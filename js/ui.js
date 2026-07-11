/* Monster Lab — Rendu Canvas
 * Dessine le terrain, les bâtiments, les créatures, projectiles et effets.
 * Convertit aussi les coordonnées écran ↔ terrain pour les entrées.
 */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1; this.ox = 0; this.oy = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    const s = Math.min(rect.width / FIELD.w, rect.height / FIELD.h);
    this.scale = s;
    this.ox = (rect.width - FIELD.w * s) / 2;
    this.oy = (rect.height - FIELD.h * s) / 2;
    this.cssW = rect.width; this.cssH = rect.height;
  }

  screenToField(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.ox) / this.scale;
    const y = (clientY - rect.top - this.oy) / this.scale;
    return { x, y };
  }

  begin() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
  }
  end() { this.ctx.restore(); }

  drawField(game, deployHint) {
    const ctx = this.ctx;
    // sol
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.h);
    g.addColorStop(0, '#141a2e');
    g.addColorStop(0.5, '#0e1424');
    g.addColorStop(1, '#141a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);

    // grille hexagonale simplifiée (lignes)
    ctx.strokeStyle = 'rgba(90,120,200,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.h); ctx.stroke(); }
    for (let y = 0; y <= FIELD.h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FIELD.w, y); ctx.stroke(); }

    // ligne médiane bioluminescente
    ctx.strokeStyle = 'rgba(0,229,208,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(0, FIELD.mid); ctx.lineTo(FIELD.w, FIELD.mid); ctx.stroke();
    ctx.setLineDash([]);

    // zone de déploiement (aide visuelle pendant le drag)
    if (deployHint) {
      ctx.fillStyle = 'rgba(0,229,208,0.06)';
      ctx.fillRect(6, FIELD.mid + 6, FIELD.w - 12, FIELD.h - FIELD.mid - 30);
      // zones débloquées
      const enemyB = game.buildings.filter(b => b.team === 'enemy');
      const gDown = enemyB.find(b => b.slot === 'reacteurG' && !b.alive);
      const dDown = enemyB.find(b => b.slot === 'reacteurD' && !b.alive);
      ctx.fillStyle = 'rgba(124,252,0,0.05)';
      if (gDown) ctx.fillRect(0, 150, FIELD.w / 2, FIELD.mid - 150);
      if (dDown) ctx.fillRect(FIELD.w / 2, 150, FIELD.w / 2, FIELD.mid - 150);
    }
  }

  drawBuilding(b) {
    const ctx = this.ctx;
    const teamColor = b.team === 'player' ? '#4cc9f0' : '#f04c7a';
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.hitFlash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 14; }

    if (b.kind === 'coeur') {
      // Cœur Génétique : hexagone pulsant
      const pulse = 1 + Math.sin(performance.now() / 400) * 0.04;
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      const R = b.radius * pulse;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = Math.cos(a) * R, py = Math.sin(a) * R;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, R);
      grad.addColorStop(0, b.active ? '#fff2a8' : teamColor);
      grad.addColorStop(1, b.active ? '#ff9d5c' : '#0e1424');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = teamColor; ctx.stroke();
      ctx.rotate(-Math.PI / 6);
    } else {
      // Réacteur : tour ronde
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#1b2236';
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = teamColor; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, b.radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = teamColor; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();

    // barre de vie
    this.drawHpBar(b.x, b.y - b.radius - 8, b.radius * 2, b.hp / b.maxHp, teamColor);
  }

  drawUnit(u) {
    const ctx = this.ctx;
    const fam = FAMILIES[u.family] || { color: '#fff', glyph: '?' };
    const teamRing = u.team === 'player' ? '#4cc9f0' : '#f04c7a';
    ctx.save();
    ctx.translate(u.x, u.y);
    const spawnScale = u.spawnAnim > 0 ? clamp(1 - u.spawnAnim, 0.2, 1) : 1;
    ctx.scale(spawnScale, spawnScale);

    // glow d'instabilité / mutation
    if (u.buffT > 0) {
      ctx.shadowColor = fam.color; ctx.shadowBlur = 16;
    }
    if (u.mutateFlash > 0) { ctx.shadowColor = '#ffd35c'; ctx.shadowBlur = 24; }
    if (u.hitFlash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; }

    // corps
    ctx.beginPath();
    ctx.arc(0, 0, u.radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-u.radius * 0.3, -u.radius * 0.3, 2, 0, 0, u.radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, fam.color);
    grad.addColorStop(1, shade(fam.color, -0.5));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = teamRing; ctx.stroke();
    ctx.shadowBlur = 0;

    // glyphe famille
    ctx.font = `${Math.round(u.radius * 1.1)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fam.glyph, 0, 1);

    // état gelé / stun
    if (u.slowT > 0) { ctx.fillStyle = 'rgba(120,200,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, u.radius, 0, Math.PI * 2); ctx.fill(); }
    if (u.stunT > 0) { ctx.fillStyle = 'rgba(255,255,120,0.3)'; ctx.beginPath(); ctx.arc(0, 0, u.radius, 0, Math.PI * 2); ctx.fill(); }

    ctx.restore();

    // barre de vie
    this.drawHpBar(u.x, u.y - u.radius - 7, u.radius * 2, u.hp / u.maxHp, teamRing);

    // jauge d'ADN (anneau doré) si mutable
    if (u.def.mutateTo) {
      const p = clamp(u.dna / u.def.dnaToMutate, 0, 1);
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.radius + 4, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.strokeStyle = '#ffd35c'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  drawHpBar(cx, y, w, ratio, color) {
    const ctx = this.ctx;
    const h = 3.5;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - w / 2, y, w, h);
    ctx.fillStyle = ratio > 0.4 ? color : '#ff5c5c';
    ctx.fillRect(cx - w / 2, y, w * clamp(ratio, 0, 1), h);
  }

  drawProjectile(p) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.fill(); ctx.shadowBlur = 0;
  }

  drawEffects(game) {
    const ctx = this.ctx;
    for (const e of game.effects) {
      if (e.kind === 'mutate') {
        const r = (0.7 - e.t) / 0.7 * 40;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,211,92,${e.t / 0.7})`; ctx.lineWidth = 3; ctx.stroke();
      } else if (e.kind === 'ability') {
        const a = e.t / 0.7;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,208,${0.18 * a})`; ctx.fill();
        ctx.strokeStyle = `rgba(0,229,208,${a})`; ctx.lineWidth = 3; ctx.stroke();
        ctx.font = '16px serif'; ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillText(e.ability.icon, e.x, e.y);
      } else if (e.kind === 'instability') {
        const a = e.t / 1.0;
        ctx.strokeStyle = `rgba(255,80,120,${a * 0.6})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, FIELD.w - 8, FIELD.h - 8);
      }
    }
    // textes flottants
    ctx.textAlign = 'center';
    for (const f of game.floaters) {
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.globalAlpha = clamp(f.t * 1.4, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  render(game, deployHint) {
    this.begin();
    this.drawField(game, deployHint);
    for (const b of game.buildings) if (b.alive) this.drawBuilding(b);
    // trier par y pour un léger effet de profondeur
    const us = game.units.filter(u => u.alive).sort((a, b) => a.y - b.y);
    for (const u of us) this.drawUnit(u);
    for (const p of game.projectiles) this.drawProjectile(p);
    this.drawEffects(game);
    this.end();
  }
}

function shade(hex, amt) {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = clamp(Math.round(r + r * amt), 0, 255);
  g = clamp(Math.round(g + g * amt), 0, 255);
  b = clamp(Math.round(b + b * amt), 0, 255);
  return `rgb(${r},${g},${b})`;
}
