# MyCraft

Build with blocks, ride your own roller coaster, and hop through a carrot portal to Bunny Meadow. Runs in the browser, made for phones first.

Rebuilt from a first version made with Gemini (kept in `original/gemini-version.html`). The ideas are all the same: blocks, a bunny dimension behind a carrot portal, coaster track with loops, and generator, wire and piston circuits. The engine underneath is new.

## Run it

```bash
nvm use      # Node 22
npm ci
npm run dev  # http://localhost:5173
npm run build
```

Deployed as a static site on Cloudflare Pages (build `npm run build`, output `dist`).

## Audit of the original

| Area | Problem in the original | What MyCraft does |
|---|---|---|
| Rendering | One `Mesh` per block: about 3,000 draw calls for a tiny 33x33 world | Chunked meshes with hidden faces removed: 64 draw calls for a 128x128 world |
| Lighting | Flat Lambert colours | Baked ambient occlusion and face shading on an unlit material, which is cheaper and looks softer |
| Targeting | Three.js raycast against every block mesh every tap | Voxel grid walk (DDA), a few dozen lookups |
| Circuits | Flood fill re-run on every block placed, any block | Only runs when a circuit block changes. Pistons push chains, retract, and lamps light up |
| Portal | Frame check only worked for one exact shape | Flood fills any carrot frame (up to 24 cells), either direction. Breaking the frame closes it |
| Coaster | Track joined by "nearest block within 1.8", jerky straight lines, loop was a fake animation | Proper track connections including slopes, smooth curves, real vertical loops, gravity physics with chain lift, a three-car train and a rider camera |
| Controls | Fixed joystick, two buttons to build and break aimed at the screen centre | Floating joystick, tap where you want a block, hold to break, auto-jump onto steps, double-tap jump to fly |
| Saving | Manual Save button, whole world as JSON | Autosaves only your changes (a few KB) |
| Performance | No resolution control | Dynamic resolution keeps it smooth on slower phones; tab in the background pauses audio |
| Sound | None | Generative lo-fi soundtrack in the Cozy Coaster style, plus sound effects. All synthesised, no audio files |
| Load | Three.js from a CDN at run time | Bundled, about 165 KB gzipped, works offline after the first visit |

## Code map

- `src/world.js`: voxel storage, terrain for both worlds, power flow, track connections, portal detection
- `src/mesher.js`: chunk meshing with ambient occlusion; track, wire, piston and portal shapes
- `src/coaster.js`: track path building, loops, train physics and the ride camera
- `src/audio.js`: lo-fi music engine and sound effects
- `src/input.js`: touch and desktop controls
- `src/scenery.js`: sky, clouds and bunnies
- `src/logo.js`: the voxel wordmark
- `src/main.js`: game loop, building rules, UI
