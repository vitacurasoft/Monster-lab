/* Monster Lab — Contrôleur principal
 * Enchaîne les écrans (menu → chargement → combat → résultats),
 * gère la boucle de jeu, les entrées joueur et l'IA adverse.
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const glyphOf = (id) => { const d = CREATURES[id]; return (d && d.glyph) || (d && FAMILIES[d.family] && FAMILIES[d.family].glyph) || '?'; };
  const sfx = (name) => { if (window.Sound && Meta.state.settings.sound) window.Sound.play(name); };
  let _toastT;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = el('div'); t.id = 'toast'; document.getElementById('app').appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('show'), 1600);
  }

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

  // ---- HUB / Laboratoire --------------------------------------------------
  const NAV = [
    { id: 'collection', icon: '🧬', label: 'Collection', build: buildCollection },
    { id: 'deck',       icon: '🃏', label: 'Deck',       build: buildDeck },
    { id: 'shop',       icon: '🛒', label: 'Boutique',   build: buildShop },
    { id: 'lab',        icon: '⚗️', label: 'Labo',        build: buildLab },
    { id: 'ladder',     icon: '🏆', label: 'Classement', build: buildLadder },
    { id: 'premium',    icon: '👑', label: 'Premium',    build: buildPremium },
  ];

  function buildHub() {
    const s = Meta.state;
    const lvl = Meta.level(), lg = Meta.league();
    $('#hub-avatar').textContent = s.avatar;
    $('#hub-name').textContent = s.name;
    $('#hub-lvl').textContent = 'Niv. ' + lvl.lvl;
    $('#hub-xp').style.width = (lvl.into / lvl.need * 100) + '%';
    $('#hub-league-icon').textContent = lg.cur.icon;
    $('#hub-league').textContent = lg.cur.name;
    $('#hub-trophies').textContent = s.trophies;
    $('#hub-science').textContent = s.science;
    $('#hub-coins').textContent = s.coins;

    const nav = $('#hub-nav');
    nav.innerHTML = '';
    NAV.forEach(n => {
      const b = el('button', 'nav-btn');
      b.innerHTML = `<span class="nav-ico">${n.icon}</span><span class="nav-lbl">${n.label}</span>`;
      b.onclick = () => { show('screen-' + n.id); n.build(); };
      nav.appendChild(b);
    });
  }

  // ---- Collection ---------------------------------------------------------
  function buildCollection() {
    $('#col-science').textContent = Meta.state.science;
    const body = $('#collection-body');
    body.innerHTML = '';
    const grid = el('div', 'card-grid');
    Object.keys(CREATURES).forEach(id => {
      const def = CREATURES[id];
      const unlocked = Meta.isUnlocked(id);
      const fam = FAMILIES[def.family];
      const c = el('div', 'coll-card' + (unlocked ? '' : ' locked'));
      c.style.setProperty('--fam', fam.color);
      const cost = Meta.unlockCost(id);
      c.innerHTML = `
        <div class="coll-glyph">${glyphOf(id)}</div>
        <div class="coll-name">${def.name}</div>
        <div class="coll-fam">${fam.glyph} ${fam.name}</div>
        <div class="coll-stats">⚡${def.cost} ❤️${def.hp} ${def.dmg ? '⚔️' + def.dmg : '✚soutien'}</div>
        ${unlocked ? '<div class="coll-owned">Débloqué</div>'
                   : `<button class="coll-unlock" ${Meta.state.science < cost ? 'disabled' : ''}>🧪 ${cost}</button>`}`;
      if (!unlocked) {
        const btn = c.querySelector('.coll-unlock');
        btn.onclick = () => {
          if (Meta.unlock(id)) { sfx('unlock'); buildCollection(); buildHub(); }
        };
      }
      grid.appendChild(c);
    });
    body.appendChild(grid);
  }

  // ---- Éditeur de deck ----------------------------------------------------
  let deckDraft = null;
  function buildDeck() {
    deckDraft = Meta.state.deck.slice();
    renderDeckScreen();
  }
  function renderDeckScreen() {
    const body = $('#deck-body');
    body.innerHTML = '';

    // deck actuel
    body.appendChild(el('div', 'section-label', 'Votre deck (8 capsules)'));
    const deckRow = el('div', 'deck-row');
    deckDraft.forEach((id, i) => {
      const d = el('div', 'mini-card');
      d.style.setProperty('--fam', FAMILIES[CREATURES[id].family].color);
      d.innerHTML = `<div class="mini-cost">${CREATURES[id].cost}</div><div class="mini-glyph">${glyphOf(id)}</div>`;
      d.title = 'Retirer ' + CREATURES[id].name;
      d.onclick = () => { deckDraft.splice(i, 1); renderDeckScreen(); };
      deckRow.appendChild(d);
    });
    for (let i = deckDraft.length; i < 8; i++) deckRow.appendChild(el('div', 'mini-card empty', '+'));
    body.appendChild(deckRow);

    // capacité de labo
    body.appendChild(el('div', 'section-label', 'Capacité de laboratoire'));
    const abRow = el('div', 'ab-row');
    Object.entries(LAB_ABILITIES).forEach(([id, a]) => {
      const b = el('button', 'ab-choice' + (id === Meta.state.ability ? ' sel' : ''));
      b.innerHTML = `<div class="ab-ico">${a.icon}</div><div class="ab-nm">${a.name}</div>`;
      b.title = a.desc;
      b.onclick = () => { Meta.setAbility(id); renderDeckScreen(); };
      abRow.appendChild(b);
    });
    body.appendChild(abRow);

    // save
    const saveBtn = el('button', 'big-btn small', deckDraft.length === 8 ? 'Enregistrer le deck' : `Choisissez ${8 - deckDraft.length} capsule(s)`);
    if (deckDraft.length !== 8) saveBtn.disabled = true;
    saveBtn.onclick = () => { if (Meta.setDeck(deckDraft)) { sfx('unlock'); toast('Deck enregistré'); } };
    body.appendChild(saveBtn);

    // capsules disponibles (débloquées, pas déjà dans le deck)
    body.appendChild(el('div', 'section-label', 'Capsules débloquées'));
    const grid = el('div', 'card-grid');
    Meta.state.unlocked.filter(id => !deckDraft.includes(id)).forEach(id => {
      const def = CREATURES[id];
      const c = el('div', 'coll-card mini');
      c.style.setProperty('--fam', FAMILIES[def.family].color);
      c.innerHTML = `<div class="coll-glyph">${glyphOf(id)}</div><div class="coll-name">${def.name}</div>
        <div class="coll-stats">⚡${def.cost}</div>`;
      c.onclick = () => { if (deckDraft.length < 8) { deckDraft.push(id); renderDeckScreen(); } };
      grid.appendChild(c);
    });
    body.appendChild(grid);
  }

  // ---- Boutique -----------------------------------------------------------
  function buildShop() {
    $('#shop-coins').textContent = Meta.state.coins;
    const body = $('#shop-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'shop-note', 'Uniquement cosmétique — aucun avantage en combat.'));
    const cats = [['Arènes', SHOP.arenes], ['Avatars', SHOP.avatars], ['Émotes', SHOP.emotes]];
    cats.forEach(([label, items]) => {
      body.appendChild(el('div', 'section-label', label));
      const grid = el('div', 'shop-grid');
      items.forEach(it => {
        const owned = Meta.owns(it.id);
        const c = el('div', 'shop-card' + (owned ? ' owned' : ''));
        c.innerHTML = `<div class="shop-ico">${it.icon}</div><div class="shop-name">${it.name}</div>
          ${owned ? '<div class="shop-owned">Possédé</div>'
                  : `<button class="shop-buy" ${Meta.state.coins < it.cost ? 'disabled' : ''}>💠 ${it.cost}</button>`}`;
        if (!owned) c.querySelector('.shop-buy').onclick = () => {
          if (Meta.buy(it)) { sfx('unlock'); if (it.id.startsWith('av_')) Meta.state.avatar = it.icon, Meta.save();
            buildShop(); buildHub(); }
        };
        else if (it.icon && it.id.startsWith('av_')) { c.style.cursor = 'pointer'; c.onclick = () => { Meta.state.avatar = it.icon; Meta.save(); buildHub(); toast('Avatar équipé'); }; }
        grid.appendChild(c);
      });
      body.appendChild(grid);
    });
  }

  // ---- Laboratoire (salles) ----------------------------------------------
  function buildLab() {
    $('#lab-coins').textContent = Meta.state.coins;
    const body = $('#lab-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'shop-note', 'Améliorez votre laboratoire pour de meilleurs gains.'));
    LAB_ROOMS.forEach(room => {
      const lvl = Meta.state.rooms[room.id] || 1;
      const cost = Meta.roomCost(room);
      const c = el('div', 'room-card');
      c.innerHTML = `<div class="room-ico">${room.icon}</div>
        <div class="room-info"><div class="room-name">${room.name} <span class="room-lvl">Niv. ${lvl}</span></div>
          <div class="room-desc">${room.desc}</div></div>
        <button class="room-up" ${Meta.state.coins < cost ? 'disabled' : ''}>💠 ${cost}</button>`;
      c.querySelector('.room-up').onclick = () => { if (Meta.upgradeRoom(room)) { sfx('unlock'); buildLab(); buildHub(); } };
      body.appendChild(c);
    });
  }

  // ---- Classement ---------------------------------------------------------
  function buildLadder() {
    const body = $('#ladder-body');
    body.innerHTML = '';
    const lg = Meta.league();
    // paliers de ligue
    const lgWrap = el('div', 'league-track');
    LEAGUES.forEach(L => {
      const active = Meta.state.trophies >= L.min;
      const d = el('div', 'league-pip' + (active ? ' on' : '') + (L.name === lg.cur.name ? ' cur' : ''));
      d.innerHTML = `<span>${L.icon}</span><small>${L.name}</small><small class="lg-min">${L.min}🏆</small>`;
      lgWrap.appendChild(d);
    });
    body.appendChild(lgWrap);

    body.appendChild(el('div', 'section-label', 'Classement mondial'));
    const list = el('div', 'ladder-list');
    Meta.leaderboard().slice(0, 14).forEach((row, i) => {
      const r = el('div', 'ladder-row' + (row.you ? ' you' : ''));
      r.innerHTML = `<span class="lad-rank">${i + 1}</span><span class="lad-name">${row.name}</span><span class="lad-tr">🏆 ${row.trophies}</span>`;
      list.appendChild(r);
    });
    body.appendChild(list);

    // stats perso
    const st = Meta.state.stats;
    body.appendChild(el('div', 'section-label', 'Vos statistiques'));
    const stats = el('div', 'stats-box');
    const wr = st.games ? Math.round(st.wins / st.games * 100) : 0;
    [['Parties', st.games], ['Victoires', st.wins], ['Ratio', wr + '%'], ['Record 🏆', st.bestTrophies]]
      .forEach(([k, v]) => { const r = el('div', 'stat-row'); r.innerHTML = `<span>${k}</span><b>${v}</b>`; stats.appendChild(r); });
    body.appendChild(stats);
  }

  // ---- Premium / Pass de saison ------------------------------------------
  function buildPremium() {
    const body = $('#premium-body');
    body.innerHTML = '';
    const s = Meta.state;
    const card = el('div', 'premium-card');
    card.innerHTML = `<div class="prem-head">👑 Premium — 5,99 €/mois</div>
      <ul class="prem-list">
        <li>Pass de saison inclus</li><li>+50% XP · +40% cristaux</li>
        <li>Récompenses quotidiennes</li><li>Personnalisation exclusive</li>
        <li>Statistiques avancées</li></ul>
      <button class="big-btn small" id="prem-toggle">${s.premium ? '✓ Premium actif (simulé)' : 'Activer Premium (simulé)'}</button>`;
    body.appendChild(card);
    card.querySelector('#prem-toggle').onclick = () => { s.premium = !s.premium; Meta.save(); sfx('unlock'); buildPremium(); buildHub(); };

    body.appendChild(el('div', 'section-label', 'Pass de saison — XP : ' + s.season.xp));
    const track = el('div', 'season-track');
    Meta.seasonTiers().forEach(t => {
      const reached = s.season.xp >= t.need;
      const claimed = s.season.claimed.includes(t.tier);
      const d = el('div', 'season-tier' + (reached ? ' reached' : '') + (claimed ? ' claimed' : ''));
      d.innerHTML = `<div class="st-tier">${t.tier}</div><div class="st-reward">${t.reward.icon} ${t.reward.amount}</div>
        <div class="st-need">${t.need}</div>`;
      if (reached && !claimed) {
        const b = el('button', 'st-claim', 'Récupérer');
        b.onclick = () => { if (Meta.claimTier(t.tier)) { sfx('reward'); buildPremium(); buildHub(); } };
        d.appendChild(b);
      }
      track.appendChild(d);
    });
    body.appendChild(track);
  }

  // ---- Réglages -----------------------------------------------------------
  function openSettings() {
    const m = $('#settings-modal');
    $('#set-sound').checked = Meta.state.settings.sound;
    $('#set-name').value = Meta.state.name;
    m.classList.add('open');
  }

  // ---- Chargement (écran VS 5s, cf. cahier des charges) -------------------
  function startLoading() {
    const deck = Meta.state.deck;
    const enemyDeckId = pick(Object.keys(DECKS));
    const lg = Meta.league();
    show('screen-loading');
    $('#load-player-deck').textContent = Meta.state.name;
    $('#load-enemy-deck').textContent = DECKS[enemyDeckId].name;
    $('#load-player-fav').textContent = Meta.state.avatar;
    $('#load-enemy-fav').textContent = FAMILIES[CREATURES[DECKS[enemyDeckId].cards[0]].family].glyph;
    document.querySelectorAll('.vs-league').forEach((n, i) => { n.textContent = lg.cur.icon + ' ' + lg.cur.name; });
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
    const playerAbility = LAB_ABILITIES[Meta.state.ability] || LAB_ABILITIES.nuageToxique;
    const enemyAbility = LAB_ABILITIES[pick(Object.keys(LAB_ABILITIES))];
    const game = new Game({ playerAbility, enemyAbility });
    state.game = game;
    state.bot = new BotPlayer(game, DECKS[enemyDeckId].cards, 0.7);

    // main du joueur (deck méta)
    state.deck = Meta.state.deck.slice();
    state.queue = shuffle(state.deck.slice());
    state.hand = [];
    for (let i = 0; i < GAME_CONFIG.handSize; i++) state.hand.push(state.queue.shift());
    state.selectedCard = -1;
    state.targetingAbility = false;
    state.stats = { deployed: 0, mutations: 0, instab: 0 };

    if (!state.renderer) state.renderer = new Render3D($('#game-canvas'), $('#game-overlay'));
    else state.renderer.dispose();
    // arènes : labo + celles achetées en boutique
    const owned = ['labo'].concat(SHOP.arenes.filter(a => Meta.owns(a.id)).map(a => a.arena));
    state.renderer.setArena(pick(owned));
    state.renderer.resize();

    renderHand();
    show('screen-match');
    state.renderer.resize();
    if (window.Sound) { window.Sound.resume(); window.Sound.setMusic(Meta.state.settings.sound); }
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
      sfx('deploy');
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

    // sons émis par la simulation
    if (g.sounds.length) { for (const s of g.sounds) sfx(s); g.sounds.length = 0; }

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
    if (window.Sound) window.Sound.setMusic(false);
    sfx(win ? 'win' : draw ? 'reward' : 'lose');
    show('screen-results');
    const title = $('#result-title');
    title.textContent = draw ? 'ÉGALITÉ' : win ? 'VICTOIRE' : 'DÉFAITE';
    title.className = draw ? 'draw' : win ? 'win' : 'lose';
    $('#result-sub').textContent = draw
      ? 'Les deux Cœurs Génétiques ont tenu bon.'
      : win ? 'Cœur Génétique adverse neutralisé.' : 'Votre laboratoire est tombé.';

    // récompenses appliquées à la progression persistante
    const rw = Meta.applyResult({ win, draw, reacteurs: g.reacteursDown.enemy, deployed: state.stats.deployed });
    const lg = Meta.league();
    const rows = [
      ['🏆 Trophées', (rw.trophies >= 0 ? '+' : '') + rw.trophies + '  (' + lg.cur.icon + ' ' + lg.cur.name + ')'],
      ['⭐ Expérience', '+' + rw.xp],
      ['🧪 Ressources scientifiques', '+' + rw.science],
      ['💠 Cristaux', '+' + rw.coins],
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

  // ---- Émotes (en combat) -------------------------------------------------
  let _emoteT;
  function setupEmotes() {
    const btn = $('#emote-btn'), pop = $('#emote-pop');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // émotes de base + celles achetées
      const owned = SHOP.emotes.filter(em => Meta.owns(em.id)).map(em => em.icon);
      const list = ['🧪', '👍', '😈'].concat(owned);
      pop.innerHTML = '';
      list.forEach(ic => {
        const b = el('button', 'emote-item', ic);
        b.onclick = (ev) => { ev.stopPropagation(); showEmote(ic); pop.classList.remove('open'); };
        pop.appendChild(b);
      });
      pop.classList.toggle('open');
    });
    document.addEventListener('click', () => pop.classList.remove('open'));
  }
  function showEmote(icon) {
    const b = $('#emote-bubble');
    b.textContent = icon; b.classList.add('show');
    sfx('emote');
    clearTimeout(_emoteT); _emoteT = setTimeout(() => b.classList.remove('show'), 1400);
  }

  // ---- utils --------------------------------------------------------------
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---- init ---------------------------------------------------------------
  function init() {
    Meta.load();
    buildHub();
    setupInput();
    $('#fight-btn').addEventListener('click', () => { if (window.Sound) window.Sound.resume(); sfx('deploy'); startLoading(); });
    $('#replay-btn').addEventListener('click', startLoading);
    $('#menu-btn').addEventListener('click', () => { buildHub(); show('screen-hub'); });
    $('#help-btn').addEventListener('click', () => $('#help-modal').classList.add('open'));
    $('#help-close').addEventListener('click', () => $('#help-modal').classList.remove('open'));
    $('#settings-btn').addEventListener('click', openSettings);

    // boutons retour des sous-écrans
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { buildHub(); show('screen-hub'); }));

    // réglages
    const sm = $('#settings-modal');
    $('#set-sound').addEventListener('change', (e) => {
      Meta.state.settings.sound = e.target.checked; Meta.save();
      if (window.Sound) { if (e.target.checked) window.Sound.resume(); else window.Sound.setMusic(false); }
    });
    $('#set-name').addEventListener('input', (e) => { Meta.state.name = e.target.value.slice(0, 16) || 'Scientifique'; Meta.save(); buildHub(); });
    $('#set-reset').addEventListener('click', () => { if (confirm('Réinitialiser toute la progression ?')) { Meta.reset(); buildHub(); sm.classList.remove('open'); } });
    $('#set-close').addEventListener('click', () => sm.classList.remove('open'));

    setupEmotes();
    show('screen-hub');

    // tutoriel au premier lancement
    if (!Meta.state.settings.tutoDone) {
      $('#help-modal').classList.add('open');
      Meta.state.settings.tutoDone = true; Meta.save();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
