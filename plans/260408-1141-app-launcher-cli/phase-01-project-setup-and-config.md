# Phase 1: Project Setup & Config

## Context

- [Requirement](../../requirement.md)
- [Plan Overview](./plan.md)

## Overview

- **Priority:** P1
- **Status:** Complete
- **Effort:** 2h
- Setup TypeScript + Ink project, create types, implement apps.json config loader with variable interpolation, state manager with last selection.

## Key Insights

- apps.json command field is the run command only (e.g. `rails -s -p ${port}`), NOT including `cd`
- Launcher auto-resolves working directory: `${root_path}/${relative_path}`
- Template variables in command: `${port}` (and any future vars)
- Workspaces array contains named workspace objects with `root_path` and `apps`
- Tab field optional (blank = new tab, "row_col" = split pane position)
- ESM project (`"type": "module"` in package.json)
- Ink v5 requires React 18+

## Requirements

### Functional
- Parse apps.json with workspace/app definitions
- Interpolate template variables in command strings
- Validate config (required fields, port uniqueness, valid tab format)
- Persist/load state (PIDs, last selection) via JSON file

### Non-functional
- Fast startup (<100ms for config loading)
- Clear error messages for invalid config

## Related Code Files

### Create
- `package.json` — npm config, deps, bin entry
- `tsconfig.json` — TypeScript config (ESM, JSX)
- `src/types.ts` — Workspace, AppConfig, AppStatus interfaces
- `src/services/config-loader.ts` — JSON parsing + interpolation
- `src/services/state-manager.ts` — JSON state persistence
- `config.example.json` — sample config (user copies to `~/.app-launcher/config.json`)

## Implementation Steps

1. Create `package.json`:
   ```json
   {
     "name": "@hieepjddinh/app-launcher",
     "version": "0.1.0",
     "type": "module",
     "bin": { "app-launcher": "./dist/cli.js" },
     "scripts": {
       "build": "tsc",
       "dev": "tsx src/cli.ts",
       "start": "node dist/cli.js"
     },
     "dependencies": {
       "ink": "^5.0.0",
       "react": "^18.0.0",
       "commander": "^12.0.0"
     },
     "devDependencies": {
       "@types/react": "^18.0.0",
       "typescript": "^5.4.0",
       "tsx": "^4.0.0"
     }
   }
   ```

2. Create `tsconfig.json`:
   - Target: ES2022, Module: NodeNext
   - JSX: react-jsx (for Ink components)
   - outDir: dist, rootDir: src

3. Create `src/types.ts`:
   ```typescript
   export interface AppConfig {
     name: string;
     command: string;       // Template with ${vars}
     relative_path: string;
     port: number;
     tab?: string;          // "" = new tab, "1_1" = pane position
   }

   export interface Workspace {
     name: string;
     root_path: string;
     apps: AppConfig[];
   }

   export interface AppStatus {
     app: AppConfig;
     workspace: Workspace;
     pid?: number;
     running: boolean;
     portAvailable: boolean;
     branch: string;
     ahead: number;
     behind: number;
     dirty: boolean;
   }

   export interface LauncherState {
     processes: Record<string, { pid: number; port: number; launchedAt: string }>;
     lastSelection: string[];  // ["workspace_1/backend_1", ...]
   }
   ```

4. Create `src/services/config-loader.ts`:
   - `loadConfig(path?: string): Workspace[]` — parse config.json (default: `~/.app-launcher/config.json`)
   - `interpolateCommand(app: AppConfig): string` — replace `${port}` and future vars in command
   - `resolveAppPath(app: AppConfig, workspace: Workspace): string` — returns `path.join(root_path, relative_path)` as cwd
   - Validate: required fields, port uniqueness, tab format `\d+_\d+` or empty

5. Create `src/services/state-manager.ts`:
   - `loadState(): LauncherState` — read from `~/.app-launcher/state.json`
   - `saveState(state: LauncherState): void`
   - `saveLastSelection(keys: string[]): void`
   - `getLastSelection(): string[]`
   - Validate PIDs on load (check if process still alive)

6. Create sample `apps.json` matching requirement format

## Todo List

- [ ] Create package.json with deps and bin entry
- [ ] Create tsconfig.json for ESM + JSX
- [ ] Define types (Workspace, AppConfig, AppStatus, LauncherState)
- [ ] Implement config-loader with JSON parsing + interpolation
- [ ] Implement state-manager with last selection persistence
- [ ] Add config validation (ports, tab format)
- [ ] Create config.example.json
- [ ] Ensure `~/.app-launcher/` directory auto-created on first run
- [ ] Run `npm install` and verify `tsx src/cli.ts` works

## Success Criteria

- `loadConfig("apps.json")` returns typed Workspace array
- Template interpolation produces correct shell commands
- State manager reads/writes `~/.app-launcher-state.json`
- Invalid config throws clear error messages
- `npm run dev` starts without errors

## Risk Assessment

- **apps.json format** — requirement shows unusual structure (array of objects with workspace name as key); parse carefully
- **ESM + React JSX** — ensure tsconfig.json JSX setting works with Ink v5

## Next Steps

- Phase 2 uses types and services to launch/stop apps
