/* Monster Lab — Rendu 3D (WebGL via Three.js r128)
 * Remplace le rendu 2D. La simulation (engine.js) est inchangée : ce module
 * ne fait que LIRE l'état du jeu et le dessiner en 3D, plus un calque 2D
 * par-dessus pour les barres de vie, glyphes et dégâts (net et léger).
 *
 * Mapping terrain -> monde : worldX = fieldX-180 ; worldZ = fieldY-320.
 */

const ARENAS = {
  labo:     { name: 'Laboratoire',      ground: 0x1b2340, grid: 0x33427a, fog: 0x0b0f1c, light: 0xbfd0ff },
  station:  { name: 'Station spatiale', ground: 0x161a2e, grid: 0x2f5a8a, fog: 0x05070f, light: 0x8ad0ff },
  jungle:   { name: 'Jungle radioactive', ground: 0x14251a, grid: 0x3f8a3f, fog: 0x08140a, light: 0xbfffa8 },
  volcan:   { name: 'Volcan',           ground: 0x2a1410, grid: 0x8a3a1a, fog: 0x1a0805, light: 0xffb37a },
  marine:   { name: 'Base sous-marine', ground: 0x0e2230, grid: 0x2f7aa0, fog: 0x04121c, light: 0x8ae0ff },
  desert:   { name: 'Désert mutant',    ground: 0x2c2718, grid: 0x8a7a3a, fog: 0x181405, light: 0xffe3a8 },
  glacier:  { name: 'Glacier',          ground: 0x1a2838, grid: 0x6aa0c8, fog: 0x0a141c, light: 0xdff0ff },
};
const ARENA_IDS = Object.keys(ARENAS);

function toWorld(fx, fy) { return { x: fx - 180, z: fy - 320 }; }

class Render3D {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(this.dpr);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(48, 1, 1, 4000);
    camera.position.set(0, 610, 340);
    camera.lookAt(0, 0, 0);
    this.camera = camera;

    // Lumières
    this.ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(this.ambient);
    this.dir = new THREE.DirectionalLight(0xffffff, 0.9);
    this.dir.position.set(120, 400, 260);
    scene.add(this.dir);
    this.rim = new THREE.DirectionalLight(0x88aaff, 0.4);
    this.rim.position.set(-200, 200, -300);
    scene.add(this.rim);

    // Groupe monde
    this.world = new THREE.Group();
    scene.add(this.world);

    // Sol + grille
    this.buildGround();

    // Ligne médiane
    const midGeo = new THREE.PlaneGeometry(360, 4);
    const midMat = new THREE.MeshBasicMaterial({ color: 0x00e5d0, transparent: true, opacity: 0.6 });
    this.midLine = new THREE.Mesh(midGeo, midMat);
    this.midLine.rotation.x = -Math.PI / 2;
    this.midLine.position.set(0, 0.6, 0);
    this.world.add(this.midLine);

    // Zone de déploiement (moitié joueur), masquée par défaut
    const dzGeo = new THREE.PlaneGeometry(360, 320);
    const dzMat = new THREE.MeshBasicMaterial({ color: 0x00e5d0, transparent: true, opacity: 0.09 });
    this.deployZone = new THREE.Mesh(dzGeo, dzMat);
    this.deployZone.rotation.x = -Math.PI / 2;
    this.deployZone.position.set(0, 0.4, 160); // moitié basse (z>0)
    this.deployZone.visible = false;
    this.world.add(this.deployZone);

    // Pools
    this.unitMeshes = new Map();   // id -> {group, body, ring, base}
    this.buildingMeshes = new Map();
    this.projPool = [];
    this.effectMeshes = [];

    // Géométries partagées
    this.geo = {
      unit: new THREE.SphereGeometry(1, 18, 14),
      ring: new THREE.TorusGeometry(1, 0.14, 8, 24),
      proj: new THREE.SphereGeometry(3.2, 8, 8),
      ringFx: new THREE.TorusGeometry(1, 0.5, 6, 28),
    };

    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._ray = new THREE.Raycaster();
    this._v2 = new THREE.Vector2();
    this._v3 = new THREE.Vector3();

    this.setArena('labo');
    this.buildingsBuilt = false;
    this.time = 0;
  }

  buildGround() {
    const g = new THREE.PlaneGeometry(520, 780);
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x1b2340, roughness: 0.95, metalness: 0.0 });
    this.ground = new THREE.Mesh(g, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.world.add(this.ground);

    this.grid = new THREE.GridHelper(720, 36, 0x33427a, 0x33427a);
    this.grid.position.y = 0.2;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.25;
    this.world.add(this.grid);

    // Bordure lumineuse du terrain
    const border = new THREE.Mesh(
      new THREE.RingGeometry(1, 1, 4),
      new THREE.MeshBasicMaterial({ color: 0x2a3a6a, side: THREE.DoubleSide })
    );
    // remplacé par un simple cadre en lignes
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(360, 1, 640));
    this.fieldFrame = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x3a4a8a }));
    this.fieldFrame.position.y = 0.5;
    this.world.add(this.fieldFrame);
  }

  setArena(id) {
    const a = ARENAS[id] || ARENAS.labo;
    this.arena = id;
    this.groundMat.color.setHex(a.ground);
    if (this.grid) { this.grid.material.color.setHex(a.grid); }
    this.scene.fog = new THREE.Fog(a.fog, 700, 1500);
    this.scene.background = new THREE.Color(a.fog);
    this.dir.color.setHex(a.light);
  }

  // -- Bâtiments (créés une fois) -------------------------------------------
  buildBuildings(game) {
    for (const b of game.buildings) {
      const teamColor = b.team === 'player' ? 0x4cc9f0 : 0xf04c7a;
      const w = toWorld(b.x, b.y);
      const group = new THREE.Group();
      group.position.set(w.x, 0, w.z);

      if (b.kind === 'coeur') {
        const h = 46;
        const crystal = new THREE.Mesh(
          new THREE.CylinderGeometry(b.radius * 0.9, b.radius * 1.1, h, 6),
          new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4, flatShading: true })
        );
        crystal.position.y = h / 2;
        group.add(crystal);
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(b.radius * 0.5, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        core.position.y = h / 2;
        group.add(core);
        group.userData = { crystal, core, kind: 'coeur' };
      } else {
        const h = 34;
        const tower = new THREE.Mesh(
          new THREE.CylinderGeometry(b.radius, b.radius * 1.15, h, 12),
          new THREE.MeshStandardMaterial({ color: 0x1b2236, emissive: teamColor, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.5 })
        );
        tower.position.y = h / 2;
        group.add(tower);
        const emitter = new THREE.Mesh(
          new THREE.SphereGeometry(b.radius * 0.55, 12, 12),
          new THREE.MeshBasicMaterial({ color: teamColor })
        );
        emitter.position.y = h + 3;
        group.add(emitter);
        group.userData = { tower, emitter, kind: 'reacteur' };
      }
      this.world.add(group);
      this.buildingMeshes.set(b.id, group);
    }
    this.buildingsBuilt = true;
  }

  // -- Unités ---------------------------------------------------------------
  ensureUnit(u) {
    let m = this.unitMeshes.get(u.id);
    if (m) return m;
    const fam = FAMILIES[u.family] || { color: '#ffffff' };
    const col = new THREE.Color(fam.color);
    const teamColor = u.team === 'player' ? 0x4cc9f0 : 0xf04c7a;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      this.geo.unit,
      new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.3), roughness: 0.45, metalness: 0.2 })
    );
    group.add(body);
    const ring = new THREE.Mesh(
      this.geo.ring,
      new THREE.MeshBasicMaterial({ color: teamColor })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    this.world.add(group);
    m = { group, body, ring, fam };
    this.unitMeshes.set(u.id, m);
    return m;
  }

  updateUnits(game) {
    const seen = new Set();
    for (const u of game.units) {
      if (!u.alive) continue;
      seen.add(u.id);
      const m = this.ensureUnit(u);
      const w = toWorld(u.x, u.y);
      const r = u.radius * 0.95;
      const bob = Math.sin(this.time * 6 + u.id) * 1.2;
      m.group.position.set(w.x, r + bob, w.z);
      m.body.scale.setScalar(r);
      m.ring.position.y = -r + 1.5;
      m.ring.scale.set(r * 1.25, r * 1.25, r * 1.25);

      // couleur / états
      const mat = m.body.material;
      let emi = 0.3;
      if (u.buffT > 0) emi = 0.8 + Math.sin(this.time * 20) * 0.2;      // instabilité
      if (u.mutateFlash > 0) emi = 1.2;
      if (u.hitFlash > 0) emi = 1.0;
      mat.emissiveIntensity = emi;
      if (u.slowT > 0) mat.color.setHex(0x9fd8ff);
      else mat.color.set(m.fam.color);
    }
    // suppression des morts
    for (const [id, m] of this.unitMeshes) {
      if (!seen.has(id)) {
        this.world.remove(m.group);
        m.body.material.dispose();
        m.ring.material.dispose();
        this.unitMeshes.delete(id);
      }
    }
  }

  updateBuildings(game) {
    for (const b of game.buildings) {
      const group = this.buildingMeshes.get(b.id);
      if (!group) continue;
      if (!b.alive) { group.visible = false; continue; }
      group.visible = true;
      const ud = group.userData;
      if (ud.kind === 'coeur') {
        group.rotation.y = this.time * 0.5;
        const pulse = 1 + Math.sin(this.time * 3) * 0.05;
        ud.crystal.scale.setScalar(pulse);
        ud.crystal.material.emissiveIntensity = b.active ? 1.1 : 0.5;
        ud.core.material.color.setHex(b.active ? 0xfff2a8 : 0xffffff);
      } else {
        ud.tower.material.emissiveIntensity = b.hitFlash > 0 ? 1.0 : 0.25;
      }
    }
  }

  updateProjectiles(game) {
    // recycle un pool de sphères
    let i = 0;
    for (const p of game.projectiles) {
      let mesh = this.projPool[i];
      if (!mesh) {
        mesh = new THREE.Mesh(this.geo.proj, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        this.world.add(mesh);
        this.projPool[i] = mesh;
      }
      mesh.visible = true;
      mesh.material.color.set(p.color || '#ffffff');
      const w = toWorld(p.x, p.y);
      mesh.position.set(w.x, 20, w.z);
      i++;
    }
    for (; i < this.projPool.length; i++) this.projPool[i].visible = false;
  }

  updateEffects(game) {
    // rings de mutation / capacités : recréés à la volée
    for (const m of this.effectMeshes) { this.world.remove(m.mesh); m.mesh.material.dispose(); }
    this.effectMeshes = [];
    for (const e of game.effects) {
      if (e.kind === 'mutate') {
        const p = (0.7 - e.t) / 0.7;
        const w = toWorld(e.x, e.y);
        const mesh = new THREE.Mesh(this.geo.ringFx,
          new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: 1 - p }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(w.x, 4, w.z);
        mesh.scale.setScalar(6 + p * 40);
        this.world.add(mesh);
        this.effectMeshes.push({ mesh });
      } else if (e.kind === 'ability') {
        const a = e.t / 0.7;
        const w = toWorld(e.x, e.y);
        const mesh = new THREE.Mesh(
          new THREE.CircleGeometry(e.radius, 28),
          new THREE.MeshBasicMaterial({ color: 0x00e5d0, transparent: true, opacity: 0.22 * a, side: THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(w.x, 3, w.z);
        this.world.add(mesh);
        this.effectMeshes.push({ mesh });
      }
    }
  }

  // -- Projection monde -> écran (pour le calque 2D) ------------------------
  project(fx, fy, h) {
    const w = toWorld(fx, fy);
    this._v3.set(w.x, h || 0, w.z);
    this._v3.project(this.camera);
    return {
      x: (this._v3.x * 0.5 + 0.5) * this.cssW,
      y: (-this._v3.y * 0.5 + 0.5) * this.cssH,
      visible: this._v3.z < 1,
    };
  }

  // -- Calque 2D (barres de vie, glyphes, dégâts) ---------------------------
  drawOverlay(game) {
    const ctx = this.octx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    // bâtiments : barre de vie
    for (const b of game.buildings) {
      if (!b.alive) continue;
      const s = this.project(b.x, b.y, 52);
      if (s.visible) this.hpBar(ctx, s.x, s.y - 34, 42, b.hp / b.maxHp, b.team === 'player' ? '#4cc9f0' : '#f04c7a');
    }

    // unités : glyphe + barre de vie + anneau ADN
    const units = game.units.filter(u => u.alive);
    for (const u of units) {
      const fam = FAMILIES[u.family] || { glyph: '?', color: '#fff' };
      const top = this.project(u.x, u.y, u.radius * 2.1);
      const mid = this.project(u.x, u.y, u.radius);
      if (!mid.visible) continue;
      // glyphe
      const size = Math.max(11, 20 - u.radius * 0.1);
      ctx.font = `${Math.round(u.radius * 0.95)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fam.glyph, mid.x, mid.y);
      // barre de vie
      this.hpBar(ctx, top.x, top.y - 6, Math.max(20, u.radius * 1.6), u.hp / u.maxHp, u.team === 'player' ? '#4cc9f0' : '#f04c7a');
      // anneau ADN
      if (u.def.mutateTo) {
        const p = clamp(u.dna / u.def.dnaToMutate, 0, 1);
        ctx.beginPath();
        ctx.arc(mid.x, mid.y, Math.max(12, u.radius * 0.9), -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.strokeStyle = '#ffd35c'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // capacités : icône au centre de la zone
    for (const e of game.effects) {
      if (e.kind === 'ability') {
        const s = this.project(e.x, e.y, 6);
        ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = clamp(e.t / 0.7, 0, 1);
        ctx.fillText(e.ability.icon, s.x, s.y);
        ctx.globalAlpha = 1;
      }
    }

    // instabilité : cadre rouge pulsant
    for (const e of game.effects) {
      if (e.kind === 'instability') {
        const a = e.t / 1.0;
        ctx.strokeStyle = `rgba(255,80,120,${a * 0.6})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, this.cssW - 6, this.cssH - 6);
      }
    }

    // dégâts / soins flottants
    ctx.textAlign = 'center';
    for (const f of game.floaters) {
      const s = this.project(f.x, f.y, 24);
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.globalAlpha = clamp(f.t * 1.4, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  }

  hpBar(ctx, cx, y, w, ratio, color) {
    const h = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - w / 2, y, w, h);
    ctx.fillStyle = ratio > 0.4 ? color : '#ff5c5c';
    ctx.fillRect(cx - w / 2, y, w * clamp(ratio, 0, 1), h);
  }

  // -- API publique ---------------------------------------------------------
  render(game, hint) {
    if (!this.buildingsBuilt) this.buildBuildings(game);
    this.time += 1 / 60;
    this.deployZone.visible = !!hint;
    this.updateUnits(game);
    this.updateBuildings(game);
    this.updateProjectiles(game);
    this.updateEffects(game);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(game);
  }

  screenToField(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this._v2.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._v2.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this._ray.setFromCamera(this._v2, this.camera);
    const hit = new THREE.Vector3();
    this._ray.ray.intersectPlane(this._plane, hit);
    if (!hit) return { x: 180, y: 320 };
    return { x: clamp(hit.x + 180, 0, 360), y: clamp(hit.z + 320, 0, 640) };
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return; // écran masqué
    this.cssW = rect.width; this.cssH = rect.height;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.overlay.width = Math.round(rect.width * this.dpr);
    this.overlay.height = Math.round(rect.height * this.dpr);
    this.overlay.style.width = rect.width + 'px';
    this.overlay.style.height = rect.height + 'px';
  }

  dispose() {
    // vide les pools pour une nouvelle partie
    for (const [, m] of this.unitMeshes) { this.world.remove(m.group); }
    this.unitMeshes.clear();
    for (const [, g] of this.buildingMeshes) { this.world.remove(g); }
    this.buildingMeshes.clear();
    for (const p of this.projPool) this.world.remove(p);
    this.projPool = [];
    for (const m of this.effectMeshes) this.world.remove(m.mesh);
    this.effectMeshes = [];
    this.buildingsBuilt = false;
  }
}
