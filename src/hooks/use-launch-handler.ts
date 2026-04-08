// Hook encapsulating the launch flow: selection → port check → terminal → process wait
import { useCallback } from 'react';
import type { AppConfig, Workspace } from '../types.js';
import type { ProcessManager } from '../services/process-manager.js';
import type { TerminalController } from '../services/terminal-controller.js';

interface UseLaunchHandlerOptions {
  workspaces: Workspace[];
  processManager: ProcessManager;
  terminalController: TerminalController;
  onMessage: (msg: string) => void;
  onSwitchToTable: () => void;
}

export function useLaunchHandler({
  workspaces,
  processManager,
  terminalController,
  onMessage,
  onSwitchToTable,
}: UseLaunchHandlerOptions): (selected: Set<string>) => void {
  const handleLaunch = useCallback(async (selected: Set<string>): Promise<void> => {
    if (selected.size === 0) return;

    // Collect all apps to launch and kill any existing processes on their ports
    const appsToLaunch: { app: AppConfig; workspace: Workspace }[] = [];
    const portsToKill: number[] = [];

    for (const ws of workspaces) {
      for (const app of ws.apps) {
        const key = `${ws.name}/${app.name}`;
        if (!selected.has(key)) continue;
        
        const available = await processManager.isPortAvailable(app.port);
        if (!available) {
          portsToKill.push(app.port);
        }
        appsToLaunch.push({ app, workspace: ws });
      }
    }

    if (appsToLaunch.length === 0) {
      onMessage('No apps selected');
      return;
    }

    // Kill existing processes on ports
    if (portsToKill.length > 0) {
      onMessage(`Killing processes on ports: ${portsToKill.join(', ')}...`);
      for (const port of portsToKill) {
        await processManager.killProcessOnPort(port);
      }
      // Small delay to ensure ports are released
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    onMessage(`Launching ${appsToLaunch.length} app(s)...`);
    onSwitchToTable();

    // Mark all apps as starting
    for (const { app, workspace } of appsToLaunch) {
      const appKey = `${workspace.name}/${app.name}`;
      processManager.markStarting(appKey);
    }

    // Group by workspace for terminal controller
    const byWorkspace = new Map<string, { ws: Workspace; apps: AppConfig[] }>();
    for (const { app, workspace } of appsToLaunch) {
      const existing = byWorkspace.get(workspace.name) ?? { ws: workspace, apps: [] };
      existing.apps.push(app);
      byWorkspace.set(workspace.name, existing);
    }

    for (const { ws, apps } of byWorkspace.values()) {
      try {
        await terminalController.launchApps(apps, ws);
      } catch (err) {
        onMessage(`Launch error (${ws.name}): ${(err as Error).message}`);
        return;
      }
    }

    // Poll for each app's port in background; status refresh will reflect results
    for (const { app, workspace } of appsToLaunch) {
      const appKey = `${workspace.name}/${app.name}`;
      processManager.waitForApp(appKey, app.port).catch(() => { /* timeout is non-fatal */ });
    }

    onMessage(`Launched ${appsToLaunch.length} app(s). Waiting for processes...`);
  }, [workspaces, processManager, terminalController, onMessage, onSwitchToTable]);

  return useCallback((selected: Set<string>): void => {
    void handleLaunch(selected);
  }, [handleLaunch]);
}
