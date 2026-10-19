import React, { useEffect, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { McpConnection, type ConnectionState } from '../utils/mcpConnection';
import { parsePairingFragment, type McpEditorRequest, type McpEditorResult } from '../utils/mcpEditor';
export default function McpConnectionPanel({ execute, reset }: { execute: (request: McpEditorRequest) => Promise<McpEditorResult>; reset: () => void }) {
  const [open, setOpen] = useState(false);
  const [port, setPort] = useState('38475');
  const [code, setCode] = useState('');
  const [state, setState] = useState<ConnectionState>('unavailable');
  const [message, setMessage] = useState('Connect a local companion to let your AI agent edit this workspace.');
  const connection = useRef<McpConnection | null>(null);
  const executeRef = useRef(execute); executeRef.current = execute;
  const resetRef = useRef(reset); resetRef.current = reset;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const readFragment = () => {
      const pairing = parsePairingFragment(window.location.hash);
      if (!pairing) return;
      setPort(pairing.port); setCode(pairing.code); setOpen(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    readFragment(); window.addEventListener('hashchange', readFragment);
    const disconnect = () => connection.current?.disconnect(false);
    window.addEventListener('pagehide', disconnect);
    return () => { window.removeEventListener('hashchange', readFragment); window.removeEventListener('pagehide', disconnect); disconnect(); };
  }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const connect = async (event: React.FormEvent) => {
    event.preventDefault(); connection.current?.disconnect(false);
    try {
      connection.current = new McpConnection(port, request => executeRef.current(request), (next, text) => { setState(next); setMessage(text); }, () => resetRef.current());
      await connection.current.connect(code.trim());
      setCode('');
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'Could not connect.'); }
  };
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="AI integrations" title="Connect your AI agent" className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold hover:bg-slate-800"><Bot className="h-3.5 w-3.5" /><span className="hidden sm:inline">AI integrations</span><span aria-label={state === 'success' ? 'Connected' : 'Disconnected'} className={`h-2 w-2 rounded-full ${state === 'success' ? 'bg-emerald-400' : state === 'loading' ? 'bg-amber-400' : 'bg-slate-500'}`} /></button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby="mcp-panel-title" className="m-auto max-h-[85dvh] w-[min(94vw,36rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="flex items-center justify-between gap-3"><h2 id="mcp-panel-title" className="text-lg font-semibold">Connect your AI agent</h2><button type="button" aria-label="Close AI integrations" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-800"><X size={20} /></button></div>
      <p className="mt-3 text-sm text-slate-300">Use the AssetMaster companion with an AI application that supports local MCP servers. Keep this editor open while your agent works.</p>
      <a href={`${import.meta.env.BASE_URL}mcp/index.html`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-cyan-300 underline">Download and setup instructions</a>
      <p role="status" aria-live="polite" className={`my-4 rounded-lg border p-3 text-sm ${state === 'error' ? 'border-red-800 text-red-200' : state === 'success' ? 'border-emerald-800 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>{message}</p>
      {state !== 'success' && <form onSubmit={connect} className="space-y-4">
        <p className="text-sm text-slate-400">Start the companion from your AI application, open its local pairing page, and enter the port and code shown there. Allow local network access if your browser requests it.</p>
        <label className="block text-sm">Companion port<input required inputMode="numeric" pattern="[0-9]+" value={port} onChange={event => setPort(event.target.value)} disabled={state === 'loading'} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 p-2" /></label>
        <label className="block text-sm">Pairing code<input required autoComplete="off" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} disabled={state === 'loading'} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 p-2 font-mono" /></label>
        <button type="submit" disabled={state === 'loading' || !code.trim() || !/^\d+$/.test(port) || +port < 1 || +port > 65535} className="w-full rounded-lg bg-cyan-700 px-4 py-2 font-semibold hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40">{state === 'loading' ? 'Connecting…' : 'Connect workspace'}</button>
      </form>}
      {state === 'success' && <button type="button" onClick={() => connection.current?.disconnect()} className="w-full rounded-lg border border-slate-600 px-4 py-2 font-semibold hover:bg-slate-800">Disconnect workspace</button>}
      <p className="mt-4 text-xs leading-relaxed text-slate-400">Connecting permits the agent to inspect and edit this workspace. File import and export are limited to the companion’s configured folder. Requested previews and other content returned to your AI application may be sent to its AI provider. Pairing credentials stay in memory and clear when you disconnect or close this page.</p>
    </dialog>
  </>;
}
