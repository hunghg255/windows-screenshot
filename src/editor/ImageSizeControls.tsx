import { useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Field, FieldGroup, FieldLabel } from '../components/ui/field';
import type { ImageAnnotation } from './model';
export function ImageSizeControls({ image, busy, change }: { image: ImageAnnotation; busy: boolean; change(axis: 'width' | 'height', value: number, locked: boolean): void }) {
  const [locked, setLocked] = useState(true);
  return <FieldGroup role="group" aria-label="Image dimensions" className="w-64 shrink-0 flex-row items-center gap-2">
    {(['width', 'height'] as const).map(axis => <Field key={axis} orientation="horizontal" className="w-auto gap-1" data-disabled={busy}>
      <FieldLabel htmlFor={`image-${axis}`}>{axis === 'width' ? 'W' : 'H'}</FieldLabel>
      <Input key={`${image.id}-${image.width}-${image.height}`} id={`image-${axis}`} aria-label={`Image ${axis}`} type="number" min={2} max={16384} step="any" className="w-20" disabled={busy} defaultValue={Number(image[axis].toFixed(2))}
        onBlur={e => { const value = e.currentTarget.valueAsNumber; if (Math.abs(value - image[axis]) > .005 || !Number.isFinite(value)) change(axis, value, locked); e.currentTarget.value = String(Number(image[axis].toFixed(2))); }}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = String(Number(image[axis].toFixed(2))); e.currentTarget.blur(); } }} />
    </Field>)}
    <Button size="icon" variant="ghost" aria-label="Lock image aspect ratio" aria-pressed={locked} title="Lock image aspect ratio" disabled={busy} onClick={() => setLocked(v => !v)}>{locked ? <Lock /> : <LockOpen />}</Button>
  </FieldGroup>;
}
