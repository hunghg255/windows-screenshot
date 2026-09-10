import { createRoot } from 'react-dom/client';
import { Editor } from '../../src/editor/Editor';
import type { CaptureData } from '../../shared/contracts';

// Synthetic image only: visual QA must not include the user's captured desktop.
export function mountPreview(capture: CaptureData) {
  document.getElementById('root')!.style.display = 'none';
  const root = document.createElement('div'); root.style.height = '100vh'; document.body.append(root);
  createRoot(root).render(<Editor capture={capture} />);
}
