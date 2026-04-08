// -w -a mode: launch named apps directly without TUI, wait for port binding, then exit
import { StateManager } from '../services/state-manager.js';
import { ProcessManager } from '../services/process-manager.js';
import { createTerminalController } from '../services/terminal-controller.js';
import type { Workspace } from '../types.js';
import { RESET, GREEN, RED, YELLOW } from './ansi-colors.js';
import { resolveApps } from './run-stop.js';

export async function runDirectLaunch(
  workspaces: Workspace[],
  workspaceName: string,
  appNames: string,
): Promise<void> {
  const workspace = workspaces.find((ws) => ws.name === workspaceName);
  if (!workspace) {
    console.error(`Error: workspace "${workspaceName}" not found`);
    process.exit(1);
  }

  const names = appNames.split(',').map((n) => n.trim()).filter(Boolean);
  const resolvedApps = resolveApps(workspace, names);
  if (resolvedApps.errors.length > 0) {
    for (const e of resolvedApps.errors) console.error(`Error: ${e}`);
    process.exit(1);
  }

  const stateManager = new StateManager();
  const processManager = new ProcessManager(stateManager);

  // Check port availability before launching
  const portChecks = await Promise.all(
    resolvedApps.apps.map(async (app) => ({
      app,
      available: await processManager.isPortAvailable(app.port),
    }))
  );

  const busy = portChecks.filter((c) => !c.available);
  if (busy.length > 0) {
    for (const { app } of busy) {
      console.error(`Error: port ${app.port} for "${app.name}" is already in use`);
    }
    process.exit(1);
  }

  let termController;
  try {
    termController = await createTerminalController();
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    await termController.launchApps(resolvedApps.apps, workspace);
  } catch (err) {
    console.error(`Error launching apps: ${(err as Error).message}`);
    process.exit(1);
  }

  // Persist selection for TUI next-open restore
  const selectionKeys = resolvedApps.apps.map((a) => `${workspaceName}/${a.name}`);
  stateManager.saveLastSelection(selectionKeys);

  console.log(`Waiting for ${resolvedApps.apps.length} app(s) to start...`);

  const waitResults = await Promise.allSettled(
    resolvedApps.apps.map(async (app) => {
      const appKey = `${workspaceName}/${app.name}`;
      const pid = await processManager.waitForApp(appKey, app.port);
      return { app, pid };
    })
  );

  for (const result of waitResults) {
    if (result.status === 'fulfilled') {
      const { app, pid } = result.value;
      if (pid !== undefined) {
        console.log(`${GREEN}Started:${RESET} ${app.name} (port ${app.port}, PID ${pid})`);
      } else {
        console.log(`${YELLOW}Timeout:${RESET} ${app.name} (port ${app.port}) — may still be starting`);
      }
    } else {
      console.error(`${RED}Error:${RESET} ${(result.reason as Error).message}`);
    }
  }
}
