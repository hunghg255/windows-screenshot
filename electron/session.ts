export class CaptureSession {
  id: string | null = null;
  begin(id: string) { if (this.id) return false; this.id = id; return true; }
  matches(id: unknown) { return typeof id === 'string' && this.id !== null && this.id === id; }
  end() { this.id = null; }
}
