# Phase 3: Git Monitor Service

## Context

- [Process/Git Research](../../plans/reports/researcher-260408-1142-process-git-research.md)
- [Phase 1: Config](./phase-01-project-setup-and-config.md)

## Overview

- **Priority:** P2
- **Status:** Complete
- **Effort:** 2h
- Git status monitoring per app: branch name, ahead/behind remote, dirty state. Cached with TTL.

## Key Insights

- Use `child_process.execSync`/`exec` for git commands (no external deps)
- `git branch --show-current` for branch name
- `git rev-list --count` for ahead/behind
- `git status --porcelain` for dirty check
- Cache with 10s TTL to avoid disk/network thrashing

## Requirements

### Functional
- Get current branch name per app repo
- Count commits ahead/behind remote
- Detect uncommitted changes (dirty flag)
- Display format: `branch total arrow_up/arrow_down`

### Non-functional
- Non-blocking (Promise-based)
- Cached (10s TTL default)
- Graceful degradation if git not available or not a repo

## Related Code Files

### Create
- `src/services/git-monitor.ts`

## Implementation Steps

1. Create `src/services/git-monitor.ts`:
   ```typescript
   interface GitStatus {
     branch: string;
     ahead: number;
     behind: number;
     dirty: boolean;
     totalCommits: number;
     error?: string;
   }
   
   export class GitMonitor {
     private cache: Map<string, { timestamp: number; status: GitStatus }>;
     private ttl: number;
     
     constructor(cacheTtlMs = 10_000) { ... }
     
     async getStatus(repoPath: string): Promise<GitStatus> { ... }
     private async runGit(repoPath: string, args: string[]): Promise<string> { ... }
     private async getBranch(repoPath: string): Promise<string> { ... }
     private async getAheadBehind(repoPath: string, branch: string): Promise<[number, number]> { ... }
     private async isDirty(repoPath: string): Promise<boolean> { ... }
     private async getTotalCommits(repoPath: string): Promise<number> { ... }
     async refreshAll(repoPaths: string[]): Promise<Map<string, GitStatus>> { ... }
   }
   ```

2. `runGit()` helper: `execFile('git', args, { cwd, timeout: 5000 })` wrapped in Promise

3. `getStatus()` flow:
   - Check cache TTL, return cached if fresh
   - Run all git checks via Promise.all (parallel within single repo)
   - Update cache, return GitStatus
   - On failure: return GitStatus with error field

4. `refreshAll()`: `Promise.all()` across all repos (parallel)

5. Repo path: `path.join(workspace.root_path, app.relative_path)`

## Todo List

- [ ] Define GitStatus interface
- [ ] Implement GitMonitor with TTL cache
- [ ] Implement runGit helper with timeout
- [ ] Implement branch, ahead/behind, dirty, totalCommits methods
- [ ] Implement parallel refreshAll
- [ ] Handle edge cases: not a git repo, no remote, detached HEAD

## Success Criteria

- `getStatus("/path/to/repo")` returns correct GitStatus
- Cache returns within TTL window without re-querying
- No crash if path is not a git repo
- `refreshAll()` runs in parallel

## Risk Assessment

- **git fetch blocks on network** — skip fetch by default, use cached remote refs
  - Mitigation: only fetch on explicit user refresh action
- **Detached HEAD** — `--show-current` returns empty
  - Mitigation: fallback to `git rev-parse --short HEAD`

## Next Steps

- Phase 4 TUI displays GitStatus in status table columns
