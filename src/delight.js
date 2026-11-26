// Little moments of delight: hearts, butterflies, fireworks, the golden-carrot sparkle, day and night,
// confetti and celebration pop-ups, and the sticker book. Everything is pooled: nothing allocates per frame.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------------------------------------
// Sprite textures drawn once on canvases

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {};
function textures() {
  if (TEX.heart) return TEX;
  TEX.heart = canvasTexture(64, (g) => {
    g.fillStyle = '#ff6f9f';
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(4, 34, 8, 8, 32, 20);
    g.bezierCurveTo(56, 8, 60, 34, 32, 54);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.ellipse(22, 22, 5, 3.5, -0.6, 0, 7); g.fill();
  });
  TEX.note = canvasTexture(64, (g) => {
    g.fillStyle = '#fffaf3';
    g.strokeStyle = '#4a3a2e';
    g.lineWidth = 3;
    g.beginPath(); g.ellipse(24, 46, 10, 8, -0.4, 0, 7); g.fill(); g.stroke();
    g.fillRect(31, 10, 5, 36); g.strokeRect(31, 10, 5, 36);
    g.beginPath(); g.moveTo(36, 10); g.quadraticCurveTo(52, 16, 48, 30); g.lineTo(44, 27); g.quadraticCurveTo(46, 20, 36, 18); g.closePath(); g.fill(); g.stroke();
  });
  TEX.sparkle = canvasTexture(64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,230,1)');
    grd.addColorStop(0.25, 'rgba(255,225,120,0.9)');
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fffbe6';
    g.beginPath(); g.moveTo(32, 2); g.lineTo(36, 28); g.lineTo(62, 32); g.lineTo(36, 36); g.lineTo(32, 62); g.lineTo(28, 36); g.lineTo(2, 32); g.lineTo(28, 28); g.closePath(); g.fill();
  });
  TEX.dot = canvasTexture(32, (g) => {
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
  });
  return TEX;
}

export function nameTag(text) {
  const tex = canvasTexture(256, (g) => {
    g.font = '800 30px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif';
    const w = Math.min(240, g.measureText(text).width + 34);
    const x = 128 - w / 2;
    g.fillStyle = 'rgba(251,246,238,0.92)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x, 104, w, 48, 24);
    else { g.arc(x + 24, 128, 24, Math.PI / 2, Math.PI * 1.5); g.arc(x + w - 24, 128, 24, -Math.PI / 2, Math.PI / 2); g.closePath(); }
    g.fill();
    g.fillStyle = '#c77d62';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 129);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.15, 1.15, 1);
  return s;
}

// ---------------------------------------------------------------------------------------------------------
// 3D effects

export class Effects {
  constructor(scene) {
    const T = textures();
    this.scene = scene;
    // Floating sprites: hearts, music notes, sparkles
    this.sprites = [];
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.heart, transparent: true, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.sprites.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.5 });
    }
    // Golden-carrot sparkle beacon
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.sparkle, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.beaconPos = null;

    // Butterflies: two wing quads each
    const wing = new THREE.PlaneGeometry(0.22, 0.18);
    wing.translate(0.11, 0, 0);
    this.butterflies = [];
    const colours = [0xf4a9c8, 0xe5c579, 0x8daabb, 0x9fd8c0, 0xc77d62];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: colours[i % colours.length], side: THREE.DoubleSide, transparent: true });
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.rotation.y = Math.PI;
      g.add(l, r);
      g.visible = false;
      scene.add(g);
      this.butterflies.push({ g, l, r, mat, life: 0, phase: 0, heading: 0 });
    }

    // Firework particles: one additive Points cloud
    this.FW = 420;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.FW * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.FW * 3), 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(this.FW), 1));
    this.fwGeo = geo;
    this.fwVel = new Float32Array(this.FW * 3);
    this.fwLife = new Float32Array(this.FW);
    this.fwBase = new Float32Array(this.FW * 3);
    this.fwNext = 0;
    // Soft round sparks with their own fade, readable against a bright daytime sky as well as at night
    this.fwMat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 } },
      vertexShader: `attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(0.3 * scale / max(1.0, -mv.z), 0.045 * scale); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.55), vA * smoothstep(0.5, 0.25, d)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.fw = new THREE.Points(geo, this.fwMat);
    this.fw.frustumCulled = false;
    scene.add(this.fw);
    this.rockets = [];
    this.fwActive = false;
  }

  /** Spawns a floating sprite. kind: heart | note | sparkle */
  pop(kind, x, y, z, opts = {}) {
    const T = textures();
    const p = this.sprites.find((q) => q.life <= 0) || this.sprites[0];
    p.s.material.map = T[kind];
    p.s.material.color.setHex(opts.tint ?? 0xffffff);
    p.s.material.blending = kind === 'sparkle' ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.needsUpdate = true;
    p.s.position.set(x, y, z);
    p.size = opts.size ?? 0.45;
    p.max = p.life = opts.life ?? 1.2;
    p.vx = opts.vx ?? rand(-0.3, 0.3);
    p.vy = opts.vy ?? rand(0.8, 1.3);
    p.vz = opts.vz ?? rand(-0.3, 0.3);
    p.s.visible = true;
  }

  hearts(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) this.pop('heart', x + rand(-0.3, 0.3), y + rand(0, 0.3), z + rand(-0.3, 0.3), { size: rand(0.3, 0.5), life: rand(1, 1.5) });
  }

  butterfly(x, y, z) {
    const b = this.butterflies.find((q) => q.life <= 0);
    if (!b) return false;
    b.g.position.set(x, y, z);
    b.life = 7;
    b.phase = Math.random() * 6;
    b.heading = Math.random() * Math.PI * 2;
    b.g.visible = true;
    return true;
  }

  firework(x, y, z) {
    this.rockets.push({ x, y, z, vy: 12, t: 0, fuse: rand(0.6, 0.72), trail: 0 });
    this.fwActive = true;
  }

  burst(x, y, z) {
    const palette = [[0.95, 0.25, 0.5], [1, 0.72, 0.15], [0.25, 0.55, 1], [0.2, 0.8, 0.5], [1, 0.45, 0.2], [0.65, 0.35, 0.95]];
    const c1 = palette[Math.floor(Math.random() * palette.length)];
    const c2 = palette[Math.floor(Math.random() * palette.length)];
    const pos = this.fwGeo.attributes.position.array;
    const n = 150;
    this.pop('sparkle', x, y, z, { size: 3.2, life: 0.45, vy: 0, vx: 0, vz: 0 });
    for (let k = 0; k < n; k++) {
      const i = this.fwNext;
      this.fwNext = (this.fwNext + 1) % this.FW;
      // even-ish sphere directions
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = rand(4.2, 6.2);
      this.fwVel[i * 3] = Math.cos(a) * r * sp;
      this.fwVel[i * 3 + 1] = u * sp + 1;
      this.fwVel[i * 3 + 2] = Math.sin(a) * r * sp;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const c = k % 2 ? c1 : c2;
      this.fwBase[i * 3] = c[0]; this.fwBase[i * 3 + 1] = c[1]; this.fwBase[i * 3 + 2] = c[2];
      this.fwLife[i] = rand(1.5, 2.2);
    }
  }

  trail(x, y, z) {
    const pos = this.fwGeo.attributes.position.array;
    const i = this.fwNext;
    this.fwNext = (this.fwNext + 1) % this.FW;
    pos[i * 3] = x + rand(-0.05, 0.05); pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + rand(-0.05, 0.05);
    this.fwVel[i * 3] = 0; this.fwVel[i * 3 + 1] = -1; this.fwVel[i * 3 + 2] = 0;
    this.fwBase[i * 3] = 1; this.fwBase[i * 3 + 1] = 0.85; this.fwBase[i * 3 + 2] = 0.55;
    this.fwLife[i] = 0.4;
  }

  setBeacon(pos) {
    this.beaconPos = pos;
    this.beacon.visible = !!pos;
  }

  update(dt, now, onBoom) {
    // sprites
    for (const p of this.sprites) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.vy *= 1 - dt * 0.8;
      const t = 1 - p.life / p.max;
      const scale = p.size * (t < 0.15 ? t / 0.15 : 1);
      p.s.scale.set(scale, scale, 1);
      p.s.material.opacity = t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.4) : 1;
      if (p.life <= 0) p.s.visible = false;
    }
    // golden-carrot beacon: gentle twinkle above the block, visible from a distance
    if (this.beaconPos) {
      const tw = 0.75 + Math.sin(now * 0.004) * 0.25;
      this.beacon.position.set(this.beaconPos[0] + 0.5, this.beaconPos[1] + 1.25 + Math.sin(now * 0.002) * 0.1, this.beaconPos[2] + 0.5);
      this.beacon.scale.setScalar(1.3 * tw);
      this.beacon.material.rotation = now * 0.0006;
      if (Math.random() < dt * 2) this.pop('sparkle', this.beaconPos[0] + rand(0.1, 0.9), this.beaconPos[1] + rand(0.6, 1.2), this.beaconPos[2] + rand(0.1, 0.9), { size: rand(0.15, 0.3), life: 0.9, vy: 0.4 });
    }
    // butterflies: flutter upward on a lazy wander, then fade
    for (const b of this.butterflies) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.phase += dt * 18;
      b.heading += Math.sin(b.phase * 0.07) * dt * 1.4;
      b.g.position.x += Math.cos(b.heading) * dt * 1.1;
      b.g.position.z += Math.sin(b.heading) * dt * 1.1;
      b.g.position.y += (0.45 + Math.sin(b.phase * 0.2) * 0.5) * dt;
      b.g.rotation.y = -b.heading;
      const flap = Math.sin(b.phase) * 1.1;
      b.l.rotation.y = flap;
      b.r.rotation.y = Math.PI - flap;
      b.mat.opacity = Math.min(1, b.life / 1.2);
      if (b.life <= 0) b.g.visible = false;
    }
    // fireworks
    if (this.fwActive) {
      for (let r = this.rockets.length - 1; r >= 0; r--) {
        const k = this.rockets[r];
        k.t += dt;
        k.y += k.vy * dt;
        k.trail += dt;
        if (k.trail > 0.02) { k.trail = 0; this.trail(k.x, k.y, k.z); }
        if (k.t > k.fuse) {
          this.burst(k.x, k.y, k.z);
          onBoom?.(k.x, k.y, k.z);
          this.rockets.splice(r, 1);
        }
      }
      const pos = this.fwGeo.attributes.position.array, col = this.fwGeo.attributes.color.array, alp = this.fwGeo.attributes.alpha.array;
      let alive = this.rockets.length > 0;
      for (let i = 0; i < this.FW; i++) {
        if (this.fwLife[i] <= 0) { alp[i] = 0; continue; }
        alive = true;
        this.fwLife[i] -= dt;
        alp[i] = Math.min(1, this.fwLife[i] / 0.7) * (0.8 + Math.random() * 0.2);
        this.fwVel[i * 3 + 1] -= 3.5 * dt;
        this.fwVel[i * 3] *= 1 - dt * 1.6; this.fwVel[i * 3 + 1] *= 1 - dt * 1.6; this.fwVel[i * 3 + 2] *= 1 - dt * 1.6;
        pos[i * 3] += this.fwVel[i * 3] * dt; pos[i * 3 + 1] += this.fwVel[i * 3 + 1] * dt; pos[i * 3 + 2] += this.fwVel[i * 3 + 2] * dt;
        col[i * 3] = this.fwBase[i * 3]; col[i * 3 + 1] = this.fwBase[i * 3 + 1]; col[i * 3 + 2] = this.fwBase[i * 3 + 2];
      }
      this.fwGeo.attributes.position.needsUpdate = true;
      this.fwGeo.attributes.color.needsUpdate = true;
      this.fwGeo.attributes.alpha.needsUpdate = true;
      this.fwActive = alive;
    }
  }

  clear() {
    for (const p of this.sprites) { p.life = 0; p.s.visible = false; }
    for (const b of this.butterflies) { b.life = 0; b.g.visible = false; }
    this.rockets.length = 0;
    this.fwLife.fill(0);
  }

  /** Keeps spark size right for the screen height (call on resize). */
  setScreen(h) { this.fwMat.uniforms.scale.value = h * 0.5 * (window.devicePixelRatio || 1); }

  /** A gentle shower of petals (Blossom). */
  petals(x, y, z) {
    for (let i = 0; i < 8; i++) this.pop('heart', x + rand(0, 1), y + rand(0.2, 1), z + rand(0, 1), { size: rand(0.14, 0.22), life: rand(1.4, 2), vy: rand(-0.6, -0.2), vx: rand(-0.4, 0.4), vz: rand(-0.4, 0.4), tint: 0xffc4da });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Day and night

const DAY_SECONDS = 540; // one full day takes 9 minutes
const SKY = {
  overworld: {
    day: { top: 0x8fbcd4, hor: 0xe4ecea, fog: 0xdfe8e6 },
    dusk: { top: 0x7f8fbf, hor: 0xf6c9a0, fog: 0xeac2a4 },
    night: { top: 0x1c2547, hor: 0x46507e, fog: 0x3a4470 },
  },
  bunny: {
    day: { top: 0xf2a7c9, hor: 0xffe6f0, fog: 0xffe3ee },
    dusk: { top: 0xb58bd0, hor: 0xffc9b8, fog: 0xf4bfc2 },
    night: { top: 0x3b2552, hor: 0x7a4f86, fog: 0x6b4579 },
  },
};

export class DayNight {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.12; // morning
    this.enabled = true;
    this.daylight = 1;
    this.top = new THREE.Color();
    this.hor = new THREE.Color();
    this.fog = new THREE.Color();
    this._a = new THREE.Color();
    this._b = new THREE.Color();
    this.acc = 1;

    // Stars on the upper sky
    const n = 380;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 0.9 + 0.08, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * r * 140; pos[i * 3 + 1] = u * 140; pos[i * 3 + 2] = Math.sin(a) * r * 140;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xfff6dd, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    scene.add(this.stars);

    // Sun and moon discs
    const disc = (color, r) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, fog: false, depthWrite: false }));
      m.renderOrder = -1;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.sun = disc(0xffe6a8, 7);
    this.moon = disc(0xf4f1e6, 5);

    // Fireflies around the player at night
    this.FF = 36;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.FF * 3), 3));
    fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.FF * 3), 3));
    this.ffGeo = fg;
    this.ffSeed = Array.from({ length: this.FF }, () => ({ x: rand(-12, 12), z: rand(-12, 12), h: rand(0.4, 2.6), p: rand(0, 6.3), s: rand(0.6, 1.4) }));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.22, map: textures().dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fireflies.frustumCulled = false;
    scene.add(this.fireflies);
  }

  /** 0 = night, 1 = full day */
  static daylightAt(t) {
    // day 0.0-0.55, dusk to 0.65, night to 0.9, dawn to 1.0
    if (t < 0.55) return 1;
    if (t < 0.65) return 1 - (t - 0.55) / 0.1;
    if (t < 0.9) return 0;
    return (t - 0.9) / 0.1;
  }

  update(dt, dim, camPos, world, sky, mats) {
    if (this.enabled) this.time = (this.time + dt / DAY_SECONDS) % 1;
    else this.time = 0.2;
    const t = this.time;
    const d = DayNight.daylightAt(t);
    this.daylight = d;
    // colour updates a few times a second are plenty
    this.acc += dt;
    if (this.acc > 0.2) {
      this.acc = 0;
      const P = SKY[dim] || SKY.overworld;
      const dusk = t > 0.5 && t < 0.7 ? 1 - Math.abs(t - 0.6) / 0.1 : t > 0.86 || t < 0.04 ? 1 - Math.min(Math.abs(t - 0.95), Math.abs(t + 0.05)) / 0.09 : 0;
      const mix = (key, out) => {
        this._a.setHex(P.night[key]).lerp(this._b.setHex(P.day[key]), d);
        if (dusk > 0) this._a.lerp(this._b.setHex(P.dusk[key]), Math.max(0, Math.min(1, dusk)) * 0.75);
        out.copy(this._a);
      };
      mix('top', this.top); mix('hor', this.hor); mix('fog', this.fog);
      sky.setColors(this.top, this.hor, this.fog, this.scene);
      // world brightness: nights stay bright enough to build (never below ~45%), with a cool tint
      const b = 0.46 + 0.54 * d;
      for (const m of mats.world) m.color.setRGB(b * (0.92 + 0.08 * d), b * (0.95 + 0.05 * d), Math.min(1, b * 1.12));
      sky.cloudMat.opacity = 0.35 + 0.57 * d;
    }
    // sun and moon arcs (sun up during the day half)
    const ang = (t / 1) * Math.PI * 2 - Math.PI / 2 + 0.35;
    const sx = Math.cos(ang), sy = Math.sin(-ang + Math.PI);
    this.sun.position.set(camPos.x + sx * 120, camPos.y + Math.max(-40, sy * 110), camPos.z - 30);
    this.moon.position.set(camPos.x - sx * 120, camPos.y + Math.max(-40, -sy * 110), camPos.z + 30);
    this.sun.lookAt(camPos);
    this.moon.lookAt(camPos);
    this.sun.material.opacity = Math.max(0, Math.min(1, sy * 3)) * 0.95;
    this.moon.material.opacity = Math.max(0, Math.min(1, -sy * 3)) * (1 - d * 0.6);
    this.stars.position.copy(camPos);
    this.starMat.opacity = (1 - d) * 0.95;
    // fireflies drift around the player, twinkling
    const night = 1 - d;
    this.fireflies.visible = night > 0.05;
    if (this.fireflies.visible) {
      const pos = this.ffGeo.attributes.position.array, col = this.ffGeo.attributes.color.array;
      const tt = performance.now() * 0.001;
      for (let i = 0; i < this.FF; i++) {
        const f = this.ffSeed[i];
        const x = camPos.x + f.x + Math.sin(tt * 0.3 * f.s + f.p) * 2;
        const z = camPos.z + f.z + Math.cos(tt * 0.27 * f.s + f.p) * 2;
        const ground = world.surface(x, z);
        pos[i * 3] = x; pos[i * 3 + 1] = ground + f.h + Math.sin(tt * 0.8 + f.p) * 0.3; pos[i * 3 + 2] = z;
        const tw = Math.max(0, Math.sin(tt * 2.2 * f.s + f.p)) * night;
        col[i * 3] = 1 * tw; col[i * 3 + 1] = 0.93 * tw; col[i * 3 + 2] = 0.55 * tw;
      }
      this.ffGeo.attributes.position.needsUpdate = true;
      this.ffGeo.attributes.color.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Stickers

const ICON = {
  block: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="currentColor" opacity=".9"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="#fff" stroke-width="1.2" opacity=".6"/>',
  stack: '<path d="M4 15l8 4 8-4M4 11l8 4 8-4M12 3l8 4-8 4-8-4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  crown: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z" fill="currentColor"/>',
  boing: '<path d="M4 20h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M7 16c0-4 2-6 5-6s5 2 5 6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="6" r="3" fill="currentColor"/>',
  cart: '<rect x="4" y="8" width="16" height="8" rx="2.5" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/><circle cx="16" cy="18" r="2" fill="currentColor"/>',
  loop: '<circle cx="12" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M3 19h18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  star: '<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" fill="currentColor"/>',
  bunny: '<ellipse cx="9" cy="6" rx="2" ry="4.5" fill="currentColor"/><ellipse cx="15" cy="6" rx="2" ry="4.5" fill="currentColor"/><circle cx="12" cy="15" r="6" fill="currentColor"/>',
  heart: '<path d="M12 20C4 14 4 7 8.5 6S12 9 12 9s-.5-2 3.5-3S20 14 12 20z" fill="currentColor"/>',
  carrot: '<path d="M6 19l9-9 2 2-9 9c-1 1-3 0-2-2z" fill="currentColor"/><path d="M15 9l3-5M15 9l5-2M15 9l2-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  butterfly: '<path d="M12 12C9 6 4 5 4 9s4 4 8 3zM12 12c3-6 8-7 8-3s-4 4-8 3zM12 12c-2 3-6 5-6 7s4 0 6-4zM12 12c2 3 6 5 6 7s-4 0-6-4z" fill="currentColor"/>',
  moon: '<path d="M15 3a8 8 0 1 0 6 13A7 7 0 0 1 15 3z" fill="currentColor"/>',
  firework: '<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></g>',
  note: '<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="7" cy="18" r="2.6" fill="currentColor"/><circle cx="17" cy="16" r="2.6" fill="currentColor"/>',
  lamp: '<circle cx="12" cy="10" r="5" fill="currentColor"/><path d="M9 17h6M10 20h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  portal: '<rect x="6" y="3" width="12" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="9" y="6" width="6" height="12" rx="1" fill="currentColor" opacity=".55"/>',
};

export const STICKERS = [
  { id: 'first', title: 'First block', hint: 'Build a block', icon: 'block', colour: '#7fb069' },
  { id: 'builder', title: 'Builder', hint: 'Build 100 blocks', icon: 'stack', colour: '#c99a66' },
  { id: 'master', title: 'Master builder', hint: 'Build 1,000 blocks', icon: 'crown', colour: '#e5c579' },
  { id: 'boing', title: 'Boing!', hint: 'Bounce on a cloud', icon: 'boing', colour: '#8daabb' },
  { id: 'ride', title: 'All aboard', hint: 'Ride the coaster', icon: 'cart', colour: '#c77d62' },
  { id: 'loop', title: 'Loop the loop', hint: 'Go round a loop', icon: 'loop', colour: '#e5b94f' },
  { id: 'loops10', title: 'Loop legend', hint: 'Go round 10 loops', icon: 'star', colour: '#f0a35e' },
  { id: 'portal', title: 'Bunny explorer', hint: 'Visit Bunny Meadow', icon: 'portal', colour: '#f49ac4' },
  { id: 'pet', title: 'Best friends', hint: 'Make a bunny your pet', icon: 'bunny', colour: '#f4a9c8' },
  { id: 'feed5', title: 'Bunny buffet', hint: 'Feed 5 bunnies', icon: 'heart', colour: '#ff7aa2' },
  { id: 'golden', title: 'Golden carrot', hint: 'Find a golden carrot', icon: 'carrot', colour: '#f5b82e' },
  { id: 'golden2', title: 'Treasure hunter', hint: 'Find both golden carrots', icon: 'crown', colour: '#ffcf3f' },
  { id: 'butterfly', title: 'Butterfly friend', hint: 'Set a butterfly free', icon: 'butterfly', colour: '#9fd8c0' },
  { id: 'night', title: 'Night owl', hint: 'See the stars come out', icon: 'moon', colour: '#5d6aa8' },
  { id: 'firework', title: 'Sky sparkles', hint: 'Launch a firework', icon: 'firework', colour: '#e05a7a' },
  { id: 'music', title: 'Music maker', hint: 'Play a note block', icon: 'note', colour: '#9c6b49' },
  { id: 'lamp', title: 'Light it up', hint: 'Power a lamp', icon: 'lamp', colour: '#f2c94c' },
];

export function stickerBadge(st, unlocked) {
  const fill = unlocked ? st.colour : '#d9ccb8';
  const glyph = unlocked ? ICON[st.icon] : '<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="800" fill="currentColor">?</text>';
  return `<span class="badge${unlocked ? '' : ' locked'}" style="--b:${fill}"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">${glyph}</svg></span>`;
}

// ---------------------------------------------------------------------------------------------------------
// Screen-space celebrations (DOM): confetti, pop-up cards, big cheers

const CONFETTI = ['#c77d62', '#e5c579', '#7fb069', '#8daabb', '#f4a9c8', '#9fd8c0', '#fffaf3'];

export function confetti(count = 46) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.getElementById('confetti');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const x = rand(5, 95);
    p.style.left = `${x}vw`;
    p.style.background = CONFETTI[i % CONFETTI.length];
    p.style.setProperty('--dx', `${rand(-18, 18)}vw`);
    p.style.setProperty('--r', `${rand(-540, 540)}deg`);
    p.style.animationDuration = `${rand(1.4, 2.3)}s`;
    p.style.animationDelay = `${rand(0, 0.25)}s`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    frag.appendChild(p);
  }
  layer.appendChild(frag);
  setTimeout(() => { for (let i = 0; i < count && layer.firstChild; i++) layer.removeChild(layer.firstChild); }, 2800);
}

const queue = [];
let showing = false;
/** Slide-in card at the top: { badge?, kicker, title, line } */
export function celebrate(card) {
  queue.push(card);
  if (!showing) next();
}
function next() {
  const el = document.getElementById('celebrate');
  const card = queue.shift();
  if (!card) { showing = false; return; }
  showing = true;
  el.innerHTML = `${card.badge || ''}<div><div class="kicker">${card.kicker}</div><div class="ctitle">${card.title}</div>${card.line ? `<div class="cline">${card.line}</div>` : ''}</div>`;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  setTimeout(() => { el.classList.remove('on'); setTimeout(next, 350); }, card.ms || 3200);
}

let cheerTimer = 0;
export function cheer(text, sub = '') {
  const el = document.getElementById('cheer');
  el.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(() => el.classList.remove('on'), 1400);
}
