// TUI mode: render the Ink interactive interface (full or workspace-filtered)
import React from 'react';
import { render } from 'ink';
import { App } from '../app.js';
import { StateManager } from '../services/state-manager.js';
import { ProcessManager } from '../services/process-manager.js';
import { GitMonitor } from '../services/git-monitor.js';
import { createTerminalController } from '../services/terminal-controller.js';
import { ServicesProvider } from '../context/services-context.js';
import type { Workspace } from '../types.js';
import type { ServicesContextValue } from '../context/services-context.js';

export async function runTUI(workspaces: Workspace[], filterWorkspace?: string): Promise<void> {
  const stateManager = new StateManager();
  const processManager = new ProcessManager(stateManager);
  const gitMonitor = new GitMonitor();

  let terminalController;
  try {
    terminalController = await createTerminalController();
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  const servicesValue: ServicesContextValue = {
    config: workspaces,
    processManager,
    terminalController,
    gitMonitor,
    stateManager,
  };

  const appElement = React.createElement(App, { workspaces, filterWorkspace });
  const providerElement = React.createElement(ServicesProvider, { value: servicesValue, children: appElement });
  render(providerElement);
  // Do NOT call process.exit() — Ink controls the lifecycle
}
