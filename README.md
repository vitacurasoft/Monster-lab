# 🧬 Monster Lab — Prototype jouable

Prototype web (HTML5 Canvas, JavaScript vanilla, **zéro dépendance**) du jeu de
stratégie temps réel décrit dans le cahier des charges *Monster Lab v1.0*.

Année 2087 : chaque joueur dirige un laboratoire de bio-ingénierie et déploie
des créatures mutantes pour détruire le **Cœur Génétique** adverse.

## ▶️ Jouer

Ouvrez simplement `index.html` dans un navigateur, ou via GitHub Pages une fois
le dépôt publié. Optimisé pour mobile (format portrait, tactile).

- **Déployer une créature :** glissez une capsule de votre main vers votre
  moitié de terrain (ou tapez la carte puis tapez le terrain).
- **Capacité de labo :** activez le bouton à gauche quand il est chargé, puis
  ciblez une zone.

## 🧪 Mécaniques implémentées (traçabilité cahier des charges)

| Section du CDC | Implémentation |
|---|---|
| Déroulement : matchmaking + écran VS 5 s | Écran de chargement « Mutation en cours… », deck/ligue/créature favorite |
| Partie de 3 min + prolongation 1 min | Chrono, phases `play`/`overtime`, régénération d'énergie accélérée |
| Énergie 0→10, plus rapide en dernière minute | `GAME_CONFIG.energyRegen*` |
| Cœur Génétique + 2 Réacteurs par camp | Bâtiments ; le Cœur reste **passif** tant qu'un Réacteur tient |
| Deck de 8 capsules, main de 4 | `DECKS`, pioche cyclique |
| Rôles auto (tank, prédateur, assassin, soutien, volant, distance) | IA de ciblage par rôle (`acquireTarget`) |
| 8 familles + forces/faiblesses | `FAMILIES`, table de contres `COUNTERS` (+30 % de dégâts) |
| **Mutations** (Larve → Mante → Reine, etc.) | Jauge d'ADN, `mutate()` avec animation |
| **Instabilité génétique** (mécanique signature) | Empiler la même famille remplit une jauge → **Mutation Instable** (bonus + comportement erratique) |
| Capacités de laboratoire | Nuage toxique, impulsion, gel, soin collectif |
| Zones de déploiement débloquées si un Réacteur tombe | `canDeploy()` |
| Conditions de victoire (Cœur / Réacteurs / prolongation / PV) | `handleRegulationEnd`, `handleOvertimeEnd` |
| Matchmaking humain/IA indiscernable | Bot avancé (`BotPlayer`) gère énergie, défense et poussée |
| Écran de récompenses (trophées, XP, ressources) | Écran de résultats |

## 🗂️ Structure

```
index.html        écrans (menu, chargement, combat, résultats) + aide
css/style.css     direction artistique « labo haute technologie »
js/data.js        familles, capsules, decks, mutations, capacités, constantes
js/engine.js      moteur de combat temps réel (simulation, IA de ciblage, victoire)
js/ai.js          bot adverse
js/ui.js          rendu Canvas + conversion écran ↔ terrain
js/app.js         contrôleur d'écrans, boucle de jeu, entrées joueur
```

## ⚖️ Statut

Prototype de démonstration du **gameplay** et des mécaniques. Les valeurs
d'équilibrage sont volontairement lisibles dans `js/data.js` pour être ajustées.
Ne couvre pas encore : rendu 3D cartoon, réseau/multijoueur réel, progression
persistante, boutique, audio. Ce sont des phases ultérieures.
