import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { TextAnnotation } from './model';
import { normalizeText, textError } from './glyph-layout';
import { Button } from '../components/ui/button';
import { Field, FieldGroup, FieldLabel } from '../components/ui/field';
export function TextComposer({ value, change, done, cancel }: { value: TextAnnotation; change(value: TextAnnotation): void; done(): void; cancel(): void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const error = textError(value.content);
  return <section className="editor-panel" aria-label="Text composer" onKeyDown={e => {
    e.stopPropagation(); if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); if (!error) done(); }
  }}><header className="editor-panel-header"><h2 className="font-semibold">Text</h2><Button type="button" variant="ghost" size="icon" aria-label="Close text editor" title="Discard text" onClick={cancel}><X /></Button></header><FieldGroup><Field><FieldLabel htmlFor="text-content">Content</FieldLabel><textarea ref={input} id="text-content" rows={5} className="rounded-md border border-input bg-background p-3 resize-y" value={value.content} aria-invalid={!!error} onChange={e => change({ ...value, content: normalizeText(e.target.value) })} /></Field><Field><FieldLabel htmlFor="text-size">Font size (px)</FieldLabel><input id="text-size" type="range" min={12} max={160} value={value.fontSize} onChange={e => change({ ...value, fontSize: Number(e.target.value) })} /><span>{value.fontSize} px</span></Field><Field><FieldLabel htmlFor="text-color">Text color</FieldLabel><input id="text-color" type="color" value={value.color} onChange={e => change({ ...value, color: e.target.value })} /></Field></FieldGroup><p className="text-xs text-muted-foreground my-3">Enter: new line · Ctrl+Enter: done · Esc: discard</p>{error && <p role="alert" className="text-destructive mb-3">{error}</p>}<div className="flex gap-2"><Button disabled={!!error} onClick={done}>Done</Button></div></section>;
}

