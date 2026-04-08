// Git status monitoring service with TTL cache
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitStatus {
  branch: string;       // "" if not a git repo or detached HEAD fallback
  ahead: number;
  behind: number;
  dirty: boolean;
  totalCommits: number;
  latestCommit: string; // latest commit message (short)
  error?: string;       // set if not a git repo or git unavailable
}

interface CacheEntry {
  timestamp: number;
  status: GitStatus;
}

const ERROR_STATUS = (error: string): GitStatus => ({
  branch: '',
  ahead: 0,
  behind: 0,
  dirty: false,
  totalCommits: 0,
  latestCommit: '',
  error,
});

export class GitMonitor {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number;

  constructor(cacheTtlMs = 10_000) {
    this.ttl = cacheTtlMs;
  }

  /** Run a git command in the given repo directory with a 5s timeout. */
  private async runGit(repoPath: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      timeout: 5000,
    });
    return stdout.trim();
  }

  /** Get current branch name; fallback to short commit hash for detached HEAD. */
  private async getBranch(repoPath: string): Promise<string> {
    const branch = await this.runGit(repoPath, ['branch', '--show-current']);
    if (branch) return branch;
    // Detached HEAD — return short hash as identifier
    return this.runGit(repoPath, ['rev-parse', '--short', 'HEAD']);
  }

  /**
   * Get ahead/behind counts relative to upstream.
   * Returns [0, 0] if no upstream is configured.
   */
  private async getAheadBehind(repoPath: string): Promise<[number, number]> {
    try {
      const output = await this.runGit(repoPath, [
        'rev-list',
        '--count',
        '--left-right',
        'HEAD...@{u}',
      ]);
      // Output format: "ahead\tbehind"
      const [aheadStr, behindStr] = output.split('\t');
      return [parseInt(aheadStr ?? '0', 10), parseInt(behindStr ?? '0', 10)];
    } catch {
      // No upstream configured or other error — treat as 0/0
      return [0, 0];
    }
  }

  /** Check if working tree has uncommitted changes. */
  private async isDirty(repoPath: string): Promise<boolean> {
    const output = await this.runGit(repoPath, ['status', '--porcelain']);
    return output.trim().length > 0;
  }

  /** Count total reachable commits from HEAD. */
  private async getTotalCommits(repoPath: string): Promise<number> {
    const output = await this.runGit(repoPath, ['rev-list', '--count', 'HEAD']);
    return parseInt(output, 10) || 0;
  }

  /** Get latest commit message (first line only). */
  private async getLatestCommit(repoPath: string): Promise<string> {
    try {
      const output = await this.runGit(repoPath, ['log', '-1', '--pretty=%s']);
      return output.slice(0, 50); // Truncate to reasonable length
    } catch {
      return '';
    }
  }

  /**
   * Return cached GitStatus if fresh, otherwise query git and update cache.
   * Never throws — returns GitStatus with error field on failure.
   */
  async getStatus(repoPath: string): Promise<GitStatus> {
    const cached = this.cache.get(repoPath);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.status;
    }

    let status: GitStatus;
    try {
      const [branch, [ahead, behind], dirty, totalCommits, latestCommit] = await Promise.all([
        this.getBranch(repoPath),
        this.getAheadBehind(repoPath),
        this.isDirty(repoPath),
        this.getTotalCommits(repoPath),
        this.getLatestCommit(repoPath),
      ]);
      status = { branch, ahead, behind, dirty, totalCommits, latestCommit };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Distinguish "not a git repo" from other errors
      const isNotRepo =
        message.includes('not a git repository') ||
        message.includes('fatal:');
      status = ERROR_STATUS(
        isNotRepo ? 'not a git repository' : `git error: ${message}`,
      );
    }

    this.cache.set(repoPath, { timestamp: Date.now(), status });
    return status;
  }

  /**
   * Refresh git status for all provided paths in parallel.
   * Returns a Map of repoPath → GitStatus.
   */
  async refreshAll(repoPaths: string[]): Promise<Map<string, GitStatus>> {
    const entries = await Promise.all(
      repoPaths.map(async (p) => [p, await this.getStatus(p)] as const),
    );
    return new Map(entries);
  }
}
