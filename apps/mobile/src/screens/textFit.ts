// A conservative estimate of how wide and how many lines a text takes, so the console layouts can be
// proven to fit by arithmetic (Jest cannot measure text). The average glyph is taken as 0.6 em wide
// (about 10 to 20 percent wider than Roboto's mixed-case average), and a line is only filled to 90
// percent (words do not break mid-way). Over-estimating only costs room, under-estimating would clip.

/** Average glyph width in em. */
export const CHAR_EM = 0.6;
/** Share of a line's width that words can fill. */
export const FILL = 0.9;

/** Estimated width (dp) of `chars` characters at `size` sp and text scale `scale`. */
export function textWidth(chars: number, size: number, scale: number): number {
  return Math.ceil(chars * CHAR_EM * size * Math.max(1, scale));
}

/** Estimated number of lines of `text` in a column `width` dp wide (at least 1). */
export function textLines(text: string, width: number, size: number, scale: number): number {
  return Math.max(1, Math.ceil(textWidth(text.length, size, scale) / Math.max(1, width * FILL)));
}
