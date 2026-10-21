export type FeatureRequest = { title: string; description: string; replyTo: string; website: string };
export type DeliveryState = 'success' | 'unavailable' | 'error' | 'limited';
export function validateFeatureRequest(value: FeatureRequest): string | null {
  if (value.title.trim().length < 3 || value.title.length > 120) return 'Enter a title between 3 and 120 characters.';
  if (value.description.trim().length < 10 || value.description.length > 5000) return 'Describe your idea in 10 to 5,000 characters.';
  if (value.replyTo && (value.replyTo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.replyTo))) return 'Enter a valid reply email or leave it blank.';
  return null;
}
export async function submitFeatureRequest(value: FeatureRequest, send: typeof fetch = fetch, endpoint = 'https://created.link/assetmaster/api/feature-request.php'): Promise<DeliveryState> {
  try {
    const response = await send(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value), signal: AbortSignal.timeout(20000), credentials: 'omit',
    });
    if (response.status === 503) return 'unavailable';
    if (response.status === 429) return 'limited';
    if (!response.ok) return 'error';
    return (await response.json()).ok === true ? 'success' : 'error';
  } catch { return 'error'; }
}
