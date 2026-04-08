// iTerm2 terminal controller — launches apps via AppleScript + osascript
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AppConfig, Workspace } from '../types.js';
import type { TerminalController } from './terminal-controller.js';
import { interpolateCommand, resolveAppPath } from './config-loader.js';
import { groupAppsByTab } from './tab-grouper.js';

const execFileAsync = promisify(execFile);

// Write command to a temp shell script to avoid AppleScript escaping issues
function writeTempScript(command: string): string {
  const tmpFile = path.join(os.tmpdir(), `app-launcher-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`);
  const script = `#!/bin/sh
echo "[app-launcher] Running: ${command.replace(/"/g, '\\"')}"
echo "[app-launcher] PWD: $(pwd)"
${command}
`;
  fs.writeFileSync(tmpFile, script, { mode: 0o755 });
  return tmpFile;
}

// Run an AppleScript string via osascript
async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trim();
  } catch (err) {
    throw new Error(`AppleScript failed: ${(err as Error).message}`);
  }
}

// Build the command string for a pane (just the command, cd is done separately)
function buildPaneCommand(app: AppConfig): string {
  const cmd = interpolateCommand(app.command, app.port);
  return cmd;
}

// Create a new iTerm2 window and return its integer ID for stable targeting
async function createWindow(): Promise<string> {
  const id = await runAppleScript(`
tell application "iTerm2"
  set w to (create window with default profile)
  return id of w
end tell`);
  return id.trim();
}

// Create a new tab inside a specific window (by ID); new tab becomes current tab
async function createTabInWindow(winId: string): Promise<void> {
  await runAppleScript(`
tell application "iTerm2"
  tell window id ${winId}
    create tab with default profile
  end tell
end tell`);
}

// Split current session vertically and return the new session's ID
async function splitVerticalInWindow(winId: string): Promise<string> {
  // split vertically returns the NEW session reference
  const newSessionId = await runAppleScript(`
tell application "iTerm2"
  tell window id ${winId}
    tell current tab
      tell current session
        set newSession to (split vertically with default profile)
        return id of newSession
      end tell
    end tell
  end tell
end tell`);
  // Small delay to ensure new session is fully initialized
  await new Promise(resolve => setTimeout(resolve, 200));
  return newSessionId.trim();
}

// Send command to current session of current tab inside a specific window
// First cd to directory, wait 1000ms, then run the script
async function sendToCurrentSession(winId: string, appPath: string, scriptPath: string, appName: string): Promise<void> {
  const safeName = appName.replace(/"/g, '\\"');
  const safePath = appPath.replace(/"/g, '\\"');
  await runAppleScript(`
tell application "iTerm2"
  tell window id ${winId}
    tell current tab
      tell current session
        set name to "${safeName}"
        write text "cd \\"${safePath}\\" && clear"
      end tell
    end tell
  end tell
end tell`);
  // Wait for cd to complete before running script
  await new Promise(resolve => setTimeout(resolve, 1000));
  await runAppleScript(`
tell application "iTerm2"
  tell window id ${winId}
    tell current tab
      tell current session
        write text "${scriptPath}"
      end tell
    end tell
  end tell
end tell`);
}

// Send command to a specific session by ID inside a specific window
// First cd to directory, wait 1000ms, then run the script
async function sendToSessionById(winId: string, sessionId: string, appPath: string, scriptPath: string, appName: string): Promise<void> {
  const safeName = appName.replace(/"/g, '\\"');
  const safePath = appPath.replace(/"/g, '\\"');
  await runAppleScript(`
tell application "iTerm2"
  tell window id ${winId}
    tell current tab
      tell session id "${sessionId}"
        set name to "${safeName}"
        write text "cd \\"${safePath}\\" && clear"
      end tell
    end tell
  end tell
end tell`);
  // Wait for cd to complete before running script
  await new Promise(resolve => setTimeout(resolve, 1000));
  await runAppleScript(`
tell application "iTerm2"
  tell window id ${winId}
    tell current tab
      tell session id "${sessionId}"
        write text "${scriptPath}"
      end tell
    end tell
  end tell
end tell`);
}

// Get frontmost window ID (returns null if no windows)
async function getFrontWindowId(): Promise<string | null> {
  try {
    const id = await runAppleScript(`
tell application "iTerm2"
  if (count of windows) > 0 then
    return id of front window
  else
    return ""
  end if
end tell`);
    return id.trim() || null;
  } catch {
    return null;
  }
}

export class ITermController implements TerminalController {
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('osascript', ['-e', 'tell application "iTerm2" to name']);
      return true;
    } catch {
      return false;
    }
  }

  async launchApps(apps: AppConfig[], workspace: Workspace): Promise<void> {
    const groups = groupAppsByTab(apps);
    const tmpFiles: string[] = [];

    try {
      // Create window and pin its ID — all ops target this window explicitly
      const winId = await createWindow();
      let isFirstTab = true;

      for (const group of groups) {
        // First group uses the tab that was auto-created with the window
        if (!isFirstTab) {
          await createTabInWindow(winId);
        }
        isFirstTab = false;

        // Send first app to current session (leftmost pane in this tab)
        const firstApp = group.apps[0];
        if (firstApp) {
          const appPath = resolveAppPath(firstApp, workspace);
          const tmpFile = writeTempScript(buildPaneCommand(firstApp));
          tmpFiles.push(tmpFile);
          await sendToCurrentSession(winId, appPath, tmpFile, firstApp.name);
        }

        // Each additional app: split → send command to the NEW session by ID
        for (let i = 1; i < group.apps.length; i++) {
          const app = group.apps[i];
          if (!app) continue;
          const newSessionId = await splitVerticalInWindow(winId);
          const appPath = resolveAppPath(app, workspace);
          const tmpFile = writeTempScript(buildPaneCommand(app));
          tmpFiles.push(tmpFile);
          await sendToSessionById(winId, newSessionId, appPath, tmpFile, app.name);
        }
      }
    } finally {
      // Cleanup temp scripts after delay — iTerm2 needs time to read the file
      setTimeout(() => {
        for (const f of tmpFiles) {
          try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
      }, 10000);
    }
  }

  async launchAppInTab(app: AppConfig, workspace: Workspace): Promise<void> {
    const appPath = resolveAppPath(app, workspace);
    const tmpFile = writeTempScript(buildPaneCommand(app));

    try {
      // Try to use existing front window, otherwise create new window
      let winId = await getFrontWindowId();
      if (!winId) {
        winId = await createWindow();
      } else {
        // Create a new tab in existing window
        await createTabInWindow(winId);
      }

      await sendToCurrentSession(winId, appPath, tmpFile, app.name);
    } finally {
      // Cleanup temp script after delay
      setTimeout(() => {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      }, 10000);
    }
  }
}
