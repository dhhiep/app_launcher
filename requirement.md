# App Launcher

## What & Why

Managing multiple dev apps (backend, frontend, mobile) requires remembering commands, ports, and paths for each one. Manually `cd`-ing into folders and running commands is time-consuming and error-prone, especially when running many apps simultaneously.

App Launcher solves this by providing a CLI tool with an interactive TUI to select, launch, monitor, and stop apps — all pre-configured in a single config file. Distributed via npm for easy team adoption.

## Tech Stack

- **Language:** TypeScript (ESM)
- **TUI:** Ink v5 (React for CLI)
- **Terminal:** iTerm2 (macOS) + tmux fallback (Linux)
- **Process tracking:** Node.js child_process, net module
- **Git monitoring:** subprocess (git CLI)
- **Distribution:** npm package (`npm i -g @hieepjddinh/app-launcher`)

## Features

### 1. Global Config File

Config lives at `~/.app-launcher/config.json`. Contains workspace and app definitions.

```json
{
  "workspaces": [
    {
      "workspace_1": {
        "root_path": "/path/to/workspace_1",
        "apps": [
          {
            "name": "backend_1",
            "command": "rails -s -p ${port}",
            "relative_path": "backend_1_project",
            "port": 3000,
            "tab": "1_1"
          },
          {
            "name": "backend_2",
            "command": "rails -s -p ${port}",
            "relative_path": "backend_2_project",
            "port": 3001,
            "tab": "2_1"
          },
          {
            "name": "frontend_1",
            "command": "npm start",
            "relative_path": "frontend_1_project",
            "port": 8080,
            "tab": "1_2"
          },
          {
            "name": "frontend_2",
            "command": "npm start",
            "relative_path": "frontend_2_project",
            "port": 8081,
            "tab": "2_2"
          }
        ]
      },
      "workspace_2": {
        "root_path": "/path/to/workspace_2",
        "apps": [
          {
            "name": "mobile_1",
            "command": "npm start",
            "relative_path": "mobile_1_project",
            "port": 8082
          },
          {
            "name": "mobile_2",
            "command": "npm start",
            "relative_path": "mobile_2_project",
            "port": 8083
          }
        ]
      }
    }
  ]
}
```

**Notes:**
- `command` is the run command only — launcher auto-handles `cd` to `${root_path}/${relative_path}` behind the scenes
- `${port}` in command is interpolated from the `port` field
- `tab` field controls terminal split layout (see Feature 6)

### 2. Interactive TUI (Two Views)

- **Tree View (default):** Shows workspace list. Select a workspace to see its apps. Multi-select apps with Space, launch with Enter.
- **Table View:** Press Tab to toggle — shows all apps in a tree layout across workspaces. Allows selecting apps from different workspaces (e.g., workspace_1/backend_1 + workspace_2/mobile_1).
- **Dashboard mode:** After launching, TUI stays open as a live status monitor (see Feature 4). Ctrl+C to quit.

### 3. CLI Direct Mode

Supports running without TUI via flags:
- `app-launcher --workspace workspace_1` — opens TUI filtered to workspace_1 apps
- `app-launcher --workspace workspace_1 --app backend_1,frontend_1` — launches directly without TUI
- `app-launcher --status` — prints status table to stdout

### 4. Status Dashboard (Task Manager)

When running, displays a live status table for launched apps:

| Column | Description |
|--------|-------------|
| App Name | Name from config |
| Port | Port number + availability indicator |
| Status | Running / Stopped (tracked via PID or port listening) |
| PID | Process ID |
| Git Branch | Current branch name |
| Git Commits | Total commits + ahead/behind arrows (e.g., `↑3 ↓1`) |

Status refreshes every 2 seconds.

### 5. Stop Apps

- **Via TUI:** Select a running app in status table, press Ctrl+X to stop
- **Via CLI:** `app-launcher --stop --workspace workspace_1 --app backend_1` — stops directly without TUI

### 6. Terminal Split Panes

When launching apps, opens a new iTerm2 window (macOS) or tmux session (Linux):
- `tab` field blank/missing → new tab (single pane)
- `tab: "1_1"`, `tab: "1_2"` → same tab, split vertically (2 columns)
- `tab: "2_1"`, `tab: "2_2"` → second row, split vertically

Example: 4 apps with tabs `1_1`, `1_2`, `2_1`, `2_2` create a 2x2 grid of panes.

### 7. Remember Last Selection

On startup, the TUI auto-checks previously selected apps from the last session. Selection is saved to `~/.app-launcher/state.json` whenever apps are launched.
