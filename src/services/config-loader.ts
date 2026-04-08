// Config loader: reads ~/.app-launcher/config.json and parses workspace/app definitions

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AppConfig, Workspace } from '../types.js';

const APP_LAUNCHER_DIR = path.join(os.homedir(), '.app-launcher');
const DEFAULT_CONFIG_PATH = path.join(APP_LAUNCHER_DIR, 'config.json');

// Ensure ~/.app-launcher/ directory exists
function ensureConfigDir(): void {
  if (!fs.existsSync(APP_LAUNCHER_DIR)) {
    fs.mkdirSync(APP_LAUNCHER_DIR, { recursive: true });
  }
}

// Validate a single app config object
function validateApp(app: unknown, workspaceName: string, index: number): AppConfig {
  if (typeof app !== 'object' || app === null) {
    throw new Error(`Workspace "${workspaceName}" app[${index}] must be an object`);
  }

  const a = app as Record<string, unknown>;
  const required = ['name', 'command', 'relative_path', 'port'] as const;

  for (const field of required) {
    if (a[field] === undefined || a[field] === null) {
      throw new Error(`Workspace "${workspaceName}" app[${index}] missing required field: "${field}"`);
    }
  }

  if (typeof a['name'] !== 'string' || a['name'].trim() === '') {
    throw new Error(`Workspace "${workspaceName}" app[${index}]: "name" must be a non-empty string`);
  }
  if (typeof a['command'] !== 'string' || a['command'].trim() === '') {
    throw new Error(`Workspace "${workspaceName}" app[${index}]: "command" must be a non-empty string`);
  }
  // Security: reject newlines to prevent command injection via temp shell scripts
  if ((a['command'] as string).includes('\n') || (a['command'] as string).includes('\r')) {
    throw new Error(`App "${a['name']}": command must not contain newline characters`);
  }
  if (typeof a['relative_path'] !== 'string') {
    throw new Error(`Workspace "${workspaceName}" app[${index}]: "relative_path" must be a string`);
  }
  if (typeof a['port'] !== 'number' || !Number.isInteger(a['port']) || a['port'] < 1 || a['port'] > 65535) {
    throw new Error(`Workspace "${workspaceName}" app[${index}]: "port" must be an integer between 1 and 65535`);
  }

  // Validate optional tab field: must match \d+_\d+ or be empty string
  if (a['tab'] !== undefined) {
    if (typeof a['tab'] !== 'string') {
      throw new Error(`Workspace "${workspaceName}" app "${a['name']}": "tab" must be a string`);
    }
    if (a['tab'] !== '' && !/^\d+_\d+$/.test(a['tab'])) {
      throw new Error(`Workspace "${workspaceName}" app "${a['name']}": "tab" must be empty or match pattern "row_col" (e.g. "1_1")`);
    }
  }

  return {
    name: a['name'] as string,
    command: a['command'] as string,
    relative_path: a['relative_path'] as string,
    port: a['port'] as number,
    tab: a['tab'] as string | undefined,
  };
}

// Parse a single workspace entry object (key = workspace name, value = workspace data)
function parseWorkspaceEntry(entry: Record<string, unknown>): Workspace[] {
  return Object.entries(entry).map(([name, data]) => {
    if (typeof data !== 'object' || data === null) {
      throw new Error(`Workspace "${name}" must be an object`);
    }

    const w = data as Record<string, unknown>;

    if (typeof w['root_path'] !== 'string' || w['root_path'].trim() === '') {
      throw new Error(`Workspace "${name}" missing required field: "root_path"`);
    }

    if (!Array.isArray(w['apps'])) {
      throw new Error(`Workspace "${name}" missing required field: "apps" (must be an array)`);
    }

    const apps = (w['apps'] as unknown[]).map((app, i) => validateApp(app, name, i));

    // Validate port uniqueness within workspace
    const ports = apps.map(a => a.port);
    const duplicates = ports.filter((p, i) => ports.indexOf(p) !== i);
    if (duplicates.length > 0) {
      throw new Error(`Workspace "${name}" has duplicate ports: ${[...new Set(duplicates)].join(', ')}`);
    }

    return { name, root_path: w['root_path'] as string, apps };
  });
}

/** Sample config written on first run if no config file exists */
const SAMPLE_CONFIG = {
  workspaces: [
    {
      my_project: {
        root_path: '/path/to/my_project',
        apps: [
          {
            name: 'api',
            command: 'rails -s -p ${port}',
            relative_path: 'api',
            port: 3000,
            tab: '1_1',
          },
          {
            name: 'web',
            command: 'npm start',
            relative_path: 'web',
            port: 8080,
            tab: '1_2',
          },
        ],
      },
    },
  ],
};

/** Create sample config at the given path and return the path */
function createSampleConfig(configPath: string): void {
  fs.writeFileSync(configPath, JSON.stringify(SAMPLE_CONFIG, null, 2) + '\n', 'utf-8');
}

// Load and parse config from the given path (defaults to ~/.app-launcher/config.json)
export function loadConfig(configPath?: string): Workspace[] {
  ensureConfigDir();

  const resolvedPath = configPath ?? DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(resolvedPath)) {
    createSampleConfig(resolvedPath);
    throw new Error(
      `SAMPLE_CONFIG_CREATED:${resolvedPath}`
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read config file "${resolvedPath}": ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in config file "${resolvedPath}": ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Config file must be a JSON object');
  }

  const config = parsed as Record<string, unknown>;

  if (!Array.isArray(config['workspaces'])) {
    throw new Error('Config must have a "workspaces" array');
  }

  const workspaces: Workspace[] = [];

  for (let i = 0; i < (config['workspaces'] as unknown[]).length; i++) {
    const entry = (config['workspaces'] as unknown[])[i];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`workspaces[${i}] must be an object with workspace name as key`);
    }
    const parsed = parseWorkspaceEntry(entry as Record<string, unknown>);
    workspaces.push(...parsed);
  }

  if (workspaces.length === 0) {
    throw new Error('Config must define at least one workspace');
  }

  return workspaces;
}

// Replace ${port} and other template variables in command string
export function interpolateCommand(command: string, port: number): string {
  return command.replace(/\$\{port\}/g, String(port));
}

// Resolve absolute path for an app (workspace root + relative path)
export function resolveAppPath(app: AppConfig, workspace: Workspace): string {
  return path.join(workspace.root_path, app.relative_path);
}
