/* Monster Lab — IA adverse
 * Bot "avancé" : gère son énergie, réagit aux menaces, varie ses déploiements,
 * déclenche sa capacité de labo sur les regroupements ennemis.
 * (Le joueur ignore s'il affronte un humain ou une IA — cf. cahier des charges.)
 */
class BotPlayer {
  constructor(game, deck, difficulty) {
    this.game = game;
    this.team = 'enemy';
    this.deck = deck.slice();
    this.hand = [];
    this.queue = shuffle(deck.slice());
    for (let i = 0; i < GAME_CONFIG.handSize; i++) this.draw();
    this.thinkT = 0;
    this.difficulty = difficulty || 0.7; // 0..1
  }

  draw() {
    if (this.queue.length === 0) this.queue = shuffle(this.deck.slice());
    this.hand.push(this.queue.shift());
  }

  playCard(index, x, y) {
    const card = this.hand[index];
    if (this.game.deploy('enemy', card, x, y)) {
      this.hand.splice(index, 1);
      this.draw();
      return true;
    }
    return false;
  }

  update(dt) {
    if (this.game.phase === 'ended') return;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = 0.6 + Math.random() * 0.7 * (1 - this.difficulty);

    const g = this.game;
    const energy = g.energy.enemy;

    // Menaces : créatures joueur dans la moitié adverse (haut).
    const threats = g.units.filter(u => u.team === 'player' && u.alive && u.y < FIELD.mid + 40);

    // Capacité de labo sur un cluster de joueurs.
    const abil = g.lab.enemy;
    if (abil.ability && abil.charge >= abil.ability.charge && threats.length >= 2) {
      const c = centroid(threats);
      g.useAbility('enemy', c.x, c.y);
    }

    // Choix de carte jouable la moins chère qui rentre dans le budget.
    const playable = this.hand
      .map((id, i) => ({ id, i, def: CREATURES[id] }))
      .filter(c => c.def.cost <= energy);
    if (playable.length === 0) return;

    // Stratégie : si menace, poser un défenseur ; sinon pousser sur une aile.
    let choice;
    if (threats.length) {
      // préférer prédateurs / tanks pour défendre
      choice = playable.find(c => ['predateur', 'assassin', 'tank'].includes(c.def.role)) || playable[0];
    } else if (energy >= 7 || Math.random() < this.difficulty * 0.5) {
      // pousser : privilégier un tank ou une unité offensive
      choice = playable.find(c => c.def.role === 'tank') || playable[Math.floor(Math.random() * playable.length)];
    } else {
      return; // économiser
    }

    // Position de déploiement (moitié haute = camp ennemi).
    let x, y;
    if (threats.length) {
      const t = threats[0];
      x = clamp(t.x + (Math.random() * 40 - 20), 30, FIELD.w - 30);
      y = clamp(Math.max(t.y - 30, 120), 60, FIELD.mid - 20);
    } else {
      // pousser sur l'aile la plus faible du joueur
      const pg = this.game.buildings.find(b => b.team === 'player' && b.slot === 'reacteurG');
      const targetLeft = pg && (!pg.alive || Math.random() < 0.5);
      x = targetLeft ? 78 + (Math.random() * 30 - 15) : 282 + (Math.random() * 30 - 15);
      y = clamp(FIELD.mid - 30 - Math.random() * 60, 80, FIELD.mid - 20);
    }
    this.playCard(choice.i, x, y);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function centroid(arr) {
  let x = 0, y = 0;
  for (const e of arr) { x += e.x; y += e.y; }
  return { x: x / arr.length, y: y / arr.length };
}
