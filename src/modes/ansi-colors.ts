// ANSI escape codes for terminal coloring — no external dependency required
export const RESET = '\x1b[0m';
export const GREEN = '\x1b[32m';
export const RED = '\x1b[31m';
export const YELLOW = '\x1b[33m';
export const CYAN = '\x1b[36m';
export const DIM = '\x1b[2m';

/** Right-pad a string to the given column width */
export function pad(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}
