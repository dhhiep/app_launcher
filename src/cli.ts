// CLI entry point — commander setup, option parsing, routing to mode handlers
// Note: shebang is added to dist/cli.js via postbuild script in package.json

import { Command } from 'commander';
import os from 'os';
import path from 'path';
import { loadConfig } from './services/config-loader.js';
import { runStatus } from './modes/run-status.js';
import { runStop } from './modes/run-stop.js';
import { runDirectLaunch } from './modes/run-direct-launch.js';
import { runTUI } from './modes/run-tui.js';
import type { Workspace } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Expand leading ~ to the user home directory */
function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

// ─── CLI Definition ──────────────────────────────────────────────────────────

const program = new Command()
  .name('app-launcher')
  .description('Launch and manage dev apps across workspaces')
  .option('-w, --workspace <name>', 'Workspace name filter')
  .option('-a, --app <names>', 'Comma-separated app names (use with -w)')
  .option('--stop', 'Stop mode: stop named apps and exit')
  .option('--status', 'Print status table to stdout and exit')
  .option('-c, --config <path>', 'Config path', '~/.app-launcher/config.json')
  .parse(process.argv);

// ─── Main router ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = program.opts<{
    workspace?: string;
    app?: string;
    stop?: boolean;
    status?: boolean;
    config: string;
  }>();

  const configPath = expandTilde(opts.config);

  // Load config — auto-create sample on first run, exit 2 on other missing/parse errors
  let workspaces: Workspace[];
  try {
    workspaces = loadConfig(configPath);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('SAMPLE_CONFIG_CREATED:')) {
      const createdPath = msg.slice('SAMPLE_CONFIG_CREATED:'.length);
      console.log(`\x1b[33mNo config found — created sample config at:\x1b[0m`);
      console.log(`  ${createdPath}`);
      console.log(`\nEdit it to add your workspaces, then run \x1b[1mapp-launcher\x1b[0m again.`);
      process.exit(0);
    }
    console.error(`Error: ${msg}`);
    const isMissing = msg.includes('not found') || msg.includes('ENOENT');
    process.exit(isMissing ? 2 : 1);
  }

  // Show which config is active
  console.log(`\x1b[2mConfig: ${configPath}\x1b[0m`);

  // ── Route 1: --status ──────────────────────────────────────────────────────
  if (opts.status) {
    await runStatus(workspaces);
    process.exit(0);
  }

  // ── Route 2: --stop -w <ws> -a <apps> ─────────────────────────────────────
  if (opts.stop) {
    if (!opts.workspace || !opts.app) {
      console.error('Error: --stop requires both -w <workspace> and -a <apps>');
      process.exit(1);
    }
    await runStop(workspaces, opts.workspace, opts.app);
    process.exit(0);
  }

  // ── Route 3: -w <ws> -a <apps> (direct launch, no TUI) ───────────────────
  if (opts.workspace && opts.app) {
    await runDirectLaunch(workspaces, opts.workspace, opts.app);
    process.exit(0);
  }

  // ── Route 4 & 5: TUI modes (filtered or full) ─────────────────────────────
  if (opts.workspace) {
    const found = workspaces.find((ws) => ws.name === opts.workspace);
    if (!found) {
      console.error(`Error: workspace "${opts.workspace}" not found in config`);
      process.exit(1);
    }
  }

  await runTUI(workspaces, opts.workspace);
}

// ─── Entry ───────────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error(`Fatal: ${(err as Error).message}`);
  process.exit(1);
});
