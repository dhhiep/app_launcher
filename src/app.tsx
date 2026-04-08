// Main Ink App component — root of the TUI, manages view state and service orchestration
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { AppStatus, Workspace } from './types.js';
import { WorkspaceTree } from './components/workspace-tree.js';
import { StatusTable } from './components/status-table.js';
import { useServices } from './context/services-context.js';
import { useLaunchHandler } from './hooks/use-launch-handler.js';
import { resolveAppPath } from './services/config-loader.js';

export interface AppProps {
  workspaces: Workspace[];
  filterWorkspace?: string; // from -w CLI flag — show only this workspace in tree
}

type View = 'tree' | 'table';

const REFRESH_INTERVAL_MS = 1000;

export function App({ workspaces, filterWorkspace }: AppProps): React.ReactElement {
  const { processManager, terminalController, gitMonitor } = useServices();

  const { exit } = useApp();
  const [view, setView] = useState<View>('tree');
  const [statuses, setStatuses] = useState<AppStatus[]>([]);
  const [message, setMessage] = useState('');

  // Filter workspaces for tree view if -w flag provided
  const visibleWorkspaces = filterWorkspace
    ? workspaces.filter((ws) => ws.name === filterWorkspace)
    : workspaces;

  // Refresh function extracted for manual reload
  const refreshStatuses = useCallback(async (): Promise<void> => {
    try {
      const rawStatuses = await processManager.getAllStatuses(workspaces);

      // Unique repo paths for git enrichment
      const repoPaths = [
        ...new Set(
          workspaces.flatMap((ws) => ws.apps.map((app) => resolveAppPath(app, ws))),
        ),
      ];
      const gitMap = await gitMonitor.refreshAll(repoPaths);

      const enriched = rawStatuses.map((s) => {
        const appPath = resolveAppPath(s.app, s.workspace);
        const git = gitMap.get(appPath);
        return git && !git.error
          ? { ...s, branch: git.branch, ahead: git.ahead, behind: git.behind, dirty: git.dirty, latestCommit: git.latestCommit }
          : s;
      });

      setStatuses(enriched);
    } catch {
      // Non-fatal: leave previous statuses in place
    }
  }, [workspaces, processManager, gitMonitor]);

  // Periodic status + git refresh (non-blocking)
  useEffect(() => {
    let active = true;

    const refresh = async (): Promise<void> => {
      if (active) await refreshStatuses();
    };

    void refresh();
    const timer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [refreshStatuses]);

  // Manual reload handler
  const onReload = useCallback((): void => {
    setMessage('Reloading...');
    refreshStatuses().then(() => setMessage('Reloaded'));
  }, [refreshStatuses]);

  const onLaunch = useLaunchHandler({
    workspaces,
    processManager,
    terminalController,
    onMessage: setMessage,
    onSwitchToTable: () => setView('table'),
  });

  // Stop handler: called by StatusTable on Ctrl+X (force stop without confirm)
  const onStop = useCallback((appKey: string): void => {
    const appName = appKey.split('/')[1] ?? appKey;
    setMessage(`Stopping ${appName}...`);
    processManager.stopApp(appKey)
      .then(() => setMessage(`Stopped ${appName}`))
      .catch((err: unknown) => setMessage(`Stop error: ${(err as Error).message}`));
  }, [processManager]);

  // Confirm stop handler: called by StatusTable on Delete key
  const [pendingStop, setPendingStop] = useState<{ appKey: string; appName: string } | null>(null);

  const onConfirmStop = useCallback((appKey: string, appName: string): void => {
    setPendingStop({ appKey, appName });
    setMessage(`Stop "${appName}"? Press Enter to confirm, any other key to cancel`);
  }, []);

  // Handle confirmation input
  useInput((input, key) => {
    if (pendingStop) {
      if (key.return) {
        onStop(pendingStop.appKey);
      } else {
        setMessage('Stop cancelled');
      }
      setPendingStop(null);
      return;
    }
    if (key.tab) { setView((v) => (v === 'tree' ? 'table' : 'tree')); return; }
    if (input === 'q') { exit(); }
  });

  // Launch single app in new tab handler
  const onLaunchInTab = useCallback((appKey: string): void => {
    const [wsName, appName] = appKey.split('/');
    const workspace = workspaces.find(ws => ws.name === wsName);
    const app = workspace?.apps.find(a => a.name === appName);
    
    if (!workspace || !app) {
      setMessage(`App not found: ${appKey}`);
      return;
    }

    setMessage(`Launching ${appName} in new tab...`);
    processManager.markStarting(appKey);
    terminalController.launchAppInTab(app, workspace)
      .then(() => {
        setMessage(`Launched ${appName}`);
        // Start waiting for the app's port
        processManager.waitForApp(appKey, app.port).catch(() => { /* timeout non-fatal */ });
      })
      .catch((err: unknown) => {
        processManager.clearStarting(appKey);
        setMessage(`Launch error: ${(err as Error).message}`);
      });
  }, [workspaces, terminalController, processManager]);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{`App Launcher [${view}]`}</Text>
      {view === 'tree' && (
        <WorkspaceTree
          workspaces={visibleWorkspaces}
          initialSelection={new Set()}
          onLaunch={onLaunch}
        />
      )}
      {view === 'table' && (
        <StatusTable 
          statuses={statuses} 
          onStop={onStop} 
          onLaunchInTab={onLaunchInTab}
          onConfirmStop={onConfirmStop}
          onReload={onReload}
        />
      )}
      {message.length > 0 && <Text dimColor>{message}</Text>}
      <Text dimColor>
        Tab:toggle  Space:select  Enter:launch  Delete:stop  q:quit
      </Text>
    </Box>
  );
}
