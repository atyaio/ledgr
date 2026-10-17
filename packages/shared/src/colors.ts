/** Fixed, validated categorical order (see dataviz skill): never cycled. */
export const CATEGORICAL_PALETTE = [
  '#5B8DEF', // blue
  '#E0A458', // amber
  '#4FB286', // green
  '#D96C8A', // rose
  '#8F7EE7', // violet
  '#44B3C2', // teal
  '#C98E3A', // ochre
  '#9A9FAD', // slate (other)
] as const;

export function pickColor(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

/** Deterministic colour for a name (stable across imports). */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORICAL_PALETTE[h % (CATEGORICAL_PALETTE.length - 1)];
}
