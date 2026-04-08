// StatusTable: task-manager-style display of running app statuses
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AppStatus } from '../types.js';

interface StatusTableProps {
  statuses: AppStatus[];
  onStop: (appKey: string) => void;
  onLaunchInTab: (appKey: string) => void;
  onConfirmStop: (appKey: string, appName: string) => void;
  onReload: () => void;
}

// Fixed widths for compact columns; flexible columns fill remaining terminal width
const FIXED = { status: 8, port: 14, pid: 8 };
const FIXED_TOTAL = FIXED.status + FIXED.port + FIXED.pid;

function getColWidths() {
  const total = (process.stdout.columns || 120) - 1; // -1 to avoid wrap
  const flexible = Math.max(total - FIXED_TOTAL, 40);
  const q = Math.floor(flexible / 4);
  return {
    app:       q,
    workspace: q,
    status:    FIXED.status,
    port:      FIXED.port,
    pid:       FIXED.pid,
    branch:    q,
    commits:   flexible - q * 3, // remainder to last flexible col
  };
}

// Pad or truncate string to exact width
function col(value: string, width: number): string {
  if (value.length > width) return value.slice(0, width - 1) + '…';
  return value.padEnd(width, ' ');
}

// Format branch column: "main ↑3 ↓1 *" or "main"
function formatBranch(status: AppStatus): string {
  const { branch, ahead, behind, dirty } = status;
  if (!branch) return '—';
  let s = branch;
  if (ahead > 0) s += ` ↑${ahead}`;
  if (behind > 0) s += ` ↓${behind}`;
  if (dirty) s += ' *';
  return s;
}

// Header row renderer
function HeaderRow(): React.ReactElement {
  const C = getColWidths();
  return (
    <Box>
      <Text bold color="cyan">{col('App', C.app)}</Text>
      <Text bold color="cyan">{col('Workspace', C.workspace)}</Text>
      <Text bold color="cyan">{col('Status', C.status)}</Text>
      <Text bold color="cyan">{col('Port', C.port)}</Text>
      <Text bold color="cyan">{col('PID', C.pid)}</Text>
      <Text bold color="cyan">{col('Branch', C.branch)}</Text>
      <Text bold color="cyan">{col('Commit', C.commits)}</Text>
    </Box>
  );
}

// Single data row renderer
interface DataRowProps {
  status: AppStatus;
  isCursor: boolean;
}

function DataRow({ status, isCursor }: DataRowProps): React.ReactElement {
  const C = getColWidths();
  const running = status.running;
  const starting = status.starting;
  const portInUse = !status.portAvailable && !running && !starting;
  
  // Status: "running", "starting", "in use" (other process), or "stopped"
  let statusText: string;
  let statusColor: string;
  if (running) {
    statusText = 'running';
    statusColor = 'green';
  } else if (starting) {
    statusText = 'starting';
    statusColor = 'cyan';
  } else if (portInUse) {
    statusText = 'in use';
    statusColor = 'yellow';
  } else {
    statusText = 'stopped';
    statusColor = 'red';
  }
  
  // Port column: show "port(process)" if port is in use by other process
  const portText = portInUse && status.processName 
    ? `${status.app.port}(${status.processName})`
    : String(status.app.port);
  
  const pidText = status.pid !== undefined ? String(status.pid) : '—';
  const branchText = formatBranch(status);
  const commitText = status.latestCommit || '—';

  return (
    <Box>
      <Text inverse={isCursor} color={isCursor ? 'cyan' : undefined}>
        {col(status.app.name, C.app)}
      </Text>
      <Text inverse={isCursor}>{col(status.workspace.name, C.workspace)}</Text>
      <Text color={statusColor} inverse={isCursor}>{col(statusText, C.status)}</Text>
      <Text inverse={isCursor}>{col(portText, C.port)}</Text>
      <Text inverse={isCursor}>{col(pidText, C.pid)}</Text>
      <Text inverse={isCursor}>{col(branchText, C.branch)}</Text>
      <Text inverse={isCursor}>{col(commitText, C.commits)}</Text>
    </Box>
  );
}

// Separator line spanning full terminal width
function SeparatorRow(): React.ReactElement {
  const width = (process.stdout.columns || 120) - 1;
  return <Text dimColor>{'─'.repeat(width)}</Text>;
}

export function StatusTable({ statuses, onStop, onLaunchInTab, onConfirmStop, onReload }: StatusTableProps): React.ReactElement {
  const [cursor, setCursor] = useState(0);

  const safeMax = Math.max(0, statuses.length - 1);

  useInput(useCallback((_input: string, key: { upArrow: boolean; downArrow: boolean; ctrl: boolean; delete: boolean; return: boolean }) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(safeMax, c + 1));
      return;
    }
    if (_input === 'r') {
      onReload();
      return;
    }
    if (key.ctrl && _input === 'x') {
      const entry = statuses[cursor];
      if (entry) {
        const appKey = `${entry.workspace.name}/${entry.app.name}`;
        onStop(appKey);
      }
      return;
    }
    if (key.delete) {
      // Delete key: stop with confirmation
      const entry = statuses[cursor];
      if (entry && entry.running) {
        const appKey = `${entry.workspace.name}/${entry.app.name}`;
        onConfirmStop(appKey, entry.app.name);
      }
      return;
    }
    if (key.return) {
      // Enter key: launch app in new tab
      const entry = statuses[cursor];
      if (entry && !entry.running) {
        const appKey = `${entry.workspace.name}/${entry.app.name}`;
        onLaunchInTab(appKey);
      }
      return;
    }
  }, [cursor, safeMax, statuses, onStop, onLaunchInTab, onConfirmStop, onReload]));

  // Clamp cursor if statuses shrink
  const effectiveCursor = Math.min(cursor, safeMax);

  if (statuses.length === 0) {
    return (
      <Box flexDirection="column">
        <HeaderRow />
        <SeparatorRow />
        <Text dimColor>  No apps tracked yet. Launch apps from the tree view.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HeaderRow />
      <SeparatorRow />
      {statuses.map((status, idx) => (
        <DataRow
          key={`${status.workspace.name}/${status.app.name}`}
          status={status}
          isCursor={idx === effectiveCursor}
        />
      ))}
      <Text dimColor>Up/Down:navigate  Enter:start  Delete:stop  Ctrl+X:force-stop  r:reload</Text>
    </Box>
  );
}
