/** Local pairing-page relay. Only its explicitly opened editor window may send messages. */
export function getRelayScript(origins: string[]) {
  return `const allowedOrigins = ${JSON.stringify(origins)};
let editorWindow = null;
let helloTimer = null;
let helloAttempts = 0;
const link = document.getElementById('connect-editor');
link.addEventListener('click', event => {
  event.preventDefault();
  editorWindow = window.open(link.href, 'assetmaster-paired-editor');
  if (!editorWindow) document.getElementById('relay-status').textContent = 'Allow this page to open the AssetMaster editor, then try again.';
  else {
    document.getElementById('relay-status').textContent = 'Keep this pairing page open while your agent works in the editor tab.';
    clearInterval(helloTimer); helloAttempts = 0;
    const target = new URL(link.href);
    const code = new URLSearchParams(target.hash.slice(1)).get('mcp-code');
    helloTimer = setInterval(() => {
      if (editorWindow.closed || ++helloAttempts > 120) { clearInterval(helloTimer); return; }
      editorWindow.postMessage({ channel: 'assetmaster-relay-hello', code }, target.origin);
    }, 250);
  }
});
window.addEventListener('message', async event => {
  if (event.source !== editorWindow || !allowedOrigins.includes(event.origin)) return;
  const data = event.data;
  if (data?.channel === 'assetmaster-relay-ready') { clearInterval(helloTimer); return; }
  if (!data || data.channel !== 'assetmaster-relay-request' || typeof data.id !== 'string' || !['/pair','/poll','/result','/disconnect'].includes(data.route)) return;
  try {
    const response = await fetch(data.route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(typeof data.token === 'string' ? { Authorization: 'Bearer ' + data.token } : {}) }, body: JSON.stringify(data.body), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (event.source === editorWindow) editorWindow.postMessage({ channel: 'assetmaster-relay-response', id: data.id, status: response.status, result }, event.origin);
  } catch {
    if (event.source === editorWindow) editorWindow.postMessage({ channel: 'assetmaster-relay-response', id: data.id, status: 503, result: { error: 'The local companion connection was interrupted. Reopen the pairing page and connect again.' } }, event.origin);
  }
});`;
}
