# Process Management & Git Monitoring for CLI Launcher

**Research Date:** 2026-04-08  
**Scope:** Python subprocess/psutil for process management; GitPython/subprocess for git operations  
**Target:** Lightweight, production-ready approaches for a CLI launcher app

---

## TOPIC 1: Python Process Management

### 1.1 Spawning & Tracking Processes via PID

**Recommended:** Use `subprocess.Popen()` directly; avoid external dependencies for basic use.

```python
import subprocess
import signal
import time

# Spawn process and capture PID
proc = subprocess.Popen(["/usr/bin/python", "app.py"], 
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE)
pid = proc.pid
print(f"Started process with PID: {pid}")

# Store PID for later tracking
with open("app.pid", "w") as f:
    f.write(str(pid))
```

**Critical caveat:** If using `shell=True`, `Popen.pid` returns the shell's PID, not the actual command's PID. Avoid `shell=True` for this reason.

**Lightweight approach:** Store PID in a `.pid` file (plaintext or JSON). On startup, validate PID is still running via `os.kill(pid, 0)` (no-op signal check).

```python
import os
import signal

def is_process_alive(pid):
    """Check if PID exists without raising exception."""
    try:
        os.kill(pid, 0)  # Signal 0 does nothing but checks if process exists
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # Process exists but we can't signal it (different user)
```

---

### 1.2 Detecting Port Usage & Finding Process Owner

**Recommendation:** Use `psutil` only for this—subprocess can't easily enumerate open ports.

```python
import psutil

def find_process_on_port(port):
    """Find PID and process name using a specific port."""
    try:
        for conn in psutil.net_connections(kind='inet'):
            if conn.laddr.port == port and conn.status == psutil.CONN_LISTEN:
                try:
                    proc = psutil.Process(conn.pid)
                    return {
                        "pid": conn.pid,
                        "name": proc.name(),
                        "status": "listening"
                    }
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
    except (psutil.AccessDenied, psutil.Error):
        # macOS/AIX require root for system-wide connections
        return None
    return None

# Usage
result = find_process_on_port(8000)
if result:
    print(f"Port 8000 in use by {result['name']} (PID {result['pid']})")
```

**Performance note:** `psutil.net_connections()` is O(n) where n = all connections on system. Acceptable for occasional checks but not for tight polling loops. Cache results or rate-limit.

**Platform caveat:** macOS/AIX require root privilege for system-wide connection inspection. Consider per-process approach or graceful fallback.

---

### 1.3 Graceful Process Termination (SIGTERM → SIGKILL)

**Standard pattern:** SIGTERM first (allows cleanup), then SIGKILL if unresponsive.

```python
import subprocess
import signal
import time

def terminate_process(proc, timeout_sec=5):
    """Gracefully terminate process, force kill if needed."""
    try:
        # Step 1: Send SIGTERM (graceful shutdown)
        proc.terminate()  # On POSIX: SIGTERM, on Windows: TerminateProcess()
        
        # Step 2: Wait for graceful exit
        try:
            proc.wait(timeout=timeout_sec)
            print(f"Process {proc.pid} terminated gracefully")
            return True
        except subprocess.TimeoutExpired:
            # Step 3: Force kill if no response
            print(f"Process {proc.pid} not responding, force killing...")
            proc.kill()  # On POSIX: SIGKILL
            proc.wait()
            return False
    except Exception as e:
        print(f"Error terminating process: {e}")
        return False

# Alternative: send specific signals
proc = subprocess.Popen([...])
proc.send_signal(signal.SIGTERM)  # Any signal
```

**Key differences:**
- **SIGTERM (15):** Catchable; allows cleanup (write temp files, close connections)
- **SIGKILL (9):** Uncatchable; immediate termination, potential resource leaks
- **Windows:** SIGTERM is alias for `terminate()`. No equivalent to SIGKILL.

**Best practice:** Docker-style grace period (SIGTERM → wait 10 sec → SIGKILL) ensures robust cleanup across platforms.

---

### 1.4 Persisting PID State Across Launcher Restarts

**Simple approach (recommended):** Plain `.pid` file + state validation

```python
import json
import os

class ProcessState:
    def __init__(self, pid_file=".launcher.pid"):
        self.pid_file = pid_file
    
    def save(self, pid, cmd, start_time):
        """Save process state."""
        data = {
            "pid": pid,
            "cmd": cmd,
            "started_at": start_time
        }
        with open(self.pid_file, "w") as f:
            json.dump(data, f)
    
    def load(self):
        """Load process state, validate PID is alive."""
        if not os.path.exists(self.pid_file):
            return None
        
        with open(self.pid_file) as f:
            data = json.load(f)
        
        pid = data["pid"]
        
        # Validate PID still exists
        if is_process_alive(pid):
            return data
        
        # Stale PID file
        os.remove(self.pid_file)
        return None
    
    def clear(self):
        """Remove PID file."""
        if os.path.exists(self.pid_file):
            os.remove(self.pid_file)

# Usage
state = ProcessState()
loaded = state.load()
if loaded:
    print(f"Resuming process {loaded['pid']}")
else:
    print("No valid running process, starting new one")
```

**Alternative (overkill for CLI launcher):** `pidlockfile` library with file locking (prevents accidental duplicate launches):
```python
from pid.pidlockfile import PidLockFile

with PidLockFile("/var/run/launcher.pid", timeout=2):
    # Your code here—lock held during execution
    pass
```

**Trade-offs:**
- **`.pid` file:** Simple, no dependencies, sufficient for single-instance CLI tools
- **File locking:** Prevents race conditions, adds overhead, requires library

---

## TOPIC 2: Git Status Monitoring in Python

### 2.1 Getting Current Branch Name

**Option A (lightweight):** `subprocess.run()` with git command

```python
import subprocess

def get_current_branch(repo_path):
    """Get active branch name via subprocess."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    return None
```

**Option B (OOP):** GitPython (heavier but more featureful)

```python
from git import Repo

def get_current_branch_gitpython(repo_path):
    """Get active branch name via GitPython."""
    try:
        repo = Repo(repo_path)
        return repo.active_branch.name
    except Exception:
        return None
```

**Recommendation:** Use subprocess for single-query use cases; GitPython if doing multiple git operations. GitPython 3.1.46 (Jan 2026) includes improved type hints and path support.

---

### 2.2 Checking Ahead/Behind Commits vs Remote

**Recommended approach:** Fetch once, then count commits

```python
import subprocess

def get_ahead_behind(repo_path, remote="origin", branch=None):
    """Count commits ahead/behind remote."""
    try:
        # Get current branch if not specified
        if branch is None:
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode != 0:
                return None
            branch = result.stdout.strip()
        
        # Fetch latest from remote
        subprocess.run(
            ["git", "fetch", remote],
            cwd=repo_path,
            capture_output=True,
            timeout=10
        )
        
        # Count ahead (commits in local not in remote)
        result_ahead = subprocess.run(
            ["git", "rev-list", "--count", f"{remote}/{branch}..HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5
        )
        ahead = int(result_ahead.stdout.strip()) if result_ahead.returncode == 0 else 0
        
        # Count behind (commits in remote not in local)
        result_behind = subprocess.run(
            ["git", "rev-list", "--count", f"HEAD..{remote}/{branch}"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5
        )
        behind = int(result_behind.stdout.strip()) if result_behind.returncode == 0 else 0
        
        return {"ahead": ahead, "behind": behind}
    except Exception as e:
        return None
```

**GitPython equivalent:**

```python
from git import Repo

def get_ahead_behind_gitpython(repo_path):
    """Count commits via GitPython."""
    try:
        repo = Repo(repo_path)
        repo.remotes.origin.fetch()
        
        current = repo.active_branch
        tracking = current.tracking_branch()
        
        if not tracking:
            return None
        
        ahead = sum(1 for _ in repo.iter_commits(f"{tracking.name}..HEAD"))
        behind = sum(1 for _ in repo.iter_commits(f"HEAD..{tracking.name}"))
        
        return {"ahead": ahead, "behind": behind}
    except Exception:
        return None
```

**Critical performance issue:** `git fetch` is a network operation—can hang on slow networks. Always use `timeout=10` or higher.

---

### 2.3 Total Commit Count (Efficient)

```python
import subprocess

def count_total_commits(repo_path):
    """Get total commits on current branch."""
    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return int(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError):
        return None
    return None
```

**Performance:** O(1) lookup (git counts directly from refs). Safe to call in polling loops.

---

### 2.4 Detecting Uncommitted Changes

**Option A (fastest):** Git status with `--porcelain`

```python
def has_uncommitted_changes(repo_path):
    """Check if repo has uncommitted changes."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return bool(result.stdout.strip())
    except subprocess.TimeoutExpired:
        return None
    return False

def get_uncommitted_summary(repo_path):
    """Get summary of uncommitted changes."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return None
        
        lines = result.stdout.strip().split("\n")
        modified = sum(1 for line in lines if line.startswith(" M"))
        added = sum(1 for line in lines if line.startswith("A"))
        deleted = sum(1 for line in lines if line.startswith(" D"))
        untracked = sum(1 for line in lines if line.startswith("??"))
        
        return {
            "modified": modified,
            "added": added,
            "deleted": deleted,
            "untracked": untracked,
            "total": len([l for l in lines if l])
        }
    except subprocess.TimeoutExpired:
        return None
```

**Option B:** GitPython (simpler API)

```python
from git import Repo

def has_uncommitted_changes_gitpython(repo_path):
    """Check uncommitted changes via GitPython."""
    try:
        repo = Repo(repo_path)
        return repo.is_dirty()  # Checks staged + unstaged + untracked
    except Exception:
        return None
```

**Recommendation:** `git status --porcelain` for performance-critical code (readable and fast). GitPython's `is_dirty()` for simplicity if speed is not critical.

---

### 2.5 Performance Considerations for Multiple Repos

**Avoid:** Polling every repo synchronously in tight loop  
**Better:** Async subprocess calls or thread pool

```python
import concurrent.futures
import subprocess

def check_all_repos(repo_paths):
    """Check git status across multiple repos in parallel."""
    results = {}
    
    def check_repo(path):
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=3
        )
        return path, bool(status.stdout.strip()) if status.returncode == 0 else None
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(check_repo, p): p for p in repo_paths}
        for future in concurrent.futures.as_completed(futures):
            path, has_changes = future.result()
            results[path] = has_changes
    
    return results
```

**Caching strategy:** Cache git status with TTL (e.g., 5-10 sec) to avoid spamming disk I/O:

```python
import time

class GitStatusCache:
    def __init__(self, ttl_sec=5):
        self.cache = {}
        self.ttl = ttl_sec
    
    def get_status(self, repo_path):
        now = time.time()
        if repo_path in self.cache:
            cached_time, data = self.cache[repo_path]
            if now - cached_time < self.ttl:
                return data  # Return cached
        
        # Fetch fresh
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=3
        )
        data = bool(result.stdout.strip()) if result.returncode == 0 else None
        self.cache[repo_path] = (now, data)
        return data
```

---

## Recommendations Summary

### Process Management
| Task | Approach | Why |
|------|----------|-----|
| Spawn & track PID | `subprocess.Popen()` | No dependencies, standard library |
| Find process on port | `psutil.net_connections()` | Only reliable cross-platform method |
| Graceful shutdown | `proc.terminate()` → wait → `proc.kill()` | POSIX standard, portable |
| Persist PID | JSON `.pid` file + `os.kill(pid, 0)` check | Simple, sufficient for CLI tools |

### Git Monitoring
| Task | Approach | Why |
|------|----------|-----|
| Current branch | `subprocess.run(["git", "branch", "--show-current"])` | Fast, no deps |
| Ahead/behind count | `git rev-list --count` + fetch | Efficient, accurate |
| Total commits | `git rev-list --count HEAD` | O(1) lookup |
| Uncommitted changes | `git status --porcelain` | Human & machine readable |
| Multiple repos | Thread pool + caching (TTL 5-10 sec) | Avoids network/disk thrashing |

---

## Unresolved Questions

1. Should launcher support Windows (PowerShell process management differs)? Currently research assumes POSIX.
2. What's acceptable latency for git status polling? Affects cache TTL strategy.
3. Should launcher use file locking for PID file (prevents duplicate instances)? Or is simple validation sufficient?
4. Need to handle credential/SSH key prompts when git fetch is called? (Currently research ignores auth)

---

## Sources

- [Python subprocess module documentation](https://docs.python.org/3/library/subprocess.html)
- [psutil documentation & port detection](https://psutil.readthedocs.io/)
- [SIGTERM vs SIGKILL termination patterns](https://www.suse.com/c/observability-sigkill-vs-sigterm-a-developers-guide-to-process-termination/)
- [psutil.net_connections examples](https://snyk.io/advisor/python/psutil/functions/psutil.net_connections)
- [GitPython API reference](https://gitpython.readthedocs.io/en/stable/reference.html)
- [PID file locking libraries](https://pypi.org/project/pid/)
- [Git rev-list commit counting](https://www.git-tower.com/learn/git/commands/git-status)
