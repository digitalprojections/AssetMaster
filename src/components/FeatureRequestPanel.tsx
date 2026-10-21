import React, { useRef, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { submitFeatureRequest, validateFeatureRequest, type DeliveryState } from '../utils/featureRequests';

export default function FeatureRequestPanel() {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<DeliveryState | 'idle' | 'sending'>('idle');
  const [validation, setValidation] = useState('');
  const sending = state === 'sending';
  const value = { title, description, replyTo, website };
  const messages = {
    idle: '', sending: 'Sending your request...', success: 'Your request has been accepted for email delivery to the AssetMaster team. Thank you for sharing your idea.',
    unavailable: 'Feature requests are temporarily unavailable. Your draft is still here; please try again later.',
    error: 'Your request could not be confirmed. Your draft is still here; please check your connection and try again.',
    limited: 'Please wait a few minutes before sending another request. Your draft is still here.',
  };
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} aria-label="Request a feature" title="Request a feature" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
      <MessageSquarePlus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Request a feature</span>
    </button>
    <dialog ref={dialog} aria-labelledby="feature-request-title" onCancel={event => { if (sending) event.preventDefault(); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl backdrop:bg-black/70">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id="feature-request-title" className="text-lg font-semibold">Request a feature</h2><button type="button" disabled={sending} onClick={() => dialog.current?.close()} aria-label="Close feature request" className="rounded-lg p-2 hover:bg-slate-800 disabled:opacity-40"><X size={18} /></button></div>
      <p className="mb-4 text-sm text-slate-400">Tell us what would make AssetMaster work better for you.</p>
      <form onSubmit={async event => {
        event.preventDefault();
        if (inFlight.current) return;
        const issue = validateFeatureRequest(value);
        setValidation(issue || '');
        if (issue) return;
        inFlight.current = true;
        setState('sending');
        const endpoint = import.meta.env.DEV ? '/api/feature-request.php' : 'https://created.link/assetmaster/api/feature-request.php';
        const result = await submitFeatureRequest(value, fetch, endpoint);
        inFlight.current = false;
        setState(result);
        if (result === 'success') { setTitle(''); setDescription(''); setReplyTo(''); }
      }} className="space-y-4">
        <fieldset disabled={sending || state === 'success'} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm">Feature title<input autoFocus required minLength={3} maxLength={120} value={title} onChange={e => { setTitle(e.target.value); setState('idle'); }} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5" /></label>
          <label className="block text-sm">Your idea<textarea required minLength={10} maxLength={5000} rows={5} value={description} onChange={e => { setDescription(e.target.value); setState('idle'); }} className="mt-1 block w-full resize-y rounded-lg border border-slate-700 bg-slate-900 p-2.5" placeholder="What would you like to do, and how would it help?" /></label>
          <label className="block text-sm">Reply email <span className="text-slate-400">(optional)</span><input type="email" maxLength={254} autoComplete="email" value={replyTo} onChange={e => { setReplyTo(e.target.value); setState('idle'); }} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5" /></label>
          <div className="hidden" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
        </fieldset>
        <p className="text-xs leading-relaxed text-slate-400">Submitting sends this text and your optional reply address to the AssetMaster team through our email provider. Include only details needed to explain your idea. Your images and projects are not attached. <a href="https://created.link/assetmaster/feedback-privacy.html" target="_blank" rel="noreferrer" className="text-cyan-300 underline">Feature request privacy</a></p>
        <p role="status" aria-live="polite" className="text-sm text-cyan-200">{validation || messages[state]}</p>
        {state === 'success' ? <button type="button" onClick={() => { setState('idle'); dialog.current?.close(); }} className="w-full rounded-lg bg-cyan-700 px-4 py-2.5 font-semibold">Done</button> : <button type="submit" disabled={sending || !!validateFeatureRequest(value)} className="w-full rounded-lg bg-cyan-700 px-4 py-2.5 font-semibold hover:bg-cyan-600 disabled:opacity-40">{sending ? 'Sending...' : 'Send request'}</button>}
      </form>
    </dialog>
  </>;
}
