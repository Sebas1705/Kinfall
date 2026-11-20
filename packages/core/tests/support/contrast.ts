// WCAG 2.x contrast for the art tests (kept out of core src: it needs an exponent, which the
// determinism guard bans there).

/** Relative luminance of the opaque part of `#rrggbb` / `#rrggbbaa`. */
export function luminance(hex: string): number {
  const ch = (i: number): number => {
    const s = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

/** Contrast ratio between two colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
