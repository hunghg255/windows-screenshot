import { expect, it } from 'vitest';
import { glyphLayout, normalizeText, textError } from '../src/editor/glyph-layout';
import type { TextAnnotation } from '../src/editor/model';
const text: TextAnnotation = { type: 'text', id: 'a', position: { x: 100, y: 50 }, content: 'Tiếng Việt\nHello', fontFamily: 'Segoe UI', fontSize: 32, lineHeight: 1.25, color: '#000' };
it('shares multiline baselines and accounts for glyph overhangs', () => {
  const layout = glyphLayout(text, content => ({ width: content.length * 16, actualBoundingBoxLeft: 3, actualBoundingBoxRight: content.length * 16 + 2, actualBoundingBoxAscent: 35, actualBoundingBoxDescent: 10 }));
  expect(layout.lines.map(l => l.baseline)).toEqual([82, 122]);
  expect(layout.bounds.x).toBe(95); expect(layout.bounds.y).toBe(45); expect(layout.bounds.bottom).toBe(134);
});
it('normalizes line endings and limits content without splitting Unicode', () => {
  expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
  expect(textError('a'.repeat(2001))).toContain('2,000'); expect(textError('\n'.repeat(20))).toContain('20 lines'); expect(textError('😀'.repeat(2000))).toBe('');
});
