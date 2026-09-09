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
