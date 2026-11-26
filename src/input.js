// Unified input: touch (floating joystick, drag-to-look, tap to build, hold to break) and
// desktop (pointer lock mouse look, WASD, clicks). Exposes plain state; no per-frame allocation.

const HOLD_MS = 380;
const REPEAT_MS = 240;
const TAP_MOVE = 12;

export class Input {
  constructor(layer, handlers) {
    this.layer = layer;
    this.h = handlers; // { onTap(x,y), onHold(x,y), onHoldStart(x,y), onHoldEnd(), onLookStart(), isPaused() }
    this.move = { x: 0, z: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.jump = false;
    this.down = false;
    this.keys = new Set();
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.locked = false;
    this.sensitivity = 1;
    this.joy = null;
    this.look = null;
    this.joyEl = document.getElementById('joy');
    this.knobEl = document.getElementById('joy-knob');
    this.holdEl = document.getElementById('hold-ring');
    this.bind();
  }

  bind() {
    const L = this.layer;
    L.addEventListener('pointerdown', (e) => this.pdown(e));
    window.addEventListener('pointermove', (e) => this.pmove(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.pup(e));
    window.addEventListener('pointercancel', (e) => this.pup(e, true));
    L.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      this.h.onKey?.(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.layer;
      this.h.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX * 0.0022 * this.sensitivity;
      this.lookDY += e.movementY * 0.0022 * this.sensitivity;
    });
    this.layer.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.h.onBreak?.();
      if (e.button === 2) this.h.onPlace?.();
    });
    // Scroll to change block. Trackpads send a stream of tiny deltas, so add them up and step at most
    // one slot per short interval; a mouse wheel notch (~100) still moves exactly one slot.
    this.wheelAcc = 0; this.wheelLast = 0; this.wheelStep = 0;
    const onWheel = (e) => {
      if (this.h.isPaused()) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const now = performance.now();
      if (now - this.wheelLast > 220) this.wheelAcc = 0;
      this.wheelLast = now;
      this.wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(this.wheelAcc) >= 70 && now - this.wheelStep > 190) {
        this.h.onWheel?.(Math.sign(this.wheelAcc));
        this.wheelAcc = 0;
        this.wheelStep = now;
      }
    };
    this.layer.addEventListener('wheel', onWheel, { passive: true });
    document.getElementById('hotbar').addEventListener('wheel', onWheel, { passive: true });
  }

  pdown(e) {
    if (this.h.isPaused()) return;
    if (e.pointerType === 'mouse') {
      this.touchMode = false;
      if (!this.locked && this.h.canLock()) this.layer.requestPointerLock?.();
      return;
    }
    this.touchMode = true;
    this.h.onAnyTouch?.();
    const leftZone = e.clientX < window.innerWidth * 0.42 && e.clientY > window.innerHeight * 0.3;
    if (leftZone && !this.joy) {
      this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), far: 0 };
      this.joyEl.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 60}px)`;
      this.joyEl.classList.add('on');
      this.knobEl.style.transform = 'translate(0px, 0px)';
      return;
    }
    if (!this.look) {
      const now = performance.now();
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: now, moved: false, holding: false, lastBreak: 0 };
      this.holdTimer = setTimeout(() => this.startHold(), HOLD_MS);
    }
  }

  startHold() {
    const l = this.look;
    if (!l || l.moved) return;
    l.holding = true;
    l.lastBreak = performance.now();
    this.holdEl.style.transform = `translate(${l.x - 28}px, ${l.y - 28}px)`;
    this.holdEl.classList.add('on');
    navigator.vibrate?.(10);
    this.h.onHold?.(l.x, l.y);
  }

  pmove(e) {
    if (this.joy && e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y;
      const d = Math.hypot(dx, dy), max = 46;
      this.joy.far = Math.max(this.joy.far, d);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      // gentle dead zone + response curve for fine control
      const m = Math.min(1, d / max);
      const k = m < 0.12 ? 0 : (m - 0.12) / 0.88;
      const n = d > 0 ? k / (Math.min(d, max) / max || 1) : 0;
      this.move.x = (dx / max) * n;
      this.move.z = (dy / max) * n;
      return;
    }
    const l = this.look;
    if (l && e.pointerId === l.id) {
      const dx = e.clientX - l.x, dy = e.clientY - l.y;
      l.x = e.clientX; l.y = e.clientY;
      if (!l.moved && Math.hypot(l.x - l.sx, l.y - l.sy) > TAP_MOVE) {
        l.moved = true;
        clearTimeout(this.holdTimer);
        if (l.holding) this.endHold();
      }
      if (l.moved) {
        this.lookDX += dx * 0.0058 * this.sensitivity;
        this.lookDY += dy * 0.0058 * this.sensitivity;
      }
    }
  }

  endHold() {
    if (this.look) this.look.holding = false;
    this.holdEl.classList.remove('on');
    this.h.onHoldEnd?.();
  }

  pup(e, cancel) {
    if (this.joy && e.pointerId === this.joy.id) {
      // A quick tap in the joystick area builds there, like anywhere else on screen
      const j = this.joy;
      if (!cancel && j.far < TAP_MOVE && performance.now() - j.t < 300) this.h.onTap?.(j.x, j.y);
      this.joy = null;
      this.move.x = this.move.z = 0;
      this.joyEl.classList.remove('on');
      this.knobEl.style.transform = 'translate(0px, 0px)';
      this.restJoystick();
      return;
    }
    const l = this.look;
    if (l && e.pointerId === l.id) {
      clearTimeout(this.holdTimer);
      if (!cancel && !l.moved && !l.holding && performance.now() - l.t < HOLD_MS) this.h.onTap?.(l.x, l.y);
      if (l.holding) this.endHold();
      this.look = null;
    }
  }

  /** Per-frame: repeats hold-to-break and folds keyboard state into movement. */
  update() {
    const l = this.look;
    if (l && l.holding && performance.now() - l.lastBreak > REPEAT_MS) {
      l.lastBreak = performance.now();
      this.h.onHold?.(l.x, l.y);
    }
    if (!this.touchMode || this.keys.size) {
      const k = this.keys;
      let x = 0, z = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      const n = Math.hypot(x, z) || 1;
      if (!this.joy) { this.move.x = x / n; this.move.z = z / n; }
      this.keyJump = k.has('Space');
      this.keyDown = k.has('ShiftLeft') || k.has('ShiftRight');
    }
  }

  consumeLook() {
    const r = [this.lookDX, this.lookDY];
    this.lookDX = this.lookDY = 0;
    return r;
  }

  reset() {
    this.joy = null;
    this.look = null;
    this.move.x = this.move.z = 0;
    this.joyEl.classList.remove('on');
    this.holdEl.classList.remove('on');
    this.knobEl.style.transform = 'translate(0px, 0px)';
    clearTimeout(this.holdTimer);
    this.restJoystick();
  }

  /** Parks the joystick at its resting spot (bottom-left, clear of the hotbar) so players can see where to put a thumb. */
  restJoystick() {
    if (this.joy) return;
    const bar = document.getElementById('hotbar').getBoundingClientRect();
    const left = 24 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-left')) || 0);
    const clearOfBar = bar.width === 0 || bar.left > left + 130;
    const bottom = clearOfBar ? innerHeight - 24 : bar.top - 18;
    this.joyEl.style.transform = `translate(${left}px, ${bottom - 120}px)`;
  }
}
