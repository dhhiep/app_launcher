// WorkspaceTree: multi-select tree of workspaces and their apps for launch selection
import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Workspace } from '../types.js';

interface WorkspaceTreeProps {
  workspaces: Workspace[];
  initialSelection: Set<string>;
  onLaunch: (selected: Set<string>) => void;
}

// Flat list item — either a workspace header or a selectable app row
interface HeaderItem {
  type: 'header';
  workspaceName: string;
}

interface AppItem {
  type: 'app';
  appKey: string;        // "workspaceName/appName"
  workspaceName: string;
  appName: string;
  port: number;
}

type ListItem = HeaderItem | AppItem;

// Build a flat list from workspaces for linear cursor navigation
function buildFlatList(workspaces: Workspace[]): ListItem[] {
  const items: ListItem[] = [];
  for (const ws of workspaces) {
    items.push({ type: 'header', workspaceName: ws.name });
    for (const app of ws.apps) {
      items.push({
        type: 'app',
        appKey: `${ws.name}/${app.name}`,
        workspaceName: ws.name,
        appName: app.name,
        port: app.port,
      });
    }
  }
  return items;
}

// Find next selectable (app) item index in given direction, wrapping around
function nextAppIndex(items: ListItem[], from: number, direction: 1 | -1): number {
  const len = items.length;
  let idx = (from + direction + len) % len;
  // Walk until we land on an app row (skip headers)
  while (items[idx]?.type === 'header' && idx !== from) {
    idx = (idx + direction + len) % len;
  }
  return items[idx]?.type === 'app' ? idx : from;
}

// Initial cursor: first app row index
function firstAppIndex(items: ListItem[]): number {
  const idx = items.findIndex((i) => i.type === 'app');
  return idx >= 0 ? idx : 0;
}

export function WorkspaceTree({ workspaces, initialSelection, onLaunch }: WorkspaceTreeProps): React.ReactElement {
  const items = buildFlatList(workspaces);
  const [cursor, setCursor] = useState(() => firstAppIndex(items));
  
  // Filter initialSelection to only include valid app keys that exist in current items
  const validAppKeys = new Set(
    items
      .filter((i): i is AppItem => i.type === 'app')
      .map((i) => i.appKey)
  );
  const [selected, setSelected] = useState<Set<string>>(() => {
    const filtered = new Set<string>();
    for (const key of initialSelection) {
      if (validAppKeys.has(key)) {
        filtered.add(key);
      }
    }
    return filtered;
  });

  const currentItem = items[cursor];

  useInput(useCallback((_input: string, key: { upArrow: boolean; downArrow: boolean; return: boolean }) => {
    if (key.upArrow) {
      setCursor((c) => nextAppIndex(items, c, -1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => nextAppIndex(items, c, 1));
      return;
    }
    if (_input === ' ') {
      // Toggle selection on current app row
      if (currentItem?.type === 'app') {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(currentItem.appKey)) {
            next.delete(currentItem.appKey);
          } else {
            next.add(currentItem.appKey);
          }
          return next;
        });
      }
      return;
    }
    if (_input === 'a') {
      // Select all apps in the workspace of the current cursor position
      if (currentItem?.type === 'app') {
        const wsName = currentItem.workspaceName;
        const wsKeys = items
          .filter((i): i is Extract<ListItem, { type: 'app' }> => i.type === 'app' && i.workspaceName === wsName)
          .map((i) => i.appKey);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const k of wsKeys) next.add(k);
          return next;
        });
      }
      return;
    }
    if (key.return) {
      if (selected.size > 0) {
        onLaunch(selected);
      }
    }
  }, [items, currentItem, selected, onLaunch]));

  return (
    <Box flexDirection="column">
      {items.map((item, idx) => {
        if (item.type === 'header') {
          return (
            <Text key={item.workspaceName} bold color="yellow">
              {item.workspaceName}
            </Text>
          );
        }
        const isCursor = idx === cursor;
        const isSelected = selected.has(item.appKey);
        const checkbox = isSelected ? '[x]' : '[ ]';
        const label = `  ${checkbox} ${item.appName} (port: ${item.port})`;
        return (
          <Text key={item.appKey} inverse={isCursor} color={isCursor ? 'cyan' : undefined}>
            {label}
          </Text>
        );
      })}
      <Text dimColor>
        {`Selected: ${selected.size} app(s) — Space:toggle  a:select-all-in-ws  Enter:launch`}
      </Text>
    </Box>
  );
}
