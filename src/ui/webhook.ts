import { hookBody, validHookUrl, type Connections, type HookEvent } from '@/engine/connect';

/**
 * Sends one event to the contractor's own webhook link (Zapier, Make…). Fire and forget: a failure never
 * blocks the app; the result is returned for the "Send a test" button.
 */
export async function postHook(conn: Connections | undefined, event: HookEvent, data: Record<string, unknown>, company: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!conn?.webhookUrl || !validHookUrl(conn.webhookUrl)) return { ok: false, error: 'No link set' };
  if (event !== 'test' && !conn.events.includes(event)) return { ok: false, error: 'Event turned off' };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(conn.webhookUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(hookBody(event, data, company)), signal: ctl.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not reach the link' };
  } finally {
    clearTimeout(t);
  }
}
