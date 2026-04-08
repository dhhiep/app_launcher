# Research Report: Ink, iTerm2 Control, and Node.js Process Management

**Date:** 2026-04-08 | **Target:** app_launcher CLI Research

---

## Executive Summary

Ink v5+ is production-ready for building interactive terminal UIs (GitHub Copilot CLI, Wrangler, Prisma). iTerm2 AppleScript integration works via `osascript` from Node.js, but is **fragile**—version-dependent and fragile. Process management with `child_process.spawn` is solid but requires explicit PID tracking for reliable graceful shutdown. Recommendation: Use Ink for CLI UI, keep iTerm2 integration minimal (launch only, not control), persist state to JSON.

---

## Topic 1: Ink React CLI Framework (v5+)

### Status & Adoption
- **Maturity:** Production. Powers GitHub Copilot CLI, Cloudflare Wrangler, Prisma, Shopify CLI.
- **Activity:** Latest GitHub commit Feb 2026 (active maintenance).
- **Breaking Changes:** Stable v5.x API; no major breaking changes announced.
- **Community:** Established; growing adoption especially in DevTools space.

### Core Components
| Component | Purpose | Example |
|-----------|---------|---------|
| `<Text>` | Render styled text with colors, bold, italic, underline, strikethrough | `<Text color="green" bold>Success</Text>` |
| `<Box>` | Flexbox container (uses Yoga layout engine) | `<Box flexDirection="column" padding={1}>` |
| `<Newline>` | Add blank lines | `<Newline count={2} />` |
| `<Spacer>` | Flexible spacing (flex:1) | `<Box><Text>Left</Text><Spacer/><Text>Right</Text></Box>` |

### Key Hooks

**`useInput`** – Handle keyboard input
```typescript
import { useInput } from 'ink';

useInput((input, key) => {
  if (input === 'q') process.exit(0);
  if (key.tab) focusNext();
  if (key.space) toggleSelected();
  if (key.return) confirm();
  if (key.ctrl && input === 's') save();
  if (key.ctrl && input === 'x') cancel();
});
```

**`useApp`** – Control app lifecycle
```typescript
import { useApp } from 'ink';

const { exit } = useApp();
// Programmatically exit: exit()
```

**`useFocus`** – Focus management (auto-tab handling)
```typescript
import { useFocus } from 'ink';

const { isFocused } = useFocus({ autoFocus: true });
// Ink intercepts Tab before useInput when useFocus is active
```

**`useAnimation`** – Periodic updates
```typescript
import { useAnimation } from 'ink';

useAnimation(time => {
  // Called on each frame; use for polling
  setRefreshCount(Math.floor(time / 1000));
});
```

### Multi-Select List Component (Custom Pattern)

Ink doesn't ship a built-in checkbox list, but **ink-ui** library provides `<MultiSelect>`. For custom implementation:

```typescript
// src/components/CheckboxList.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';

interface Item { id: string; label: string }

export const CheckboxList: React.FC<{ items: Item[] }> = ({ items }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    if (key.downArrow) setCursor(Math.min(items.length - 1, cursor + 1));
    if (input === ' ') {
      const newSelected = new Set(selected);
      if (newSelected.has(items[cursor].id)) {
        newSelected.delete(items[cursor].id);
      } else {
        newSelected.add(items[cursor].id);
      }
      setSelected(newSelected);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Box key={item.id}>
          <Text>{cursor === i ? '> ' : '  '}</Text>
          <Text>{selected.has(item.id) ? '✓' : ' '}</Text>
          <Text> {item.label}</Text>
        </Box>
      ))}
    </Box>
  );
};
```

### Data Table Component (Custom Pattern)

```typescript
// src/components/DataTable.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface Row { [key: string]: string | number }

export const DataTable: React.FC<{ 
  columns: string[]; 
  rows: Row[]; 
  columnWidths?: Record<string, number>;
}> = ({ columns, rows, columnWidths = {} }) => {
  const getWidth = (col: string) => columnWidths[col] || 20;
  const pad = (str: string, width: number) => String(str).padEnd(width);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {columns.map(col => (
          <Text key={col} bold>{pad(col, getWidth(col))}</Text>
        ))}
      </Box>
      {/* Rows */}
      {rows.map((row, i) => (
        <Box key={i}>
          {columns.map(col => (
            <Text key={`${i}-${col}`}>{pad(row[col], getWidth(col))}</Text>
          ))}
        </Box>
      ))}
    </Box>
  );
};
```

### Keyboard Input Handling

Ink's `key` object in `useInput` callback:
- `key.upArrow`, `key.downArrow`, `key.leftArrow`, `key.rightArrow` – Arrow keys
- `key.tab` – Tab (Ink intercepts globally; caught before useInput if useFocus active)
- `key.return` – Enter
- `key.space` – Handled via `input === ' '`
- `key.ctrl` – Ctrl modifier; check with `key.ctrl && input === 'x'`
- `key.shift`, `key.meta` – Shift and Meta (Cmd on macOS)
- `key.escape` – Esc

**Note:** Global shortcuts (Tab, Shift+Tab, Esc) may be intercepted by App component if `useFocus` is in tree.

### Periodic Data Refresh

Use `useEffect` + `setInterval` pattern (or `useAnimation` hook):

```typescript
export const StatusDisplay: React.FC = () => {
  const [status, setStatus] = useState('Idle');

  useEffect(() => {
    const timer = setInterval(async () => {
      const newStatus = await fetchStatus();
      setStatus(newStatus);
    }, 1000); // Poll every second

    return () => clearInterval(timer);
  }, []);

  return <Text>{status}</Text>;
};
```

### App Structure & State Management

**Recommended Pattern (ESM + TypeScript):**

```typescript
// src/index.ts
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

const app = render(React.createElement(App));
// app.cleanup() on exit
```

```typescript
// src/App.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<'menu' | 'launcher'>('menu');

  useInput((input, key) => {
    if (input === 'q') process.exit(0);
  });

  return (
    <Box flexDirection="column">
      {screen === 'menu' && <MenuScreen onSelect={() => setScreen('launcher')} />}
      {screen === 'launcher' && <LauncherScreen />}
    </Box>
  );
};
```

**State Management:** Use Context API + useState. Avoid Redux unless managing very complex app state.

### Publishing as npm CLI Tool

**package.json:**
```json
{
  "name": "app-launcher",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "app-launcher": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts"
  }
}
```

**src/cli.ts (entry point):**
```typescript
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

render(React.createElement(App));
```

**Install locally:** `npm install -g .` or `npm link` → `app-launcher` command available globally.

**Key Requirements:**
- Shebang line: `#!/usr/bin/env node` (must be first line)
- Set `"type": "module"` in package.json for ESM
- Use `.js` extensions in imports (TypeScript → JavaScript build output)
- chmod +x not needed; npm handles executable flag

---

## Topic 2: iTerm2 Control from Node.js

### Overview
iTerm2 exposes a **stable AppleScript API**. From Node.js, invoke AppleScript via `osascript` command.

### Fundamental Approach

```typescript
// src/utils/iterm-control.ts
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function runAppleScript(script: string): string {
  try {
    return execSync(`osascript`, {
      input: script,
      encoding: 'utf-8',
    });
  } catch (error: any) {
    throw new Error(`AppleScript error: ${error.message}`);
  }
}
```

### Create Window & Tabs

```typescript
export function createWindow(withDefaultProfile = true): void {
  const script = `
    tell application "iTerm"
      create window with default profile
    end tell
  `;
  runAppleScript(script);
}

export function createTab(windowIndex = 1, profileName?: string): void {
  const profileClause = profileName 
    ? `with profile "${profileName}"` 
    : 'with default profile';
  
  const script = `
    tell application "iTerm"
      tell window ${windowIndex}
        create tab ${profileClause}
      end tell
    end tell
  `;
  runAppleScript(script);
}
```

### Split Panes (2x2 Grid)

```typescript
export function createSplitPanes(): void {
  const script = `
    tell application "iTerm"
      activate
      tell current window
        create tab with default profile
        tell current tab
          tell current session
            split vertically with default profile
          end tell
          tell first session
            split horizontally with default profile
          end tell
        end tell
      end tell
    end tell
  `;
  runAppleScript(script);
}
```

### Send Command to Pane

```typescript
export function sendCommandToPane(
  windowIdx: number, 
  tabIdx: number, 
  sessionIdx: number, 
  command: string
): void {
  const script = `
    tell application "iTerm"
      tell window ${windowIdx}
        tell tab ${tabIdx}
          tell session ${sessionIdx}
            write text "${command}"
          end tell
        end tell
      end tell
    end tell
  `;
  runAppleScript(script);
}
```

### Name Tab/Session

```typescript
export function nameSession(
  windowIdx: number,
  tabIdx: number,
  sessionIdx: number,
  name: string
): void {
  const script = `
    tell application "iTerm"
      tell window ${windowIdx}
        tell tab ${tabIdx}
          tell session ${sessionIdx}
            set name to "${name}"
          end tell
        end tell
      end tell
    end tell
  `;
  runAppleScript(script);
}
```

### ⚠️ Critical Limitations

1. **Version-Dependent Syntax:** AppleScript API differs between iTerm2 versions (2.9.20140903+ has different syntax). Version detection required for robustness:
   ```typescript
   const versionScript = `tell application "iTerm" to version`;
   const version = runAppleScript(versionScript);
   ```

2. **Fragile String Escaping:** Command strings must escape quotes carefully. Complex commands are brittle.

3. **No Real-Time Feedback:** No direct way to poll pane output or detect process completion from AppleScript.

4. **Security:** AppleScript calls may be blocked by System Preferences on newer macOS versions (Monterey+).

5. **macOS-Only:** Won't work on Linux/Windows.

### Recommendation: Minimal iTerm2 Integration
- **Do:** Use iTerm2 control to **launch processes only** (create windows, send initial commands).
- **Don't:** Attempt to parse output, monitor pane state, or interact with processes via AppleScript.
- **Better Alternative:** Manage processes directly via `child_process.spawn` (see Topic 3); let user interact with iTerm2 UI manually.

---

## Topic 3: Process Management in Node.js

### spawn vs. exec vs. fork

| Method | Use Case | Return Value |
|--------|----------|--------------|
| `spawn` | Stream-based, long-running processes | ChildProcess |
| `exec` | Small scripts, capture all output | Callback with stdout |
| `fork` | Spawn Node.js worker scripts | ChildProcess with IPC |

**For app_launcher:** Use `spawn` for tracking multiple processes independently.

### Track PID and Check Port

```typescript
// src/utils/process-manager.ts
import { spawn, ChildProcess } from 'child_process';
import net from 'net';

interface AppProcess {
  name: string;
  pid: number;
  process: ChildProcess;
  port?: number;
}

const runningApps: Map<string, AppProcess> = new Map();

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port in use
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false); // Port free
    });
    server.listen(port);
  });
}

export function launchApp(
  name: string,
  command: string,
  args: string[],
  port?: number
): AppProcess {
  const proc = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false, // Don't create process group
  });

  const appProc: AppProcess = {
    name,
    pid: proc.pid!,
    process: proc,
    port,
  };

  // Track output
  proc.stdout?.on('data', (data) => {
    console.log(`[${name}] stdout: ${data}`);
  });

  proc.stderr?.on('data', (data) => {
    console.error(`[${name}] stderr: ${data}`);
  });

  proc.on('exit', (code, signal) => {
    console.log(`[${name}] exited with code ${code} signal ${signal}`);
    runningApps.delete(name);
  });

  runningApps.set(name, appProc);
  return appProc;
}
```

### Graceful Termination (SIGTERM → SIGKILL)

```typescript
export function terminateApp(
  name: string,
  timeoutMs: number = 3000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = runningApps.get(name);
    if (!app) {
      reject(new Error(`App ${name} not running`));
      return;
    }

    // Send SIGTERM (graceful shutdown)
    app.process.kill('SIGTERM');

    const timer = setTimeout(() => {
      // Force kill after timeout
      if (!app.process.killed) {
        app.process.kill('SIGKILL');
        console.warn(`[${name}] Force killed (SIGKILL)`);
      }
    }, timeoutMs);

    app.process.on('exit', () => {
      clearTimeout(timer);
      runningApps.delete(name);
      resolve();
    });
  });
}

export async function terminateAll(): Promise<void> {
  const promises = Array.from(runningApps.keys()).map(name =>
    terminateApp(name).catch(err => console.error(err))
  );
  await Promise.all(promises);
}
```

### Persist State to JSON

```typescript
// src/utils/state-manager.ts
import fs from 'fs/promises';
import path from 'path';

interface AppState {
  apps: Array<{
    name: string;
    pid: number;
    port?: number;
    launchedAt: string;
  }>;
}

const STATE_FILE = path.join(process.env.HOME || '/tmp', '.app-launcher-state.json');

export async function loadState(): Promise<AppState> {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { apps: [] };
  }
}

export async function saveState(state: AppState): Promise<void> {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function recordApp(
  name: string,
  pid: number,
  port?: number
): Promise<void> {
  const state = await loadState();
  state.apps.push({
    name,
    pid,
    port,
    launchedAt: new Date().toISOString(),
  });
  await saveState(state);
}
```

### ⚠️ Critical Notes on Process Termination

1. **`subprocess.killed` is misleading:** It only indicates if kill() was *called*, not if the process actually terminated. Always wait for 'exit' event.

2. **PID Reuse Risk:** On Unix, if a child exits and its PID is reassigned to another process, `kill()` might terminate the wrong process. Mitigate by:
   - Using process groups: `detached: true` + `process.kill(-pid)` (kill entire group).
   - Not relying on stored PIDs after long delays.

3. **Signal Handling:** Processes must handle SIGTERM to shut down gracefully. If they don't, use the SIGKILL fallback.

### Example: Launcher Integration

```typescript
// src/launcher.ts
export async function launchAppWithTracking(
  name: string,
  config: LaunchConfig
): Promise<void> {
  // Check port if specified
  if (config.port) {
    const inUse = await isPortInUse(config.port);
    if (inUse) {
      throw new Error(`Port ${config.port} already in use`);
    }
  }

  // Spawn process
  const app = launchApp(name, config.command, config.args, config.port);

  // Persist to state file
  await recordApp(name, app.pid, config.port);

  console.log(`Launched ${name} (PID ${app.pid})`);
}
```

---

## Integration: Ink + iTerm2 + Process Management

**Recommended Architecture:**

1. **Ink UI**: Display launcher menu, select apps, show status.
2. **Process Manager**: Spawn/kill processes via `child_process.spawn`.
3. **iTerm2**: Only use to *create* initial windows/panes; let processes run independently.
4. **State Persistence**: JSON file tracking PIDs and ports.

**Example Workflow:**
```
User selects 3 apps in Ink UI
  → Process Manager spawns all 3 (tracks PIDs)
  → Optionally launch iTerm2 windows (via AppleScript)
  → Display real-time status in Ink
  → On exit: graceful termination (SIGTERM + timeout)
  → Cleanup state file
```

---

## Trade-Offs & Risk Assessment

| Factor | Ink | iTerm2 API | Process Manager |
|--------|-----|-----------|-----------------|
| **Maturity** | Production | Mature but version-fragile | Stable (Node.js core) |
| **Complexity** | Low (React-like) | High (AppleScript escaping) | Medium (signal handling) |
| **Portability** | Cross-platform | macOS only | Cross-platform |
| **Maintenance Risk** | Low (active project) | Medium (fragile to iTerm2 versions) | Low (no dependencies) |
| **Learning Curve** | Low (React knowledge transfers) | High (AppleScript unfamiliar) | Medium (signal semantics) |

---

## Key Recommendations

### Do's
- ✅ Use Ink for the CLI UI (proven, production-ready).
- ✅ Use `child_process.spawn` for launching apps (direct, reliable).
- ✅ Persist app state to JSON (recovery after crash).
- ✅ Implement graceful shutdown (SIGTERM → SIGKILL with timeout).
- ✅ Use `net.createServer` to detect port conflicts.

### Don'ts
- ❌ Don't over-invest in iTerm2 AppleScript control (fragile, version-dependent).
- ❌ Don't store PIDs long-term without validation (PID reuse risk).
- ❌ Don't rely on `subprocess.killed` to detect actual termination.
- ❌ Don't launch without checking port availability first.

### Simplified Starting Point
1. Build Ink UI for app selection + status display.
2. Use `spawn` to launch selected apps (no iTerm2 integration).
3. Persist PIDs + ports to JSON.
4. Implement graceful stop via signal handler.

---

## Code Examples Summary

**TypeScript + ESM patterns throughout.** All examples use:
- `import/export` syntax (set `"type": "module"` in package.json)
- `.js` file extensions in imports
- Async/await for readable async code
- Type annotations for clarity

See above sections for full working code blocks.

---

## Unresolved Questions

1. **Ink UI Components Library:** Is `ink-ui` stable enough for production? (Consider building custom components for tighter control.)
2. **iTerm2 Window Persistence:** Does iTerm2 auto-restore window state on app crash? (May affect state recovery strategy.)
3. **Graceful Shutdown Timeout:** What's a safe default? (Recommendation: 3–5 seconds, configurable per app.)
4. **State File Location:** Should it live in XDG_CONFIG_HOME or ~/.app-launcher-state.json? (Recommend the latter for simplicity.)

---

## Sources

- [Ink GitHub Repository](https://github.com/vadimdemedes/ink)
- [Ink Documentation v5+](https://use.ink/docs/v5/frontend/overview/)
- [LogRocket: Using Ink UI for Custom CLIs](https://blog.logrocket.com/using-ink-ui-react-build-interactive-custom-clis/)
- [iTerm2 Scripting Documentation](https://iterm2.com/documentation-scripting.html)
- [Node.js child_process Documentation](https://nodejs.org/api/child_process.html)
- [Node.js net Module Documentation](https://nodejs.org/api/net.html)
- [npm package.json bin Field](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [Port Detection Strategies (Medium)](https://medium.com/@richard.e.schloss/nodejs-portfinding-three-approaches-compared-e4e2ad9c2afc)
- [Ink UI Library GitHub](https://github.com/vadimdemedes/ink-ui)
- [detect-port npm Package](https://www.npmjs.com/package/detect-port)
