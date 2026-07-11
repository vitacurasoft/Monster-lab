/* Monster Lab — Méta-jeu : progression, collection, ligues, économie
 * Persistance locale (localStorage). Aucun avantage payant : la boutique
 * ne vend que du cosmétique (cf. cahier des charges §11, §15).
 */

const LEAGUES = [
  { name: 'Bronze',  min: 0,    icon: '🥉' },
  { name: 'Argent',  min: 200,  icon: '🥈' },
  { name: 'Or',      min: 500,  icon: '🥇' },
  { name: 'Diamant', min: 900,  icon: '💎' },
  { name: 'Maître',  min: 1400, icon: '🔷' },
  { name: 'Élite',   min: 2000, icon: '⭐' },
  { name: 'Légende', min: 2800, icon: '👑' },
];

// Créatures débloquées au départ (le reste s'achète avec de l'ADN).
const STARTER_CREATURES = [
  'larve', 'scorpion', 'drone', 'bufloTank', 'ovniSoutien', 'xeno',
  'raieVolante', 'sangsue', 'loupMeute', 'varan', 'fleurSoin', 'tourelle',
];

// Cosmétiques achetables (cristaux). Purement visuels.
const SHOP = {
  arenes: [
    { id: 'arene_station', name: 'Station spatiale', arena: 'station', cost: 300, icon: '🛰️' },
    { id: 'arene_jungle',  name: 'Jungle radioactive', arena: 'jungle', cost: 300, icon: '🌴' },
    { id: 'arene_volcan',  name: 'Volcan', arena: 'volcan', cost: 400, icon: '🌋' },
    { id: 'arene_marine',  name: 'Base sous-marine', arena: 'marine', cost: 400, icon: '🌊' },
    { id: 'arene_desert',  name: 'Désert mutant', arena: 'desert', cost: 500, icon: '🏜️' },
    { id: 'arene_glacier', name: 'Glacier', arena: 'glacier', cost: 500, icon: '🧊' },
  ],
  avatars: [
    { id: 'av_dna', name: 'ADN', icon: '🧬', cost: 100 },
    { id: 'av_robot', name: 'Robot', icon: '🤖', cost: 150 },
    { id: 'av_alien', name: 'Alien', icon: '👾', cost: 150 },
    { id: 'av_kraken', name: 'Kraken', icon: '🐙', cost: 250 },
    { id: 'av_crown', name: 'Couronne', icon: '👑', cost: 600 },
  ],
  emotes: [
    { id: 'em_lab', name: 'Éprouvette', icon: '🧪', cost: 80 },
    { id: 'em_boom', name: 'Explosion', icon: '💥', cost: 80 },
    { id: 'em_laugh', name: 'Rire', icon: '😂', cost: 120 },
    { id: 'em_skull', name: 'Crâne', icon: '☠️', cost: 120 },
  ],
};

// Salles du laboratoire (personnalisation §9) — bonus méta légers.
const LAB_ROOMS = [
  { id: 'adn',     name: 'Salle ADN',        icon: '🧬', desc: '+ADN gagné en combat',        base: 200 },
  { id: 'incub',   name: 'Incubateurs',      icon: '🥚', desc: '+XP par partie',              base: 200 },
  { id: 'reacteur',name: 'Réacteur principal',icon: '⚛️', desc: '+cristaux par victoire',      base: 250 },
  { id: 'stockage',name: 'Stockage',         icon: '📦', desc: 'Réserve d\'ADN augmentée',    base: 150 },
  { id: 'recherche',name: 'Labo de recherche',icon: '🔬', desc: 'Réduit le coût de déblocage', base: 300 },
];

const Meta = {
  KEY: 'monsterlab_save_v1',
  state: null,

  defaults() {
    return {
      name: 'Scientifique',
      xp: 0,
      trophies: 0,
      coins: 300,          // cristaux (cosmétique)
      science: 400,        // ADN (déblocage créatures)
      unlocked: STARTER_CREATURES.slice(),
      deck: DECKS.equilibre.cards.slice(),
      ability: 'nuageToxique',
      avatar: '🧬',
      cosmetics: [],       // ids possédés
      rooms: { adn: 1, incub: 1, reacteur: 1, stockage: 1, recherche: 1 },
      season: { xp: 0, claimed: [] },
      premium: false,
      settings: { sound: true },
      stats: { games: 0, wins: 0, bestTrophies: 0 },
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.state = raw ? Object.assign(this.defaults(), JSON.parse(raw)) : this.defaults();
    } catch (e) { this.state = this.defaults(); }
    // garde-fous
    if (!this.state.unlocked || !this.state.unlocked.length) this.state.unlocked = STARTER_CREATURES.slice();
    if (!this.state.deck || this.state.deck.length !== 8) this.state.deck = DECKS.equilibre.cards.slice();
    return this.state;
  },

  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) {} },

  reset() { this.state = this.defaults(); this.save(); },

  // --- Niveau / ligue ---
  level() {
    let xp = this.state.xp, lvl = 1, need = 100;
    while (xp >= need) { xp -= need; lvl++; need = Math.round(need * 1.22); }
    return { lvl, into: xp, need };
  },
  league() {
    let cur = LEAGUES[0], next = null;
    for (let i = 0; i < LEAGUES.length; i++) {
      if (this.state.trophies >= LEAGUES[i].min) { cur = LEAGUES[i]; next = LEAGUES[i + 1] || null; }
    }
    return { cur, next };
  },

  // --- Créatures ---
  isUnlocked(id) { return this.state.unlocked.includes(id); },
  unlockCost(id) {
    const c = CREATURES[id];
    const base = 80 + (c.cost || 3) * 40;
    const disc = 1 - (this.state.rooms.recherche - 1) * 0.08; // salle recherche
    return Math.max(30, Math.round(base * disc));
  },
  unlock(id) {
    if (this.isUnlocked(id)) return false;
    const cost = this.unlockCost(id);
    if (this.state.science < cost) return false;
    this.state.science -= cost;
    this.state.unlocked.push(id);
    this.save();
    return true;
  },

  setDeck(cards) {
    if (cards.length !== 8) return false;
    this.state.deck = cards.slice();
    this.save();
    return true;
  },
  setAbility(id) { this.state.ability = id; this.save(); },

  // --- Boutique cosmétique ---
  owns(id) { return this.state.cosmetics.includes(id); },
  buy(item) {
    if (this.owns(item.id)) return false;
    if (this.state.coins < item.cost) return false;
    this.state.coins -= item.cost;
    this.state.cosmetics.push(item.id);
    this.save();
    return true;
  },

  // --- Salles de labo ---
  roomCost(room) { return Math.round(room.base * Math.pow(1.6, (this.state.rooms[room.id] || 1) - 1)); },
  upgradeRoom(room) {
    const cost = this.roomCost(room);
    if (this.state.coins < cost) return false;
    this.state.coins -= cost;
    this.state.rooms[room.id] = (this.state.rooms[room.id] || 1) + 1;
    this.save();
    return true;
  },

  // --- Récompenses de fin de partie ---
  applyResult(res) {
    // res: { win, draw, reacteurs, deployed }
    const s = this.state;
    const roomAdn = this.state.rooms.adn, roomXp = this.state.rooms.incub, roomCoin = this.state.rooms.reacteur;
    const trophies = res.draw ? 5 : res.win ? 30 : -18;
    const xp = Math.round((40 + res.deployed * 6 + res.reacteurs * 15) * (1 + (roomXp - 1) * 0.1) * (s.premium ? 1.5 : 1));
    const science = Math.round((res.draw ? 60 : res.win ? 120 : 45) * (1 + (roomAdn - 1) * 0.1));
    const coins = Math.round((res.draw ? 10 : res.win ? 40 : 8) * (1 + (roomCoin - 1) * 0.12) * (s.premium ? 1.4 : 1));

    s.trophies = Math.max(0, s.trophies + trophies);
    s.xp += xp;
    s.science += science;
    s.coins += coins;
    s.season.xp += Math.round(xp * 0.6);
    s.stats.games++;
    if (res.win) s.stats.wins++;
    s.stats.bestTrophies = Math.max(s.stats.bestTrophies, s.trophies);
    this.save();
    return { trophies, xp, science, coins };
  },

  // --- Pass de saison ---
  seasonTiers() {
    // 10 paliers, chaque palier = 300 XP de saison
    return Array.from({ length: 10 }, (_, i) => ({
      tier: i + 1, need: (i + 1) * 300,
      reward: i % 2 === 0 ? { type: 'coins', amount: 60 + i * 10, icon: '💠' }
                          : { type: 'science', amount: 80 + i * 15, icon: '🧪' },
    }));
  },
  claimTier(tier) {
    const t = this.seasonTiers().find(x => x.tier === tier);
    if (!t || this.state.season.xp < t.need || this.state.season.claimed.includes(tier)) return false;
    if (t.reward.type === 'coins') this.state.coins += t.reward.amount;
    else this.state.science += t.reward.amount;
    this.state.season.claimed.push(tier);
    this.save();
    return true;
  },

  // Classement mondial simulé (le joueur + des bots crédibles).
  leaderboard() {
    const names = ['DrMutagen', 'BioReaper', 'HelixX', 'GenomeKing', 'NanoWitch', 'ToxicQueen',
      'Chimera_77', 'DNA_Hunter', 'LabRat', 'Splice', 'Venomus', 'Prof_Zero'];
    const rng = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };
    const board = names.map((n, i) => ({ name: n, trophies: 3600 - i * 240 - Math.floor(rng(i + 1) * 120), you: false }));
    board.push({ name: this.state.name + ' (vous)', trophies: this.state.trophies, you: true });
    board.sort((a, b) => b.trophies - a.trophies);
    return board;
  },
};
