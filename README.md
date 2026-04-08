# App Launcher

CLI tool to launch, monitor, and stop multiple dev apps across workspaces. Interactive TUI for app selection and live status dashboard. Supports iTerm2 split panes (macOS) and tmux (Linux).

## Install

```bash
npm install -g @hiep/app-launcher
```

Or run directly:

```bash
npx @hiep/app-launcher
```

## Setup

Create config file at `~/.app-launcher/config.json`:

```json
{
  "workspaces": [
    {
      "my_project": {
        "root_path": "/path/to/my_project",
        "apps": [
          {
            "name": "api",
            "command": "rails -s -p ${port}",
            "relative_path": "api",
            "port": 3000,
            "tab": "1_1"
          },
          {
            "name": "web",
            "command": "npm start",
            "relative_path": "web",
            "port": 8080,
            "tab": "1_2"
          }
        ]
      }
    }
  ]
}
```

### Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | App display name |
| `command` | Yes | Run command (supports `${port}` interpolation) |
| `relative_path` | Yes | Path relative to `root_path` (auto-cd before running) |
| `port` | Yes | Port number |
| `tab` | No | Terminal layout — blank = new tab, `"1_1"`/`"1_2"` = split panes |

### Tab Layout

The `tab` field controls how apps are arranged in terminal panes:

- **Missing/blank** — opens in a new tab
- **`"1_1"`, `"1_2"`** — same tab, split vertically (2 columns)
- **`"1_1"`, `"1_2"`, `"2_1"`, `"2_2"`** — 2x2 grid

Format: `"row_column"`.

## Usage

### Interactive Mode (TUI)

```bash
app-launcher
```

Opens the interactive TUI with two views:

- **Tree View** (default) — select workspace, then multi-select apps
- **Table View** — live status dashboard for running apps

Press `Tab` to toggle between views.

### Keybindings

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate |
| `Space` | Toggle app selection |
| `Enter` | Launch selected apps |
| `Tab` | Switch Tree / Table view |
| `Ctrl+X` | Stop selected app |
| `r` | Refresh status |
| `q` / `Ctrl+C` | Quit |

### CLI Direct Mode

```bash
# Filter TUI to a workspace
app-launcher -w my_project

# Launch specific apps directly (no TUI)
app-launcher -w my_project -a api,web

# Stop specific apps
app-launcher --stop -w my_project -a api

# Show status table
app-launcher --status

# Custom config path
app-launcher -c /path/to/config.json
```

## Status Dashboard

After launching, the TUI stays open as a live dashboard showing:

| Column | Description |
|--------|-------------|
| App | App name |
| Workspace | Workspace name |
| Status | Running / Stopped |
| Port | Port number + availability |
| PID | Process ID |
| Branch | Git branch name |
| Commits | Ahead/behind remote (e.g., `142 ↑3 ↓1`) |

Status refreshes every 2 seconds.

## Features

- **Multi-workspace support** — organize apps by project
- **iTerm2 + tmux** — split panes on macOS (iTerm2) and Linux (tmux)
- **Remember last selection** — previously selected apps auto-checked on startup
- **Git monitoring** — branch name, ahead/behind, dirty status per app
- **Port detection** — warns if port is already in use before launch
- **Graceful shutdown** — SIGTERM with fallback to SIGKILL

## Requirements

- Node.js 18+
- iTerm2 (macOS) or tmux (Linux) for split-pane features
- Git (for git status monitoring)

## Development

```bash
git clone <repo-url>
cd app-launcher
npm install
npm run dev
```

## License

MIT
