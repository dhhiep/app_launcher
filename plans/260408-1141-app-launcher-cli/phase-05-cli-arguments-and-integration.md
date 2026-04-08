# Phase 5: CLI Arguments & Integration

## Context

- [Requirement](../../requirement.md)
- [Phase 4: TUI](./phase-04-tui-interface.md)

## Overview

- **Priority:** P1
- **Status:** Complete
- **Effort:** 3h
- CLI entry point with commander. Supports direct launch/stop via flags or interactive TUI mode. npm bin entry point.

## Key Insights

- No args = launch TUI (interactive mode)
- `--workspace` + `--app` = direct launch (skip TUI)
- `--stop` flag = stop mode
- Entry point: `#!/usr/bin/env node` in `dist/cli.js`
- Commander for arg parsing (standard in Node.js ecosystem)

## Requirements

### Functional
- `app-launcher` — opens TUI for interactive selection
- `app-launcher -w ws1` — TUI filtered to ws1 apps
- `app-launcher -w ws1 -a backend_1,frontend_1` — direct launch, no TUI
- `app-launcher --stop -w ws1 -a backend_1` — direct stop, no TUI
- `app-launcher --status` — print status table to stdout (no TUI)
- `app-launcher -c path/to/config.json` — custom config path (default: `~/.app-launcher/config.json`)

### Non-functional
- Fast CLI parsing (<50ms)
- Helpful `--help` output
- Exit codes: 0=success, 1=error, 2=config not found

## Related Code Files

### Create
- `src/cli.ts` — commander setup + routing logic

## Implementation Steps

1. Create `src/cli.ts`:
   ```typescript
   #!/usr/bin/env node
   import { Command } from 'commander';
   import React from 'react';
   import { render } from 'ink';
   import { App } from './app.js';
   import { loadConfig } from './services/config-loader.js';
   import { ProcessManager } from './services/process-manager.js';
   import { ITermController } from './services/iterm-controller.js';
   import { StateManager } from './services/state-manager.js';
   
   const program = new Command()
     .name('app-launcher')
     .description('Launch and manage dev apps across workspaces')
     .option('-w, --workspace <name>', 'Workspace name')
     .option('-a, --app <names>', 'Comma-separated app names')
     .option('--stop', 'Stop mode')
     .option('--status', 'Show status table')
     .option('-c, --config <path>', 'Config file path', '~/.app-launcher/config.json')
     .parse();
   
   const opts = program.opts();
   // Route to: TUI, direct launch, direct stop, or status print
   ```

2. Routing logic:
   - `--status` → print Rich-style table to stdout via chalk + cli-table3
   - `--stop -w -a` → direct stop via ProcessManager
   - `-w -a` (no --stop) → direct launch via ITermController + ProcessManager
   - `-w` only → TUI filtered to workspace
   - no flags → full TUI

3. Direct launch flow:
   - Load config, find workspace + apps
   - Check port availability for each app
   - ITermController.launchApps() → send commands to iTerm2
   - ProcessManager.waitForApp() → poll ports, find PIDs
   - StateManager.saveLastSelection() → remember for next time
   - Print results to stdout, exit

4. Direct stop flow:
   - Load state, find apps by workspace/name
   - ProcessManager.stopApp() for each
   - Print results, exit

5. Status print:
   - Load state + config
   - ProcessManager.getAllStatuses()
   - GitMonitor.refreshAll()
   - Print formatted table (chalk colors + padded columns)

## Todo List

- [ ] Create cli.ts with commander setup
- [ ] Implement routing logic (TUI vs direct modes)
- [ ] Implement direct launch flow
- [ ] Implement direct stop flow
- [ ] Implement status print (formatted table to stdout)
- [ ] Wire Ink render for TUI modes
- [ ] Handle errors and exit codes
- [ ] Add shebang and verify `npm link` works
- [ ] Test all CLI patterns from requirement

## Success Criteria

- `app-launcher` opens TUI
- `app-launcher -w workspace_1 -a backend_1,frontend_1` launches directly
- `app-launcher --stop -w workspace_1 -a backend_1` stops app
- `app-launcher --status` prints colored table
- `npm link` → `app-launcher` available globally
- Invalid input shows helpful error with exit code

## Risk Assessment

- **Two render paths** — Ink TUI vs stdout print; ensure no Ink artifacts in non-TUI mode
  - Mitigation: only call `render()` in TUI mode; use console.log for direct modes
- **Config path resolution** — relative vs absolute
  - Mitigation: resolve relative to CWD, support `~` expansion via `os.homedir()`

## Next Steps

- After all phases: end-to-end testing, npm publish
- Future: `--restart` flag, config watch mode, workspace groups
