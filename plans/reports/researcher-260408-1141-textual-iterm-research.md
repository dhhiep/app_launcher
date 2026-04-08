# Research Report: Textual TUI Framework & iTerm2 Integration
**Date:** 2026-04-08 | **For:** App Launcher Project

---

## TOPIC 1: TEXTUAL FRAMEWORK FOR INTERACTIVE CLI APPS

### Executive Summary
Textual is a production-ready, async-powered Python TUI framework by Textualize. Perfectly suited for the app launcher: supports Tree/DataTable widgets, keyboard routing, and async operations. Mature project with 15k+ GitHub stars, active maintenance, and cross-platform support (macOS/Linux/Windows).

### 1. Core Architecture & Best Practices

**Standard App Structure:**
```python
from textual.app import ComposeResult, on
from textual.containers import Container
from textual.widgets import Header, Footer, Tree, DataTable
from textual.binding import Binding

class AppLauncherApp(ComposeResult):
    """Main app class—called once at startup."""
    
    BINDINGS = [
        Binding("tab", "toggle_view", "Toggle View"),
        Binding("q", "quit", "Quit"),
    ]
    
    def compose(self) -> ComposeResult:
        """Build initial widget tree—returned once on mount."""
        yield Header()
        yield Tree("Workspaces")  # or DataTable for task-manager view
        yield Footer()
    
    def on_mount(self) -> None:
        """Setup called after compose; safe to populate widgets."""
        tree = self.query_one(Tree)
        tree.root.expand()
        # Populate tree with workspaces/apps
    
    def action_toggle_view(self) -> None:
        """Bind to Tab key—switch between Tree and DataTable views."""
        pass

if __name__ == "__main__":
    app = AppLauncherApp()
    app.run()
```

**Key Patterns:**
- `compose()` yields widgets (generators preferred over lists)
- `on_mount()` handles async setup, data population
- `BINDINGS` list defines keyboard shortcuts with actions
- Use `await mount()` for dynamic widget addition
- Separate styling in `.tcss` files (not inline Python)

### 2. Tree Widget for Hierarchical Display (Workspace > Apps)

**Basic Tree with Expand/Collapse:**
```python
from textual.widgets import Tree
from textual.widgets.tree import TreeNode

tree = Tree("All Workspaces")
root = tree.root

# Add workspace nodes (expandable)
ws1 = root.add("workspace_1")
ws1.add_leaf("backend_1 (port 3000)")
ws1.add_leaf("frontend_1 (port 8080)")

ws2 = root.add("workspace_2")
ws2.add_leaf("mobile_1 (port 8082)")

# Programmatically select/expand
tree.cursor_node = ws1
ws1.expand()
```

**Node Selection Handling:**
```python
def on_tree_select(self, event: Tree.Selected) -> None:
    """Emitted when user selects node (Enter key)."""
    node: TreeNode = event.node
    if node.is_leaf:
        # This is an app—get it for launch
        app_name = node.label
        self.selected_apps.append(app_name)

def on_tree_node_expanded(self, event: Tree.NodeExpanded) -> None:
    """Expand event for lazy loading or UI updates."""
    pass
```

**Key Bindings (Textual Defaults):**
- `Enter` → Select node (triggers `Tree.Selected` message)
- `Space` → Expand/collapse
- `Up/Down` → Navigate
- `Shift+Up/Down` → Move to sibling nodes
- Custom: `Tab` can be bound via `action_toggle_view()`

**Important:** Tab is indistinguishable from Ctrl+I in terminals—Textual sets `aliases = ["tab", "ctrl+i"]`. Override carefully via binding.

### 3. DataTable Widget for Task-Manager Status Display

**Setup Columns & Rows:**
```python
from textual.widgets import DataTable
from rich.text import Text

table = DataTable()
# Add columns (key, label, width)
table.add_column("App Name", key="name", width=20)
table.add_column("Status", key="status", width=10)
table.add_column("Port", key="port", width=8)
table.add_column("PID", key="pid", width=8)
table.add_column("Branch", key="branch", width=15)
table.add_column("Commits", key="commits", width=12)

# Add rows (row_key, values, height=1)
table.add_row("backend_1", "running", "3000", "12345", "main", "↑ 3")
table.add_row("frontend_1", "stopped", "8080", "—", "dev", "↓ 2")
```

**Dynamic Updates:**
```python
table.update_cell(row_key="backend_1", column_key="status", value="stopped")
table.remove_row("old_app")
table.add_row("new_app", "running", "3001", "12346", "feature", "↑ 1")
```

**Navigation & Selection:**
```python
def on_data_table_cell_selected(self, event: DataTable.CellSelected) -> None:
    """User selected a cell (arrow keys or click)."""
    row_key = event.row_key
    column_key = event.column_key
    # Use to stop/restart apps on selection + action

# Move cursor programmatically
table.move_cursor(row_key="backend_1")

# Cursor types: "cell", "row", "column", "none"
table.cursor_type = "row"  # Highlight entire rows
```

**Styling & Appearance:**
```python
# Rich renderables in cells (colors, text styles)
from rich.text import Text
styled_status = Text("running", style="bold green")
table.update_cell("backend_1", "status", styled_status)
```

### 4. Checkbox/Selection Patterns for Multi-Select

**Option A: Custom Widget State**
```python
selected_apps = set()  # Track selected app names

def action_toggle_selection(self) -> None:
    """Space or custom key to toggle selection."""
    node = tree.cursor_node
    if node.is_leaf:
        if node.label in selected_apps:
            selected_apps.discard(node.label)
            node.label = f"☐ {node.label}"
        else:
            selected_apps.add(node.label)
            node.label = f"☑ {node.label}"
```

**Option B: DataTable with Custom Column**
```python
# Add checkbox column
table.add_column("", key="select", width=3)
table.add_row("☐", "backend_1", "running", ...)

def on_data_table_cell_selected(self, event: DataTable.CellSelected):
    if event.column_key == "select":
        # Toggle checkbox
        current = table.get_cell("select", row_key=event.row_key)
        new_val = "☑" if current == "☐" else "☐"
        table.update_cell("select", event.row_key, new_val)
```

### 5. Keyboard Shortcuts & Custom Event Binding

**Global Bindings (Priority = Always Checked First):**
```python
BINDINGS = [
    ("tab", "toggle_view", "Switch Tree/Table View"),
    ("ctrl+s", "start_selected", "Start Apps", show=True),
    ("ctrl+x", "stop_selected", "Stop Apps", show=True),
    ("q", "quit", "Quit"),
]

async def action_toggle_view(self) -> None:
    """Switch between Tree and DataTable display."""
    # Hide tree, show table, or vice versa
    tree = self.query_one(Tree)
    table = self.query_one(DataTable)
    tree.display = not tree.display
    table.display = not table.display

async def action_start_selected(self) -> None:
    """Launch all selected apps."""
    for app in self.selected_apps:
        await self.launch_app(app)
```

**Custom Messages for Widget Events:**
```python
class AppSelected(Message):
    """Posted when user selects an app to launch."""
    def __init__(self, app_name: str) -> None:
        super().__init__()
        self.app_name = app_name

def on_tree_select(self, event: Tree.Selected) -> None:
    node = event.node
    if node.is_leaf:
        self.post_message(AppSelected(node.label))
```

**Handling Tab Ambiguity:**
```python
# Tab key aliases: ["tab", "ctrl+i"]
# To explicitly capture Tab:
def key_tab(self) -> None:
    """Explicit Tab handler (less reliable than binding)."""
    self.action_toggle_view()

# Better approach: Use binding with priority
BINDINGS = [
    Binding("tab", "toggle_view", "Toggle View", priority=True),
]
```

### 6. App Structure Best Practices

**File Layout for App Launcher:**
```
app_launcher/
├── main.py              # Entry point (run() call)
├── app.py               # AppLauncherApp class
├── app.tcss             # Styling (CSS-like)
├── widgets/
│   ├── workspace_tree.py    # Tree widget logic
│   ├── status_table.py      # DataTable logic
│   └── app_launcher_header.py
├── services/
│   ├── app_manager.py       # Launch/stop logic
│   ├── iterm_controller.py  # iTerm2 integration
│   └── process_monitor.py   # PID/port tracking
└── models/
    ├── workspace.py
    ├── app.py
    └── status.py
```

**Async Task Management (Recommended):**
```python
import asyncio

class AppLauncherApp(ComposeResult):
    def on_mount(self) -> None:
        # Start background task for port monitoring
        self.set_interval(0.5, self.update_process_status)
    
    async def update_process_status(self) -> None:
        """Runs every 0.5s—update table with live status."""
        for row_key in self.running_apps:
            pid = self.app_pids[row_key]
            is_alive = os.kill(pid, 0) works  # Check if process alive
            status = "running" if is_alive else "stopped"
            table.update_cell(row_key, "status", status)
```

**Error Handling:**
```python
async def action_start_selected(self) -> None:
    for app_name in self.selected_apps:
        try:
            await self.app_manager.launch(app_name)
        except ValueError as e:
            self.notify(f"Failed: {e}", severity="error", timeout=5.0)
        except Exception as e:
            self.notify(f"Unexpected error: {e}", severity="error")
```

---

## TOPIC 2: iTERM2 APPLESCRIPT & PYTHON INTEGRATION

### Executive Summary
**Use Python API, not AppleScript** (AppleScript deprecated per iTerm2 docs). Python API provides:
- `async_create_tab()` for new tabs
- `async_split_pane(vertical=True/False)` for splits
- `async_send_text()` to run commands
- Full async/await support

The `"tab"` field in `apps.json` maps to pane splits: blank = new tab, `"1_1"/"1_2"` = split panels.

### 1. iTerm2 Python API Fundamentals

**Installation:**
```bash
pip install iterm2
```

**Basic Connection & Window Access:**
```python
import iterm2

async def main(connection):
    """Main entry point for iTerm2 scripts."""
    app = await iterm2.async_get_app(connection)
    window = app.current_terminal_window
    if not window:
        # Create new window if none exists
        window = await app.async_create_window_with_default_profile()
    return window

# Run: iterm2.run_until_complete(main(connection))
```

**Script Placement:**
- Location: `~/Library/Application Support/iTerm2/Scripts/`
- Invoked from iTerm2 → Scripts menu
- Can also run standalone via: `iterm2.run_until_complete(main())`

### 2. Creating Tabs & Windows

**Create New Tab:**
```python
async def create_new_tab(window):
    """Create a new tab in current window."""
    tab = await window.async_create_tab()
    # tab contains default session (current_session)
    return tab

async def create_tab_with_profile(window, profile_name="Default"):
    """Create tab with specific profile."""
    profile = await iterm2.Profile.async_get(connection, profile_name)
    tab = await window.async_create_tab(profile=profile)
    return tab
```

**Create New Window:**
```python
async def create_new_window():
    """Create entirely new window."""
    app = await iterm2.async_get_app(connection)
    window = await app.async_create_window_with_default_profile()
    return window
```

### 3. Splitting Panes (Vertical/Horizontal)

**Basic Split Pattern:**
```python
async def split_pane_example(window):
    """Create 2×2 grid of panes."""
    tab = await window.async_create_tab()
    
    # Start with one session (current_session)
    session_1_1 = tab.current_session
    
    # Split vertically (left/right)
    session_1_2 = await session_1_1.async_split_pane(vertical=True)
    
    # Split top-left horizontally (top/bottom)
    session_2_1 = await session_1_1.async_split_pane(
        vertical=False,  # Horizontal split
        before=True       # New pane ABOVE current
    )
    
    # Split top-right horizontally
    session_2_2 = await session_1_2.async_split_pane(
        vertical=False,
        before=True
    )
    
    return {
        "1_1": session_1_1,  # Bottom-left
        "1_2": session_1_2,  # Bottom-right
        "2_1": session_2_1,  # Top-left
        "2_2": session_2_2,  # Top-right
    }
```

**Parameters:**
- `vertical=True` → Split left/right (creates column)
- `vertical=False` → Split top/bottom (creates row)
- `before=True` → New pane positioned above/left of current
- `before=False` (default) → New pane positioned below/right

### 4. Running Commands in Panes

**Send Text to Session:**
```python
async def run_command(session, command):
    """Execute command in specific pane."""
    await session.async_send_text(command, add_newline=True)

async def setup_panes_with_commands(window, apps_config):
    """Example: app_launcher setup with 2 apps side-by-side."""
    tab = await window.async_create_tab()
    
    # Create vertical split (left/right)
    left = tab.current_session
    right = await left.async_split_pane(vertical=True)
    
    # Get configs for apps
    app1 = apps_config["backend_1"]
    app2 = apps_config["frontend_1"]
    
    # Run commands
    await run_command(left, app1["command"])
    await run_command(right, app2["command"])
    
    return tab
```

### 5. Tab Field Mapping for App Launcher

**Requirement:** `"tab"` field controls split layout

**Mapping Strategy:**
```python
"""
Tab field patterns:
- null/"" → Create new tab (blank/no splits)
- "1_1", "1_2", "1_3" → Vertical splits (1 row, N columns)
- "2_1", "2_2" → 2 rows × 2 columns
- "3_2" → 3 rows × 2 columns
"""

async def parse_tab_layout(tab_string):
    """Parse tab string to pane coordinates."""
    if not tab_string:
        return {"1_1": None}  # New tab, default pane
    
    # Parse "row_col" format
    row, col = map(int, tab_string.split("_"))
    return {"row": row, "col": col}

async def create_pane_layout(window, layout_map):
    """
    Create pane layout from tab strings.
    layout_map = {"1_1": session_or_none, "1_2": session_or_none, ...}
    """
    tab = await window.async_create_tab()
    sessions = {}
    
    # Group apps by tab string
    from collections import defaultdict
    panes = defaultdict(list)
    
    for app_name, app_config in layout_map.items():
        tab_str = app_config.get("tab", "")
        if not tab_str:
            tab_str = "1_1"
        panes[tab_str].append((app_name, app_config))
    
    # For each pane, create/find session
    current = tab.current_session
    for pane_id, apps in sorted(panes.items()):
        row, col = map(int, pane_id.split("_"))
        
        if pane_id == "1_1":
            sessions[pane_id] = current
        else:
            # Split logic: if col > 1, split vertically; if row > 1, split horizontally
            # Simplified: assume sequential creation
            current = await current.async_split_pane(vertical=(col > 1))
            sessions[pane_id] = current
    
    return sessions
```

**Complex Example: 2×2 Grid from Config**
```python
async def launch_apps_with_splits(window, apps_json):
    """
    apps_json = [
        {"name": "backend_1", "command": "...", "tab": "1_1"},
        {"name": "frontend_1", "command": "...", "tab": "1_2"},
        {"name": "backend_2", "command": "...", "tab": "2_1"},
        {"name": "frontend_2", "command": "...", "tab": "2_2"},
    ]
    """
    tab = await window.async_create_tab()
    sessions_map = {}
    
    # Create 2×2 grid manually
    # Start: session_1_1 (current)
    s11 = tab.current_session
    
    # Create session_1_2 (right of 1_1, vertical split)
    s12 = await s11.async_split_pane(vertical=True)
    
    # Create session_2_1 (below 1_1, horizontal split)
    s21 = await s11.async_split_pane(vertical=False, before=False)
    
    # Create session_2_2 (below 1_2, horizontal split)
    s22 = await s12.async_split_pane(vertical=False, before=False)
    
    sessions_map = {
        "1_1": s11,
        "1_2": s12,
        "2_1": s21,
        "2_2": s22,
    }
    
    # Run apps
    for app in apps_json:
        session = sessions_map.get(app.get("tab", "1_1"))
        if session:
            await run_command(session, app["command"])
    
    return tab
```

### 6. Tab Naming & Organization

**Set Tab Title:**
```python
async def set_tab_title(tab, title):
    """Name the tab (visible in iTerm2 tab bar)."""
    tab.title = title

# Example
tab = await window.async_create_tab()
await set_tab_title(tab, "workspace_1 - Backend + Frontend")
```

**Session Naming (Pane-level):**
```python
async def set_session_title(session, title):
    """Name individual pane/session."""
    await session.async_set_title(title)

# Usage
await set_session_title(s11, "backend_1")
await set_session_title(s12, "frontend_1")
```

### 7. Complete Integration Pattern for App Launcher

```python
import iterm2

class iTerm2Controller:
    def __init__(self, connection):
        self.connection = connection
        self.app = None
        self.window = None
    
    async def initialize(self):
        self.app = await iterm2.async_get_app(self.connection)
        self.window = self.app.current_terminal_window
        if not self.window:
            self.window = await self.app.async_create_window_with_default_profile()
    
    async def launch_apps(self, apps_config, workspace_name):
        """Launch multiple apps with split panes."""
        tab = await self.window.async_create_tab()
        await self.set_tab_title(tab, f"workspace: {workspace_name}")
        
        sessions = await self._create_pane_grid(tab, apps_config)
        
        for app in apps_config:
            tab_key = app.get("tab", "1_1")
            session = sessions.get(tab_key)
            if session:
                await self._run_app(session, app)
    
    async def _create_pane_grid(self, tab, apps_config):
        """Create pane layout based on tab fields."""
        # Find max row/col from tab strings
        max_row = max_col = 1
        for app in apps_config:
            if app.get("tab"):
                r, c = map(int, app["tab"].split("_"))
                max_row = max(max_row, r)
                max_col = max(max_col, c)
        
        # Create grid dynamically (simplified for max 2×2)
        sessions = {}
        # ... implementation
        return sessions
    
    async def _run_app(self, session, app_config):
        """Execute app command in session."""
        command = app_config["command"]
        await session.async_send_text(command, add_newline=True)
    
    async def set_tab_title(self, tab, title):
        tab.title = title

# Usage
async def main(connection):
    controller = iTerm2Controller(connection)
    await controller.initialize()
    
    apps = [
        {"name": "backend", "command": "cd /path && rails -s", "tab": "1_1"},
        {"name": "frontend", "command": "cd /path && npm start", "tab": "1_2"},
    ]
    
    await controller.launch_apps(apps, "workspace_1")

iterm2.run_until_complete(main)
```

---

## ARCHITECTURAL RECOMMENDATIONS

### For App Launcher Integration:
1. **Use Textual for TUI** (superior to urwid/blessed; modern, async-native)
2. **Tree + DataTable toggle** via Tab key (requirement-aligned)
3. **Separate iTerm2 logic** into `services/iterm_controller.py`
4. **Tab field → pane mapping** via helper class (abstract complexity)
5. **Async process monitoring** with `set_interval()` for status updates

### Adoption Risk:
- **Textual:** Mature (v0.79+), large community, stable API. **Low risk.**
- **iTerm2 Python API:** Official, documented, actively maintained. **Low risk.**
- **Tab complexity:** Custom layout parsing required; test grid generation thoroughly.

---

## SOURCES

**Textual Framework:**
- [Textual - Home](https://textual.textualize.io/)
- [GitHub - Textualize/textual](https://github.com/Textualize/textual)
- [Real Python - Python Textual](https://realpython.com/python-textual/)
- [Textual - Tree Widget](https://textual.textualize.io/widgets/tree/)
- [Textual - DataTable Widget](https://textual.textualize.io/widgets/data_table/)
- [Textual - Input & Keyboard](https://textual.textualize.io/guide/input/)
- [Textual - App Basics](https://textual.textualize.io/guide/app/)

**iTerm2 Integration:**
- [iTerm2 - Documentation](https://iterm2.com/documentation-scripting.html)
- [iTerm2 Python API - Tab](https://iterm2.com/python-api/tab.html)
- [iTerm2 Python API - Session](https://iterm2.com/python-api/session.html)
- [Exploring the iTerm2 Python API](https://jongsma.wordpress.com/2020/02/19/exploring-the-iterm2-python-api/)
- [Auto-start multiple iTerm2 Sessions](https://pyronaur.com/how-to-automate-iterm2-sessions/)
