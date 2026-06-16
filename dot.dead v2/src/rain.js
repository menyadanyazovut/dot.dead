// Weather: occasional rain. Starts at random, never more than once every five
// minutes, and lasts two to three minutes. While it rains the sky and fog
// darken smoothly, a field of raindrop streaks falls around the player, the
// clouds dim, and the synthesized downpour (audio.js) fades in. Everything
// eases on intensity, so onset and clearing are gradual — no hard switch.

const Rain = (() => {
  const MIN_GAP = 300;        // seconds between rains: "no more than 1 in 5 min"
  const DUR_MIN = 120;        // 2 minutes
  const DUR_MAX = 180;        // 3 minutes
  const START_TC = 45;        // mean seconds before a start once the gap clears

  const COUNT = 520;          // raindrop streaks
  const RANGE = 16;           // horizontal half-extent around the player
  const TOP = 22;             // spawn height above the camera
  const BOTTOM = -6;          // recycle height below the camera
  const FALL = 24;            // m/s
  const LEN = 0.55;           // streak length
  const SLANT = 0.14;         // wind lean

  function create(world, camera) {
    const scene = world.scene;

    // raindrops as line segments (two verts per drop)
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 2 * 3);
    const drops = new Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      drops[i] = {
        x: (Math.random() * 2 - 1) * RANGE,
        y: Math.random() * (TOP - BOTTOM) + BOTTOM,
        z: (Math.random() * 2 - 1) * RANGE,
      };
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xaeb9c4, transparent: true, opacity: 0, depthWrite: false, fog: true,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    lines.visible = false;
    scene.add(lines);

    // sky / fog endpoints
    const baseSky = scene.background.clone();
    const rainSky = baseSky.clone().multiplyScalar(0.5); // a dark, wet slate
    const baseFar = scene.fog.far;

    let raining = false;
    let intensity = 0;          // smoothed 0..1
    let durLeft = 0;
    let cooldown = 30 + Math.random() * 60; // a short initial wait, then 5-min gaps
    let disabled = false;       // the finale switches the weather off for good
    let ownFog = true;          // once the finale owns the fog, rain stops touching it

    function update(dt) {
      // scheduling — heaven (disabled) forces any rain to clear and never starts
      if (disabled) {
        raining = false;
      } else if (raining) {
        durLeft -= dt;
        if (durLeft <= 0) {
          raining = false;
          cooldown = MIN_GAP; // enforce the five-minute minimum after each rain
        }
      } else {
        cooldown -= dt;
        if (cooldown <= 0 && Math.random() < dt / START_TC) {
          raining = true;
          durLeft = DUR_MIN + Math.random() * (DUR_MAX - DUR_MIN);
        }
      }

      // ease intensity toward the target (smooth onset/clearing, ~several sec)
      const target = raining ? 1 : 0;
      intensity += (target - intensity) * (1 - Math.exp(-0.5 * dt));
      if (intensity < 0.0005 && !raining) intensity = 0;

      // sky, fog, clouds — skipped once the finale has taken the fog over, so
      // the two systems never fight (rain still eases its drops + audio out)
      if (ownFog) {
        scene.background.copy(baseSky).lerp(rainSky, intensity);
        scene.fog.color.copy(scene.background);
        scene.fog.far = baseFar - 6 * intensity;
      }
      if (world.setCloudShade) world.setCloudShade(1 - 0.45 * intensity);

      // audio level follows the visual intensity
      if (typeof Audio3D !== 'undefined' && Audio3D.setRain) Audio3D.setRain(intensity);

      // raindrops
      const on = intensity > 0.003;
      lines.visible = on;
      mat.opacity = 0.5 * intensity;
      if (!on) return;

      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;
      lines.position.set(cx, 0, cz);
      const p = positions;
      for (let i = 0; i < COUNT; i++) {
        const d = drops[i];
        d.y -= FALL * dt;
        if (d.y < cy + BOTTOM) {
          d.y = cy + TOP + Math.random() * 4;
          d.x = (Math.random() * 2 - 1) * RANGE;
          d.z = (Math.random() * 2 - 1) * RANGE;
        }
        const o = i * 6;
        p[o] = d.x;            p[o + 1] = d.y;          p[o + 2] = d.z;
        p[o + 3] = d.x + SLANT; p[o + 4] = d.y - LEN;   p[o + 5] = d.z;
      }
      geo.attributes.position.needsUpdate = true;
    }

    // turn the weather off permanently; any active rain eases out smoothly
    function disable() { disabled = true; }

    // hand fog control to the finale; rain keeps easing its own drops + audio
    function releaseFog() { ownFog = false; }

    // current smoothed rain level (so the finale can ramp the fog from it)
    function level() { return intensity; }

    // cut the rain instantly and hide the drops (the finale takes over the fog,
    // so rain.update must no longer run — this clears any shower mid-fall)
    function hide() {
      disabled = true;
      raining = false;
      intensity = 0;
      lines.visible = false;
      mat.opacity = 0;
      if (typeof Audio3D !== 'undefined' && Audio3D.setRain) Audio3D.setRain(0);
    }

    return { update, disable, releaseFog, hide, level, isRaining: () => raining };
  }

  return { create };
})();
