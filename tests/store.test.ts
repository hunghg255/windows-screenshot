import { beforeEach, expect, it } from 'vitest';
import { useEditor } from '../src/stores/editor';
beforeEach(() => useEditor.getState().reset());
it('changes only the selected colored annotation and restores base after deleting blur', () => {
  const s = useEditor.getState(); s.add({ id: 'a', type: 'freehand', color: '#f00', width: 4, points: [{ x: 1, y: 1 }] });
  s.add({ id: 'b', type: 'blurStroke', width: 30, points: [{ x: 1, y: 1 }] });
  s.setColor('#00ff00'); expect(useEditor.getState().annotations[0]).toHaveProperty('color', '#f00');
  s.select('a'); s.setColor('#00ff00'); expect(useEditor.getState().annotations[0]).toHaveProperty('color', '#00ff00');
  s.select('b'); s.setColor('#0000ff'); expect(useEditor.getState().annotations[1]).not.toHaveProperty('color');
  s.remove(); expect(useEditor.getState().annotations.map(a => a.id)).toEqual(['a']);
  s.reset(); expect(useEditor.getState().annotations).toEqual([]);
});

it('loads and edits selected line/circle/freehand width without changing geometry or other drawings', () => {
  const s = useEditor.getState(), transform = { x: 20, y: 30, sx: 3, sy: .5 };
  s.add({ id: 'circle', type: 'circle', color: '#f00', width: 8, start: { x: 10, y: 10 }, end: { x: 50, y: 50 }, transform });
  s.add({ id: 'pen', type: 'freehand', color: '#f00', width: 4, points: [{ x: 10, y: 10 }], transform });
  s.add({ id: 'line', type: 'line', color: '#f00', width: 6, start: { x: 10, y: 10 }, end: { x: 70, y: 10 }, transform });
  for (const [id, width] of [['circle', 8], ['pen', 4], ['line', 6]] as const) {
    s.select(id); expect(useEditor.getState().width).toBe(width);
    const before = useEditor.getState().annotations, selected = before.find(a => a.id === id)!;
    s.setWidth(12);
    expect(useEditor.getState().annotations.find(a => a.id === id)).toEqual({ ...selected, width: 12 });
    expect(useEditor.getState().annotations.find(a => a.id !== id)).toBe(before.find(a => a.id !== id));
  }
});
