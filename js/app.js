/* Monster Lab — Contrôleur principal
 * Enchaîne les écrans (menu → chargement → combat → résultats),
 * gère la boucle de jeu, les entrées joueur et l'IA adverse.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const glyphOf = (id) => { const d = CREATURES[id]; return (d && d.glyph) || (d && FAMILIES[d.family] && FAMILIES[d.family].glyph) || '?'; };

  const state = {
    deckId: 'equilibre',
    abilityId: 'nuageToxique',
    game: null,
    bot: null,
    renderer: null,
    running: false,
    last: 0,
    selectedCard: -1,   // index dans la main
    hand: [],
    queue: [],
    deck: [],
    targetingAbility: false,
    dragGhost: null,
    stats: { deployed: 0, mutations: 0, instab: 0 },
  };

  // ---- Écrans -------------------------------------------------------------
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('#' + id).classList.add('active');
  }

  // ---- Menu ---------------------------------------------------------------
  function buildMenu() {
    const deckWrap = $('#deck-choices');
    deckWrap.innerHTML = '';
    Object.entries(DECKS).forEach(([id, d]) => {
      const card = el('button', 'choice' + (id === state.deckId ? ' sel' : ''));
      card.innerHTML = `<div class="choice-title">${d.name}</div>
        <div class="choice-cards">${d.cards.map(c => (FAMILIES[CREATURES[c].family].glyph)).join(' ')}</div>`;
      card.onclick = () => { state.deckId = id; buildMenu(); };
      deckWrap.appendChild(card);
    });

    const abWrap = $('#ability-choices');
    abWrap.innerHTML = '';
    Object.entries(LAB_ABILITIES).forEach(([id, a]) => {
      const b = el('button', 'choice small' + (id === state.abilityId ? ' sel' : ''));
      b.innerHTML = `<div class="ab-icon">${a.icon}</div><div class="ab-name">${a.name}</div>`;
      b.title = a.desc;
      b.onclick = () => { state.abilityId = id; buildMenu(); };
      abWrap.appendChild(b);
    });
  }

  // ---- Chargement (écran VS 5s, cf. cahier des charges) -------------------
  function startLoading() {
    const deck = DECKS[state.deckId];
    const enemyDeckId = pick(Object.keys(DECKS));
    show('screen-loading');
    $('#load-player-deck').textContent = deck.name;
    $('#load-enemy-deck').textContent = DECKS[enemyDeckId].name;
    $('#load-player-fav').textContent = FAMILIES[CREATURES[deck.cards[0]].family].glyph;
    $('#load-enemy-fav').textContent = FAMILIES[CREATURES[DECKS[enemyDeckId].cards[0]].family].glyph;
    let t = 5;
    $('#load-count').textContent = t;
    const iv = setInterval(() => {
      t--;
      $('#load-count').textContent = t > 0 ? t : '';
      if (t <= 0) { clearInterval(iv); startMatch(enemyDeckId); }
    }, 900);
  }

  // ---- Combat -------------------------------------------------------------
  function startMatch(enemyDeckId) {
    const playerAbility = LAB_ABILITIES[state.abilityId];
    const enemyAbility = LAB_ABILITIES[pick(Object.keys(LAB_ABILITIES))];
    const game = new Game({ playerAbility, enemyAbility });
    state.game = game;
    state.bot = new BotPlayer(game, DECKS[enemyDeckId].cards, 0.7);

    // main du joueur
    state.deck = DECKS[state.deckId].cards.slice();
    state.queue = shuffle(state.deck.slice());
    state.hand = [];
    for (let i = 0; i < GAME_CONFIG.handSize; i++) state.hand.push(state.queue.shift());
    state.selectedCard = -1;
    state.targetingAbility = false;
    state.stats = { deployed: 0, mutations: 0, instab: 0 };

    if (!state.renderer) state.renderer = new Render3D($('#game-canvas'), $('#game-overlay'));
    else state.renderer.dispose();
    state.renderer.setArena(pick(ARENA_IDS));
    state.renderer.resize();

    renderHand();
    show('screen-match');
    state.renderer.resize();
    state.running = true;
    state.last = performance.now();
    requestAnimationFrame(loop);
  }

  function drawPlayerCard() {
    if (state.queue.length === 0) state.queue = shuffle(state.deck.slice());
    state.hand.push(state.queue.shift());
  }

  function renderHand() {
    const wrap = $('#hand');
    wrap.innerHTML = '';
    state.hand.forEach((id, i) => {
      const def = CREATURES[id];
      const fam = FAMILIES[def.family];
      const canAfford = state.game && state.game.energy.player >= def.cost;
      const c = el('div', 'card' + (i === state.selectedCard ? ' sel' : '') + (canAfford ? '' : ' poor'));
      c.style.setProperty('--fam', fam.color);
      c.innerHTML = `
        <div class="card-cost">${def.cost}</div>
        <div class="card-glyph">${glyphOf(id)}</div>
        <div class="card-name">${def.name}</div>`;
      c.dataset.index = i;
      wrap.appendChild(c);
    });
    // aperçu de la prochaine capsule
    const next = state.queue[0] || state.deck[0];
    $('#next-card').textContent = next ? glyphOf(next) : '';
  }

  function deploySelected(fieldPos) {
    if (state.selectedCard < 0) return false;
    const id = state.hand[state.selectedCard];
    const ok = state.game.deploy('player', id, fieldPos.x, fieldPos.y);
    if (ok) {
      state.hand.splice(state.selectedCard, 1);
      drawPlayerCard();
      state.selectedCard = -1;
      state.stats.deployed++;
      renderHand();
    }
    return ok;
  }

  // ---- Entrées ------------------------------------------------------------
  function setupInput() {
    const hand = $('#hand');
    const canvas = $('#game-canvas');

    hand.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const i = +card.dataset.index;
      state.selectedCard = (state.selectedCard === i) ? -1 : i;
      state.targetingAbility = false;
      renderHand();
      startDrag(e);
    });

    function startDrag(e) {
      if (state.selectedCard < 0) return;
      state.dragging = true;
      moveGhost(e.clientX, e.clientY);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    }
    function onMove(e) { moveGhost(e.clientX, e.clientY); markHint(e); }
    function onUp(e) {
      window.removeEventListener('pointermove', onMove);
      hideGhost();
      state.dragging = false;
      state.hintPos = null;
      const rect = canvas.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right) {
        const p = state.renderer.screenToField(e.clientX, e.clientY);
        deploySelected(p);
      }
    }
    function markHint(e) {
      const rect = canvas.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        state.hintPos = state.renderer.screenToField(e.clientX, e.clientY);
      } else state.hintPos = null;
    }

    // tap sur le terrain (sélection préalable) OU ciblage de capacité
    canvas.addEventListener('pointerdown', (e) => {
      const p = state.renderer.screenToField(e.clientX, e.clientY);
      if (state.targetingAbility) {
        if (state.game.useAbility('player', p.x, p.y)) {
          state.stats.instab += 0; state.targetingAbility = false;
          $('#ability-btn').classList.remove('targeting');
          updateAbilityBtn();
        }
        return;
      }
      if (state.selectedCard >= 0) deploySelected(p);
    });

    // bouton capacité
    $('#ability-btn').addEventListener('click', () => {
      const lab = state.game.lab.player;
      if (!lab.ability || lab.charge < lab.ability.charge) return;
      state.targetingAbility = !state.targetingAbility;
      state.selectedCard = -1; renderHand();
      $('#ability-btn').classList.toggle('targeting', state.targetingAbility);
    });

    window.addEventListener('resize', () => state.renderer && state.renderer.resize());
  }

  function moveGhost(x, y) {
    if (state.selectedCard < 0) return;
    let g = $('#drag-ghost');
    const id = state.hand[state.selectedCard];
    if (!id) return;
    const fam = FAMILIES[CREATURES[id].family];
    g.textContent = glyphOf(id);
    g.style.display = 'flex';
    g.style.left = x + 'px';
    g.style.top = y + 'px';
    g.style.borderColor = fam.color;
  }
  function hideGhost() { const g = $('#drag-ghost'); if (g) g.style.display = 'none'; }

  // ---- HUD ----------------------------------------------------------------
  function updateHud() {
    const g = state.game;
    // timer
    const t = Math.max(0, Math.ceil(g.time));
    const mm = Math.floor(t / 60), ss = t % 60;
    $('#timer').textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
    $('#timer').classList.toggle('urgent', g.phase === 'overtime' || (g.phase === 'play' && g.time <= 60));
    $('#phase-label').textContent = g.phase === 'overtime' ? 'PROLONGATION' : '';

    // énergie
    const e = g.energy.player;
    $('#energy-fill').style.width = (e / GAME_CONFIG.maxEnergy * 100) + '%';
    $('#energy-val').textContent = Math.floor(e);
    // pips
    const pips = $('#energy-pips');
    if (pips.childElementCount !== GAME_CONFIG.maxEnergy) {
      pips.innerHTML = '';
      for (let i = 0; i < GAME_CONFIG.maxEnergy; i++) pips.appendChild(el('span', 'pip'));
    }
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < Math.floor(e)));

    // instabilité
    $('#instab-fill').style.width = clamp(g.instability.player, 0, 100) + '%';

    // capacité
    updateAbilityBtn();

    // réacteurs détruits
    $('#score-player').textContent = g.reacteursDown.enemy;
    $('#score-enemy').textContent = g.reacteursDown.player;

    // ticker d'événements
    const ticker = $('#ticker');
    if (g.events.length) {
      const last = g.events[g.events.length - 1];
      ticker.textContent = last.msg;
      ticker.style.color = last.color || '#e8ecf8';
      ticker.style.opacity = clamp(last.t, 0, 1);
    } else ticker.style.opacity = 0;

    // rafraîchir l'état "abordable" des cartes
    [...$('#hand').children].forEach((c, i) => {
      const id = state.hand[i]; if (!id) return;
      c.classList.toggle('poor', g.energy.player < CREATURES[id].cost);
    });
  }

  function updateAbilityBtn() {
    const lab = state.game.lab.player;
    const btn = $('#ability-btn');
    if (!lab.ability) { btn.style.display = 'none'; return; }
    const ready = lab.charge >= lab.ability.charge;
    btn.querySelector('.ab-glyph').textContent = lab.ability.icon;
    btn.querySelector('.ab-fill').style.height = clamp(lab.charge, 0, 100) + '%';
    btn.classList.toggle('ready', ready);
  }

  // ---- Boucle -------------------------------------------------------------
  function loop(now) {
    if (!state.running) return;
    let dt = (now - state.last) / 1000;
    state.last = now;
    dt = Math.min(dt, 0.05);

    const g = state.game;
    state.bot.update(dt);
    g.update(dt);

    state.renderer.render(g, state.dragging || state.selectedCard >= 0 || state.targetingAbility);
    updateHud();

    if (g.phase === 'ended') { state.running = false; endMatch(); return; }
    requestAnimationFrame(loop);
  }

  // ---- Résultats ----------------------------------------------------------
  function endMatch() {
    const g = state.game;
    const win = g.winner === 'player';
    const draw = g.winner === 'draw';
    show('screen-results');
    const title = $('#result-title');
    title.textContent = draw ? 'ÉGALITÉ' : win ? 'VICTOIRE' : 'DÉFAITE';
    title.className = draw ? 'draw' : win ? 'win' : 'lose';
    $('#result-sub').textContent = draw
      ? 'Les deux Cœurs Génétiques ont tenu bon.'
      : win ? 'Cœur Génétique adverse neutralisé.' : 'Votre laboratoire est tombé.';

    // récompenses (cf. cahier des charges)
    const trophies = draw ? 5 : win ? 30 : -18;
    const xp = 40 + state.stats.deployed * 6 + g.reacteursDown.enemy * 15;
    const science = draw ? 60 : win ? 120 : 45;
    const rows = [
      ['🏆 Trophées', (trophies >= 0 ? '+' : '') + trophies],
      ['⭐ Expérience', '+' + xp],
      ['🧪 Ressources scientifiques', '+' + science],
      ['📊 Réacteurs détruits', g.reacteursDown.enemy + ' / 2'],
      ['🧬 Créatures déployées', state.stats.deployed],
    ];
    const box = $('#result-stats');
    box.innerHTML = '';
    rows.forEach(([k, v]) => {
      const r = el('div', 'stat-row');
      r.innerHTML = `<span>${k}</span><b>${v}</b>`;
      box.appendChild(r);
    });
  }

  // ---- utils --------------------------------------------------------------
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---- init ---------------------------------------------------------------
  function init() {
    buildMenu();
    setupInput();
    $('#fight-btn').addEventListener('click', startLoading);
    $('#replay-btn').addEventListener('click', startLoading);
    $('#menu-btn').addEventListener('click', () => { buildMenu(); show('screen-menu'); });
    $('#help-btn').addEventListener('click', () => $('#help-modal').classList.add('open'));
    $('#help-close').addEventListener('click', () => $('#help-modal').classList.remove('open'));
    show('screen-menu');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
