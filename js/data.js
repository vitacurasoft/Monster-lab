/* Monster Lab — Données de jeu (familles, capsules, mutations)
 * Prototype jouable. Toutes les valeurs sont volontairement lisibles
 * et faciles à équilibrer.
 */

// ---------------------------------------------------------------------------
// Familles biologiques. Chaque famille a une couleur d'identité et des
// forces / faiblesses (bonus de dégâts contre certaines familles).
// ---------------------------------------------------------------------------
const FAMILIES = {
  insecte:  { name: 'Insectes',          color: '#7CFC00', glyph: '🐛' },
  mammifere:{ name: 'Mammifères',        color: '#F4A460', glyph: '🐺' },
  reptile:  { name: 'Reptiles',          color: '#2ecc71', glyph: '🦎' },
  robot:    { name: 'Robots biologiques',color: '#8ab4ff', glyph: '🤖' },
  parasite: { name: 'Parasites',         color: '#c65cff', glyph: '🦠' },
  alien:    { name: 'Aliens',            color: '#00e5d0', glyph: '👾' },
  marin:    { name: 'Créatures marines', color: '#2fa4e7', glyph: '🐙' },
  plante:   { name: 'Plantes mutantes',  color: '#4caf50', glyph: '🌿' },
};

// Table de contres : attacker gagne +30% de dégâts contre defender.
// Forme un cycle lisible (chaîne d'avantages).
const COUNTERS = {
  insecte:   'plante',
  plante:    'marin',
  marin:     'robot',
  robot:     'parasite',
  parasite:  'mammifere',
  mammifere: 'reptile',
  reptile:   'alien',
  alien:     'insecte',
};

// ---------------------------------------------------------------------------
// Rôles de comportement (IA de ciblage automatique).
//   tank      : vise les bâtiments en priorité
//   predateur : vise les créatures ennemies
//   assassin  : vise la créature ennemie la plus fragile (PV bas), rapide
//   soutien   : soigne l'allié blessé le plus proche
//   volant    : ignore les obstacles au sol, vise tout
//   distance  : attaque à distance
//   essaim    : invoque plusieurs petites unités
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Capsules génétiques (les créatures déployables).
//   cost   : énergie (1..8)
//   hp     : points de vie
//   dmg    : dégâts par attaque
//   range  : portée d'attaque (px)
//   speed  : vitesse de déplacement (px/s)
//   atkSpd : attaques par seconde
//   radius : rayon de collision / rendu
//   count  : nombre d'unités invoquées (essaim)
//   mutateTo : id de la créature obtenue quand la jauge d'ADN est pleine
//   dnaToMutate : ADN nécessaire pour muter
// ---------------------------------------------------------------------------
const CREATURES = {
  // --- Insectes -----------------------------------------------------------
  larve: {
    id: 'larve', name: 'Larve', family: 'insecte', role: 'predateur',
    cost: 2, hp: 90, dmg: 14, range: 22, speed: 62, atkSpd: 1.1, radius: 12,
    mutateTo: 'mante', dnaToMutate: 60,
    desc: "Petite mais vorace. Mute en Mante toxique.",
  },
  mante: {
    id: 'mante', name: 'Mante toxique', family: 'insecte', role: 'assassin',
    cost: 2, hp: 150, dmg: 30, range: 24, speed: 78, atkSpd: 1.3, radius: 14,
    mutateTo: 'reine', dnaToMutate: 90,
    desc: "Forme évoluée de la larve. Mute en Reine mutante.",
  },
  reine: {
    id: 'reine', name: 'Reine mutante', family: 'insecte', role: 'predateur',
    cost: 2, hp: 260, dmg: 42, range: 26, speed: 70, atkSpd: 1.2, radius: 17,
    desc: "Stade final. Un fléau pour les créatures ennemies.",
  },
  essaimGuepes: {
    id: 'essaimGuepes', name: 'Essaim de guêpes', family: 'insecte', role: 'volant',
    cost: 3, hp: 40, dmg: 16, range: 20, speed: 95, atkSpd: 1.6, radius: 9, count: 4,
    desc: "Quatre guêpes volantes. Submergent par le nombre.",
  },

  // --- Mammifères ---------------------------------------------------------
  bufloTank: {
    id: 'bufloTank', name: 'Buffle blindé', family: 'mammifere', role: 'tank',
    cost: 5, hp: 900, dmg: 55, range: 26, speed: 42, atkSpd: 0.8, radius: 22,
    desc: "Muraille de muscle. Fonce droit sur les bâtiments.",
  },
  loupMeute: {
    id: 'loupMeute', name: 'Meute de loups', family: 'mammifere', role: 'predateur',
    cost: 4, hp: 120, dmg: 26, range: 22, speed: 90, atkSpd: 1.4, radius: 12, count: 3,
    desc: "Trois loups rapides qui déchirent les créatures.",
  },

  // --- Reptiles -----------------------------------------------------------
  scorpion: {
    id: 'scorpion', name: 'Scorpion', family: 'reptile', role: 'assassin',
    cost: 3, hp: 200, dmg: 44, range: 24, speed: 84, atkSpd: 1.2, radius: 15,
    mutateTo: 'scorpionRad', dnaToMutate: 80,
    desc: "Chasse les proies fragiles. Mute en Scorpion radioactif.",
  },
  scorpionRad: {
    id: 'scorpionRad', name: 'Scorpion radioactif', family: 'reptile', role: 'assassin',
    cost: 3, hp: 340, dmg: 70, range: 26, speed: 80, atkSpd: 1.2, radius: 18,
    mutateTo: 'titanToxique', dnaToMutate: 120,
    desc: "Irradié et féroce. Mute en Titan toxique.",
  },
  titanToxique: {
    id: 'titanToxique', name: 'Titan toxique', family: 'reptile', role: 'tank',
    cost: 3, hp: 700, dmg: 90, range: 30, speed: 55, atkSpd: 1.0, radius: 24,
    desc: "Colosse mutant. Détruit tout sur son passage.",
  },
  varan: {
    id: 'varan', name: 'Varan cuirassé', family: 'reptile', role: 'tank',
    cost: 4, hp: 620, dmg: 40, range: 24, speed: 50, atkSpd: 0.9, radius: 20,
    desc: "Tank défensif au cuir épais.",
  },

  // --- Robots biologiques -------------------------------------------------
  drone: {
    id: 'drone', name: 'Drone-canon', family: 'robot', role: 'distance',
    cost: 3, hp: 130, dmg: 34, range: 120, speed: 60, atkSpd: 0.9, radius: 13,
    desc: "Tire à distance sur les cibles au sol et volantes.",
  },
  sentinelle: {
    id: 'sentinelle', name: 'Sentinelle lourde', family: 'robot', role: 'tank',
    cost: 6, hp: 1050, dmg: 65, range: 28, speed: 38, atkSpd: 0.7, radius: 24,
    desc: "Bâti pour encaisser. Marche sur les défenses.",
  },

  // --- Parasites ----------------------------------------------------------
  sangsue: {
    id: 'sangsue', name: 'Sangsue vorace', family: 'parasite', role: 'predateur',
    cost: 2, hp: 110, dmg: 20, range: 20, speed: 72, atkSpd: 1.5, radius: 11,
    lifesteal: 0.5,
    desc: "Se soigne d'une partie des dégâts infligés.",
  },
  spore: {
    id: 'spore', name: 'Spore infectieuse', family: 'parasite', role: 'distance',
    cost: 3, hp: 90, dmg: 22, range: 100, speed: 55, atkSpd: 1.0, radius: 12,
    desc: "Projette des spores corrosives à distance.",
  },

  // --- Aliens -------------------------------------------------------------
  xeno: {
    id: 'xeno', name: 'Xéno-rôdeur', family: 'alien', role: 'assassin',
    cost: 4, hp: 260, dmg: 60, range: 24, speed: 100, atkSpd: 1.3, radius: 15,
    desc: "Ultra-rapide, fond sur les cibles fragiles.",
  },
  ovniSoutien: {
    id: 'ovniSoutien', name: 'Nodule guérisseur', family: 'alien', role: 'soutien',
    cost: 4, hp: 300, dmg: 0, range: 90, speed: 48, atkSpd: 1.0, radius: 16,
    heal: 26,
    desc: "Soigne les alliés proches. Aucune attaque.",
  },

  // --- Créatures marines --------------------------------------------------
  kraken: {
    id: 'kraken', name: 'Kraken juvénile', family: 'marin', role: 'tank',
    cost: 7, hp: 1200, dmg: 80, range: 30, speed: 40, atkSpd: 0.8, radius: 26,
    desc: "Menace lourde. Frappe fort et encaisse énormément.",
  },
  raieVolante: {
    id: 'raieVolante', name: 'Raie planante', family: 'marin', role: 'volant',
    cost: 3, hp: 150, dmg: 30, range: 22, speed: 96, atkSpd: 1.1, radius: 13,
    desc: "Créature volante, ignore les obstacles au sol.",
  },

  // --- Plantes mutantes ---------------------------------------------------
  liane: {
    id: 'liane', name: 'Liane étrangleuse', family: 'plante', role: 'distance',
    cost: 4, hp: 240, dmg: 36, range: 110, speed: 46, atkSpd: 0.9, radius: 15,
    desc: "Fouette de loin, contrôle une zone.",
  },
  fleurSoin: {
    id: 'fleurSoin', name: 'Fleur nourricière', family: 'plante', role: 'soutien',
    cost: 3, hp: 220, dmg: 0, range: 85, speed: 40, atkSpd: 1.2, radius: 15,
    heal: 20,
    desc: "Soigne régulièrement les alliés autour d'elle.",
  },
};

// Decks pré-construits (8 capsules). Le joueur utilise le premier ;
// l'IA en pioche un au hasard.
const DECKS = {
  equilibre: {
    name: 'Labo Équilibré',
    cards: ['larve', 'scorpion', 'drone', 'bufloTank', 'ovniSoutien', 'xeno', 'raieVolante', 'sangsue'],
  },
  insectesRush: {
    name: 'Nuée d\'Insectes',
    cards: ['larve', 'essaimGuepes', 'mante', 'loupMeute', 'sangsue', 'xeno', 'drone', 'fleurSoin'],
  },
  lourds: {
    name: 'Titans Lourds',
    cards: ['bufloTank', 'kraken', 'sentinelle', 'liane', 'ovniSoutien', 'scorpion', 'drone', 'varan'],
  },
};

// Capacités spéciales de laboratoire.
const LAB_ABILITIES = {
  nuageToxique: {
    id: 'nuageToxique', name: 'Nuage toxique', icon: '☠️',
    desc: 'Dégâts de zone sur les ennemis dans un rayon.',
    charge: 100, radius: 90, dmg: 220,
  },
  impulsion: {
    id: 'impulsion', name: 'Impulsion électrique', icon: '⚡',
    desc: 'Étourdit et blesse les ennemis dans une zone.',
    charge: 100, radius: 80, dmg: 120, stun: 1.6,
  },
  gel: {
    id: 'gel', name: 'Gel de zone', icon: '❄️',
    desc: 'Ralentit fortement les ennemis touchés.',
    charge: 90, radius: 100, dmg: 40, slow: 3.0,
  },
  soinCollectif: {
    id: 'soinCollectif', name: 'Soin collectif', icon: '➕',
    desc: 'Soigne toutes vos créatures dans la zone.',
    charge: 100, radius: 110, heal: 280,
  },
};

// Constantes de partie.
const GAME_CONFIG = {
  matchDuration: 180,      // 3 minutes
  overtimeDuration: 60,    // 1 minute
  maxEnergy: 10,
  energyRegen: 1 / 2.8,    // ~1 énergie / 2.8s
  energyRegenLastMin: 1 / 1.4,
  energyRegenOvertime: 1 / 0.9,
  handSize: 4,
  instabilityThreshold: 100, // Instabilité génétique
  instabilityPerSameFamily: 34,
  instabilityBuffDuration: 8,
};
