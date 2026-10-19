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

// ─── Brand colour maths (for the custom primary colour) ───────────────────────
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on `hex`. */
export function contrastInk(hex: string): '#ffffff' | '#15181e' {
  return luminance(hex) > 0.4 ? '#15181e' : '#ffffff';
}

/** Mix `hex` towards white (`amount` 0…1). */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.map((v) => v + (255 - v) * amount) as [number, number, number]);
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** The CSS custom properties a brand colour sets on `:root` (see globals.css `[data-branded]`). */
export function brandTokens(hex: string): Record<string, string> {
  const dark = luminance(hex) < 0.18;
  const accentDark = dark ? lighten(hex, 0.35) : hex;
  return {
    '--brand': hex,
    '--brand-ink': contrastInk(hex),
    '--brand-accent': hex,
    '--brand-accent-dark': accentDark,
    '--brand-soft': withAlpha(hex, 0.12),
    '--brand-soft-dark': withAlpha(accentDark, 0.18),
    '--brand-focus': withAlpha(hex, 0.35),
    '--brand-focus-dark': withAlpha(accentDark, 0.45),
  };
}
