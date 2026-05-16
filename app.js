(() => {
  const TOTAL = 25;
  const API_URL = '/api/state';

  const DEFAULT_COUNTRIES = [
    "Danimarca", "Germania", "Israele", "Belgio", "Albania",
    "Grecia", "Ucraina", "Australia", "Serbia", "Malta",
    "Cechia", "Bulgaria", "Croazia", "Regno Unito", "Francia",
    "Moldova", "Finlandia", "Polonia", "Lituania", "Svezia",
    "Cipro", "Italia", "Norvegia", "Romania", "Austria"
  ];

  /* ---------- state ---------- */
  let state = defaultState();
  let draft = blankSlots();
  let editingPlayerId = null;
  let actualDraft = blankSlots();
  let lastRevealedRank = null;
  let activeTab = 'predictions';
  let pollTimer = null;
  let inFlight = 0;
  let hasSynced = false;

  function defaultState() {
    return { countries: [...DEFAULT_COUNTRIES], players: [], actualResults: null, revealedCount: 0 };
  }

  function blankSlots() {
    const d = {};
    for (let i = 1; i <= TOTAL; i++) d[i] = '';
    return d;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
  }

  /* ---------- toast & sync indicator ---------- */
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      toastEl.classList.add('hidden');
    }, 2400);
  }

  const syncPill = document.getElementById('sync-pill');
  const syncLabel = document.getElementById('sync-label');
  const syncBanner = document.getElementById('sync-banner');
  function setSync(stateName, label) {
    syncPill.dataset.state = stateName;
    syncLabel.textContent = label;
  }
  function showBanner(msg) {
    syncBanner.innerHTML = msg;
    syncBanner.classList.remove('hidden');
  }
  function hideBanner() {
    syncBanner.classList.add('hidden');
  }

  /* ---------- API ---------- */
  async function apiGet() {
    inFlight++;
    setSync('busy', 'Loading…');
    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data._warning) {
        showBanner(`⚠️ ${escapeHtml(data._warning)} Set the <code>GITHUB_TOKEN</code> env var on Vercel.`);
        setSync('error', 'No token');
      } else {
        hideBanner();
        setSync('ok', 'Synced');
      }
      delete data._warning;
      state = data;
      hasSynced = true;
      return state;
    } catch (e) {
      setSync('error', 'Offline');
      showBanner(`⚠️ Couldn't reach the API: ${escapeHtml(e.message)}. The API only works when deployed to Vercel (or via <code>vercel dev</code>).`);
      throw e;
    } finally {
      inFlight--;
      if (inFlight === 0 && hasSynced) setSync(syncPill.dataset.state || 'ok', syncLabel.textContent === 'Saving…' ? 'Synced' : syncLabel.textContent);
    }
  }

  async function apiPost(action, payload) {
    inFlight++;
    setSync('busy', 'Saving…');
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `HTTP ${res.status}`;
        setSync('error', 'Error');
        toast(`Save failed: ${msg}`);
        return null;
      }
      state = data;
      hasSynced = true;
      setSync('ok', 'Synced');
      hideBanner();
      return state;
    } catch (e) {
      setSync('error', 'Offline');
      toast(`Network error: ${e.message}`);
      return null;
    } finally {
      inFlight--;
    }
  }

  /* ---------- tabs ---------- */
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  async function activateTab(name) {
    activeTab = name;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    panels.forEach(p => p.classList.toggle('hidden', p.id !== `tab-${name}`));
    stopPolling();
    try { await apiGet(); } catch {}
    if (name === 'predictions') {
      renderPredictionSlots();
      renderPlayersList();
      renderCountryEditor();
    } else if (name === 'overview') {
      hideOverview();
    } else if (name === 'finale') {
      if (!Object.values(actualDraft).some(Boolean) && state.actualResults) {
        actualDraft = { ...state.actualResults };
      }
      renderActualSlots();
      renderReveal();
      renderLeaderboard();
      startPolling();
    }
  }
  tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const prev = JSON.stringify(state);
        await apiGet();
        if (JSON.stringify(state) !== prev) {
          renderReveal();
          renderLeaderboard();
        }
      } catch {}
    }, 4000);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  /* ---------- slot rendering shared ---------- */
  function buildSelect(rank, draftObj, onChange) {
    const sel = document.createElement('select');
    sel.className = 'input';
    const taken = new Set(
      Object.entries(draftObj)
        .filter(([k, v]) => +k !== rank && v)
        .map(([, v]) => v)
    );

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— select country —';
    sel.appendChild(blank);

    state.countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (taken.has(c) && draftObj[rank] !== c) opt.disabled = true;
      if (draftObj[rank] === c) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.addEventListener('change', e => onChange(e.target.value));
    return sel;
  }

  function renderSlotsInto(container, draftObj, onChange) {
    container.innerHTML = '';
    for (let r = 1; r <= TOTAL; r++) {
      const row = document.createElement('div');
      row.className = 'slot' + (draftObj[r] ? '' : ' slot--empty');
      row.dataset.rank = String(r);

      const pill = document.createElement('div');
      pill.className = 'rank-pill';
      pill.textContent = `#${r}`;

      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.title = 'Drag to reorder';
      handle.textContent = '⋮⋮';

      const sel = buildSelect(r, draftObj, v => {
        draftObj[r] = v;
        onChange();
      });

      row.appendChild(pill);
      row.appendChild(handle);
      row.appendChild(sel);
      container.appendChild(row);
    }
  }

  function initSortable(container, getDraft, onChange) {
    if (typeof Sortable === 'undefined') {
      console.warn('SortableJS not loaded — drag-and-drop disabled');
      return null;
    }
    return Sortable.create(container, {
      handle: '.drag-handle',
      animation: 180,
      forceFallback: true,
      fallbackTolerance: 4,
      touchStartThreshold: 4,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      fallbackClass: 'sortable-fallback',
      onEnd: (evt) => {
        if (evt.oldIndex === evt.newIndex) return;
        const draftObj = getDraft();
        const arr = [];
        for (let r = 1; r <= TOTAL; r++) arr.push(draftObj[r] || '');
        const item = arr.splice(evt.oldIndex, 1)[0];
        arr.splice(evt.newIndex, 0, item);
        for (let r = 1; r <= TOTAL; r++) draftObj[r] = arr[r - 1] || '';
        onChange();
      },
    });
  }

  /* ---------- Tab 1: predictions ---------- */
  const predNameEl = document.getElementById('player-name');
  const predSlotsEl = document.getElementById('prediction-slots');
  const progressEl = document.getElementById('progress-pred');
  const playersListEl = document.getElementById('players-list');
  const countryEditorEl = document.getElementById('country-editor');

  function renderPredictionSlots() {
    renderSlotsInto(predSlotsEl, draft, () => renderPredictionSlots());
    updatePredProgress();
  }

  function updatePredProgress() {
    const filled = Object.values(draft).filter(Boolean).length;
    progressEl.textContent = `${filled} / ${TOTAL}`;
  }

  function renderPlayersList() {
    playersListEl.innerHTML = '';
    if (state.players.length === 0) {
      playersListEl.innerHTML = `<li class="text-sm text-white/50">No players yet.</li>`;
      return;
    }
    state.players.forEach(p => {
      const li = document.createElement('li');
      const isEditing = editingPlayerId === p.id;
      li.className = 'player-chip' + (isEditing ? ' editing' : '');
      const filled = Object.values(p.predictions).filter(Boolean).length;
      li.innerHTML = `
        <div class="min-w-0">
          <div class="font-semibold truncate">${escapeHtml(p.name)}${isEditing ? ' <span class="text-esc-gold text-xs">(editing)</span>' : ''}</div>
          <div class="text-xs text-white/50">${filled}/25 picks</div>
        </div>
        <div class="flex gap-1 shrink-0">
          <button class="btn-ghost" data-act="edit">Edit</button>
          <button class="btn-danger" data-act="del" aria-label="Delete">×</button>
        </div>
      `;
      li.querySelector('[data-act="edit"]').addEventListener('click', () => loadPlayerIntoDraft(p.id));
      li.querySelector('[data-act="del"]').addEventListener('click', () => deletePlayer(p.id));
      playersListEl.appendChild(li);
    });
  }

  function loadPlayerIntoDraft(id) {
    const p = state.players.find(x => x.id === id);
    if (!p) return;
    editingPlayerId = id;
    predNameEl.value = p.name;
    draft = { ...p.predictions };
    renderPredictionSlots();
    renderPlayersList();
    toast(`Editing ${p.name}`);
  }

  async function deletePlayer(id) {
    const p = state.players.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Delete player "${p.name}" from GitHub for everyone?`)) return;
    const next = await apiPost('delete-player', { id });
    if (next) {
      if (editingPlayerId === id) startNewPlayer(false);
      renderPlayersList();
      toast(`Deleted ${p.name}.`);
    }
  }

  function startNewPlayer(showToast = true) {
    editingPlayerId = null;
    predNameEl.value = '';
    draft = blankSlots();
    renderPredictionSlots();
    renderPlayersList();
    if (showToast) toast('New player — slots cleared.');
  }

  async function savePrediction() {
    const name = predNameEl.value.trim();
    if (!name) { toast('Enter a player name first.'); predNameEl.focus(); return; }
    const filled = Object.values(draft).filter(Boolean).length;

    if (!editingPlayerId) editingPlayerId = uid();
    const next = await apiPost('save-player', {
      player: { id: editingPlayerId, name, predictions: draft },
    });
    if (next) {
      renderPlayersList();
      toast(`Saved ${filled}/${TOTAL} picks to GitHub.`);
    }
  }

  function randomizeRemaining() {
    const used = new Set(Object.values(draft).filter(Boolean));
    const remaining = state.countries.filter(c => !used.has(c));
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    const emptyRanks = [];
    for (let r = 1; r <= TOTAL; r++) if (!draft[r]) emptyRanks.push(r);
    if (emptyRanks.length === 0) { toast('All 25 slots already filled.'); return; }
    emptyRanks.forEach((r, i) => { draft[r] = remaining[i] || ''; });
    renderPredictionSlots();
    toast(`Randomized ${emptyRanks.length} slot(s).`);
  }

  function renderCountryEditor() {
    countryEditorEl.innerHTML = '';
    state.countries.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'country-edit-row';
      const idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = (i + 1);
      const input = document.createElement('input');
      input.className = 'input';
      input.value = c;
      input.dataset.idx = i;
      row.appendChild(idx);
      row.appendChild(input);
      countryEditorEl.appendChild(row);
    });
  }

  async function saveCountries() {
    const inputs = countryEditorEl.querySelectorAll('input');
    const next = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
    if (next.length !== TOTAL) { toast(`Need exactly ${TOTAL} non-empty countries.`); return; }
    if (new Set(next).size !== TOTAL) { toast('Country names must be unique.'); return; }
    const out = await apiPost('save-countries', { countries: next });
    if (out) {
      for (let r = 1; r <= TOTAL; r++) {
        if (draft[r] && !out.countries.includes(draft[r])) draft[r] = '';
        if (actualDraft[r] && !out.countries.includes(actualDraft[r])) actualDraft[r] = '';
      }
      renderPredictionSlots();
      toast('Countries updated.');
    }
  }

  document.getElementById('btn-save-pred').addEventListener('click', savePrediction);
  document.getElementById('btn-randomize').addEventListener('click', randomizeRemaining);
  document.getElementById('btn-clear-pred').addEventListener('click', () => {
    if (!confirm('Clear all 25 slots in the current draft?')) return;
    draft = blankSlots();
    renderPredictionSlots();
  });
  document.getElementById('btn-new-player').addEventListener('click', () => startNewPlayer(true));
  document.getElementById('btn-save-countries').addEventListener('click', saveCountries);

  /* ---------- Tab 2: Overview ---------- */
  const overviewToggleBtn = document.getElementById('btn-overview-toggle');
  const overviewGridEl = document.getElementById('overview-grid');
  const overviewCoverEl = document.getElementById('overview-cover');

  function showOverview() {
    overviewCoverEl.classList.add('hidden');
    overviewGridEl.classList.remove('hidden');
    overviewToggleBtn.textContent = '🙈 Hide predictions';
    renderOverview();
  }
  function hideOverview() {
    overviewCoverEl.classList.remove('hidden');
    overviewGridEl.classList.add('hidden');
    overviewToggleBtn.textContent = '👁 Show predictions';
  }
  overviewToggleBtn.addEventListener('click', () => {
    if (overviewGridEl.classList.contains('hidden')) showOverview();
    else hideOverview();
  });

  function renderOverview() {
    const root = document.getElementById('overview-grid');
    if (state.players.length === 0) {
      root.innerHTML = `<p class="text-white/60 text-sm">No players yet. Add predictions in tab 1.</p>`;
      return;
    }
    const table = document.createElement('table');
    table.className = 'overview-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.innerHTML = `<th>#</th>` + state.players.map(p => `<th>${escapeHtml(p.name)}</th>`).join('');
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let r = 1; r <= TOTAL; r++) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="rank-cell">#${r}</td>` + state.players.map(p => {
        const v = p.predictions[r] || '—';
        return `<td>${escapeHtml(v)}</td>`;
      }).join('');
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    root.innerHTML = '';
    root.appendChild(table);
  }

  /* ---------- Tab 3: Finale ---------- */
  const actualSlotsEl = document.getElementById('actual-slots');
  const revealListEl = document.getElementById('reveal-list');
  const revealProgressEl = document.getElementById('reveal-progress');
  const leaderboardEl = document.getElementById('leaderboard');

  function renderActualSlots() {
    renderSlotsInto(actualSlotsEl, actualDraft, () => renderActualSlots());
  }

  async function saveActual() {
    const filled = Object.values(actualDraft).filter(Boolean).length;
    const next = await apiPost('save-actual', { actualResults: actualDraft });
    if (next) {
      renderReveal();
      renderLeaderboard();
      toast(`Actual results saved (${filled}/${TOTAL}).`);
    }
  }

  async function clearActual() {
    if (!confirm('Clear actual results and reset all reveals (for everyone)?')) return;
    const next = await apiPost('clear-actual', {});
    if (next) {
      actualDraft = blankSlots();
      lastRevealedRank = null;
      renderActualSlots();
      renderReveal();
      renderLeaderboard();
    }
  }

  async function loadDemoResults() {
    if (state.actualResults && Object.values(state.actualResults).some(Boolean)) {
      if (!confirm('Overwrite existing actual results with demo data?')) return;
    }
    const shuffled = [...state.countries];
    const italyIdx = shuffled.findIndex(c => c === 'Italia' || c === 'Italy');
    if (italyIdx > 0) [shuffled[0], shuffled[italyIdx]] = [shuffled[italyIdx], shuffled[0]];
    for (let i = shuffled.length - 1; i > 1; i--) {
      const j = 1 + Math.floor(Math.random() * i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const fake = blankSlots();
    for (let r = 1; r <= TOTAL; r++) fake[r] = shuffled[r - 1] || '';

    const next = await apiPost('save-actual', { actualResults: fake });
    if (next) {
      actualDraft = { ...next.actualResults };
      renderActualSlots();
      renderReveal();
      renderLeaderboard();
      toast('🎬 Demo (Sanremo) results loaded.');
    }
  }

  const MAX_POINTS_TOP = 15;     // exact guess of actual #1
  const MAX_POINTS_BOTTOM = 5;   // exact guess of actual #25
  const DISTANCE_LIMIT = 5;      // beyond this distance, 0 points

  function maxPointsFor(rank) {
    const t = (rank - 1) / (TOTAL - 1);
    return Math.round(MAX_POINTS_TOP - t * (MAX_POINTS_TOP - MAX_POINTS_BOTTOM));
  }
  function pointsFor(rank, distance) {
    if (distance == null || distance > DISTANCE_LIMIT) return 0;
    const factor = Math.pow(1 - distance / DISTANCE_LIMIT, 2);
    return Math.round(maxPointsFor(rank) * factor);
  }
  function playerGuessRank(player, country) {
    if (!country) return null;
    for (let pr = 1; pr <= TOTAL; pr++) {
      if (player.predictions[pr] === country) return pr;
    }
    return null;
  }
  function playerPointsAtRank(player, r) {
    if (!state.actualResults) return { guess: null, distance: null, points: 0 };
    const actual = state.actualResults[r];
    if (!actual) return { guess: null, distance: null, points: 0 };
    const guess = playerGuessRank(player, actual);
    if (guess == null) return { guess: null, distance: null, points: 0 };
    const distance = Math.abs(guess - r);
    return { guess, distance, points: pointsFor(r, distance) };
  }

  function isRevealed(rank) { return rank >= TOTAL - state.revealedCount + 1; }
  function currentRevealRank() { return TOTAL - state.revealedCount + 1; }

  function renderReveal() {
    revealListEl.innerHTML = '';
    revealProgressEl.textContent = `${state.revealedCount} / ${TOTAL} revealed`;

    const haveActual = !!state.actualResults;
    const btn = document.getElementById('btn-reveal-next');
    btn.disabled = !haveActual || state.revealedCount >= TOTAL;
    if (!haveActual) btn.textContent = 'Set actual results first';
    else if (state.revealedCount >= TOTAL) btn.textContent = 'All revealed';
    else btn.textContent = `Reveal #${TOTAL - state.revealedCount} ▼`;

    if (state.revealedCount === 0) {
      const hint = document.createElement('div');
      hint.className = 'reveal-empty';
      hint.innerHTML = haveActual
        ? `Nothing revealed yet. Click <strong>Reveal #${TOTAL} ▼</strong> to start from the bottom.`
        : `Set the actual results in the admin section, then click Reveal.`;
      revealListEl.appendChild(hint);
      return;
    }

    for (let r = 1; r <= TOTAL; r++) {
      if (!isRevealed(r)) continue;
      const row = document.createElement('div');
      const justRevealed = r === lastRevealedRank;
      row.className = 'reveal-row revealed' + (justRevealed ? ' just-revealed' : '');

      const rankDiv = document.createElement('div');
      rankDiv.className = 'rank-big';
      rankDiv.textContent = `#${r}`;

      const right = document.createElement('div');
      const country = state.actualResults ? state.actualResults[r] : null;
      const maxPts = maxPointsFor(r);
      right.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="country-name">${country ? escapeHtml(country) : '<span class="text-white/40">— empty —</span>'}</div>
          <div class="text-xs text-white/60">max ${maxPts} pts</div>
        </div>
      `;

      if (country && state.players.length) {
        const breakdown = document.createElement('div');
        breakdown.className = 'player-breakdown';

        const rows = state.players.map(p => {
          const { guess, distance, points } = playerPointsAtRank(p, r);
          return { name: p.name, guess, distance, points };
        });
        rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

        rows.forEach(({ name, guess, distance, points }) => {
          const cls = points === maxPts && points > 0 ? 'exact'
                    : points > 0 ? 'partial' : 'zero';
          const guessText = guess == null
            ? '<span class="player-guess muted">no pick</span>'
            : `<span class="player-guess">#${guess}${distance > 0 ? ` <span class="dist">(${distance > DISTANCE_LIMIT ? '5+' : distance} off)</span>` : ''}</span>`;
          const pointsLabel = points > 0 ? `+${points}` : '0';
          const playerRow = document.createElement('div');
          playerRow.className = `player-row ${cls}`;
          playerRow.innerHTML = `
            <span class="player-name">${escapeHtml(name)}</span>
            ${guessText}
            <span class="player-points">${pointsLabel}</span>
          `;
          breakdown.appendChild(playerRow);
        });

        right.appendChild(breakdown);
      }

      row.appendChild(rankDiv);
      row.appendChild(right);
      revealListEl.appendChild(row);
    }
  }

  function renderLeaderboard() {
    leaderboardEl.innerHTML = '';
    const lastRank = state.revealedCount > 0 ? currentRevealRank() : null;

    const scored = state.players.map(p => {
      let score = 0;
      let lastDelta = 0;
      for (let r = 1; r <= TOTAL; r++) {
        if (!isRevealed(r) || !state.actualResults) continue;
        const { points } = playerPointsAtRank(p, r);
        score += points;
        if (r === lastRank) lastDelta = points;
      }
      return { p, score, lastDelta };
    });
    scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));

    if (scored.length === 0) {
      leaderboardEl.innerHTML = `<li class="text-sm text-white/50">No players.</li>`;
      return;
    }

    scored.forEach((row, i) => {
      const li = document.createElement('li');
      li.className = 'leader-row' + (i === 0 && row.score > 0 ? ' top' : '');
      li.innerHTML = `
        <div class="rank">${i + 1}</div>
        <div class="truncate">${escapeHtml(row.p.name)}</div>
        <div class="score">${row.score}${row.lastDelta ? `<span class="delta">+${row.lastDelta}</span>` : ''}</div>
      `;
      leaderboardEl.appendChild(li);
    });
  }

  async function revealNext() {
    if (!state.actualResults) { toast('Set actual results first.'); return; }
    if (state.revealedCount >= TOTAL) return;
    const newCount = state.revealedCount + 1;
    const next = await apiPost('set-reveal-count', { revealedCount: newCount });
    if (next) {
      lastRevealedRank = TOTAL - newCount + 1;
      renderReveal();
      renderLeaderboard();
      const c = state.actualResults[lastRevealedRank];
      toast(`#${lastRevealedRank}: ${c || '(empty)'}`);
    }
  }

  async function resetReveals() {
    if (state.revealedCount === 0) return;
    if (!confirm('Reset reveal progress back to 0 (for everyone)?')) return;
    const next = await apiPost('set-reveal-count', { revealedCount: 0 });
    if (next) {
      lastRevealedRank = null;
      renderReveal();
      renderLeaderboard();
    }
  }

  document.getElementById('btn-save-actual').addEventListener('click', saveActual);
  document.getElementById('btn-clear-actual').addEventListener('click', clearActual);
  document.getElementById('btn-load-demo').addEventListener('click', loadDemoResults);
  document.getElementById('btn-reveal-next').addEventListener('click', revealNext);
  document.getElementById('btn-reveal-reset').addEventListener('click', resetReveals);

  /* ---------- Export / Import / Reset / Refresh ---------- */
  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eurovision-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Exported.');
  });

  document.getElementById('file-import').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!confirm('Import will replace ALL data on GitHub. Continue?')) { e.target.value = ''; return; }
      const next = await apiPost('import-state', { state: parsed });
      if (next) {
        draft = blankSlots();
        actualDraft = next.actualResults ? { ...next.actualResults } : blankSlots();
        editingPlayerId = null;
        lastRevealedRank = null;
        predNameEl.value = '';
        activateTab('predictions');
        toast('Import complete.');
      }
    } catch {
      toast('Invalid JSON file.');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('Wipe ALL shared data on GitHub (players, actual results, country edits)?')) return;
    const next = await apiPost('reset-all', {});
    if (next) {
      draft = blankSlots();
      actualDraft = blankSlots();
      editingPlayerId = null;
      lastRevealedRank = null;
      predNameEl.value = '';
      activateTab('predictions');
      toast('All shared data cleared.');
    }
  });

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    try { await apiGet(); } catch {}
    if (activeTab === 'predictions') { renderPlayersList(); renderCountryEditor(); renderPredictionSlots(); }
    if (activeTab === 'overview') renderOverview();
    if (activeTab === 'finale') { renderReveal(); renderLeaderboard(); }
  });

  /* ---------- boot ---------- */
  initSortable(predSlotsEl, () => draft, () => renderPredictionSlots());
  initSortable(actualSlotsEl, () => actualDraft, () => renderActualSlots());
  activateTab('predictions');
})();
