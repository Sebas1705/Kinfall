/**
 * Text props of a line the console layout keeps to `lines` lines and shrinks to fit (its height is
 * bounded by the screen's metrics file); in the fallback layout (`fixed` false) nothing is capped,
 * so large text never truncates there.
 */
export function fitText(fixed: boolean, lines: number, minScale: number): { numberOfLines?: number; adjustsFontSizeToFit?: boolean; minimumFontScale?: number } {
  return fixed ? { numberOfLines: lines, adjustsFontSizeToFit: true, minimumFontScale: minScale } : {};
}
