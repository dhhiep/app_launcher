// State manager: persists launcher state (PIDs, last selection) to ~/.app-launcher/state.json

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { LauncherState } from '../types.js';

const APP_LAUNCHER_DIR = path.join(os.homedir(), '.app-launcher');
const STATE_FILE_PATH = path.join(APP_LAUNCHER_DIR, 'state.json');

const EMPTY_STATE: LauncherState = {
  processes: {},
  lastSelection: [],
};

// Check if a process is still alive using signal 0 (no-op signal)
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Remove stale PIDs from state (processes that are no longer running)
function pruneDeadProcesses(state: LauncherState): LauncherState {
  const alive: LauncherState['processes'] = {};
  for (const [key, entry] of Object.entries(state.processes)) {
    if (isProcessAlive(entry.pid)) {
      alive[key] = entry;
    }
  }
  return { ...state, processes: alive };
}

export class StateManager {
  private statePath: string;

  constructor(statePath: string = STATE_FILE_PATH) {
    this.statePath = statePath;
    this.ensureDir();
  }

  private ensureDir(): void {
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Load state from disk; validates PIDs and prunes dead processes
  loadState(): LauncherState {
    if (!fs.existsSync(this.statePath)) {
      return { ...EMPTY_STATE, processes: {}, lastSelection: [] };
    }

    let raw: string;
    try {
      raw = fs.readFileSync(this.statePath, 'utf-8');
    } catch (err) {
      console.error(`Warning: failed to read state file: ${(err as Error).message}`);
      return { ...EMPTY_STATE, processes: {}, lastSelection: [] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupt state file — start fresh
      return { ...EMPTY_STATE, processes: {}, lastSelection: [] };
    }

    const state = this.normalizeState(parsed);
    return pruneDeadProcesses(state);
  }

  // Ensure state object has expected shape, filling in defaults
  private normalizeState(raw: unknown): LauncherState {
    if (typeof raw !== 'object' || raw === null) {
      return { ...EMPTY_STATE, processes: {}, lastSelection: [] };
    }

    const r = raw as Record<string, unknown>;
    const processes: LauncherState['processes'] = {};

    if (typeof r['processes'] === 'object' && r['processes'] !== null) {
      for (const [key, val] of Object.entries(r['processes'] as Record<string, unknown>)) {
        if (
          typeof val === 'object' && val !== null &&
          typeof (val as Record<string, unknown>)['pid'] === 'number' &&
          typeof (val as Record<string, unknown>)['port'] === 'number' &&
          typeof (val as Record<string, unknown>)['launchedAt'] === 'string'
        ) {
          const v = val as { pid: number; port: number; launchedAt: string };
          processes[key] = { pid: v.pid, port: v.port, launchedAt: v.launchedAt };
        }
      }
    }

    const lastSelection = Array.isArray(r['lastSelection'])
      ? (r['lastSelection'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];

    return { processes, lastSelection };
  }

  // Save full state to disk atomically (write to tmp then rename)
  saveState(state: LauncherState): void {
    const json = JSON.stringify(state, null, 2);
    const tmp = `${this.statePath}.tmp`;
    try {
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, this.statePath);
    } catch (err) {
      throw new Error(`Failed to save state: ${(err as Error).message}`);
    }
  }

  // Persist the user's last app selection (keys like "workspace_1/backend_1")
  saveLastSelection(keys: string[]): void {
    const state = this.loadState();
    this.saveState({ ...state, lastSelection: keys });
  }

  // Retrieve the last saved selection
  getLastSelection(): string[] {
    return this.loadState().lastSelection;
  }

  // Record a launched process PID + port for a given app key
  savePid(appKey: string, pid: number, port: number): void {
    const state = this.loadState();
    state.processes[appKey] = { pid, port, launchedAt: new Date().toISOString() };
    this.saveState(state);
  }

  // Remove a process entry (on stop or detected death)
  clearPid(appKey: string): void {
    const state = this.loadState();
    delete state.processes[appKey];
    this.saveState(state);
  }
}
