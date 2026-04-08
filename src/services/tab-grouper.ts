// Shared tab grouping logic for terminal controllers (iTerm2 + tmux)
import type { AppConfig } from '../types.js';

export interface TabGroup {
  groupKey: string;
  apps: AppConfig[];
}

/**
 * Groups apps by their tab field prefix (first digit before `_`).
 * Apps without a tab field each get their own standalone group.
 * Apps with tab "X_Y" are grouped by X (row), ordered by Y (column).
 */
export function groupAppsByTab(apps: AppConfig[]): TabGroup[] {
  const groups = new Map<string, AppConfig[]>();
  let standaloneIdx = 0;

  for (const app of apps) {
    if (!app.tab || app.tab === '') {
      const key = `__standalone_${standaloneIdx++}`;
      groups.set(key, [app]);
    } else {
      const [row] = app.tab.split('_');
      const key = `tab_${row}`;
      const existing = groups.get(key) ?? [];
      existing.push(app);
      groups.set(key, existing);
    }
  }

  // Sort apps within each group by column (Y value)
  return Array.from(groups.entries()).map(([groupKey, groupApps]) => ({
    groupKey,
    apps: groupApps.sort((a, b) => {
      const colA = a.tab ? parseInt(a.tab.split('_')[1] ?? '0', 10) : 0;
      const colB = b.tab ? parseInt(b.tab.split('_')[1] ?? '0', 10) : 0;
      return colA - colB;
    }),
  }));
}
