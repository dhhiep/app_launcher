# Phase 2: Process & iTerm2 Services

## Context

- [Ink/iTerm2/Process Research](./reports/researcher-260408-1150-ink-iterm-typescript-research.md)
- [Phase 1: Config](./phase-01-project-setup-and-config.md)

## Overview

- **Priority:** P1
- **Status:** Pending
- **Effort:** 4h
- Implement process lifecycle (launch/stop/track) and iTerm2 window/tab/pane management via AppleScript.

## Key Insights

- iTerm2 controlled via `osascript` (AppleScript) — fragile but functional
- Keep iTerm2 integration minimal: create windows/tabs/panes + send commands only
- `child_process.spawn` not used for app processes — iTerm2 owns the process lifecycle
- Track processes via port polling → PID lookup (since iTerm2 `write text` doesn't return PID)
- Port check: `net.createServer` for availability, `lsof -i :PORT` for PID lookup
- Graceful stop: find PID via port, send SIGTERM -> SIGKILL

## Requirements

### Functional
- Launch app commands in iTerm2 panes (respect tab field layout)
- Track launched processes via port → PID mapping
- Stop individual apps gracefully
- Detect port availability before launch
- Create split pane layouts from tab field coordinates

### Non-functional
- Handle iTerm2 not running (clear error message)
- Survive launcher restart (reload state, re-detect PIDs via ports)

## Related Code Files

### Create
- `src/services/process-manager.ts`
- `src/services/terminal-controller.ts` — interface/base for terminal backends
- `src/services/iterm-controller.ts` — iTerm2 AppleScript implementation
- `src/services/tmux-controller.ts` — tmux fallback implementation

## Implementation Steps

1. Create `src/services/terminal-controller.ts` — shared interface:
   ```typescript
   export interface TerminalController {
     launchApps(apps: AppConfig[], workspace: Workspace): void;
     isAvailable(): boolean;
   }
   // Auto-detect: check if iTerm2 running (macOS), else try tmux, else error
   export function createTerminalController(): TerminalController { ... }
   ```

2. Create `src/services/iterm-controller.ts` (implements TerminalController):
   ```typescript
   // Run AppleScript via osascript
   function runAppleScript(script: string): string { ... }
   
   export class ITermController {
     // Create new iTerm2 window
     createWindow(): void { ... }
     
     // Create tab in current window
     createTab(windowIdx?: number): void { ... }
     
     // Split current session vertically or horizontally
     splitPane(windowIdx: number, tabIdx: number, sessionIdx: number, vertical: boolean): void { ... }
     
     // Send command to specific session
     sendCommand(windowIdx: number, tabIdx: number, sessionIdx: number, command: string): void { ... }
     
     // Name a session
     nameSession(windowIdx: number, tabIdx: number, sessionIdx: number, name: string): void { ... }
     
     // High-level: launch apps with pane layout
     launchApps(apps: AppConfig[], workspace: Workspace): void {
       // 1. Group apps by tab field (same first digit = same tab)
       // 2. Create new window
       // 3. For each tab group: create tab, create pane grid, send commands
       // 4. Name sessions with app names
     }
   }
   ```

2. Tab field → pane grid algorithm:
   - Group apps by tab presence: apps without tab → each gets own tab
   - Apps with tab "X_Y": group by X (tab group), Y determines column
   - For each tab group: create tab, then split as needed
   - 2x2 grid: session1 → split vertical → split horizontal on each side
   - For each session: first `cd` to resolved app path, then send interpolated command
   - The `cd` is auto-prepended by the launcher — user command is just the run command (e.g. `rails -s -p 3000`)

3. Create `src/services/tmux-controller.ts` (implements TerminalController):
   ```typescript
   // tmux new-session -d -s {workspace} -n {app_name}
   // tmux split-window -h/-v -t {session}:{window}
   // tmux send-keys -t {session}:{window}.{pane} "cd ... && command" Enter
   // Tab field mapping: same grid algorithm as iTerm2, but using tmux pane splits
   ```

4. Create `src/services/process-manager.ts`:
   ```typescript
   export class ProcessManager {
     private stateManager: StateManager;
     
     // Check if port is available using net.createServer
     async isPortAvailable(port: number): Promise<boolean> { ... }
     
     // Find PID listening on port via lsof
     async findPidOnPort(port: number): Promise<number | undefined> { ... }
     
     // Register launched app (after iTerm2 sends command)
     // Poll port until listening, then find PID
     async waitForApp(appKey: string, port: number, timeout?: number): Promise<number | undefined> { ... }
     
     // Stop app: find PID via port or state, SIGTERM -> wait -> SIGKILL
     async stopApp(appKey: string): Promise<void> { ... }
     
     // Check if app is running (PID alive + port listening)
     async getStatus(appKey: string): Promise<{ running: boolean; pid?: number }> { ... }
     
     // Get all tracked app statuses
     async getAllStatuses(): Promise<AppStatus[]> { ... }
   }
   ```
   - `appKey` format: `"workspace_name/app_name"`
   - `findPidOnPort`: exec `lsof -ti :PORT` — returns PID
   - `waitForApp`: poll port every 500ms up to 30s, then lookup PID
   - `stopApp`: `process.kill(pid, 'SIGTERM')`, setTimeout SIGKILL after 5s

4. AppleScript string escaping:
   - Escape double quotes in commands: `command.replace(/"/g, '\\"')`
   - For complex commands: write to temp shell script, execute script path instead

## Todo List

- [ ] Implement `runAppleScript()` helper via osascript
- [ ] Implement TerminalController interface
- [ ] Implement ITermController with window/tab/pane creation
- [ ] Implement TmuxController with session/window/pane creation
- [ ] Implement auto-detection (iTerm2 → tmux → error)
- [ ] Implement pane grid algorithm from tab field
- [ ] Implement command execution + session naming
- [ ] Implement ProcessManager with port checking (net.createServer)
- [ ] Implement PID lookup via lsof
- [ ] Implement waitForApp (port polling after launch)
- [ ] Implement graceful stop (SIGTERM → SIGKILL)
- [ ] Integration: ProcessManager tracks what ITermController launches

## Success Criteria

- Can launch 2 apps side-by-side in iTerm2 split panes
- Can stop a running app by name
- State survives launcher restart (re-detect via port)
- Port conflict detected before launch

## Risk Assessment

- **AppleScript fragility** — string escaping, version differences
  - Mitigation: write commands to temp .sh file, execute file path in iTerm2
- **No direct PID from iTerm2** — must poll port→PID
  - Mitigation: poll with timeout, fallback to "unknown PID" status
- **lsof permissions** — may need elevated access
  - Mitigation: works for user-owned processes; fallback to port-only tracking
- **iTerm2 not installed** — osascript fails
  - Mitigation: catch error, suggest installing iTerm2

## Next Steps

- Phase 3 adds git monitoring
- Phase 4 builds TUI that uses these services
