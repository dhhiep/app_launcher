// Core domain types for App Launcher CLI

export interface AppConfig {
  name: string;
  command: string;       // Template with ${vars} e.g. "rails -s -p ${port}"
  relative_path: string; // Relative to workspace root_path
  port: number;
  tab?: string;          // "" or missing = new tab, "row_col" = split pane e.g. "1_1"
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
  processName?: string;  // name of process using the port
  running: boolean;
  starting: boolean;     // true when app is launching but not yet listening on port
  portAvailable: boolean;
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  latestCommit: string;
}

export interface LauncherState {
  // Key format: "workspace_name/app_name"
  processes: Record<string, { pid: number; port: number; launchedAt: string }>;
  lastSelection: string[]; // e.g. ["workspace_1/backend_1", "workspace_2/mobile_1"]
}
