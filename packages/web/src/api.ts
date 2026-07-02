import type { Action, PlayerView } from '@redearl/engine';

async function req(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return data;
}

export const api = {
  newGame: (): Promise<{ gameId: string; view: PlayerView }> => req('POST', '/api/games'),
  getView: (id: string): Promise<{ view: PlayerView }> => req('GET', `/api/games/${id}`),
  startMeeting: (id: string, personId: string): Promise<{ meetingId: string; opening: string; view: PlayerView }> =>
    req('POST', `/api/games/${id}/meetings`, { personId }),
  concludeMeeting: (id: string, mid: string): Promise<{
    summary: string;
    surfaced: string[];
    proposedActions: { action: Action; description: string }[];
    view: PlayerView;
  }> => req('POST', `/api/games/${id}/meetings/${mid}/conclude`),
  confirmOrders: (id: string, actions: Action[]): Promise<{
    courtScene?: string; accusationOutcome?: string; view: PlayerView;
  }> => req('POST', `/api/games/${id}/orders`, { actions }),
  study: (id: string): Promise<{ view: PlayerView }> => req('POST', `/api/games/${id}/study`),
  leisure: (id: string, kind: string): Promise<{ note: string; view: PlayerView }> =>
    req('POST', `/api/games/${id}/leisure`, { kind }),
  pin: (id: string, docId: string, lineId: string): Promise<{
    pinned: boolean; surfaced: string[]; view: PlayerView;
  }> => req('POST', `/api/games/${id}/pins`, { docId, lineId }),
  decide: (id: string, decisionId: string, response: string): Promise<{
    choice: string; note: string; view: PlayerView;
  }> => req('POST', `/api/games/${id}/decisions`, { decisionId, response }),
  endTurn: (id: string): Promise<{ briefing: string; view: PlayerView }> =>
    req('POST', `/api/games/${id}/end-turn`),
};

/** Send a meeting message and stream the NPC's reply token by token. */
export async function streamMessage(
  gameId: string, meetingId: string, text: string, onToken: (t: string) => void,
): Promise<string> {
  const res = await fetch(`/api/games/${gameId}/meetings/${meetingId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const dataRaw = /^data: (.*)$/m.exec(frame)?.[1];
      if (!event || !dataRaw) continue;
      const data = JSON.parse(dataRaw);
      if (event === 'token') onToken(data.t);
      else if (event === 'done') done = data.text;
      else if (event === 'error') throw new Error(data.error);
    }
  }
  return done;
}

export function fmtMoney(shillings: number): string {
  const neg = shillings < 0;
  const s = Math.abs(Math.round(shillings));
  const pounds = Math.floor(s / 20);
  const rem = s % 20;
  let core: string;
  if (pounds > 0 && rem > 0) core = `£${pounds} ${rem}s`;
  else if (pounds > 0) core = `£${pounds}`;
  else core = `${rem}s`;
  return neg ? `−${core}` : core;
}
