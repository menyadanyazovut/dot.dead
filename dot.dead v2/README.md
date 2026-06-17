# dot.dead

A first-person, pixelated, infinite graveyard of discontinued software.
Walk a fog-bound field of 258 real dead projects, read their epitaphs and
final commits, find the 10 monuments of the legends, and collect the papers
they carry.

## Run

Open `index.html` in a browser. No build step, no server; the only external
dependency is the Three.js CDN.

## Controls

- **Click** — capture the mouse (pointer lock)
- **WASD / arrows** — walk, **Shift** — run, **Space** — jump, **mouse** — look
- Stand at a grave to read it
- **C** — draw / pocket the compass
- **E** — with a paper in your crosshair, take it
- **M** — mute, **ESC** — release the mouse / pause

## The look

Real low-poly 3D (Three.js r128) rendered into a 270px-tall target, upscaled
nearest-neighbor through a posterize + 4×4 Bayer-dither shader with a muted
overcast grade.

## The infinite graveyard

The world streams in 22 m chunks around the player, seeded by chunk
coordinates and hidden behind dense fog — no edges, no walls, identical on
revisit. Rolling hills, scattered shallow **lakes** (small enough that the
far shore is always visible through the fog; knee-deep at worst, with sandy
shores), and a flat
flagstone path that runs forever. Each chunk gets a painted ground texture
(grass, wildflowers, fallen leaves, flagstones, lake beds), graves from a
pool of 258 — names **engraved** on every flat-faced stone, every stone a
real project — scruffy flora, fences, and crows. Above, a wind-driven field
of layered cumulus drifts and wraps around the player, so the sky is never
empty. Shared template geometry, bounded chunk cache, at most 2 fresh chunks
built per frame: memory stays flat and boundary crossings never hitch.

## Landmarks & the thirteen papers

Ten legendary dead products (Flash, IE, Netscape, Windows XP, Google
Wave, GeoCities, Winamp, Vine, AIM, Napster) have
unique monuments — metaphors, not logos — placed roughly one per 350 m. From
afar: a dark silhouette in the fog. Up close: the monument, carrying one
glowing paper with a quote. A synthesized organ sounds from each unfound
paper, barely audible at silhouette range, soft and clear up close. Take the
paper (aim + E): the organ fades over 5 s, the quote and the gold counter
(n/10) both show for 10 s and fade together. Progress resets on reload —
every visit is a fresh hunt. Taking the last paper begins the **dissolution**:
the fog lifts and, smoothly and continuously over a minute, the world itself
loses its detail and breaks down. The pixels stay the same size — this is not an
image effect — and there are no stepped jumps; the world simply shifts strangely
and steadily. Two stages stack: every object is first morphed toward its own
bounding box (spheres → cubes, cylinders and cones → boxes, a fence → plain
rectangles, a carved headstone → a slab), then the whole scene is welded onto a
coarse horizontal grid so those boxes weld into a single ultra-primitive shape
per object — a tree into one upright rectangle, a bush into a block, the road
into a flat, near-colourless strip. In step the palette merges down to a couple
of flat bands, the soundscape muffles to a dull distant tone, and the engraved
hints on the graves corrupt letter by letter into gibberish (each string keeps
its length). By ~80 s the world is at its most broken and primitive; after ~10 s
more wandering the ruin, a `dot.dead` end card fades in at the top with the dates
and a couple of parting hints. (See `src/dissolve.js`. The fade-to-white ending
is disabled for now.)

The **compass** (E) slides up from your pocket: a metal case and a needle
under glass, no letters. The needle always points to the nearest unfound
paper — an expanding deterministic search, so it works even when the next
paper is kilometers away; when all 10 are found it spins slowly, at peace.
It hangs with inertia — turning swings it, running and jumping shake it,
walking barely stirs it.

## Crows

Many trees — dry and green alike — hold a crow. Step right up to one and it
takes off with a sharp, hostile scream (1.7× the background calls),
wingbeats, and a slow climb until the fog swallows it.

## Content & data

Two tiers: 36 fully hand-written graves (`src/data/famousGraves.js`) and 222
lighter entries (`src/data/moreGraves.js`) — every one with a real, known
cause of death. Run `scripts/fetch-graves.mjs` with a `GITHUB_TOKEN` to bake
live stars, dates, and **last words** (each repo's final commit + committer)
into `src/data/baked.js`; the site then makes zero API calls at runtime. The
script validates every repo and reports 404s/renames. Without baked data the
site still works from editorial estimates, refreshing quietly per visited
grave when the API answers.

## Sound

All synthesized with the Web Audio API — no asset files, nothing to license:
LFO-gusted wind, distant crows every 7–20 s (a raspy amplitude-modulated
croak, true to the real bird), footsteps synced to the walk cycle (harder
when running), a landing thump, the startled crow's double alarm-caw at
1.7×, and the papers' organ (stacked sine partials, slow modal chords,
distance-driven volume). Starts on the first click; M mutes.

## Smoothness

Mouse look, velocity, and camera height all use frame-rate-independent
exponential smoothing — no snapping. rAF renders at the display's native
refresh rate; the low-res target keeps the GPU loafing at any Hz.

## Structure

```
index.html
styles.css
src/
  main.js               boot, loop, site dispatch, paper pickup, E-key logic
  scene.js              chunk streaming, ground textures, stones, flora,
                        fences, crows, fog
  terrain.js            shared height math: hills, cleft, path corridor
  landmarks.js          13 monuments, silhouettes, papers + quotes, layout
  compass.js            the pocket compass: springs, needle, deploy animation
  render.js             low-res render target + posterize/dither shader
  controls.js           smoothed FP movement, run/jump, collision
  audio.js              wind / crows / steps / landing / organ
  ui.js                 panels, quote display, counter, pickup hint
  github.js             GitHub API client (quiet refresh fallback)
  data/famousGraves.js  36 hand-curated graves (tier 1)
  data/moreGraves.js    222 lighter graves (tier 2)
  data/baked.js         generated GitHub data (scripts/fetch-graves.mjs)
scripts/
  fetch-graves.mjs      bakes live GitHub data; validates all repos
```
