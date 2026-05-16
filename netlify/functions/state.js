const { connectLambda, getStore } = require('@netlify/blobs');

const TOTAL = 25;
const STORE_NAME = 'eurovision';
const KEY = 'state';
const MAX_RETRIES = 5;

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
      return { state };
    }
    case 'delete-player': {
      if (!payload || !payload.id) return { error: 'missing id' };
      state.players = state.players.filter(x => x.id !== payload.id);
      return { state };
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
      return { state };
    }
    case 'save-actual': {
      state.actualResults = sanitizeSlots(payload && payload.actualResults);
      return { state };
    }
    case 'clear-actual': {
      state.actualResults = null;
      state.revealedCount = 0;
      return { state };
    }
    case 'set-reveal-count': {
      const n = payload && Number(payload.revealedCount);
      if (!Number.isInteger(n) || n < 0 || n > TOTAL) return { error: 'invalid reveal count' };
      state.revealedCount = n;
      return { state };
    }
    case 'import-state': {
      return { state: normalize(payload && payload.state) };
    }
    case 'reset-all': {
      return { state: defaultState() };
    }
    default:
      return { error: `unknown action: ${action}` };
  }
}

function getStateStore() {
  // Eventual consistency: ~sub-second freshness for other viewers,
  // and the writer always gets the canonical post-write state in the
  // POST response so they see their own change instantly.
  // Strong consistency needs an uncachedEdgeURL that the v1 Functions
  // runtime doesn't inject.
  return getStore(STORE_NAME);
}

async function readWithEtag() {
  const store = getStateStore();
  const result = await store.getWithMetadata(KEY, { type: 'json' });
  if (!result) return { state: defaultState(), etag: null };
  return { state: normalize(result.data), etag: result.etag };
}

async function writeConditional(state, etag) {
  const store = getStateStore();
  const options = {};
  if (etag) options.onlyIfMatch = etag;
  else options.onlyIfNew = true;
  try {
    const res = await store.setJSON(KEY, state, options);
    // setJSON returns { modified: true/false } in recent versions
    if (res && res.modified === false) return false;
    return true;
  } catch (e) {
    if (String(e && e.message || '').toLowerCase().includes('precondition')) return false;
    throw e;
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function jsonResponse(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  try {
    // Required for Netlify Blobs to pick up siteID/token from the Lambda runtime
    // when using the v1 (exports.handler) Functions API.
    connectLambda(event);

    if (event.httpMethod === 'GET') {
      const { state } = await readWithEtag();
      return jsonResponse(200, state);
    }

    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; }
      catch { return jsonResponse(400, { error: 'invalid JSON body' }); }

      const { action, payload } = body;
      if (!action) return jsonResponse(400, { error: 'missing action' });

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const { state, etag } = await readWithEtag();
        const result = applyAction(state, action, payload);
        if (result.error) return jsonResponse(400, { error: result.error });
        if (await writeConditional(result.state, etag)) {
          return jsonResponse(200, result.state);
        }
        // raced with another writer — re-read and retry
      }
      return jsonResponse(409, { error: 'concurrent writes — please retry' });
    }

    return jsonResponse(405, { error: 'method not allowed' });
  } catch (e) {
    return jsonResponse(500, { error: String(e && e.message || e) });
  }
};
