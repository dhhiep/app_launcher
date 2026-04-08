// Process manager: port availability, PID tracking, graceful stop, status reporting
import net from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AppStatus, Workspace } from '../types.js';
import type { StateManager } from './state-manager.js';

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 500;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const SIGKILL_DELAY_MS = 5_000;

// Check whether a process with the given PID is alive (signal 0 = no-op probe)
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class ProcessManager {
  private stateManager: StateManager;
  private startingApps: Set<string> = new Set(); // Track apps that are starting

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  // Mark an app as starting
  markStarting(appKey: string): void {
    this.startingApps.add(appKey);
  }

  // Clear starting status for an app
  clearStarting(appKey: string): void {
    this.startingApps.delete(appKey);
  }

  // Check if an app is starting
  isStarting(appKey: string): boolean {
    return this.startingApps.has(appKey);
  }

  // Returns true when no process is listening on the port (checks both IPv4 and IPv6)
  async isPortAvailable(port: number): Promise<boolean> {
    // Use lsof to check if any process is listening on the port
    const pid = await this.findPidOnPort(port);
    return pid === undefined;
  }

  // Find the PID listening on the given port via lsof; returns undefined if none found
  async findPidOnPort(port: number): Promise<number | undefined> {
    try {
      const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`]);
      const pid = parseInt(stdout.trim().split('\n')[0] ?? '', 10);
      return isNaN(pid) ? undefined : pid;
    } catch {
      // lsof exits non-zero when no process found
      return undefined;
    }
  }

  // Get process name by PID
  async getProcessName(pid: number): Promise<string> {
    try {
      const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm=']);
      return stdout.trim().split('/').pop() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Get process info on port: returns { pid, name } or undefined
  async getProcessOnPort(port: number): Promise<{ pid: number; name: string } | undefined> {
    const pid = await this.findPidOnPort(port);
    if (pid === undefined) return undefined;
    const name = await this.getProcessName(pid);
    return { pid, name };
  }

  // Kill any process listening on the given port
  async killProcessOnPort(port: number): Promise<void> {
    const pid = await this.findPidOnPort(port);
    if (pid === undefined) return;

    // Send SIGTERM
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return; // Process may have already exited
    }

    // Wait briefly then SIGKILL if still alive
    await sleep(2000);
    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already dead
      }
    }

    // Wait for process to fully exit
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && isProcessAlive(pid)) {
      await sleep(200);
    }
  }

  // Poll port every 500ms until a process is listening, then resolve PID.
  // Returns undefined if timeout elapses without a process appearing.
  async waitForApp(
    appKey: string,
    port: number,
    timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  ): Promise<number | undefined> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const available = await this.isPortAvailable(port);
      if (!available) {
        const pid = await this.findPidOnPort(port);
        if (pid !== undefined) {
          this.stateManager.savePid(appKey, pid, port);
          this.clearStarting(appKey);
          return pid;
        }
      }
      await sleep(POLL_INTERVAL_MS);
    }

    // Timeout reached — try one last PID lookup regardless of port state
    const pid = await this.findPidOnPort(port);
    if (pid !== undefined) {
      this.stateManager.savePid(appKey, pid, port);
    }
    this.clearStarting(appKey);
    return pid;
  }

  // Gracefully stop an app: SIGTERM → wait 5s → SIGKILL; clears from state
  async stopApp(appKey: string): Promise<void> {
    const state = this.stateManager.loadState();
    const entry = state.processes[appKey];

    let pid: number | undefined = entry?.pid;

    // Fallback: look up PID via port if state has the port recorded
    if (pid === undefined && entry?.port !== undefined) {
      pid = await this.findPidOnPort(entry.port);
    }

    if (pid === undefined || !isProcessAlive(pid)) {
      this.stateManager.clearPid(appKey);
      return;
    }

    // Send SIGTERM
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may have already exited
      this.stateManager.clearPid(appKey);
      return;
    }

    // Schedule SIGKILL if still alive after delay
    const killTimer = setTimeout(() => {
      try {
        if (isProcessAlive(pid!)) {
          process.kill(pid!, 'SIGKILL');
        }
      } catch {
        // Already dead — ignore
      }
    }, SIGKILL_DELAY_MS);

    // Wait for the process to actually exit (poll)
    const deadline = Date.now() + SIGKILL_DELAY_MS + 1000;
    while (Date.now() < deadline && isProcessAlive(pid)) {
      await sleep(200);
    }

    clearTimeout(killTimer);
    this.stateManager.clearPid(appKey);
  }

  // Return running status for a single app key.
  // configPort: the app's configured port — used to detect running state even before
  // waitForApp has saved a PID to state (e.g. while the app is still starting up).
  async getStatus(
    appKey: string,
    configPort?: number,
  ): Promise<{ running: boolean; pid?: number; processName?: string; portListening: boolean }> {
    const state = this.stateManager.loadState();
    const entry = state.processes[appKey];

    const statePid = entry?.pid;
    const port = entry?.port ?? configPort;

    const statePidAlive = statePid !== undefined && isProcessAlive(statePid);
    
    // Check if port is in use via lsof (works for both IPv4 and IPv6)
    const processOnPort = port !== undefined ? await this.getProcessOnPort(port) : undefined;
    const portListening = processOnPort !== undefined;

    // If our tracked PID is alive and matches the process on port, it's "running"
    if (statePidAlive && processOnPort && processOnPort.pid === statePid) {
      return { 
        running: true, 
        pid: statePid, 
        processName: processOnPort.name, 
        portListening: true 
      };
    }

    // If our tracked PID is alive (but maybe not on this port yet), still "running"
    if (statePidAlive) {
      const processName = await this.getProcessName(statePid);
      return { running: true, pid: statePid, processName, portListening };
    }

    // Port is listening by unknown process - "in use" (portListening=true, running=false)
    if (portListening && processOnPort) {
      return { 
        running: false,  // Not OUR app
        pid: processOnPort.pid, 
        processName: processOnPort.name, 
        portListening: true 
      };
    }

    // Port is free, nothing running
    return { running: false, pid: undefined, processName: undefined, portListening: false };
  }

  // Return AppStatus[] for every app across all workspaces — runs all status checks concurrently
  async getAllStatuses(workspaces: Workspace[]): Promise<AppStatus[]> {
    const entries = workspaces.flatMap((workspace) =>
      workspace.apps.map((app) => ({ workspace, app }))
    );
    return Promise.all(
      entries.map(async ({ workspace, app }) => {
        const appKey = `${workspace.name}/${app.name}`;
        // Pass config port so status is detected even before waitForApp saves to state
        const { running, pid, processName, portListening } = await this.getStatus(appKey, app.port);
        const starting = this.isStarting(appKey) && !running;
        return {
          app,
          workspace,
          pid,
          processName,
          running,
          starting,
          portAvailable: !portListening,
          branch: '',
          ahead: 0,
          behind: 0,
          dirty: false,
          latestCommit: '',
        } satisfies AppStatus;
      })
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
