// The dissolution finale. Taking the thirteenth paper does not carry you
// anywhere — the world you are standing in simply comes apart.
//
// The fog lifts (this is deliberately NOT a fog ending), and then, on a steady
// five-second pulse, everything in view loses 10% of its detail: object-space
// vertices snap to an ever-coarser grid so models shed their polygons and slump
// into primitives, the image chunks down toward a handful of giant pixels, the
// palette collapses from seven colour levels to two, and the whole synthesized
// soundscape muffles through a closing lowpass toward a dull, primitive tone.
//
// At 35 s the objects also begin to fade — 20% opacity every five seconds. By
// ~50 s the world is as simple and low-detail as it can be; by ~60 s it has
// faded out completely and you are left standing in an empty, white infinity.
//
// It drives three collaborators: the renderer (pixelate / posterize / white-out
// via pix.setDecay), the audio (Audio3D.degrade / setMasterFade), and every
// material in the scene (a shared quantisation uniform + a per-frame opacity).

const Dissolve = (() => {
  function create(graveWorld, pix, rain) {
    const scene = graveWorld.scene;
    const WHITE = new THREE.Color(0xffffff);

    // every patched material shares this uniform: the object-space grid size
    // that vertices snap to. 0 = untouched; grows to QMAX at full collapse.
    const quantU = { value: 0 };
    const QMAX = 2.4; // metres — the coarsest lattice, enough to blank a grave
    const patched = new Set();

    let baseSky = null;
    let started = false;
    let active = false;
    let collapsedFlag = false;
    let t = 0;
    let shownCollapse = 0; // eased mirrors of the stepped targets, so each
    let shownOpacity = 1;  // five-second step lands as a lurch, not a snap

    // inject a vertex-snapping prelude into a built-in material. Snapping the
    // object-space position to a grid merges nearby vertices and flattens curves
    // — the look of a model being decimated down to primitives.
    function patchMaterial(mat) {
      if (!mat || patched.has(mat)) return;
      patched.add(mat);
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uQuant = quantU;
        shader.vertexShader =
          'uniform float uQuant;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n  if (uQuant > 0.0001) { transformed = floor(transformed / uQuant + 0.5) * uQuant; }'
          );
      };
      mat.needsUpdate = true; // force a recompile so the prelude takes effect
    }

    function eachMaterial(fn) {
      scene.traverse((o) => {
        const m = o.material;
        if (!m) return;
        if (Array.isArray(m)) m.forEach((mm) => fn(mm, o));
        else fn(m, o);
      });
    }

    function start() {
      if (started) return;
      started = true;
      active = true;
      t = 0;
      baseSky = scene.background && scene.background.isColor
        ? scene.background.clone()
        : new THREE.Color(0xaab7c2);
      if (typeof Audio3D !== 'undefined') {
        Audio3D.silenceBirds();
        Audio3D.puff(); // a soft swell to mark the moment it begins
      }
      // stop the weather so it can't keep pulling the fog back in
      if (rain) {
        if (rain.hide) rain.hide();
        if (rain.releaseFog) rain.releaseFog();
      }
      // lift the fog clean past the view: the world must read sharply as it
      // falls apart, rather than dissolving into haze
      const fog = scene.fog;
      if (fog) { fog.near = 4000; fog.far = 9000; }
    }

    function update(dt) {
      if (!active) return;
      t += dt;

      // stepped targets, exactly on the five-second pulse:
      //   detail  −10% every 5 s  → bottoms out (0) at 50 s
      //   opacity −20% every 5 s after 35 s → reaches 0 at 60 s
      const detailLevel = Math.max(0, 1 - 0.1 * Math.floor(t / 5));
      const collapseTarget = 1 - detailLevel;
      const opacityTarget = t < 35 ? 1 : Math.max(0, 1 - 0.2 * Math.floor((t - 35) / 5));

      // ease toward the current step so it pops over ~0.4 s instead of jumping
      const k = 1 - Math.exp(-7 * dt);
      shownCollapse += (collapseTarget - shownCollapse) * k;
      shownOpacity += (opacityTarget - shownOpacity) * k;

      // drive the geometry, the image and the sound from the same collapse value
      quantU.value = shownCollapse * QMAX;
      pix.setDecay(shownCollapse, 1 - shownOpacity);
      if (typeof Audio3D !== 'undefined') {
        Audio3D.degrade(shownCollapse);
        Audio3D.setMasterFade(shownOpacity);
      }

      // patch any chunk that has streamed in since; once the fade phase begins
      // (opacity < 1) flip materials transparent and drop them toward nothing.
      // Before then they stay opaque, so the detail-loss phase has no transparent
      // sorting artefacts — only the geometry, image and palette are collapsing.
      const fading = shownOpacity < 0.999;
      eachMaterial((m, o) => {
        if (o.isMesh) patchMaterial(m);
        if (fading) {
          m.transparent = true;
          m.opacity = shownOpacity;
          m.depthWrite = false;
        }
      });

      // the sky bleaches to white as the detail goes and the last objects fade
      if (baseSky && scene.background && scene.background.isColor) {
        const w = Math.min(1, shownCollapse * 0.6 + (1 - shownOpacity));
        scene.background.copy(baseSky).lerp(WHITE, w);
      }

      // once everything is essentially gone, report it so the rest of the game
      // can let the player drift through the empty white (no more collisions)
      collapsedFlag = shownOpacity < 0.02;
    }

    return {
      start,
      update,
      get active() { return active; },
      get collapsed() { return collapsedFlag; },
    };
  }

  return { create };
})();
