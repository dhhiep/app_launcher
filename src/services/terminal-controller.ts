// Terminal controller interface and factory — auto-detects iTerm2 or tmux
import type { AppConfig, Workspace } from '../types.js';

export interface TerminalController {
  launchApps(apps: AppConfig[], workspace: Workspace): Promise<void>;
  launchAppInTab(app: AppConfig, workspace: Workspace): Promise<void>;
  isAvailable(): Promise<boolean>;
}

// Auto-detect the best available terminal controller
// Priority: iTerm2 (macOS) → tmux → error
export async function createTerminalController(): Promise<TerminalController> {
  const { ITermController } = await import('./iterm-controller.js');
  const iterm = new ITermController();
  if (await iterm.isAvailable()) {
    return iterm;
  }

  const { TmuxController } = await import('./tmux-controller.js');
  const tmux = new TmuxController();
  if (await tmux.isAvailable()) {
    return tmux;
  }

  throw new Error(
    'No supported terminal emulator found.\n' +
    '  • Install iTerm2 (https://iterm2.com) and ensure it is running, or\n' +
    '  • Install tmux and ensure it is in your PATH.'
  );
}
