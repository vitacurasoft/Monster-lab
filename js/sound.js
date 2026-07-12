/* Monster Lab — Audio procédural (WebAudio, aucun fichier son)
 * Tout est synthétisé à la volée : effets de combat, UI, musique d'ambiance.
 * Respecte le réglage Meta.state.settings.sound.
 */
window.Sound = (function () {
  let ctx, master, musicGain, ambient = [], musicOn = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }
  function on() { return window.Meta && Meta.state && Meta.state.settings && Meta.state.settings.sound; }

  function tone(freq, dur, type, gain, slideTo) {
    ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, gain, cutoff) {
    ensure(); if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 1400;
    const g = ctx.createGain(); g.gain.value = gain || 0.2;
    s.connect(f); f.connect(g); g.connect(master);
    s.start();
  }
  function seq(notes, type, gain, step) {
    notes.forEach((f, i) => setTimeout(() => tone(f, step * 1.4, type, gain), i * step * 1000));
  }

  const FX = {
    click:       () => tone(520, 0.05, 'square', 0.12),
    deploy:      () => tone(440, 0.12, 'triangle', 0.22, 680),
    hit:         () => noise(0.07, 0.12, 1200),
    mutate:      () => { tone(300, 0.45, 'sawtooth', 0.22, 900); tone(600, 0.45, 'sine', 0.14, 1300); },
    ability:     () => { tone(220, 0.5, 'sawtooth', 0.18, 70); noise(0.3, 0.1, 900); },
    instability: () => { tone(110, 0.6, 'square', 0.18, 320); noise(0.2, 0.1, 600); },
    reacteur:    () => { noise(0.4, 0.22, 900); tone(150, 0.4, 'square', 0.18, 55); },
    unlock:      () => { tone(660, 0.1, 'sine', 0.22); setTimeout(() => tone(880, 0.16, 'sine', 0.22), 90); },
    reward:      () => seq([523, 659, 784, 1047], 'sine', 0.2, 0.08),
    win:         () => seq([523, 659, 784, 1047, 1319], 'triangle', 0.24, 0.13),
    lose:        () => seq([440, 349, 262, 196], 'sawtooth', 0.2, 0.16),
    emote:       () => tone(760, 0.14, 'sine', 0.2, 520),
  };

  function play(name) {
    if (!on()) return;
    ensure(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (FX[name]) { try { FX[name](); } catch (e) {} }
  }
  function resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function startMusic() {
    ensure(); if (!ctx || musicOn) return;
    musicOn = true;
    musicGain = ctx.createGain(); musicGain.gain.value = 0.05; musicGain.connect(master);
    // nappe grave + quinte (ambiance labo futuriste)
    [55, 82.41, 110].forEach(f => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.5;
      o.connect(g); g.connect(musicGain); o.start(); ambient.push(o);
    });
    // léger battement lent
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(musicGain.gain); lfo.start(); ambient.push(lfo);
  }
  function stopMusic() {
    ambient.forEach(n => { try { n.stop(); } catch (e) {} });
    ambient = []; musicOn = false;
  }
  function setMusic(want) {
    if (want && on()) startMusic();
    if (!want) stopMusic();
  }

  return { play, resume, startMusic, stopMusic, setMusic };
})();
