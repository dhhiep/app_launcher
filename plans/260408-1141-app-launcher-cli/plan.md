---
title: "App Launcher CLI Tool"
description: "TypeScript CLI with Ink TUI for managing multiple dev apps across workspaces with iTerm2 split panes"
status: pending
priority: P1
effort: 16h
branch: main
tags: [cli, typescript, tui, devtools, npm]
blockedBy: []
blocks: []
created: 2026-04-08
---

# App Launcher CLI Tool

## Overview

CLI tool to launch, monitor, and stop multiple dev apps (backend, frontend, mobile) across workspaces. Uses Ink (React for CLI) for interactive selection and status display, iTerm2 AppleScript for split-pane terminal management. Distributed via npm.

**Stack:** TypeScript | Ink v5 (React TUI) | iTerm2 AppleScript | Node.js child_process/net | npm package

## Research Reports

- [Textual TUI + iTerm2 Python Research](../reports/researcher-260408-1141-textual-iterm-research.md) (original, superseded)
- [Process Management + Git Research](../reports/researcher-260408-1142-process-git-research.md) (git patterns still relevant)
- [Ink + iTerm2 AppleScript + Node.js Research](./reports/researcher-260408-1150-ink-iterm-typescript-research.md)

## Architecture

```
app-launcher/
├── package.json              # npm package config, bin entry point
├── tsconfig.json
├── # Config at ~/.app-launcher/config.json (global)
├── src/
│   ├── cli.ts                # Entry point (commander/argparse + routing)
│   ├── app.tsx               # Ink App component (root)
│   ├── types.ts              # Shared types (Workspace, AppConfig, AppStatus)
│   ├── components/
│   │   ├── workspace-tree.tsx    # Tree/list view with multi-select
│   │   └── status-table.tsx      # Task-manager status display
│   └── services/
│       ├── config-loader.ts      # apps.json parser + variable interpolation
│       ├── process-manager.ts    # Launch/stop/track via child_process
│       ├── iterm-controller.ts   # iTerm2 AppleScript via osascript
│       ├── tmux-controller.ts    # tmux fallback for Linux
│       ├── git-monitor.ts        # Branch, ahead/behind, dirty status
│       └── state-manager.ts      # JSON state persistence + last selection
└── dist/                     # Compiled output
```

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Project Setup & Config](./phase-01-project-setup-and-config.md) | Pending | 2h |
| 2 | [Process & iTerm2 Services](./phase-02-process-and-iterm-services.md) | Pending | 4h |
| 3 | [Git Monitor Service](./phase-03-git-monitor-service.md) | Pending | 2h |
| 4 | [TUI Interface](./phase-04-tui-interface.md) | Pending | 5h |
| 5 | [CLI Arguments & Integration](./phase-05-cli-arguments-and-integration.md) | Pending | 3h |

## Dependencies

- Node.js 18+
- iTerm2 (macOS) or tmux (Linux/other) for split-pane features
- Git installed (for git monitoring features)
- npm for distribution

## Key Decisions

1. **Ink v5 over blessed/prompts** — React-like, production-proven (GitHub Copilot CLI, Wrangler, Prisma)
2. **iTerm2 + tmux fallback** — iTerm2 AppleScript primary (macOS), tmux for Linux/other terminals
3. **child_process.spawn** — Direct PID tracking, no external deps
4. **net.createServer** — Port availability check without psutil dependency
5. **Global config** — `~/.app-launcher/config.json` (not per-project)
6. **State file** — `~/.app-launcher/state.json` persists PIDs + last selection
7. **Remember last selection** — State file stores last selected apps; auto-checked on TUI startup
8. **Dashboard mode** — TUI stays open after launch as live status dashboard (Ctrl+C to quit)
9. **npm package** — `npx @hiep/app-launcher` or `npm i -g` for team distribution
