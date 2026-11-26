// All sound is synthesised at runtime with the Web Audio API. No audio files.
// Music: a compact generative lo-fi engine in the style of the Cozy Coaster soundtrack
// (Rhodes-style keys with voice leading, warm bass, boom-bap kick, brushed snare, swung hats, vinyl crackle).

const SILENT = 0.0001;
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const QUALITIES = {
  maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14], '6/9': [0, 4, 7, 9, 14],
  m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17],
  9: [0, 4, 7, 10, 14], 13: [0, 4, 10, 14, 21], '9sus4': [0, 5, 7, 10, 14],
};
const PROGRESSIONS = [
  [[2, 'm9'], [7, '13'], [0, 'maj9'], [9, 'm7']],
  [[0, 'maj7'], [9, 'm9'], [2, 'm7'], [7, '9']],
  [[5, 'maj9'], [4, 'm7'], [9, 'm9'], [2, 'm11']],
  [[9, 'm9'], [5, 'maj7'], [0, 'maj9'], [7, '9sus4']],
  [[0, 'maj9'], [5, '6/9'], [0, 'maj7'], [5, '9']],
  [[4, 'm7'], [9, 'm9'], [2, 'm9'], [7, '13']],
];
const COMP = [[[0, 7], [7, 9]], [[0, 5], [6, 4], [10, 6]], [[2, 6], [8, 3], [11, 5]], [[0, 6], [6, 8], [14, 2]], [[0, 10], [10, 6]]];
const BASSLINES = [[[0, 0, 6], [7, 7, 2], [10, 0, 4]], [[0, 0, 9], [10, 12, 2], [14, -1, 2]], [[0, 0, 3], [3, 0, 4], [10, 7, 3]]];
const KICKS = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 8, 10]];
const PENTA = [0, 2, 4, 7, 9];

function voice(rootPc, quality, prev) {
  let pcs = QUALITIES[quality].map((i) => (rootPc + i) % 12);
  if (pcs.length > 4) pcs = pcs.slice(1); // rootless: bass carries the root
  const centre = prev ? prev.reduce((a, b) => a + b, 0) / prev.length : 62;
  const notes = pcs.map((pc) => {
    let best = 0, bestD = 1e9;
    for (let m = 50 + ((pc - 50) % 12 + 12) % 12; m <= 76; m += 12) {
      const d = Math.abs(m - centre);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }).sort((a, b) => a - b);
  // avoid muddy seconds at the bottom
  if (notes[1] - notes[0] <= 2 && notes[0] < 58) notes[0] += 12;
  return notes.sort((a, b) => a - b);
}

export class Audio {
  // NB: window.Audio (the HTML element) is used explicitly inside this class to avoid the name clash.
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.mood = 'overworld';
    this.song = null;
    this.nextStep = 0;
    this.step = 0;
    this.voices = 0;
    this.cart = null;
  }

  /**
   * Must be called from inside a user gesture (tap/click/key). Safe to call on every gesture:
   * iOS can suspend or interrupt the context at any time (calls, Control Centre, backgrounding).
   */
  unlock() {
    // iPhone: without this, the ring/silent switch mutes all Web Audio. 'playback' makes the game
    // behave like a music app (Safari 16.4+), and the silent <audio> loop does the same on older iOS.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    this.startSilentLoop();
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'playback' }));
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 0.8 : 0;
    this.sfx.connect(this.master);
    this.buildNoise();
    this.buildMusic();
    // iOS sometimes needs a buffer to be played inside the gesture before the context makes sound
    const kick = ctx.createBufferSource();
    kick.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    kick.connect(ctx.destination);
    kick.start(0);
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        this.ctx.suspend();
        this.silent?.pause();
      } else this.ctx.resume().catch(() => {});
    });
  }

  startSilentLoop() {
    if (this.silent) {
      if (this.silent.paused) this.silent.play().catch(() => {});
      return;
    }
    // 0.5 s of silence as a WAV blob, looped quietly. Playing a media element moves iOS Safari into the
    // "playback" audio category, so Web Audio is no longer muted by the silent switch.
    const sr = 8000, n = sr / 2;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    const el = new window.Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
    el.loop = true;
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    this.silent = el;
    el.play().catch(() => {});
  }

  buildNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const pink = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0), p = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const r = Math.random() * 2 - 1;
      w[i] = r;
      b0 = 0.997 * b0 + r * 0.029591; b1 = 0.985 * b1 + r * 0.032534; b2 = 0.95 * b2 + r * 0.048056;
      p[i] = (b0 + b1 + b2 + r * 0.1848) * 0.5;
    }
    this.white = white;
    this.pink = pink;
  }

  // --- primitive voices -----------------------------------------------------------------------------
  tone(dest, { at, freq, glide, glideTime = 0.1, gain = 0.2, attack = 0.005, decay = 0.2, type = 'sine' }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + glideTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(SILENT, at + attack + decay);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
    this.voices++;
    o.onended = () => { g.disconnect(); this.voices--; };
    return at + attack + decay;
  }

  noise(dest, { at, buffer, gain = 0.2, attack = 0.002, decay = 0.1, type = 'bandpass', freq = 1000, q = 1, sweep }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer || this.white;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, at + attack + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(SILENT, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(SILENT, at + attack + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 1.5);
    src.stop(at + attack + decay + 0.05);
    this.voices++;
    src.onended = () => { g.disconnect(); f.disconnect(); this.voices--; };
  }

  rhodes(dest, at, midi, vel, dur) {
    const ctx = this.ctx;
    const f = midiHz(midi);
    const release = at + Math.max(0.06, dur);
    const end = release + 0.8;
    const peak = 0.13 * vel;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const md = ctx.createGain();
    md.gain.setValueAtTime(f * (0.5 + vel), at);
    md.gain.setTargetAtTime(f * 0.1, at, 0.22);
    mod.connect(md).connect(car.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.007);
    env.gain.setTargetAtTime(peak * 0.32, at + 0.007, 0.7);
    env.gain.setTargetAtTime(0, release, 0.16);
    car.connect(env).connect(dest);
    car.start(at); mod.start(at); car.stop(end); mod.stop(end);
    this.voices++;
    car.onended = () => { env.disconnect(); md.disconnect(); this.voices--; };
  }

  bassNote(dest, at, midi, vel, dur) {
    const ctx = this.ctx;
    const f = midiHz(midi);
    const release = at + Math.max(0.05, dur);
    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = f;
    const sine = ctx.createOscillator();
    sine.frequency.value = f;
    const env = ctx.createGain();
    const peak = 0.24 * vel;
    env.gain.setValueAtTime(SILENT, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.012);
    env.gain.setTargetAtTime(peak * 0.6, at + 0.012, 0.35);
    env.gain.setTargetAtTime(0, release, 0.06);
    tri.connect(env); sine.connect(env); env.connect(dest);
    tri.start(at); sine.start(at); tri.stop(release + 0.35); sine.stop(release + 0.35);
    this.voices++;
    tri.onended = () => { env.disconnect(); this.voices--; };
  }

  // --- music graph -----------------------------------------------------------------------------------
  buildMusic() {
    const ctx = this.ctx;
    const out = (this.musicOut = ctx.createGain());
    out.gain.value = SILENT;
    out.connect(this.master);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 7000; lp.Q.value = 0.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
    shaper.curve = curve;
    shaper.connect(lp).connect(out);

    const bus = (freq) => {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = 0.6;
      g.connect(f).connect(shaper);
      return g;
    };
    this.drums = bus(9000);
    this.bass = bus(750);
    this.bass.gain.value = 0.9;
    this.drums.gain.value = 0.75;

    // Keys and lead get a wobbly tape delay line (wow + flutter)
    const keysIn = (this.keys = ctx.createGain());
    keysIn.gain.value = 0.85;
    const tape = ctx.createDelay(0.1);
    tape.delayTime.value = 0.02;
    const wow = ctx.createOscillator(); wow.frequency.value = 0.45;
    const wowD = ctx.createGain(); wowD.gain.value = 0.0016;
    wow.connect(wowD).connect(tape.delayTime); wow.start();
    const keysLp = ctx.createBiquadFilter(); keysLp.type = 'lowpass'; keysLp.frequency.value = 3800;
    keysIn.connect(tape).connect(keysLp).connect(shaper);
    this.lead = ctx.createGain();
    this.lead.gain.value = 0.9;
    this.lead.connect(tape);

    // Vinyl crackle bed
    const sr = ctx.sampleRate;
    const crk = ctx.createBuffer(1, Math.floor(sr * 5.3), sr);
    const d = crk.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      if (Math.random() >= 14 / sr) continue;
      const amp = Math.random() < 0.05 ? rand(0.4, 0.8) : rand(0.05, 0.25);
      const n = Math.floor(rand(3, 18));
      for (let k = 0; k < n && i + k < d.length; k++) d[i + k] += amp * (Math.random() * 2 - 1) * Math.exp(-k / (n * 0.3));
    }
    const src = ctx.createBufferSource();
    src.buffer = crk; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const cg = ctx.createGain(); cg.gain.value = 0.11;
    src.connect(hp).connect(cg).connect(out);
    src.start();
    if (this.musicOn) this.setMusic(true);
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicOut.gain.cancelScheduledValues(t);
    this.musicOut.gain.setTargetAtTime(on ? 0.62 : SILENT, t, on ? 1.2 : 0.4);
    if (on && !this.song) this.newSong();
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.ctx && this.musicOn) {
      // gentle transition into a new song for the new place
      this.song.bar = Math.max(this.song.bar, this.song.bars - 2);
    }
  }

  newSong() {
    const bunny = this.mood === 'bunny';
    const bpm = bunny ? rand(84, 90) : rand(72, 80);
    const prevKey = this.song ? this.song.key : -1;
    let key = Math.floor(Math.random() * 12);
    if (key === prevKey) key = (key + 5) % 12;
    const prog = pick(PROGRESSIONS);
    let prev = null;
    const chords = prog.map(([deg, q]) => {
      const root = (key + deg) % 12;
      prev = voice(root, q, prev);
      return { root, notes: prev };
    });
    const barsPerChord = Math.random() < 0.5 ? 1 : 2;
    const stepDur = 60 / bpm / 4;
    this.song = {
      bpm, key, chords, barsPerChord, stepDur,
      swing: rand(0.55, 0.6),
      bars: 40, bar: 0,
      kick: pick(KICKS),
      comp: [pick(COMP), pick(COMP)],
      bassline: pick(BASSLINES),
      hat16: Math.random() < 0.4,
      melodyNote: 2,
      bright: bunny,
    };
    this.step = 0;
    if (this.ctx) this.nextStep = Math.max(this.nextStep, this.ctx.currentTime + 0.1);
  }

  section(bar) {
    const s = this.song;
    if (bar < 4) return { drums: 0, bass: 0, melody: 0 };
    if (bar >= s.bars - 4) return { drums: 0.6, bass: 1, melody: 0 };
    if (bar >= 20 && bar < 28) return { drums: s.bright ? 1 : 0, bass: 1, melody: 1 };
    return { drums: 1, bass: 1, melody: s.bright ? 0.5 : 0 };
  }

  /** Called every frame: schedules everything due in the next 0.3 s on the audio clock. */
  tick() {
    if (!this.ctx || !this.musicOn || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (!this.song) this.newSong();
    if (this.nextStep < ctx.currentTime) this.nextStep = ctx.currentTime + 0.05; // skip after pauses
    while (this.nextStep < ctx.currentTime + 0.3) {
      this.scheduleStep(this.nextStep);
      this.nextStep += this.song.stepDur;
      this.step++;
      if (this.step % 16 === 0) {
        this.song.bar++;
        if (this.song.bar >= this.song.bars) this.newSong();
      }
    }
  }

  scheduleStep(t) {
    const s = this.song;
    const st = this.step % 16;
    const bar = s.bar;
    if (st % 2 === 1) t += (2 * s.swing - 1) * s.stepDur; // swing the off 16ths
    if (this.voices > 40) return;
    const sec = this.section(bar);
    const chordIdx = Math.floor(bar / s.barsPerChord) % s.chords.length;
    const chord = s.chords[chordIdx];
    const fade = bar >= s.bars - 2 ? 0.6 : 1;
    // keys
    const comp = bar < 4 || bar >= s.bars - 4 ? [[0, 16]] : s.comp[bar % 2];
    for (const [hs, len] of comp) {
      if (hs !== st) continue;
      const vel = rand(0.55, 0.75) * fade;
      chord.notes.forEach((n, k) => this.rhodes(this.keys, t + k * rand(0.006, 0.02), n + (s.bright ? 12 : 0), vel, len * s.stepDur));
    }
    // bass
    if (sec.bass) {
      for (const [bs, interval, len] of s.bassline) {
        if (bs !== st) continue;
        let n = 36 + chord.root + (interval < 0 ? 0 : interval);
        if (interval < 0) {
          const nextRoot = s.chords[(chordIdx + 1) % s.chords.length].root;
          n = 36 + nextRoot - 1;
        }
        if (n > 50) n -= 12;
        this.bassNote(this.bass, t, n, 0.8 * fade, len * s.stepDur);
      }
    }
    // drums
    if (sec.drums) {
      const v = sec.drums * fade;
      if (s.kick.includes(st)) {
        this.tone(this.drums, { at: t, freq: 105, glide: 46, glideTime: 0.11, gain: 0.5 * v, attack: 0.004, decay: 0.36 });
        this.tone(this.drums, { at: t, freq: 190, glide: 95, glideTime: 0.05, gain: 0.08 * v, attack: 0.003, decay: 0.07, type: 'triangle' });
      }
      if (st === 4 || st === 12) {
        this.noise(this.drums, { at: t, buffer: this.pink, gain: 0.28 * v, attack: 0.005, decay: 0.17, freq: 2100, q: 0.7 });
        this.tone(this.drums, { at: t, freq: 190, glide: 160, gain: 0.1 * v, attack: 0.003, decay: 0.08, type: 'triangle' });
      }
      if (st % 2 === 0 || (s.hat16 && Math.random() < 0.5)) {
        const open = st === 14 && Math.random() < 0.3;
        this.noise(this.drums, { at: t, gain: (open ? 0.06 : st % 4 === 0 ? 0.08 : 0.055) * v, attack: 0.001, decay: open ? 0.25 : 0.035, type: 'highpass', freq: 6500, q: 0.6 });
      }
    }
    // melody: pentatonic random walk, sparse
    if (sec.melody && st % 2 === 0 && Math.random() < 0.3 * sec.melody + (st === 0 ? 0.3 : 0)) {
      s.melodyNote = Math.max(0, Math.min(9, s.melodyNote + pick([-2, -1, -1, 1, 1, 2, 0])));
      const deg = s.melodyNote;
      const n = 72 + s.key + PENTA[deg % 5] + 12 * Math.floor(deg / 5) - (s.key > 6 ? 12 : 0);
      this.pluck(t, n, rand(0.5, 0.8), s.stepDur * pick([2, 3, 4]));
    }
  }

  pluck(at, midi, vel, dur) {
    const ctx = this.ctx;
    const f = midiHz(midi);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, at);
    lp.frequency.setTargetAtTime(900, at, 0.25);
    const env = ctx.createGain();
    const peak = 0.07 * vel;
    env.gain.setValueAtTime(SILENT, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.008);
    env.gain.setTargetAtTime(peak * 0.45, at + 0.008, 0.3);
    env.gain.setTargetAtTime(0, at + dur, 0.15);
    o.connect(lp).connect(env).connect(this.lead);
    o.start(at);
    o.stop(at + dur + 0.8);
    this.voices++;
    o.onended = () => { env.disconnect(); lp.disconnect(); this.voices--; };
  }

  // --- sound effects ------------------------------------------------------------------------------------
  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  ok() { return this.ctx && this.sfxOn && this.ctx.state === 'running' && this.voices < 60; }

  place(kind = 'solid') {
    if (!this.ok()) return;
    const t = this.now;
    const base = kind === 'rail' ? 520 : kind === 'soft' ? 300 : kind === 'stone' ? 240 : 380;
    this.tone(this.sfx, { at: t, freq: base * rand(0.94, 1.06), glide: base * 0.7, glideTime: 0.06, gain: 0.22, attack: 0.002, decay: 0.09, type: 'triangle' });
    this.noise(this.sfx, { at: t, buffer: this.pink, gain: 0.18, attack: 0.001, decay: 0.05, freq: kind === 'stone' ? 1800 : 900, q: 1.4 });
  }

  breakBlock(kind = 'solid') {
    if (!this.ok()) return;
    const t = this.now;
    this.noise(this.sfx, { at: t, buffer: this.pink, gain: 0.3, attack: 0.002, decay: 0.16, freq: kind === 'stone' ? 1400 : 700, q: 0.9, sweep: 300 });
    this.tone(this.sfx, { at: t, freq: 170 * rand(0.9, 1.1), glide: 90, glideTime: 0.1, gain: 0.14, attack: 0.002, decay: 0.12, type: 'triangle' });
  }

  tap() {
    if (!this.ok()) return;
    this.tone(this.sfx, { at: this.now, freq: 880, glide: 660, glideTime: 0.04, gain: 0.07, attack: 0.002, decay: 0.05 });
  }

  jump() {
    if (!this.ok()) return;
    this.tone(this.sfx, { at: this.now, freq: 260, glide: 420, glideTime: 0.12, gain: 0.06, attack: 0.01, decay: 0.12 });
  }

  boing() {
    if (!this.ok()) return;
    this.tone(this.sfx, { at: this.now, freq: 420, glide: 900, glideTime: 0.14, gain: 0.08, attack: 0.005, decay: 0.16 });
  }

  power() {
    if (!this.ok()) return;
    const t = this.now;
    this.tone(this.sfx, { at: t, freq: 180, glide: 360, glideTime: 0.2, gain: 0.12, attack: 0.01, decay: 0.25, type: 'sawtooth' });
    this.noise(this.sfx, { at: t, gain: 0.05, attack: 0.01, decay: 0.2, type: 'highpass', freq: 3000 });
  }

  portal() {
    if (!this.ok()) return;
    const t = this.now;
    [0, 4, 7, 11, 14].forEach((s, i) => this.tone(this.sfx, { at: t + i * 0.06, freq: midiHz(64 + s), glide: midiHz(76 + s), glideTime: 0.8, gain: 0.07, attack: 0.05, decay: 1.1 }));
    this.noise(this.sfx, { at: t, buffer: this.pink, gain: 0.16, attack: 0.4, decay: 0.8, freq: 400, q: 0.7, sweep: 4000 });
  }

  chime() {
    if (!this.ok()) return;
    const t = this.now;
    [0, 7, 12].forEach((s, i) => this.tone(this.sfx, { at: t + i * 0.07, freq: midiHz(76 + s), gain: 0.06, attack: 0.004, decay: 0.5 }));
  }

  // Continuous coaster sound: rolling noise + wind, both following speed.
  cartStart() {
    if (!this.ctx || this.cart) return;
    const ctx = this.ctx;
    const roll = ctx.createBufferSource(); roll.buffer = this.pink; roll.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 300;
    const rg = ctx.createGain(); rg.gain.value = 0;
    roll.connect(rf).connect(rg).connect(this.sfx);
    const wind = ctx.createBufferSource(); wind.buffer = this.white; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 800; wf.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0;
    wind.connect(wf).connect(wg).connect(this.sfx);
    roll.start(); wind.start();
    this.cart = { roll, rf, rg, wind, wf, wg, clack: 0 };
  }

  cartUpdate(speed, lifting, dist) {
    const c = this.cart;
    if (!c) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 18);
    c.rf.frequency.setTargetAtTime(160 + s * 900, t, 0.1);
    c.rg.gain.setTargetAtTime(0.05 + s * 0.22, t, 0.1);
    c.wf.frequency.setTargetAtTime(500 + s * 1800, t, 0.1);
    c.wg.gain.setTargetAtTime(s * s * 0.25, t, 0.1);
    if (lifting && dist - c.clack > 0.45) {
      c.clack = dist;
      this.noise(this.sfx, { at: t, gain: 0.12, attack: 0.001, decay: 0.03, freq: 2200, q: 3 });
    } else if (!lifting) c.clack = dist;
  }

  cartStop() {
    const c = this.cart;
    if (!c) return;
    const t = this.ctx.currentTime;
    c.rg.gain.setTargetAtTime(0, t, 0.15);
    c.wg.gain.setTargetAtTime(0, t, 0.15);
    c.roll.stop(t + 0.8); c.wind.stop(t + 0.8);
    this.cart = null;
  }
}
