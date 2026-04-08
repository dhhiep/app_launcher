// --status mode: print formatted status table to stdout and exit
import path from 'path';
import { StateManager } from '../services/state-manager.js';
import { ProcessManager } from '../services/process-manager.js';
import { GitMonitor } from '../services/git-monitor.js';
import type { Workspace } from '../types.js';
import { RESET, GREEN, RED, YELLOW, CYAN, DIM, pad } from './ansi-colors.js';

const COL_WS = 18;
const COL_APP = 18;
const COL_STATUS = 8;
const COL_PORT = 7;
const COL_PID = 8;
const COL_BRANCH = 18;
const COL_GIT = 12;

export async function runStatus(workspaces: Workspace[]): Promise<void> {
  const stateManager = new StateManager();
  const processManager = new ProcessManager(stateManager);
  const gitMonitor = new GitMonitor();

  const statuses = await processManager.getAllStatuses(workspaces);

  const repoPaths = [
    ...new Set(workspaces.flatMap((ws) =>
      ws.apps.map((app) => path.join(ws.root_path, app.relative_path))
    )),
  ];
  const gitMap = await gitMonitor.refreshAll(repoPaths);

  const enriched = statuses.map((s) => {
    const appPath = path.join(s.workspace.root_path, s.app.relative_path);
    const git = gitMap.get(appPath);
    return git && !git.error
      ? { ...s, branch: git.branch, ahead: git.ahead, behind: git.behind, dirty: git.dirty }
      : s;
  });

  const header =
    CYAN +
    pad('Workspace', COL_WS) +
    pad('App', COL_APP) +
    pad('Status', COL_STATUS) +
    pad('Port', COL_PORT) +
    pad('PID', COL_PID) +
    pad('Branch', COL_BRANCH) +
    pad('Git', COL_GIT) +
    RESET;

  const separator = DIM + '-'.repeat(COL_WS + COL_APP + COL_STATUS + COL_PORT + COL_PID + COL_BRANCH + COL_GIT) + RESET;

  console.log(header);
  console.log(separator);

  for (const s of enriched) {
    const statusColor = s.running ? GREEN : RED;
    const statusStr = s.running ? 'running' : 'stopped';

    const gitParts: string[] = [];
    if (s.branch) {
      if (s.ahead > 0) gitParts.push(`${YELLOW}↑${s.ahead}${RESET}`);
      if (s.behind > 0) gitParts.push(`${RED}↓${s.behind}${RESET}`);
      if (s.dirty) gitParts.push(`${YELLOW}*${RESET}`);
    }
    const gitStr =
      gitParts.length > 0
        ? gitParts.join(' ')
        : s.branch
          ? DIM + 'clean' + RESET
          : DIM + 'N/A' + RESET;

    const row =
      pad(s.workspace.name, COL_WS) +
      pad(s.app.name, COL_APP) +
      statusColor + pad(statusStr, COL_STATUS) + RESET +
      pad(String(s.app.port), COL_PORT) +
      pad(s.pid !== undefined ? String(s.pid) : '-', COL_PID) +
      pad(s.branch || '-', COL_BRANCH) +
      gitStr;

    console.log(row);
  }

  if (enriched.length === 0) {
    console.log(DIM + 'No apps configured.' + RESET);
  }
}
