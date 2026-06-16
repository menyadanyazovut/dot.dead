// The dissolution finale. Taking the thirteenth paper does not carry you
// anywhere — the world you are standing in loses its detail and falls apart.
//
// The pixels stay exactly the same size: this is NOT an image effect. Instead
// the geometry itself simplifies. Every object is morphed toward its own
// bounding box, so on a steady five-second pulse — 10% more each step — a tree
// slumps into a stack of cubes, a bush becomes a block, a wrought-iron fence
// sheds its pickets' detail down to plain rectangles, a carved headstone becomes
// a featureless slab. Spheres turn to cubes, cylinders and cones turn to boxes;
// everything in the graveyard is rebuilt from cruder and cruder primitives. In
// step, the whole synthesized soundscape muffles through a closing lowpass.
//
// At 35 s the objects also begin to fade — 20% opacity every five seconds. By
// ~50 s the world is as primitive as it can be; by ~60 s it has faded out
// completely and you are left standing in an empty, white infinity.

const Dissolve = (() => {
  function create(graveWorld, pix, rain) {
    const scene = graveWorld.scene;
    const WHITE = new THREE.Color(0xffffff);

    // shared by every patched material: how far each object has morphed from its
    // true shape toward its bounding box. 0 = the original detailed mesh; 1 = a
    // crude box. Each vertex carries its own corner target in the aBox attribute.
    const morphU = { value: 0 };
    const patchedMats = new Set();
    const boxedGeos = new Set();

    let baseSky = null;
    let started = false;
    let active = false;
    let collapsedFlag = false;
    let t = 0;
    let shownCollapse = 0; // eased mirrors of the stepped targets, so each
    let shownOpacity = 1;  // five-second step lands as a lurch, not a snap

    // bake a per-vertex "boxified" target: the nearest corner of the geometry's
    // own bounding box. Morphing a vertex toward it collapses the shape onto that
    // box — a sphere becomes a cube, a cylinder a block — while a part that is
    // already boxy (a fence picket, a slab) simply keeps its plain rectangle.
    function boxifyGeometry(geo) {
      if (!geo || boxedGeos.has(geo) || !geo.attributes || !geo.attributes.position) return;
      boxedGeos.add(geo);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const cx = (bb.min.x + bb.max.x) * 0.5;
      const cy = (bb.min.y + bb.max.y) * 0.5;
      const cz = (bb.min.z + bb.max.z) * 0.5;
      const pos = geo.attributes.position;
      const n = pos.count;
      const box = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        box[i * 3]     = pos.getX(i) < cx ? bb.min.x : bb.max.x;
        box[i * 3 + 1] = pos.getY(i) < cy ? bb.min.y : bb.max.y;
        box[i * 3 + 2] = pos.getZ(i) < cz ? bb.min.z : bb.max.z;
      }
      geo.setAttribute('aBox', new THREE.BufferAttribute(box, 3));
    }

    // inject the morph into a built-in material: lerp the object-space position
    // toward the baked box corner by the shared uMorph amount.
    function patchMaterial(mat) {
      if (!mat || patchedMats.has(mat)) return;
      patchedMats.add(mat);
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uMorph = morphU;
        shader.vertexShader =
          'attribute vec3 aBox;\nuniform float uMorph;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n  transformed = mix(transformed, aBox, uMorph);'
          );
      };
      mat.needsUpdate = true; // force a recompile so the morph takes effect
    }

    // one pass over the scene each frame: prepare every mesh (so chunks that have
    // streamed in are covered too) and, once the fade has begun, drop the opacity
    // of every material. Geometry must be boxified before — or in — the same
    // frame its material is patched, or the missing attribute would read zero.
    function applyToScene(opacity) {
      const fading = opacity < 0.999;
      scene.traverse((o) => {
        if (o.isMesh) {
          boxifyGeometry(o.geometry);
          const m = o.material;
          if (Array.isArray(m)) m.forEach(patchMaterial);
          else if (m) patchMaterial(m);
        }
        if (fading && o.material) {
          const m = o.material;
          const fade = (mm) => { mm.transparent = true; mm.opacity = opacity; mm.depthWrite = false; };
          if (Array.isArray(m)) m.forEach(fade);
          else fade(m);
        }
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

      applyToScene(shownOpacity);     // prepare meshes; fade them once fading
      morphU.value = shownCollapse;   // drive the geometry toward boxes
      pix.setWhiteout(1 - shownOpacity);
      if (typeof Audio3D !== 'undefined') {
        Audio3D.degrade(shownCollapse);
        Audio3D.setMasterFade(shownOpacity);
      }

      // the sky bleaches to white as the detail goes and the last objects fade
      if (baseSky && scene.background && scene.background.isColor) {
        const w = Math.min(1, shownCollapse * 0.5 + (1 - shownOpacity));
        scene.background.copy(baseSky).lerp(WHITE, w);
      }

      // once everything is essentially gone, report it so the player can drift
      // through the empty white with nothing left to collide against
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
