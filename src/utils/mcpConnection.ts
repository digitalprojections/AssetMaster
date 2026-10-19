import { getCompanionAddress, type McpEditorRequest, type McpEditorResult } from './mcpEditor';
export type ConnectionState = 'unavailable' | 'loading' | 'success' | 'error';
export class McpConnection {
  private controller = new AbortController();
  private token?: string;
  private url: string;
  constructor(port: string, private execute: (request: McpEditorRequest) => Promise<McpEditorResult>, private changed: (state: ConnectionState, message: string) => void, private reset?: () => void) { this.url = getCompanionAddress(port); }
  private async post(route: string, body: unknown, keepalive = false) {
    const response = await fetch(`${this.url}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify(body), signal: keepalive ? AbortSignal.timeout(5000) : AbortSignal.any([this.controller.signal, AbortSignal.timeout(30000)]), keepalive });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'The companion could not complete the request.');
    return result;
  }
  async connect(code: string) {
    this.changed('loading', 'Connecting to your local companion…');
    try {
      const timeout = setTimeout(() => this.controller.abort(), 15000);
      let paired: { token: string };
      try { paired = await this.post('/pair', { code }); } finally { clearTimeout(timeout); }
      this.token = paired.token;
      this.reset?.();
      this.changed('success', 'Connected. Your AI agent can work in this editor.');
      void this.listen();
    } catch (error) { if (!this.controller.signal.aborted) this.changed('error', error instanceof Error ? error.message : 'Could not connect.'); else this.changed('error', 'Connection timed out. Check that the companion is running and local network access is allowed.'); }
  }
  private async listen() {
    try {
      while (!this.controller.signal.aborted) {
        const job = await this.post('/poll', {});
        if (!job.id) continue;
        let result: McpEditorResult;
        try { result = await this.execute(job.command); } catch (error) { result = { ok: false, message: error instanceof Error ? error.message : 'Editor operation failed.' }; }
        if (this.controller.signal.aborted) return;
        await this.post('/result', { id: job.id, result });
      }
    } catch (error) {
      if (this.controller.signal.aborted) return;
      this.changed('error', error instanceof Error ? error.message : 'Connection lost. Reconnect to continue.');
      this.disconnect(false);
    }
  }
  disconnect(notify = true) {
    if (this.token) { void this.post('/disconnect', {}, true).catch(() => {}); this.token = undefined; }
    this.controller.abort();
    this.reset?.();
    if (notify) this.changed('unavailable', 'Disconnected. Reconnect with a fresh pairing code.');
  }
}
