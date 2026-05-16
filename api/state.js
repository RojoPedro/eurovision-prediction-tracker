const OWNER = process.env.GITHUB_OWNER || 'RojoPedro';
const REPO = process.env.GITHUB_REPO || 'eurovision-prediction-tracker';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH = process.env.GITHUB_DATA_PATH || 'data.json';

const TOTAL = 25;
const DEFAULT_COUNTRIES = [
  "Danimarca", "Germania", "Israele", "Belgio", "Albania",
  "Grecia", "Ucraina", "Australia", "Serbia", "Malta",
  "Cechia", "Bulgaria", "Croazia", "Regno Unito", "Francia",
  "Moldova", "Finlandia", "Polonia", "Lituania", "Svezia",
  "Cipro", "Italia", "Norvegia", "Romania", "Austria"
];

function defaultState() {
  return { countries: [...DEFAULT_COUNTRIES], players: [], actualResults: null, revealedCount: 0 };
}

function blankSlots() {
  const o = {};
  for (let i = 1; i <= TOTAL; i++) o[i] = '';
  return o;
}

function sanitizeSlots(p) {
  const out = blankSlots();
  if (!p) return out;
  for (let i = 1; i <= TOTAL; i++) if (p[i]) out[i] = String(p[i]).slice(0, 80);
  return out;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalize(s) {
  if (!s || typeof s !== 'object') return defaultState();
  return {
    countries: Array.isArray(s.countries) && s.countries.length === TOTAL
      ? s.countries.map(c => String(c).slice(0, 80))
      : [...DEFAULT_COUNTRIES],
    players: Array.isArray(s.players)
      ? s.players.slice(0, 500).map(p => ({
          id: String(p.id || uid()).slice(0, 32),
          name: String(p.name || 'Player').slice(0, 80),
          predictions: sanitizeSlots(p.predictions),
        }))
      : [],
    actualResults: s.actualResults ? sanitizeSlots(s.actualResults) : null,
    revealedCount: Number.isInteger(s.revealedCount)
      ? Math.max(0, Math.min(TOTAL, s.revealedCount))
      : 0,
  };
}

async function ghRequest(token, url, init = {}) {
  const res = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = { raw: text }; } }
  return { ok: res.ok, status: res.status, body };
}

async function readFromGithub(token) {
  const url = `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(DATA_PATH)}?ref=${encodeURIComponent(BRANCH)}`;
  const { ok, status, body } = await ghRequest(token, url);
  if (status === 404) return { state: defaultState(), sha: null };
  if (!ok) throw new Error(`Read failed (${status}): ${body && body.message ? body.message : ''}`);
  const content = Buffer.from(body.content, 'base64').toString('utf-8');
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { parsed = defaultState(); }
  return { state: normalize(parsed), sha: body.sha };
}

async function writeToGithub(token, state, sha, message) {
  const url = `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(DATA_PATH)}`;
  const payload = {
    message: message || 'chore(data): update',
    branch: BRANCH,
    content: Buffer.from(JSON.stringify(state, null, 2)).toString('base64'),
  };
  if (sha) payload.sha = sha;
  return ghRequest(token, url, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
}

function applyAction(state, action, payload) {
  state = normalize(state);
  switch (action) {
    case 'save-player': {
      const p = payload && payload.player;
      if (!p || !p.name) return { error: 'invalid player payload' };
      const player = {
        id: String(p.id || uid()).slice(0, 32),
        name: String(p.name).trim().slice(0, 80),
        predictions: sanitizeSlots(p.predictions),
      };
      if (!player.name) return { error: 'name required' };
      const idx = state.players.findIndex(x => x.id === player.id);
      if (idx >= 0) state.players[idx] = player;
      else state.players.push(player);
      return { state, message: `data: save player "${player.name}"` };
    }
    case 'delete-player': {
      if (!payload || !payload.id) return { error: 'missing id' };
      const before = state.players.length;
      state.players = state.players.filter(x => x.id !== payload.id);
      if (state.players.length === before) return { state, message: 'data: noop delete' };
      return { state, message: `data: delete player ${payload.id}` };
    }
    case 'save-countries': {
      const c = payload && payload.countries;
      if (!Array.isArray(c) || c.length !== TOTAL) return { error: `need exactly ${TOTAL} countries` };
      const cleaned = c.map(x => String(x).trim()).filter(Boolean);
      if (cleaned.length !== TOTAL) return { error: 'countries must be non-empty' };
      if (new Set(cleaned).size !== TOTAL) return { error: 'countries must be unique' };
      state.countries = cleaned;
      const valid = new Set(cleaned);
      state.players.forEach(p => {
        for (let r = 1; r <= TOTAL; r++) if (p.predictions[r] && !valid.has(p.predictions[r])) p.predictions[r] = '';
      });
      if (state.actualResults) {
        for (let r = 1; r <= TOTAL; r++) if (state.actualResults[r] && !valid.has(state.actualResults[r])) state.actualResults[r] = '';
      }
      return { state, message: 'data: update countries' };
    }
    case 'save-actual': {
      state.actualResults = sanitizeSlots(payload && payload.actualResults);
      return { state, message: 'data: save actual results' };
    }
    case 'clear-actual': {
      state.actualResults = null;
      state.revealedCount = 0;
      return { state, message: 'data: clear actual results' };
    }
    case 'set-reveal-count': {
      const n = payload && Number(payload.revealedCount);
      if (!Number.isInteger(n) || n < 0 || n > TOTAL) return { error: 'invalid reveal count' };
      state.revealedCount = n;
      return { state, message: `data: reveal count → ${n}` };
    }
    case 'import-state': {
      return { state: normalize(payload && payload.state), message: 'data: import full state' };
    }
    case 'reset-all': {
      return { state: defaultState(), message: 'data: reset all' };
    }
    default:
      return { error: `unknown action: ${action}` };
  }
}

module.exports = async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    if (!token) {
      return res.status(200).json({
        ...defaultState(),
        _warning: 'GITHUB_TOKEN env var not configured — returning defaults; writes will fail.',
      });
    }
    try {
      const { state } = await readFromGithub(token);
      return res.status(200).json(state);
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  if (req.method === 'POST') {
    if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not set on the server' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const { action, payload } = body || {};
    if (!action) return res.status(400).json({ error: 'missing action' });

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { state, sha } = await readFromGithub(token);
        const result = applyAction(state, action, payload);
        if (result.error) return res.status(400).json({ error: result.error });
        const w = await writeToGithub(token, result.state, sha, result.message);
        if (w.ok) return res.status(200).json(result.state);
        if (w.status === 409 || w.status === 422) continue;
        return res.status(w.status).json({ error: (w.body && w.body.message) || 'write failed' });
      } catch (e) {
        return res.status(500).json({ error: String(e.message || e) });
      }
    }
    return res.status(409).json({ error: 'conflict — please retry' });
  }

  res.status(405).end();
};
