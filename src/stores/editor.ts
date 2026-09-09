import { create } from 'zustand';
import type { Annotation, Tool } from '../editor/model';
type State = { tool: Tool; color: string; width: number; blurWidth: number; textSize: number; emojiSize: number; selectedId: string | null; annotations: Annotation[];
  setTool(tool: Tool): void; setColor(color: string): void; setWidth(width: number): void; select(id: string | null): void; add(a: Annotation): void; replace(a: Annotation): void; remove(): void; reset(): void };
const initial = { tool: 'arrow' as Tool, color: '#f43f5e', width: 4, blurWidth: 32, textSize: 32, emojiSize: 48, selectedId: null, annotations: [] as Annotation[] };
export const useEditor = create<State>((set) => ({ ...initial,
  setTool: tool => set({ tool, selectedId: null }),
  setColor: color => set(s => ({ color, annotations: s.annotations.map(a => a.id === s.selectedId && 'color' in a ? { ...a, color } : a) })),
  setWidth: value => set(s => {
    const selected = s.annotations.find(a => a.id === s.selectedId), type = selected?.type ?? s.tool;
    if (type === 'text' || type === 'emoji') {
      const size = Math.max(type === 'text' ? 12 : 16, Math.min(type === 'text' ? 160 : 256, value));
      return { ...(type === 'text' ? { textSize: size } : { emojiSize: size }), annotations: s.annotations.map(a => a.id !== s.selectedId ? a : a.type === 'text' ? { ...a, fontSize: size } : a.type === 'emoji' ? { ...a, size } : a) };
    }
    return s.tool === 'blurStroke' ? { blurWidth: value } : { width: value };
  }),
  select: selectedId => set(s => { const a = s.annotations.find(a => a.id === selectedId); return { selectedId, ...(a && 'color' in a ? { color: a.color } : {}) }; }),
  add: a => set(s => ({ annotations: [...s.annotations, a] })),
  replace: a => set(s => ({ annotations: s.annotations.map(old => old.id === a.id ? a : old) })),
  remove: () => set(s => ({ annotations: s.annotations.filter(a => a.id !== s.selectedId), selectedId: null })),
  reset: () => set({ ...initial, annotations: [] }),
}));
