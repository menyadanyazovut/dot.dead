// The summit — the finale's destination. Instead of teleporting to a separate
// empty field, the GRAVEYARD itself transforms: a giant mountain rises in its
// middle and the player is set on its peak. The graves and everything else stay
// where they are (down at the base); the fog clears and the view is thrown out
// to the horizon, so you see the land roll away naturally, the way it does when
// you climb something tall. Walk — or drop — down the slopes back into the
// graveyard.
//
// It exposes a small "world" the main loop can swap in: it reuses the
// graveyard's own scene, chunk streaming, graves and landmarks, and only
// overrides the ground height (to add the mountain) and collisions (off while
// you're up on the mountain, since the graves are buried far below).

const Summit = (() => {
  const PEAK = 280;    // mountain height in metres
  const BASE_R = 540;  // radius at which it meets the graveyard floor

  // the mountain as a smooth function of world position: a peaked dome with a
  // few ridges so the face looks natural, fading to nothing at the base.
  function mountain(x, z) {
    const r = Math.hypot(x, z);
    if (r >= BASE_R) return 0;
    const t = r / BASE_R;                                  // 0 centre → 1 base
    const profile = Math.pow(Math.cos(t * Math.PI * 0.5), 1.6); // steeper near the top
    const ridges = (Math.sin(x * 0.018) + Math.sin(z * 0.021) + Math.sin((x + z) * 0.012)) * 4 * (1 - t);
    return PEAK * profile + ridges;
  }

  // fresh, vivid grass for the summit terrain
  function grassTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#56953f';
    g.fillRect(0, 0, 64, 64);
    const tints = ['#6aac4c', '#4d8636', '#74b855', '#5a9b41', '#427a2c'];
    for (let i = 0; i < 1700; i++) {
      g.fillStyle = tints[(Math.random() * tints.length) | 0];
      g.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  // a gradient sky dome — deep blue overhead, pale at the horizon
  function skyDome() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2e6fc4');   // zenith
    grad.addColorStop(0.5, '#79afe6');
    grad.addColorStop(0.85, '#cfe6f5');
    grad.addColorStop(1, '#e2eff8');   // horizon
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(6000, 24, 16),
      new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, fog: false, depthWrite: false,
        transparent: true, opacity: 0,
      })
    );
    dome.renderOrder = -1;
    return dome;
  }

  function create(graveWorld, camera) {
    const scene = graveWorld.scene;

    // the player's ground is the real graveyard terrain plus the mountain
    const groundHeight = (x, z) => Terrain.groundHeight(x, z) + mountain(x, z);

    let built = false;
    let dome = null;
    let meshes = [];

    // built once when the finale begins, kept invisible until arrival so it
    // never flashes into the graveyard early
    function build() {
      if (built) return;
      built = true;

      // central mesh: high resolution, matches the player's ground exactly
      const CSIZE = 1500, CSEG = 240;
      const cgeo = new THREE.PlaneGeometry(CSIZE, CSIZE, CSEG, CSEG);
      cgeo.rotateX(-Math.PI / 2);
      let pos = cgeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        pos.setY(i, Terrain.groundHeight(x, z) + mountain(x, z) - 0.3); // just under the chunks
      }
      cgeo.computeVertexNormals();
      const ctex = grassTexture();
      ctex.wrapS = ctex.wrapT = THREE.RepeatWrapping;
      ctex.repeat.set(110, 110);
      const central = new THREE.Mesh(cgeo, new THREE.MeshLambertMaterial({ map: ctex }));
      central.visible = false;
      scene.add(central);

      // far mesh: low resolution, vast — the rolling land out to the horizon
      const FSIZE = 7000, FSEG = 160;
      const fgeo = new THREE.PlaneGeometry(FSIZE, FSIZE, FSEG, FSEG);
      fgeo.rotateX(-Math.PI / 2);
      pos = fgeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        pos.setY(i, Terrain.largeRoll(x, z) * Terrain.corridor(x) + mountain(x, z) - 1.0);
      }
      fgeo.computeVertexNormals();
      const ftex = grassTexture();
      ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping;
      ftex.repeat.set(340, 340);
      const far = new THREE.Mesh(fgeo, new THREE.MeshLambertMaterial({ map: ftex }));
      far.visible = false;
      scene.add(far);

      dome = skyDome();
      dome.visible = false;
      scene.add(dome);

      // bright daylight, added now but only meaningful once the meshes show
      const sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
      sun.position.set(-140, 320, 180);
      sun.visible = false;
      scene.add(sun);
      const sky = new THREE.HemisphereLight(0xbfe0ff, 0x4f7f3c, 0.75);
      sky.visible = false;
      scene.add(sky);

      meshes = [central, far, dome, sun, sky];
    }

    function activate() {
      build();
      for (const m of meshes) m.visible = true;
      camera.far = 8000;
      camera.updateProjectionMatrix();
    }

    // reveal progress 0..1 fades the sky dome in as the fog lifts
    function setReveal(k) {
      if (dome) dome.material.opacity = k;
    }

    const world = {
      scene,
      update: (px, pz, dt) => graveWorld.update(px, pz, dt), // graves keep streaming
      groundHeight,
      // collisions off while up on the mountain (the graves are buried below);
      // back on at the base so you don't walk through the stones
      collidersNear: (x, z) => (mountain(x, z) > 6 ? [] : graveWorld.collidersNear(x, z)),
      sitesNear: (x, z) => (mountain(x, z) > 6 ? [] : graveWorld.sitesNear(x, z)),
      landmarks: graveWorld.landmarks,
      spawn: { x: 0, z: 0, yaw: 0 }, // the centre; groundHeight puts you on the peak
    };

    return { world, build, activate, setReveal, mountain, peak: PEAK };
  }

  return { create };
})();
