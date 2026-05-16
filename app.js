(() => {
  const STORAGE_KEY = 'eurovision-tracker-v1';
  const TOTAL = 25;

  const DEFAULT_COUNTRIES = [
    "Albania", "Armenia", "Australia", "Austria", "Belgium",
    "Croatia", "Cyprus", "Denmark", "Estonia", "Finland",
    "France", "Georgia", "Germany", "Greece", "Iceland",
    "Ireland", "Israel", "Italy", "Latvia", "Lithuania",
    "Luxembourg", "Malta", "Moldova", "Netherlands", "Norway"
  ];

  /* ---------- state ---------- */
  let state = load();
  let draft = blankSlots();
  let editingPlayerId = null;
  let actualDraft = state.actualResults ? { ...state.actualResults } : blankSlots();
  let lastRevealedRank = null;

  function blankSlots() {
    const d = {};
    for (let i = 1; i <= TOTAL; i++) d[i] = '';
    return d;
  }

  function defaultState() {
    return {
      countries: [...DEFAULT_COUNTRIES],
      players: [],
      actualResults: null,
      revealedCount: 0,
    };
  }

  function normalize(s) {
    return {
      countries: Array.isArray(s.countries) && s.countries.length === TOTAL
        ? s.countries.map(String)
        : [...DEFAULT_COUNTRIES],
      players: Array.isArray(s.players)
        ? s.players.map(p => ({
            id: p.id || uid(),
            name: String(p.name || 'Player'),
            predictions: sanitizeSlots(p.predictions),
          }))
        : [],
      actualResults: s.actualResults ? sanitizeSlots(s.actualResults) : null,
      revealedCount: Number.isInteger(s.revealedCount)
        ? Math.max(0, Math.min(TOTAL, s.revealedCount))
        : 0,
    };
  }

  function sanitizeSlots(p) {
    const out = {};
    for (let i = 1; i <= TOTAL; i++) out[i] = p && p[i] ? String(p[i]) : '';
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return normalize(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
  }

  /* ---------- toast ---------- */
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
    }, 2200);
  }

  /* ---------- tabs ---------- */
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  function activateTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    panels.forEach(p => p.classList.toggle('hidden', p.id !== `tab-${name}`));
    if (name === 'predictions') {
      renderPredictionSlots();
      renderPlayersList();
      renderCountryEditor();
    } else if (name === 'overview') {
      renderOverview();
    } else if (name === 'finale') {
      renderActualSlots();
      renderReveal();
      renderLeaderboard();
    }
  }
  tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));

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
      row.className = 'slot';
      const pill = document.createElement('div');
      pill.className = 'rank-pill';
      pill.textContent = `#${r}`;
      const sel = buildSelect(r, draftObj, v => {
        draftObj[r] = v;
        onChange();
      });
      row.appendChild(pill);
      row.appendChild(sel);
      container.appendChild(row);
    }
  }

  /* ---------- Tab 1: predictions ---------- */
  const predNameEl = document.getElementById('player-name');
  const predSlotsEl = document.getElementById('prediction-slots');
  const progressEl = document.getElementById('progress-pred');
  const playersListEl = document.getElementById('players-list');
  const countryEditorEl = document.getElementById('country-editor');

  function renderPredictionSlots() {
    renderSlotsInto(predSlotsEl, draft, () => {
      renderPredictionSlots();
    });
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

  function deletePlayer(id) {
    const p = state.players.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Delete player "${p.name}"?`)) return;
    state.players = state.players.filter(x => x.id !== id);
    if (editingPlayerId === id) startNewPlayer(false);
    save();
    renderPlayersList();
  }

  function startNewPlayer(showToast = true) {
    editingPlayerId = null;
    predNameEl.value = '';
    draft = blankSlots();
    renderPredictionSlots();
    renderPlayersList();
    if (showToast) toast('New player — slots cleared.');
  }

  function savePrediction() {
    const name = predNameEl.value.trim();
    if (!name) {
      toast('Enter a player name first.');
      predNameEl.focus();
      return;
    }
    const filled = Object.values(draft).filter(Boolean).length;
    if (filled < TOTAL && !confirm(`Only ${filled}/25 slots filled. Save anyway?`)) return;

    if (editingPlayerId) {
      const p = state.players.find(x => x.id === editingPlayerId);
      if (p) { p.name = name; p.predictions = { ...draft }; }
    } else {
      const newP = { id: uid(), name, predictions: { ...draft } };
      state.players.push(newP);
      editingPlayerId = newP.id;
    }
    save();
    renderPlayersList();
    toast('Prediction saved.');
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

  function saveCountries() {
    const inputs = countryEditorEl.querySelectorAll('input');
    const next = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
    if (next.length !== TOTAL) { toast(`Need exactly ${TOTAL} non-empty countries.`); return; }
    if (new Set(next).size !== TOTAL) { toast('Country names must be unique.'); return; }
    state.countries = next;

    const valid = new Set(next);
    state.players.forEach(p => {
      for (let r = 1; r <= TOTAL; r++) if (p.predictions[r] && !valid.has(p.predictions[r])) p.predictions[r] = '';
    });
    if (state.actualResults) {
      for (let r = 1; r <= TOTAL; r++) if (state.actualResults[r] && !valid.has(state.actualResults[r])) state.actualResults[r] = '';
    }
    for (let r = 1; r <= TOTAL; r++) if (draft[r] && !valid.has(draft[r])) draft[r] = '';
    for (let r = 1; r <= TOTAL; r++) if (actualDraft[r] && !valid.has(actualDraft[r])) actualDraft[r] = '';

    save();
    renderPredictionSlots();
    toast('Countries updated.');
  }

  document.getElementById('btn-save-pred').addEventListener('click', savePrediction);
  document.getElementById('btn-clear-pred').addEventListener('click', () => {
    if (!confirm('Clear all 25 slots in the current draft?')) return;
    draft = blankSlots();
    renderPredictionSlots();
  });
  document.getElementById('btn-new-player').addEventListener('click', () => startNewPlayer(true));
  document.getElementById('btn-save-countries').addEventListener('click', saveCountries);

  /* ---------- Tab 2: Overview ---------- */
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

  function saveActual() {
    const filled = Object.values(actualDraft).filter(Boolean).length;
    if (filled < TOTAL && !confirm(`Only ${filled}/25 actual results set. Save anyway?`)) return;
    state.actualResults = { ...actualDraft };
    save();
    renderReveal();
    renderLeaderboard();
    toast('Actual results saved.');
  }

  function clearActual() {
    if (!confirm('Clear actual results and reset all reveals?')) return;
    state.actualResults = null;
    state.revealedCount = 0;
    actualDraft = blankSlots();
    lastRevealedRank = null;
    save();
    renderActualSlots();
    renderReveal();
    renderLeaderboard();
  }

  function pointsFor(rank) { return TOTAL + 1 - rank; }
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
    else btn.textContent = `Reveal #${currentRevealRank()} ▼`;

    for (let r = 1; r <= TOTAL; r++) {
      const row = document.createElement('div');
      const revealed = isRevealed(r);
      const justRevealed = revealed && r === lastRevealedRank;
      row.className = 'reveal-row ' + (revealed ? 'revealed' : 'locked') + (justRevealed ? ' just-revealed' : '');

      const rankDiv = document.createElement('div');
      rankDiv.className = 'rank-big';
      rankDiv.textContent = `#${r}`;

      const right = document.createElement('div');
      const country = revealed && state.actualResults ? state.actualResults[r] : null;
      right.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="country-name">${
            revealed
              ? (country ? escapeHtml(country) : '<span class="text-white/40">— empty —</span>')
              : '<span class="text-white/40">Hidden</span>'
          }</div>
          <div class="text-xs text-white/60">${pointsFor(r)} pts</div>
        </div>
      `;

      if (revealed && country) {
        const matches = state.players.filter(p => p.predictions[r] === country);
        if (matches.length) {
          const wrap = document.createElement('div');
          wrap.className = 'matches';
          matches.forEach(p => {
            const pill = document.createElement('span');
            pill.className = 'match-pill';
            pill.textContent = `${p.name} +${pointsFor(r)}`;
            wrap.appendChild(pill);
          });
          right.appendChild(wrap);
        }
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
        if (p.predictions[r] && p.predictions[r] === state.actualResults[r]) {
          const pts = pointsFor(r);
          score += pts;
          if (r === lastRank) lastDelta = pts;
        }
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

  function revealNext() {
    if (!state.actualResults) { toast('Set actual results first.'); return; }
    if (state.revealedCount >= TOTAL) return;
    state.revealedCount++;
    lastRevealedRank = currentRevealRank();
    save();
    renderReveal();
    renderLeaderboard();
    const c = state.actualResults[lastRevealedRank];
    toast(`#${lastRevealedRank}: ${c || '(empty)'}`);
  }

  function resetReveals() {
    if (state.revealedCount === 0) return;
    if (!confirm('Reset reveal progress back to 0?')) return;
    state.revealedCount = 0;
    lastRevealedRank = null;
    save();
    renderReveal();
    renderLeaderboard();
  }

  document.getElementById('btn-save-actual').addEventListener('click', saveActual);
  document.getElementById('btn-clear-actual').addEventListener('click', clearActual);
  document.getElementById('btn-reveal-next').addEventListener('click', revealNext);
  document.getElementById('btn-reveal-reset').addEventListener('click', resetReveals);

  /* ---------- Export / Import / Reset ---------- */
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
      if (!confirm('Import will replace your current local data. Continue?')) { e.target.value = ''; return; }
      state = normalize(parsed);
      actualDraft = state.actualResults ? { ...state.actualResults } : blankSlots();
      draft = blankSlots();
      editingPlayerId = null;
      lastRevealedRank = null;
      predNameEl.value = '';
      save();
      activateTab('predictions');
      toast('Import complete.');
    } catch {
      toast('Invalid JSON file.');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Wipe ALL local data (players, actual results, country edits)?')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    draft = blankSlots();
    actualDraft = blankSlots();
    editingPlayerId = null;
    lastRevealedRank = null;
    predNameEl.value = '';
    activateTab('predictions');
    toast('All local data cleared.');
  });

  /* ---------- boot ---------- */
  activateTab('predictions');
})();
