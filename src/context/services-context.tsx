// React context providing all initialized services to the Ink TUI tree
import React, { createContext, useContext } from 'react';
import type { Workspace } from '../types.js';
import type { ProcessManager } from '../services/process-manager.js';
import type { TerminalController } from '../services/terminal-controller.js';
import type { GitMonitor } from '../services/git-monitor.js';
import type { StateManager } from '../services/state-manager.js';

export interface ServicesContextValue {
  config: Workspace[];
  processManager: ProcessManager;
  terminalController: TerminalController;
  gitMonitor: GitMonitor;
  stateManager: StateManager;
}

// Sentinel: context used outside provider will throw immediately
const ServicesContext = createContext<ServicesContextValue | null>(null);

export function useServices(): ServicesContextValue {
  const ctx = useContext(ServicesContext);
  if (ctx === null) {
    throw new Error('useServices must be used within a ServicesProvider');
  }
  return ctx;
}

interface ServicesProviderProps {
  value: ServicesContextValue;
  children: React.ReactNode;
}

export function ServicesProvider({ value, children }: ServicesProviderProps): React.ReactElement {
  return React.createElement(ServicesContext.Provider, { value }, children);
}
