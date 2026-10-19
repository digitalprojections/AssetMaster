export function isMcpRelayHello(event: MessageEvent, origin: string, code: string) {
  return Boolean(event.source) && event.origin === origin && event.data?.channel === 'assetmaster-relay-hello' && event.data.code === code;
}
export function isMcpRelayResponse(event: MessageEvent, source: Window, origin: string, id: string) {
  return event.source === source && event.origin === origin && event.data?.channel === 'assetmaster-relay-response' && event.data.id === id && typeof event.data.status === 'number';
}
export function requestMcpRelay(source: Window, origin: string, route: string, body: unknown, token: string | undefined, signal: AbortSignal): Promise<{ status: number; result: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => { window.removeEventListener('message', onMessage); signal.removeEventListener('abort', onAbort); };
    const onAbort = () => { cleanup(); reject(new Error('The pairing-page connection was interrupted. Keep the local pairing page open and reconnect.')); };
    const onMessage = (event: MessageEvent) => { if (isMcpRelayResponse(event, source, origin, id)) { cleanup(); resolve({ status: event.data.status, result: event.data.result }); } };
    if (signal.aborted) return onAbort();
    window.addEventListener('message', onMessage); signal.addEventListener('abort', onAbort, { once: true });
    source.postMessage({ channel: 'assetmaster-relay-request', id, route, body, token }, origin);
  });
}
