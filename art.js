// TEMPORARY STUB: replaced by the real glyph set.
export const GLYPHS = { unknown: '<circle cx="12" cy="12" r="8"/>' };
export function glyph(name, cls = '') {
  const inner = GLYPHS[name] || GLYPHS.unknown;
  return `<svg class="g ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${inner}</svg>`;
}
