// --stop mode: stop named apps in a workspace and exit
import { StateManager } from '../services/state-manager.js';
import { ProcessManager } from '../services/process-manager.js';
import type { AppConfig, Workspace } from '../types.js';
import { RESET, GREEN, RED } from './ansi-colors.js';

/** Resolve app names to AppConfig objects, collecting errors for unknown names */
export function resolveApps(
  workspace: Workspace,
  names: string[],
): { apps: AppConfig[]; errors: string[] } {
  const apps: AppConfig[] = [];
  const errors: string[] = [];
  for (const name of names) {
    const found = workspace.apps.find((a) => a.name === name);
    if (found) {
      apps.push(found);
    } else {
      errors.push(`app "${name}" not found in workspace "${workspace.name}"`);
    }
  }
  return { apps, errors };
}

export async function runStop(
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

  const results = await Promise.allSettled(
    resolvedApps.apps.map(async (app) => {
      const appKey = `${workspaceName}/${app.name}`;
      await processManager.stopApp(appKey);
      return app.name;
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      console.log(`${GREEN}Stopped:${RESET} ${result.value}`);
    } else {
      console.error(`${RED}Failed to stop:${RESET} ${(result.reason as Error).message}`);
    }
  }
}
