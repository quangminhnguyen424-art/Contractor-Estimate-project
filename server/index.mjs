// Minimal backend that lets the app use Claude without putting the API key on phones.
// Run:  ANTHROPIC_API_KEY=sk-ant-... node server/index.mjs
// Then start the app with EXPO_PUBLIC_AI_URL=http://<this-computer-ip>:8787
// Node 18+ required (built-in fetch). No dependencies.

import http from 'node:http';

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const PORT = Number(process.env.PORT || 8787);
if (!KEY) {
  console.error('Set ANTHROPIC_API_KEY first.');
  process.exit(1);
}

async function askClaude(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.map((c) => c.text || '').join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

/** The assistant chat: the app sends its instructions and the recent turns. Turns are checked before use. */
async function chatClaude(b) {
  const turns = (Array.isArray(b.turns) ? b.turns : [])
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .slice(-16)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 8000) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('Chat must end with a question');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: String(b.system ?? '').slice(0, 40000), messages: turns }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.content.map((c) => c.text || '').join('') };
}

const SCOPE_SYSTEM = `You are an experienced Washington State general contractor helping fill in an estimate.
Read the contractor's job description and fill in answers to the listed questions.
Only answer questions the description actually covers; never guess. Numbers are plain numbers (no units).
Yes/no answers are true/false. Choice answers must be one of the listed option values.
Return ONLY JSON: {"jobTypeId": string|null, "answers": {questionId: value}, "heard": [short human-readable phrases of what you picked up]}`;

const PAST_JOB_SYSTEM = `Extract a completed construction job from pasted quote or invoice text.
Return ONLY JSON: {"jobTypeId": one of bathroom|kitchen|basement|flooring|painting|adu|newbuild or null,
"sizeSf": number or null, "price": total price before tax as a number or null, "finish": basic|mid|high or null, "title": short job name}`;

const routes = {
  '/parse-scope': (b) => askClaude(SCOPE_SYSTEM, `Job type: ${b.jobTypeId ?? 'unknown'}\nQuestions: ${JSON.stringify(b.questions ?? [])}\n\nDescription:\n${b.text}`),
  '/extract-past-job': (b) => askClaude(PAST_JOB_SYSTEM, b.text),
  '/chat': chatClaude,
};

http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.end();
  const route = routes[req.url];
  if (req.method !== 'POST' || !route) { res.statusCode = 404; return res.end(); }
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    const out = await route(JSON.parse(body || '{}'));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(out));
  } catch (e) {
    console.error(e);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'AI request failed' }));
  }
}).listen(PORT, () => console.log(`Estimator AI server on :${PORT} using ${MODEL}`));
