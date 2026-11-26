// Saves store only the edits on top of deterministic terrain, packed as base64 Uint32 pairs.
const KEY = 'mycraft.save.v1';
const SETTINGS = 'mycraft.settings.v1';

function packEdits(map) {
  const arr = new Uint32Array(map.size * 2);
  let k = 0;
  for (const [i, v] of map) { arr[k++] = i; arr[k++] = v; }
  const bytes = new Uint8Array(arr.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function unpackEdits(str) {
  if (!str) return [];
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const arr = new Uint32Array(bytes.buffer);
  const out = [];
  for (let k = 0; k + 1 < arr.length; k += 2) out.push([arr[k], arr[k + 1]]);
  return out;
}

export function saveGame(state) {
  try {
    const payload = {
      v: 1,
      seed: state.seed,
      dim: state.dim,
      player: state.player,
      hotbar: state.hotbar,
      fun: state.fun, // stats, stickers, pet, time of day
      worlds: Object.fromEntries(Object.entries(state.worlds).map(([k, w]) => [k, packEdits(w.edits)])),
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.v !== 1) return null;
    d.edits = Object.fromEntries(Object.entries(d.worlds || {}).map(([k, s]) => [k, unpackEdits(s)]));
    return d;
  } catch {
    return null;
  }
}

export function clearGame() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export function loadSettings() {
  try { return { music: true, sfx: true, sensitivity: 1, daynight: true, ...JSON.parse(localStorage.getItem(SETTINGS) || '{}') }; } catch { return { music: true, sfx: true, sensitivity: 1, daynight: true }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
