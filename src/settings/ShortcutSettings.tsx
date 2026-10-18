import { useEffect, useState, type KeyboardEvent } from 'react';
import { Scan, Monitor, Keyboard, ShieldCheck } from 'lucide-react';
import type { Shortcuts } from '../../shared/contracts';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '../components/ui/field';
import { Input } from '../components/ui/input';
const logoUrl = new URL('../../assets/logo.png', import.meta.url).href;
function accelerator(e: KeyboardEvent<HTMLInputElement>) {
  const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : /^(F\d{1,2}|PrintScreen)$/.test(e.key) ? e.key : '';
  return key ? [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super', key].filter(Boolean).join('+') : null;
}
export function ShortcutSettings() {
  const [shortcuts, setShortcuts] = useState<Shortcuts>({ full: '', region: '' });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { window.screenshot.settings().then(r => { if (r.ok) { setShortcuts(r.value.settings.shortcuts); setMessage(r.value.warning); } else setMessage(r.error); }); }, []);
  async function capture(mode: 'full' | 'region') { setBusy(true); const r = await window.screenshot.capture({ mode }); if (!r.ok) setMessage(r.error); setBusy(false); }
  async function apply() { setBusy(true); const r = await window.screenshot.updateShortcuts(shortcuts); setMessage(r.ok ? 'Shortcuts registered and saved.' : r.error); setBusy(false); }
  return <main className="settings">
    <header className="settings-header"><div className="flex items-center gap-3"><img className="settings-logo" src={logoUrl} alt="Screenshot logo" width={44} height={44} draggable={false} /><div><h1>Screenshot</h1><p className="settings-subtitle">Capture & shortcuts</p></div></div><span className="settings-private"><ShieldCheck size={14} /> Local only</span></header>
    <section aria-label="Quick capture" className="mt-6">
      <p className="text-sm text-muted-foreground">Capture all connected screens, or drag a region across screens.</p>
      <div className="grid grid-cols-2 gap-3 mt-3"><Button onClick={() => void capture('full')} disabled={busy}><Monitor /> Full screen</Button><Button variant="outline" onClick={() => void capture('region')} disabled={busy}><Scan /> Select region</Button></div>
    </section>
    <Card className="mt-5 gap-4 py-4"><CardHeader className="gap-1 px-5"><CardTitle className="flex items-center gap-2"><Keyboard size={17} /> Shortcuts</CardTitle><CardDescription>Click a field, then press your key combination.</CardDescription></CardHeader><CardContent className="px-5"><FieldGroup className="gap-3">
      {(['full', 'region'] as const).map(mode => <Field orientation="horizontal" className="items-center justify-between" key={mode}><FieldLabel htmlFor={mode}>{mode === 'full' ? 'Full screen' : 'Select region'}</FieldLabel><Input className="w-52 h-9" id={mode} type="text" aria-label={`${mode} shortcut`} value={shortcuts[mode]} disabled={busy} readOnly onKeyDown={e => { if (e.key === 'Tab') return; e.preventDefault(); const key = accelerator(e); if (key) setShortcuts(s => ({ ...s, [mode]: key })); }} /></Field>)}
    </FieldGroup></CardContent><CardFooter className="justify-between gap-3 px-5"><FieldDescription>Captures all connected screens.</FieldDescription><Button variant="outline" className="h-8" onClick={() => void apply()} disabled={busy || !shortcuts.full || !shortcuts.region}>Apply shortcuts</Button></CardFooter></Card>
    <p className="settings-status" role="status">{message}</p><footer className="settings-footer">Closing this window keeps Screenshot in the tray.</footer>
  </main>;
}


