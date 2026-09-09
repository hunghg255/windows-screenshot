import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';
export function EmojiPicker({ options, choose, cancel }: { options: readonly (readonly [string, string])[]; choose(emoji: string): void; cancel(): void }) {
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { grid.current?.querySelector('button')?.focus(); }, []);
  return <section className="editor-panel" aria-label="Emoji picker" onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    const buttons = Array.from(grid.current?.querySelectorAll('button') ?? []), i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 } as Record<string, number>)[e.key];
    if (delta !== undefined && i >= 0 && buttons.length) { e.preventDefault(); buttons[(i + delta + buttons.length) % buttons.length]?.focus(); }
  }}><header className="editor-panel-header"><h2 className="font-semibold">Choose an emoji</h2><Button type="button" variant="ghost" size="icon" aria-label="Close emoji picker" title="Close picker" onClick={cancel}><X /></Button></header><div ref={grid} className="grid grid-cols-6 gap-1">{options.map(([emoji, label]) => <Button key={emoji} variant="ghost" size="icon" aria-label={label} title={label} onClick={() => choose(emoji)}><span className="emoji-glyph">{emoji}</span></Button>)}</div>{!options.length && <p role="alert">No supported color emoji font was found on this device.</p>}<p className="text-xs text-muted-foreground my-3">Choose an emoji, then click the image to place it.</p></section>;
}

