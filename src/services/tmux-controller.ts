// Tmux terminal controller — launches apps via tmux sessions/windows/panes
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AppConfig, Workspace } from '../types.js';
import type { TerminalController } from './terminal-controller.js';
import { interpolateCommand, resolveAppPath } from './config-loader.js';
import { groupAppsByTab } from './tab-grouper.js';

const execFileAsync = promisify(execFile);

// Run a tmux command, ignoring expected errors (e.g. session already exists)
async function tmux(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('tmux', args);
    return stdout.trim();
  } catch (err) {
    throw new Error(`tmux ${args[0]} failed: ${(err as Error).message}`);
  }
}

// Build cd + command string for a pane
function buildPaneCommand(app: AppConfig, workspace: Workspace): string {
  const appPath = resolveAppPath(app, workspace);
  const cmd = interpolateCommand(app.command, app.port);
  return `cd ${JSON.stringify(appPath)} && ${cmd}`;
}

// Sanitize session name: tmux forbids dots and colons
function sanitizeSessionName(name: string): string {
  return name.replace(/[.:]/g, '_').replace(/\s+/g, '-');
}

export class TmuxController implements TerminalController {
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('which', ['tmux']);
      return true;
    } catch {
      return false;
    }
  }

  async launchApps(apps: AppConfig[], workspace: Workspace): Promise<void> {
    const sessionName = sanitizeSessionName(workspace.name);
    const groups = groupAppsByTab(apps);

    // Kill any existing session with the same name to start fresh
    try {
      await tmux(['kill-session', '-t', sessionName]);
    } catch {
      // Session didn't exist — that's fine
    }

    let isFirstWindow = true;

    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      const group = groups[gIdx];
      if (!group) continue;

      const firstApp = group.apps[0];
      if (!firstApp) continue;

      const windowName = firstApp.name.replace(/\s+/g, '-');

      if (isFirstWindow) {
        // Create the session with the first window
        await tmux([
          'new-session', '-d',
          '-s', sessionName,
          '-n', windowName,
        ]);
        isFirstWindow = false;
      } else {
        // Add additional windows for each tab group
        await tmux(['new-window', '-t', sessionName, '-n', windowName]);
      }

      const windowTarget = `${sessionName}:${windowName}`;

      // Send command to first pane (pane 0)
      const firstCmd = buildPaneCommand(firstApp, workspace);
      await tmux(['send-keys', '-t', `${windowTarget}.0`, firstCmd, 'Enter']);

      // For multi-app groups: split vertically and send to each additional pane
      for (let i = 1; i < group.apps.length; i++) {
        const app = group.apps[i];
        if (!app) continue;

        // Split the window vertically (side by side)
        await tmux(['split-window', '-h', '-t', windowTarget]);

        const paneCmd = buildPaneCommand(app, workspace);
        await tmux(['send-keys', '-t', `${windowTarget}.${i}`, paneCmd, 'Enter']);
      }

      // Balance pane sizes if multiple panes were created
      if (group.apps.length > 1) {
        try {
          await tmux(['select-layout', '-t', windowTarget, 'even-horizontal']);
        } catch {
          // Non-critical — layout may not apply in all cases
        }
      }
    }

    // Attach to the session so the user can see it
    // Use a detached attach to avoid blocking the process
    try {
      await execFileAsync('tmux', ['select-window', '-t', `${sessionName}:0`]);
    } catch {
      // Non-critical
    }
  }

  async launchAppInTab(app: AppConfig, workspace: Workspace): Promise<void> {
    const sessionName = sanitizeSessionName(workspace.name);
    const windowName = app.name.replace(/\s+/g, '-');
    const cmd = buildPaneCommand(app, workspace);

    // Check if session exists
    let sessionExists = false;
    try {
      await tmux(['has-session', '-t', sessionName]);
      sessionExists = true;
    } catch {
      sessionExists = false;
    }

    if (sessionExists) {
      // Create a new window in existing session
      await tmux(['new-window', '-t', sessionName, '-n', windowName]);
      await tmux(['send-keys', '-t', `${sessionName}:${windowName}`, cmd, 'Enter']);
    } else {
      // Create new session with this app
      await tmux([
        'new-session', '-d',
        '-s', sessionName,
        '-n', windowName,
      ]);
      await tmux(['send-keys', '-t', `${sessionName}:${windowName}.0`, cmd, 'Enter']);
    }
  }
}
