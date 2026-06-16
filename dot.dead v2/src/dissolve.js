// The dissolution finale. Taking the thirteenth paper does not carry you
// anywhere — over the next minute the world you are standing in loses its detail
// and falls apart into something crude, broken and barely-there.
//
// The pixels stay exactly the same size: this is NOT an image effect. The change
// is continuous and smooth — no five-second jumps, just a strangely shifting
// world — and it runs on two stacked stages:
//
//   1. boxify (0 → ~47 s): every object is morphed toward its own bounding box,
//      so spheres become cubes, cylinders and cones become blocks, a fence sheds
//      its detail to plain rectangles, a carved headstone becomes a slab.
//   2. fuse (≈27 → 60 s): the whole scene is snapped to a coarse world-space
//      grid, so those boxes weld together into a few big, ultra-primitive blocks
//      — roughly five times cruder than the boxes alone.
//
// In step the palette is merged down to a couple of flat bands (colours bleed
// to grey), the soundscape muffles through a closing lowpass, and the engraved
// hints on the graves corrupt letter by letter into gibberish. By ~60 s the
// world is at its most broken and primitive — and it simply stays there. (The
// fade-to-white ending is intentionally disabled for now.)

const Dissolve = (() => {
  // smoothstep ramp on [a,b]
  function sstep(a, b, x) {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  }

  function create(graveWorld, pix, rain) {
    const scene = graveWorld.scene;

    const T = 60;          // seconds to the fully-simplified world
    const GRID_MAX = 0.7;  // metres — the coarsest world fusion grid

    // shared by every patched material: how far vertices have morphed toward
    // their bounding box (uMorph), and the world-space grid they weld onto (uGrid)
    const morphU = { value: 0 };
    const gridU = { value: 0 };
    const patchedMats = new Set();
    const boxedGeos = new Set();

    let started = false;
    let active = false;
    let t = 0;

    // bake a per-vertex "boxified" target: the nearest corner of the geometry's
    // own bounding box. Shared geometries are baked once and cover every clone.
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

    // inject both stages into a built-in material:
    //   - morph object-space position toward the baked box corner (uMorph)
    //   - snap the resulting world-space position to a coarse grid (uGrid),
    //     which fuses neighbouring blocks together
    function patchMaterial(mat) {
      if (!mat || patchedMats.has(mat)) return;
      patchedMats.add(mat);
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uMorph = morphU;
        shader.uniforms.uGrid = gridU;
        let v = 'attribute vec3 aBox;\nuniform float uMorph;\nuniform float uGrid;\n' + shader.vertexShader;
        v = v.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  transformed = mix(transformed, aBox, uMorph);'
        );
        v = v.replace(
          '#include <project_vertex>',
          [
            'vec4 wp = modelMatrix * vec4( transformed, 1.0 );',
            'if (uGrid > 0.0001) { wp.xyz = floor(wp.xyz / uGrid + 0.5) * uGrid; }',
            'vec4 mvPosition = viewMatrix * wp;',
            'gl_Position = projectionMatrix * mvPosition;',
          ].join('\n')
        );
        shader.vertexShader = v;
      };
      mat.needsUpdate = true; // force a recompile so the injection takes effect
    }

    // one pass over the scene each frame, so chunks that have streamed in since
    // the start are boxified and patched too
    function prepareMeshes() {
      scene.traverse((o) => {
        if (!o.isMesh) return;
        boxifyGeometry(o.geometry);
        const m = o.material;
        if (Array.isArray(m)) m.forEach(patchMaterial);
        else if (m) patchMaterial(m);
      });
    }

    function start() {
      if (started) return;
      started = true;
      active = true;
      t = 0;
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

      // continuous, smooth progress — no stepped pulses. Everything is a smooth
      // function of p, so the world shifts strangely and steadily rather than
      // lurching every few seconds.
      const p = Math.min(1, t / T);

      const morph = sstep(0.00, 0.78, p); // parts → boxes, complete by ~47 s
      const fuse  = sstep(0.45, 1.00, p); // boxes weld into big blocks, 27 → 60 s
      const merge = sstep(0.40, 1.00, p); // palette merges flat, 24 → 60 s
      const corrupt = Math.min(1, p * 1.02); // hints corrupt from the very start
      const sound = p;

      prepareMeshes();
      morphU.value = morph;
      gridU.value = fuse * GRID_MAX;
      pix.setMerge(merge);
      if (typeof UI !== 'undefined' && UI.setCorruption) UI.setCorruption(corrupt);
      if (typeof Audio3D !== 'undefined') {
        Audio3D.degrade(sound);
        if (Audio3D.setMasterFade) Audio3D.setMasterFade(1 - 0.6 * sound); // muffled + distant, not silent
      }
    }

    return {
      start,
      update,
      get active() { return active; },
      // the world never disappears in this version, so there is always ground
      // and there are always blocks to bump into
      get collapsed() { return false; },
    };
  }

  return { create };
})();
