import { create } from 'zustand';
import type { Annotation, Tool } from '../editor/model';
import { preserveArrowTip, preserveGlyphOrigin } from '../editor/transform';
import type { QuarterTurns } from '../editor/screenshot-rotation';
type State = { tool: Tool; color: string; width: number; blurWidth: number; textSize: number; emojiSize: number; selectedId: string | null; annotations: Annotation[];
  quarterTurns: QuarterTurns; rotateScreenshot(): void;
  setTool(tool: Tool): void; setColor(color: string): void; setWidth(width: number): void; select(id: string | null): void; add(a: Annotation): void; replace(a: Annotation): void; remove(): void; reset(): void };
const initial = { tool: 'arrow' as Tool, color: '#f43f5e', width: 4, blurWidth: 32, textSize: 32, emojiSize: 48, selectedId: null, annotations: [] as Annotation[] };
export const useEditor = create<State>((set) => ({ ...initial,
  quarterTurns: 0,
  rotateScreenshot: () => set(s => ({ quarterTurns: ((s.quarterTurns + 1) % 4) as QuarterTurns })),
  setTool: tool => set({ tool, selectedId: null }),
  setColor: color => set(s => ({ color, annotations: s.annotations.map(a => a.id === s.selectedId && 'color' in a ? { ...a, color } : a) })),
  setWidth: value => set(s => {
    const selected = s.annotations.find(a => a.id === s.selectedId), type = selected?.type ?? s.tool;
    if (type === 'text' || type === 'emoji') {
      const size = Math.max(type === 'text' ? 12 : 16, Math.min(type === 'text' ? 160 : 256, value));
      return { ...(type === 'text' ? { textSize: size } : { emojiSize: size }), annotations: s.annotations.map(a => a.id !== s.selectedId ? a : a.type === 'text' ? preserveGlyphOrigin(a, { ...a, fontSize: size }) : a.type === 'emoji' ? preserveGlyphOrigin(a, { ...a, size }) : a) };
    }
    return type === 'blurStroke' ? { blurWidth: value } : { width: value, annotations: s.annotations.map(a => a.id === s.selectedId && (a.type === 'arrow' || a.type === 'rectangle' || a.type === 'circle' || a.type === 'freehand') ? a.type === 'arrow' ? preserveArrowTip(a, { ...a, width: value }) : { ...a, width: value } : a) };
  }),
  select: selectedId => set(s => { const a = s.annotations.find(a => a.id === selectedId); return { selectedId, ...(a && 'color' in a ? { color: a.color } : {}), ...(a && (a.type === 'arrow' || a.type === 'rectangle' || a.type === 'circle' || a.type === 'freehand') ? { width: a.width } : {}) }; }),
  add: a => set(s => ({ annotations: [...s.annotations, a] })),
  replace: a => set(s => ({ annotations: s.annotations.map(old => old.id === a.id ? a : old) })),
  remove: () => set(s => ({ annotations: s.annotations.filter(a => a.id !== s.selectedId), selectedId: null })),
  reset: () => set({ ...initial, quarterTurns: 0, annotations: [] }),
}));
