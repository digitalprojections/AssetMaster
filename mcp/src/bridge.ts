import { getRelayScript } from './relay.js';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export interface BridgeOptions { port: number; origins: string[]; commandTimeoutMs?: number; heartbeatMs?: number }
export interface EditorResult { ok: boolean; message?: string; [key: string]: unknown }
interface Pending { id: string; command: unknown; delivered: boolean; resolve: (result: EditorResult) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
const equal = (a: string, b: string) => { const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); };
export class LocalBridge {
  private server?: Server;
  private session?: string;
  private sessionOrigin?: string;
  private lastSeen = 0;
  private pending?: Pending;
  private poll?: { response: ServerResponse; timer: NodeJS.Timeout };
  private pairingExpires = Date.now() + 10 * 60_000;
  private attempts = 0;
  private attemptWindow = Date.now();
  private code = randomBytes(24).toString('base64url');
  url = '';
  constructor(private options: BridgeOptions) {}
  get pairingCode() { return this.code; }
  status() {
    if (this.session && Date.now() - this.lastSeen > (this.options.heartbeatMs ?? 60_000)) this.disconnect();
    return { state: this.session ? 'success' : 'unavailable', connected: Boolean(this.session), pairingUrl: this.url, message: this.session ? 'AssetMaster editor connected.' : 'Editor disconnected. Open pairingUrl and connect your AssetMaster workspace.' };
  }
  async start() {
    this.server = createServer((req, res) => { void this.handle(req, res).catch((error: unknown) => { this.reply(res, 400, { error: error instanceof Error ? error.message : 'Invalid request.' }); }); });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.options.port, '127.0.0.1', () => { this.server!.off('error', reject); resolve(); });
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Could not bind local companion.');
    this.url = `http://127.0.0.1:${address.port}`;
  }
  execute(command: unknown): Promise<EditorResult> {
    if (!this.status().connected) return Promise.reject(new Error('Editor disconnected. Open the pairing URL returned by assetmaster_status.'));
    if (this.pending) return Promise.reject(new Error('Editor busy. Wait for the current operation to finish.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        this.disconnect();
        reject(new Error('Editor timed out; outcome is unknown. Reconnect and inspect state before repeating an edit.'));
      }, this.options.commandTimeoutMs ?? 60_000);
      this.pending = { id: randomUUID(), command, delivered: false, resolve, reject, timer };
      this.deliver();
    });
  }
  disconnect() {
    this.session = undefined;
    this.sessionOrigin = undefined;
    this.code = randomBytes(24).toString('base64url');
    this.pairingExpires = Date.now() + 10 * 60_000;
    if (this.poll) { clearTimeout(this.poll.timer); this.reply(this.poll.response, 401, { error: 'Editor disconnected.' }); this.poll = undefined; }
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('Editor disconnected; outcome is unknown. Inspect state before repeating an edit.')); this.pending = undefined; }
  }
  async close() {
    this.disconnect();
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => this.server ? this.server.close(() => resolve()) : resolve());
  }
  private reply(res: ServerResponse, status: number, body: unknown) {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  private deliver() {
    if (!this.poll || !this.pending || this.pending.delivered) return;
    const poll = this.poll; this.poll = undefined; clearTimeout(poll.timer);
    this.pending.delivered = true;
    this.reply(poll.response, 200, { id: this.pending.id, command: this.pending.command });
  }
  private async body(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 32 * 1024 * 1024) throw new Error('Transfer exceeds the 32 MiB request memory budget. Use a smaller image.');
      chunks.push(chunk);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a JSON object.');
    return body as Record<string, unknown>;
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    const address = this.server?.address();
    const port = address && typeof address !== 'string' ? address.port : 0;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '')) return this.reply(res, 403, { error: 'Invalid local Host header.' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const route = new URL(req.url ?? '/', this.url).pathname;
    if (req.method === 'GET' && route === '/relay.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(getRelayScript(this.options.origins)); return; }
    if (req.method === 'GET' && route === '/') {
      if (req.headers.origin || req.headers['sec-fetch-site'] === 'cross-site') return this.reply(res, 403, { error: 'Open this address directly in your browser.' });
      this.status();
      // Only the local setup page exposes the short-lived pairing code; never MCP output or logs.
      const app = this.options.origins.includes('https://created.link') ? 'https://created.link/assetmaster/' : `${this.options.origins[0]}/`;
      const link = `${app}#mcp-port=${port}&mcp-code=${this.code}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AssetMaster AI connection</title><style>body{font:17px system-ui;background:#020617;color:#e2e8f0;max-width:650px;margin:8vh auto;padding:24px;line-height:1.6}a{color:#67e8f9}code{overflow-wrap:anywhere}h1{line-height:1.2}</style><h1>Connect AssetMaster to your AI agent</h1><p>${this.session ? 'An editor is connected. Disconnect it in AssetMaster before pairing another workspace.' : 'Open AssetMaster using the link below, then choose Connect in the AI integrations panel.'}</p><p><a id="connect-editor" href="${link}" target="assetmaster-paired-editor">Open AssetMaster to connect</a></p><p>For a different supported AssetMaster tab, enter port <strong>${port}</strong> and this pairing code:</p><p><code>${this.code}</code></p><p>Keep this pairing page open. Pairing expires after 10 minutes. Reload after disconnecting to get a new code. Image data shared with the agent may be sent to its AI provider.</p><p id="relay-status" role="status"></p><script src="/relay.js"></script></html>`);
    }
    const origin = req.headers.origin ?? '';
    if (![...this.options.origins, this.url].includes(origin)) return this.reply(res, 403, { error: 'Origin is not allowed.' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'POST') return this.reply(res, 405, { error: 'Use POST.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return this.reply(res, 415, { error: 'Use application/json.' });
    const body = await this.body(req);
    this.status();
    if (route === '/pair') {
      if (Date.now() - this.attemptWindow > 60_000) { this.attemptWindow = Date.now(); this.attempts = 0; }
      if (++this.attempts > 20) return this.reply(res, 429, { error: 'Too many pairing attempts. Wait one minute.' });
      if (this.session) return this.reply(res, 409, { error: 'Another workspace is connected. Disconnect it first.' });
      if (Date.now() > this.pairingExpires || typeof body.code !== 'string' || !equal(body.code, this.code)) return this.reply(res, 401, { error: 'Invalid or expired pairing code. Restart the companion to obtain a new code.' });
      this.session = randomBytes(32).toString('base64url'); this.sessionOrigin = origin; this.lastSeen = Date.now();
      return this.reply(res, 200, { token: this.session });
    }
    if (!this.session || origin !== this.sessionOrigin || !equal(req.headers.authorization ?? '', `Bearer ${this.session}`)) return this.reply(res, 401, { error: 'Editor disconnected. Pair again.' });
    this.lastSeen = Date.now();
    if (route === '/disconnect') { this.disconnect(); return this.reply(res, 200, { ok: true }); }
    if (route === '/poll') {
      if (this.poll) return this.reply(res, 409, { error: 'A command listener is already connected.' });
      const timer = setTimeout(() => { if (this.poll?.response === res) this.poll = undefined; this.reply(res, 200, { idle: true }); }, 20_000);
      this.poll = { response: res, timer };
      res.once('close', () => { if (this.poll?.response === res) { clearTimeout(timer); this.poll = undefined; } });
      this.deliver(); return;
    }
    if (route === '/result') {
      if (!this.pending || body.id !== this.pending.id || !this.pending.delivered) return this.reply(res, 409, { error: 'Unknown or expired command.' });
      if (!body.result || typeof body.result !== 'object' || typeof (body.result as EditorResult).ok !== 'boolean') return this.reply(res, 400, { error: 'Invalid editor result.' });
      const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer);
      pending.resolve(body.result as EditorResult);
      return this.reply(res, 200, { ok: true });
    }
    this.reply(res, 404, { error: 'Unknown companion route.' });
  }
}
