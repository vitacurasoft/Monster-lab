# 🧬 Monster Lab — Prototype jouable (3D)

Jeu de stratégie temps réel en **3D WebGL**, jouable dans le navigateur, inspiré
du cahier des charges *Monster Lab v1.0*. Univers de bio-ingénierie : année 2087,
chaque joueur dirige un laboratoire et déploie des créatures mutantes pour
détruire le **Cœur Génétique** adverse.

**100 % autonome, sans build, sans dépendance externe au chargement** (Three.js est
embarqué localement). Optimisé mobile, format portrait, tactile.

## ▶️ Jouer

Ouvrez `index.html` dans un navigateur, ou via GitHub Pages une fois publié.

- **Déployer :** glissez une capsule de la main vers votre moitié de terrain
  (ou tapez la carte puis tapez le terrain).
- **Capacité de labo :** bouton à gauche une fois chargé, puis ciblez une zone.
- **Émotes :** bouton 😀 en combat.

## 🎮 Contenu

- **Rendu 3D** (Three.js) : arène en perspective, Cœurs cristal, Réacteurs,
  créatures 3D, effets de mutation/capacité, 7 arènes visuelles.
- **Combat temps réel** : 3 min + prolongation, énergie, deck de 8 capsules,
  8 familles + table de contres, rôles IA (tank / prédateur / assassin / soutien /
  volant / distance), bot adverse.
- **Mutations par ADN** (Larve → Mante toxique → Reine mutante ; Scorpion →
  radioactif → Titan toxique ; Molosse → alpha…).
- **Instabilité génétique** (mécanique signature) : empiler la même famille
  déclenche une Mutation Instable (bonus + comportement erratique).
- **Bâtiments déployables** : tourelle, incubateur, générateur, piège, labo avancé.
- **Capacités de laboratoire** : nuage toxique, impulsion, gel, soin collectif.
- **Méta-jeu complet** (sauvegardé en local) :
  - Hub laboratoire, niveaux & XP, ligues **Bronze → Légende**, classement mondial.
  - **Collection** : déblocage des créatures avec l'ADN.
  - **Éditeur de deck** + choix de la capacité.
  - **Boutique** cosmétique (arènes, avatars, émotes) — aucun avantage en combat.
  - **Salles de laboratoire** améliorables.
  - **Premium** (5,99 €, simulé) + **pass de saison** à paliers.
  - Réglages (nom, sons, réinitialisation).
- **Audio procédural** (WebAudio, 100 % synthétisé, aucun fichier) : effets de
  combat, UI, victoire/défaite, nappe d'ambiance.
- **Tutoriel** au premier lancement, **émotes** en combat.

## 🌐 Multijoueur en ligne

Le bouton « Joueur en ligne » est **volontairement grisé** : le multijoueur réseau
sera développé séparément (Flutter). Le prototype couvre l'intégralité du solo
contre IA.

## 🗂️ Structure

```
index.html          écrans (hub, sous-écrans, chargement, combat, résultats)
css/style.css       direction artistique « labo haute technologie »
js/vendor/three.min.js   Three.js r128 (embarqué)
js/data.js          familles, capsules, decks, mutations, capacités, bâtiments
js/meta.js          progression, collection, ligues, économie (localStorage)
js/engine.js        moteur de combat temps réel (simulation, IA de ciblage)
js/ai.js            bot adverse
js/render3d.js      rendu 3D WebGL + calque 2D (barres de vie, glyphes, dégâts)
js/sound.js         audio procédural WebAudio
js/app.js           contrôleur d'écrans, boucle de jeu, entrées, méta-jeu
```

## ⚖️ Statut

Prototype **solo complet** couvrant gameplay, mutations, bâtiments, méta-jeu,
progression, audio et rendu 3D. Non couvert (phases ultérieures) : multijoueur
réseau réel (prévu Flutter), assets 3D artistiques finaux, paiements réels.
Les valeurs d'équilibrage sont lisibles dans `js/data.js`.
