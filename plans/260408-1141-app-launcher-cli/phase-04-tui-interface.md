# Phase 4: TUI Interface

## Context

- [Ink/iTerm2 Research](./reports/researcher-260408-1150-ink-iterm-typescript-research.md)
- [Requirement](../../requirement.md)

## Overview

- **Priority:** P1
- **Status:** Complete
- **Effort:** 5h
- Ink (React) TUI with two views: workspace tree (multi-select) and status table (task-manager). Tab toggles views. Remembers last selection.

## Key Insights

- Ink: `<Box>`, `<Text>`, `useInput`, `useApp` hooks
- No built-in tree/table — build custom components with state + useInput
- `useInput` for keyboard: `key.tab`, `key.upArrow`, `key.return`, `input === ' '`
- `useEffect` + `setInterval` for periodic status refresh
- `useFocus` intercepts Tab — avoid it if we need Tab for view toggle
- State management: React Context + useState (simple enough, no Redux)

## Requirements

### Functional
- **Tree View (default):** Hierarchical workspace > apps list, multi-select with Space, launch with Enter
- Auto-check last selected apps from state on startup
- **Table View:** Task-manager-style status display (name, port, status, PID, branch, commits)
- **Tab toggle:** Press Tab to switch Tree ↔ Table
- **Dashboard mode:** After launching, TUI stays open showing live status. User can stop/restart from TUI. Ctrl+C to quit.
- **Actions:** Enter = start selected, Ctrl+X = stop selected, q/Ctrl+C = quit, r = refresh
- **Live status:** Update every 2s — process running, port, git branch, ahead/behind
- **Notifications:** Status line for events (launched, stopped, errors)

### Non-functional
- <50ms UI response for key presses
- Status refresh non-blocking

## Architecture

```
App.tsx (Ink root)
├── Header (title + mode indicator)
├── WorkspaceTree (when mode=tree)
│   └── Custom list with checkboxes, grouped by workspace
├── StatusTable (when mode=table)
│   └── Custom table with colored status
├── StatusBar (last action notification)
└── HelpBar (keybindings)

Services injected via React Context:
├── ConfigLoader
├── ProcessManager
├── ITermController
├── GitMonitor
└── StateManager
```

## Related Code Files

### Create
- `src/app.tsx` — main Ink App component
- `src/components/workspace-tree.tsx` — multi-select tree
- `src/components/status-table.tsx` — status display table
- `src/context/services-context.tsx` — React context for services

## Implementation Steps

1. Create `src/components/workspace-tree.tsx`:
   ```tsx
   // Props: workspaces, initialSelection (from lastSelection), onLaunch
   // State: cursor position, selected set
   // Display: workspace headers (bold) > app items with [ ]/[x] prefix
   // Keys: Up/Down=navigate, Space=toggle, Enter=launch selected, a=select all
   // Format: "[x] backend_1 (port: 3000)"
   ```
   - Flat list internally: workspace headers as non-selectable separators
   - `initialSelection` prop loaded from StateManager.getLastSelection()
   - On launch: save selection to state, call TerminalController + ProcessManager
   - After launch: auto-switch to table view (dashboard mode)

2. Create `src/components/status-table.tsx`:
   ```tsx
   // Props: statuses (AppStatus[]), onStop
   // State: cursor row
   // Display: table with columns: App | Workspace | Status | Port | PID | Branch | Commits
   // Keys: Up/Down=navigate, Ctrl+X=stop selected, r=refresh
   // Status: green "running" / red "stopped" / yellow "starting"
   // Commits: "main 142 ↑3 ↓1"
   ```
   - Use `<Box>` grid with fixed-width `<Text>` columns
   - Color status with `<Text color="green">running</Text>`

3. Create `src/app.tsx`:
   ```tsx
   const App: React.FC<{ config: Workspace[], filter?: string }> = ({ config, filter }) => {
     const [view, setView] = useState<'tree' | 'table'>('tree');
     const [statuses, setStatuses] = useState<AppStatus[]>([]);
     const [message, setMessage] = useState('');
     
     useInput((input, key) => {
       if (key.tab) setView(v => v === 'tree' ? 'table' : 'tree');
       if (input === 'q') process.exit(0);
     });
     
     // Periodic status refresh
     useEffect(() => {
       const timer = setInterval(async () => {
         const newStatuses = await processManager.getAllStatuses();
         // Enrich with git status
         setStatuses(newStatuses);
       }, 2000);
       return () => clearInterval(timer);
     }, []);
     
     return (
       <Box flexDirection="column">
         <Text bold>App Launcher [{view}]</Text>
         {view === 'tree' && <WorkspaceTree ... />}
         {view === 'table' && <StatusTable ... />}
         <Text dimColor>{message}</Text>
         <Text dimColor>Tab: toggle | Space: select | Enter: launch | Ctrl+X: stop | q: quit</Text>
       </Box>
     );
   };
   ```

4. Create `src/context/services-context.tsx`:
   - React context providing ConfigLoader, ProcessManager, ITermController, GitMonitor, StateManager
   - Initialize services once in cli.ts, pass via context provider

5. Wire services:
   - On mount: load config, load last selection from state
   - On launch: save selection → ITermController.launchApps() → ProcessManager.waitForApp()
   - On stop: ProcessManager.stopApp() → update state
   - On refresh timer: ProcessManager.getAllStatuses() + GitMonitor.refreshAll()

## Todo List

- [ ] Create WorkspaceTree component with multi-select
- [ ] Implement last selection auto-check on startup
- [ ] Create StatusTable component with colored status
- [ ] Create App.tsx with Tab view toggle
- [ ] Create services context
- [ ] Wire launch flow (selection → iTerm2 → process tracking)
- [ ] Wire stop flow (table → process manager)
- [ ] Wire periodic status + git refresh
- [ ] Add status bar for notifications
- [ ] Add help bar with keybindings

## Success Criteria

- Tree shows workspaces/apps, last selection auto-checked
- Can multi-select and launch with Enter
- Table shows running app status with colors
- Tab toggles between views
- Status updates every 2s without UI freeze

## Risk Assessment

- **Tab key conflict** — Ink's `useFocus` intercepts Tab
  - Mitigation: don't use `useFocus`, handle Tab in root `useInput` only
- **Async operations from Ink** — iTerm2 AppleScript calls are sync (execSync)
  - Mitigation: use async exec variant or run in worker to avoid UI freeze
- **Terminal size** — table may overflow narrow terminals
  - Mitigation: truncate long values, use `process.stdout.columns` for responsive layout

## Next Steps

- Phase 5 adds CLI arguments that bypass TUI for direct launch/stop
