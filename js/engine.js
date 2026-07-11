/* Monster Lab — Moteur de combat (simulation temps réel)
 * Sans dépendance. Le rendu et les entrées sont gérés séparément (ui.js).
 */

const FIELD = { w: 360, h: 640, mid: 320 };

// Positions des bâtiments (côté "enemy" en haut, "player" en bas).
const BUILDING_LAYOUT = {
  enemy: {
    coeur:    { x: 180, y: 62 },
    reacteurG:{ x: 78,  y: 168 },
    reacteurD:{ x: 282, y: 168 },
  },
  player: {
    coeur:    { x: 180, y: 578 },
    reacteurG:{ x: 78,  y: 472 },
    reacteurD:{ x: 282, y: 472 },
  },
};

const BUILDING_STATS = {
  coeur:    { hp: 2600, dmg: 90, range: 120, atkSpd: 0.8, radius: 30 },
  reacteur: { hp: 1400, dmg: 60, range: 115, atkSpd: 1.1, radius: 22 },
};

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Multiplicateur de dégâts selon la table de contres des familles.
function familyMultiplier(attFamily, defFamily) {
  if (!attFamily || !defFamily) return 1;
  return COUNTERS[attFamily] === defFamily ? 1.3 : 1;
}

let _uid = 1;

class Building {
  constructor(team, kind, slot, pos) {
    this.type = 'building';
    this.id = _uid++;
    this.team = team;
    this.kind = kind;            // 'coeur' | 'reacteur'
    this.slot = slot;            // 'coeur' | 'reacteurG' | 'reacteurD'
    this.x = pos.x; this.y = pos.y;
    const s = BUILDING_STATS[kind];
    this.maxHp = s.hp; this.hp = s.hp;
    this.dmg = s.dmg; this.range = s.range;
    this.atkSpd = s.atkSpd; this.radius = s.radius;
    this.cd = 0;
    this.alive = true;
    this.active = kind === 'reacteur'; // le cœur démarre passif
    this.hitFlash = 0;
  }
}

class Unit {
  constructor(team, def, pos) {
    this.type = 'unit';
    this.id = _uid++;
    this.team = team;
    this.def = def;
    this.family = def.family;
    this.role = def.role;
    this.x = pos.x; this.y = pos.y;
    this.maxHp = def.hp; this.hp = def.hp;
    this.dmg = def.dmg; this.range = def.range;
    this.speed = def.speed; this.atkSpd = def.atkSpd;
    this.radius = def.radius;
    this.cd = 0;
    this.alive = true;
    this.dna = 0;
    this.age = 0;
    this.target = null;
    // états temporaires
    this.buffT = 0;      // instabilité génétique
    this.slowT = 0;
    this.stunT = 0;
    this.erratic = false;
    this.retargetT = 0;
    this.mutateFlash = 0;
    this.hitFlash = 0;
    this.spawnAnim = 0.35;
  }

  get dmgMult()      { return this.buffT > 0 ? 1.4 : 1; }
  get speedMult()    { return (this.buffT > 0 ? 1.3 : 1) * (this.slowT > 0 ? 0.35 : 1); }
  get dmgTakenMult() { return this.buffT > 0 ? 0.7 : 1; }
}

class Game {
  constructor(opts) {
    this.opts = opts || {};
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = [];       // effets visuels (mutations, capacités)
    this.floaters = [];      // textes flottants (dégâts, ADN)
    this.time = GAME_CONFIG.matchDuration;
    this.phase = 'play';     // 'play' | 'overtime' | 'ended'
    this.winner = null;
    this.energy = { player: 5, enemy: 5 };
    this.instability = { player: 0, enemy: 0 };
    this.lab = {
      player: { ability: opts.playerAbility, charge: 0 },
      enemy:  { ability: opts.enemyAbility,  charge: 0 },
    };
    this.reacteursDown = { player: 0, enemy: 0 };
    this.events = [];        // messages pour l'UI

    for (const team of ['enemy', 'player']) {
      const L = BUILDING_LAYOUT[team];
      this.buildings.push(new Building(team, 'coeur', 'coeur', L.coeur));
      this.buildings.push(new Building(team, 'reacteur', 'reacteurG', L.reacteurG));
      this.buildings.push(new Building(team, 'reacteur', 'reacteurD', L.reacteurD));
    }
  }

  emit(msg, color) { this.events.push({ msg, color, t: 2.2 }); }

  enemyOf(team) { return team === 'player' ? 'enemy' : 'player'; }

  // -- Déploiement -----------------------------------------------------------
  canDeploy(team, x, y) {
    if (team !== 'player') return true;
    // moitié basse par défaut
    if (y >= FIELD.mid + 6 && y <= FIELD.h - 24 && x >= 12 && x <= FIELD.w - 12) return true;
    // zones débloquées si un réacteur ennemi est tombé
    const enemyBuildings = this.buildings.filter(b => b.team === 'enemy');
    const gDown = enemyBuildings.find(b => b.slot === 'reacteurG' && !b.alive);
    const dDown = enemyBuildings.find(b => b.slot === 'reacteurD' && !b.alive);
    if (gDown && x < FIELD.w / 2 && y >= 150) return true;
    if (dDown && x >= FIELD.w / 2 && y >= 150) return true;
    return false;
  }

  deploy(team, cardId, x, y) {
    const def = CREATURES[cardId];
    if (!def) return false;
    const cost = def.cost;
    if (this.energy[team] < cost) return false;
    if (!this.canDeploy(team, x, y)) return false;

    this.energy[team] -= cost;

    // Instabilité génétique : plus on empile la même famille, plus la jauge monte.
    const sameFamilyAlive = this.units.filter(u => u.team === team && u.alive && u.family === def.family).length;
    if (sameFamilyAlive >= 1) {
      this.instability[team] += GAME_CONFIG.instabilityPerSameFamily * Math.min(sameFamilyAlive, 3);
    } else {
      this.instability[team] += 8;
    }

    const count = def.count || 1;
    for (let i = 0; i < count; i++) {
      const ox = (count > 1) ? (i - (count - 1) / 2) * 26 : 0;
      const u = new Unit(team, def, { x: clamp(x + ox, 14, FIELD.w - 14), y: clamp(y, 30, FIELD.h - 30) });
      this.units.push(u);
    }
    this.lab[team].charge = clamp(this.lab[team].charge + 6, 0, 100);

    if (this.instability[team] >= GAME_CONFIG.instabilityThreshold) {
      this.triggerInstability(team, def.family);
      this.instability[team] = 0;
    }
    return true;
  }

  triggerInstability(team, family) {
    const affected = this.units.filter(u => u.team === team && u.alive && u.family === family);
    for (const u of affected) {
      u.buffT = GAME_CONFIG.instabilityBuffDuration;
      u.erratic = true;
      u.mutateFlash = 0.6;
    }
    this.effects.push({ kind: 'instability', team, family, t: 1.0 });
    const fam = FAMILIES[family] ? FAMILIES[family].name : family;
    this.emit(`⚠️ Mutation Instable — ${fam} !`, FAMILIES[family] && FAMILIES[family].color);
  }

  // -- Capacité de laboratoire ----------------------------------------------
  useAbility(team, x, y) {
    const slot = this.lab[team];
    if (!slot.ability || slot.charge < slot.ability.charge) return false;
    const ab = slot.ability;
    slot.charge = 0;
    const foe = this.enemyOf(team);
    if (ab.dmg) {
      for (const u of this.units) {
        if (u.team === foe && u.alive && dist(u, { x, y }) <= ab.radius) {
          this.damageUnit(u, ab.dmg, null);
          if (ab.stun) u.stunT = Math.max(u.stunT, ab.stun);
          if (ab.slow) u.slowT = Math.max(u.slowT, ab.slow);
        }
      }
      for (const b of this.buildings) {
        if (b.team === foe && b.alive && dist(b, { x, y }) <= ab.radius) {
          this.damageBuilding(b, ab.dmg * 0.5);
        }
      }
    }
    if (ab.heal) {
      for (const u of this.units) {
        if (u.team === team && u.alive && dist(u, { x, y }) <= ab.radius) {
          u.hp = Math.min(u.maxHp, u.hp + ab.heal);
          this.floaters.push({ x: u.x, y: u.y, txt: '+' + ab.heal, color: '#7CFC00', t: 0.9, vy: -26 });
        }
      }
    }
    this.effects.push({ kind: 'ability', ability: ab, team, x, y, t: 0.7, radius: ab.radius });
    return true;
  }

  // -- Dégâts ----------------------------------------------------------------
  damageUnit(target, amount, attacker) {
    if (!target.alive) return;
    let dmg = amount;
    if (attacker && attacker.type === 'unit') {
      dmg *= familyMultiplier(attacker.family, target.family);
    }
    dmg *= target.dmgTakenMult;
    target.hp -= dmg;
    target.hitFlash = 0.12;
    this.floaters.push({ x: target.x, y: target.y - target.radius, txt: '-' + Math.round(dmg), color: '#ff5c7a', t: 0.6, vy: -22 });
    if (attacker && attacker.type === 'unit') {
      if (attacker.def.lifesteal) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + dmg * attacker.def.lifesteal);
      }
      this.gainDna(attacker, dmg * 0.12);
    }
    if (target.hp <= 0) {
      target.alive = false;
      if (attacker && attacker.type === 'unit') this.gainDna(attacker, 25);
    }
  }

  damageBuilding(b, amount, attacker) {
    if (!b.alive) return;
    b.hp -= amount;
    b.hitFlash = 0.12;
    if (attacker && attacker.type === 'unit') this.gainDna(attacker, amount * 0.06);
    if (b.hp <= 0) {
      b.hp = 0; b.alive = false;
      if (b.kind === 'reacteur') {
        this.reacteursDown[b.team]++;
        // Le cœur s'active quand ses deux réacteurs sont tombés.
        const stillUp = this.buildings.some(x => x.team === b.team && x.kind === 'reacteur' && x.alive);
        if (!stillUp) {
          const coeur = this.buildings.find(x => x.team === b.team && x.kind === 'coeur');
          if (coeur) coeur.active = true;
        }
        this.emit(`Réacteur ${b.team === 'player' ? 'allié' : 'ennemi'} détruit !`, '#ffcf5c');
      } else {
        // Cœur détruit → fin immédiate.
        this.endMatch(this.enemyOf(b.team));
      }
    }
  }

  gainDna(u, amount) {
    if (!u.def.mutateTo) return;
    u.dna += amount;
    if (u.dna >= u.def.dnaToMutate) this.mutate(u);
  }

  mutate(u) {
    const next = CREATURES[u.def.mutateTo];
    if (!next) return;
    const hpRatio = u.hp / u.maxHp;
    u.def = next;
    u.family = next.family;
    u.role = next.role;
    u.maxHp = next.hp;
    u.hp = Math.max(next.hp * 0.6, next.hp * hpRatio);
    u.dmg = next.dmg; u.range = next.range;
    u.speed = next.speed; u.atkSpd = next.atkSpd;
    u.radius = next.radius;
    u.dna = 0;
    u.mutateFlash = 0.8;
    this.effects.push({ kind: 'mutate', x: u.x, y: u.y, t: 0.7 });
    this.floaters.push({ x: u.x, y: u.y - u.radius - 8, txt: '⇪ ' + next.name, color: '#ffd35c', t: 1.4, vy: -14 });
  }

  // -- Ciblage ---------------------------------------------------------------
  acquireTarget(u) {
    const foe = this.enemyOf(u.team);
    const foeUnits = this.units.filter(x => x.alive && x.team === foe);
    const foeBuildings = this.buildings.filter(x => x.alive && x.team === foe);
    const nearest = (arr) => {
      let best = null, bd = Infinity;
      for (const e of arr) { const d = dist(u, e); if (d < bd) { bd = d; best = e; } }
      return best;
    };

    // Comportement erratique (instabilité) : cible aléatoire agressive.
    if (u.erratic && Math.random() < 0.5 && foeUnits.length) {
      return foeUnits[Math.floor(Math.random() * foeUnits.length)];
    }

    switch (u.role) {
      case 'tank':
        return nearest(foeBuildings) || nearest(foeUnits);
      case 'predateur':
        return nearest(foeUnits) || nearest(foeBuildings);
      case 'assassin': {
        // vise la créature ennemie la plus fragile à portée d'aggro
        const inRange = foeUnits.filter(e => dist(u, e) < 200);
        if (inRange.length) {
          inRange.sort((a, b) => a.hp - b.hp);
          return inRange[0];
        }
        return nearest(foeUnits) || nearest(foeBuildings);
      }
      case 'volant':
        return nearest(foeUnits) || nearest(foeBuildings);
      case 'distance':
        return nearest(foeUnits) || nearest(foeBuildings);
      case 'soutien': {
        const hurt = this.units.filter(x => x.alive && x.team === u.team && x.id !== u.id && x.hp < x.maxHp);
        if (hurt.length) { hurt.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp)); return hurt[0]; }
        // sinon accompagne l'allié le plus avancé
        const allies = this.units.filter(x => x.alive && x.team === u.team && x.id !== u.id);
        return nearest(allies) || nearest(foeBuildings);
      }
      default:
        return nearest(foeUnits) || nearest(foeBuildings);
    }
  }

  // -- Boucle de simulation --------------------------------------------------
  update(dt) {
    if (this.phase === 'ended') return;

    // Temps + phases
    this.time -= dt;
    if (this.time <= 0) {
      if (this.phase === 'play') this.handleRegulationEnd();
      else if (this.phase === 'overtime') this.handleOvertimeEnd();
      if (this.phase === 'ended') return;
    }

    // Énergie
    let regen = GAME_CONFIG.energyRegen;
    if (this.phase === 'overtime') regen = GAME_CONFIG.energyRegenOvertime;
    else if (this.time <= 60) regen = GAME_CONFIG.energyRegenLastMin;
    for (const t of ['player', 'enemy']) {
      this.energy[t] = Math.min(GAME_CONFIG.maxEnergy, this.energy[t] + regen * dt);
    }

    // Recharge lente des capacités de labo
    for (const t of ['player', 'enemy']) {
      this.lab[t].charge = Math.min(100, this.lab[t].charge + 2.2 * dt);
    }

    // Décroissance de l'instabilité si on ne renforce pas
    for (const t of ['player', 'enemy']) {
      this.instability[t] = Math.max(0, this.instability[t] - 1.5 * dt);
    }

    this.updateUnits(dt);
    this.updateBuildings(dt);
    this.updateProjectiles(dt);
    this.cleanup();
    this.updateFx(dt);

    // Victoire par élimination totale des bâtiments (sécurité)
    for (const team of ['player', 'enemy']) {
      const coeur = this.buildings.find(b => b.team === team && b.kind === 'coeur');
      if (coeur && !coeur.alive && this.phase !== 'ended') this.endMatch(this.enemyOf(team));
    }
  }

  updateUnits(dt) {
    for (const u of this.units) {
      if (!u.alive) continue;
      u.age += dt;
      if (u.spawnAnim > 0) u.spawnAnim -= dt;
      if (u.hitFlash > 0) u.hitFlash -= dt;
      if (u.mutateFlash > 0) u.mutateFlash -= dt;
      if (u.buffT > 0) { u.buffT -= dt; if (u.buffT <= 0) u.erratic = false; }
      if (u.slowT > 0) u.slowT -= dt;
      if (u.stunT > 0) { u.stunT -= dt; continue; }
      if (u.cd > 0) u.cd -= dt;

      // ADN de survie
      if (u.def.mutateTo) this.gainDna(u, 3 * dt);

      // (Re)ciblage
      u.retargetT -= dt;
      if (!u.target || !this.isValidTarget(u.target) || u.retargetT <= 0) {
        u.target = this.acquireTarget(u);
        u.retargetT = u.erratic ? 0.6 : 0.9;
      }
      const tgt = u.target;
      if (!tgt) continue;

      const d = dist(u, tgt);

      // Soutien : soigne à portée
      if (u.role === 'soutien' && tgt.team === u.team) {
        if (d <= u.range) {
          if (u.cd <= 0 && tgt.hp < tgt.maxHp) {
            tgt.hp = Math.min(tgt.maxHp, tgt.hp + (u.def.heal || 20));
            this.floaters.push({ x: tgt.x, y: tgt.y - tgt.radius, txt: '+' + (u.def.heal || 20), color: '#7CFC00', t: 0.7, vy: -20 });
            u.cd = 1 / u.atkSpd;
          }
        } else {
          this.moveToward(u, tgt, dt);
        }
        continue;
      }

      // Attaque si à portée, sinon avance
      const reach = u.range + (tgt.radius || 0);
      if (d <= reach) {
        if (u.cd <= 0 && u.dmg > 0) {
          this.attack(u, tgt);
          u.cd = 1 / u.atkSpd;
        }
      } else {
        this.moveToward(u, tgt, dt);
      }
    }

    this.separateUnits();
  }

  attack(u, tgt) {
    const dmg = u.dmg * u.dmgMult;
    if (u.role === 'distance') {
      this.projectiles.push({
        x: u.x, y: u.y, target: tgt, team: u.team,
        speed: 260, dmg, attacker: u,
        color: FAMILIES[u.family] ? FAMILIES[u.family].color : '#fff',
      });
    } else {
      if (tgt.type === 'building') this.damageBuilding(tgt, dmg, u);
      else this.damageUnit(tgt, dmg, u);
    }
  }

  moveToward(u, tgt, dt) {
    const dx = tgt.x - u.x, dy = tgt.y - u.y;
    const len = Math.hypot(dx, dy) || 1;
    const sp = u.speed * u.speedMult * dt;
    u.x += (dx / len) * sp;
    u.y += (dy / len) * sp;
    u.x = clamp(u.x, 12, FIELD.w - 12);
    u.y = clamp(u.y, 24, FIELD.h - 24);
  }

  // Anti-empilement doux
  separateUnits() {
    const arr = this.units.filter(u => u.alive);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = a.radius + b.radius - 2;
        if (d < min) {
          const push = (min - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  isValidTarget(t) {
    if (!t) return false;
    if (t.type === 'building') return t.alive;
    return t.alive;
  }

  updateBuildings(dt) {
    for (const b of this.buildings) {
      if (!b.alive || !b.active) continue;
      if (b.hitFlash > 0) b.hitFlash -= dt;
      if (b.cd > 0) { b.cd -= dt; continue; }
      const foe = this.enemyOf(b.team);
      let best = null, bd = Infinity;
      for (const u of this.units) {
        if (!u.alive || u.team !== foe) continue;
        const d = dist(b, u);
        if (d <= b.range && d < bd) { bd = d; best = u; }
      }
      if (best) {
        this.projectiles.push({
          x: b.x, y: b.y, target: best, team: b.team,
          speed: 300, dmg: b.dmg, attacker: b, color: '#ff8a5c',
        });
        b.cd = 1 / b.atkSpd;
      }
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p.target || !p.target.alive) { p.dead = true; continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = p.speed * dt;
      if (d <= step) {
        if (p.target.type === 'building') this.damageBuilding(p.target, p.dmg, p.attacker);
        else this.damageUnit(p.target, p.dmg, p.attacker);
        p.dead = true;
      } else {
        p.x += (dx / d) * step; p.y += (dy / d) * step;
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  updateFx(dt) {
    for (const e of this.effects) e.t -= dt;
    this.effects = this.effects.filter(e => e.t > 0);
    for (const f of this.floaters) { f.t -= dt; f.y += (f.vy || -20) * dt; }
    this.floaters = this.floaters.filter(f => f.t > 0);
    for (const ev of this.events) ev.t -= dt;
    this.events = this.events.filter(ev => ev.t > 0);
  }

  cleanup() {
    this.units = this.units.filter(u => u.alive);
  }

  // -- Fins de partie --------------------------------------------------------
  handleRegulationEnd() {
    // Un cœur déjà détruit aurait terminé la partie. On compare les réacteurs.
    if (this.reacteursDown.enemy > this.reacteursDown.player) { this.endMatch('player'); return; }
    if (this.reacteursDown.player > this.reacteursDown.enemy) { this.endMatch('enemy'); return; }
    // Égalité → prolongation
    this.phase = 'overtime';
    this.time = GAME_CONFIG.overtimeDuration;
    this.emit('⏱️ PROLONGATION !', '#00e5d0');
  }

  handleOvertimeEnd() {
    // Aucun cœur détruit : on compare les PV des bâtiments principaux (cœurs).
    const pc = this.buildings.find(b => b.team === 'player' && b.kind === 'coeur');
    const ec = this.buildings.find(b => b.team === 'enemy' && b.kind === 'coeur');
    if (pc.hp === ec.hp) this.endMatch('draw');
    else this.endMatch(pc.hp > ec.hp ? 'player' : 'enemy');
  }

  endMatch(winner) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = winner;
  }
}
