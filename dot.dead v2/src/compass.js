// The pocket compass. Press C to draw it from below the screen; it floats
// where a right hand would hold it. No cardinal letters — just a metal case
// and a needle under glass, pointing at the nearest unfound paper. It hangs
// with inertia: turning swings it sideways, running and jumping shake it,
// walking barely stirs it. C again puts it away. It now stays out even while
// wading — the old water-suppression has been removed.

const Compass = (() => {
  const SHOWN_Y = -0.5;
  const HIDDEN_Y = -2.1;
  const BASE_TILT = 1.05; // face tipped toward the viewer
  const SCALE = 2;        // overall size
  const HAND_X = 0.6;     // lateral offset — clearly in the right hand

  function create(camera, world) {
    const metal = new THREE.MeshLambertMaterial({ color: 0x4a4d54 });
    const metalDark = new THREE.MeshLambertMaterial({ color: 0x2c2e34 });
    const faceMat = new THREE.MeshLambertMaterial({ color: 0xcdc7b2 });
    const needleN = new THREE.MeshLambertMaterial({ color: 0x9c3232 });
    const needleS = new THREE.MeshLambertMaterial({ color: 0x595d66 });
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0xdfe8f0, transparent: true, opacity: 0.13, depthWrite: false,
    });

    const body = new THREE.Group();

    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.034, 14), metal);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.012, 14), metalDark);
    rim.position.y = 0.018;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.006, 14), faceMat);
    face.position.y = 0.018;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 6), metalDark);
    pin.position.y = 0.03;
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), metal);
    lug.position.set(0, 0.005, 0.115);
    lug.rotation.x = Math.PI / 2;

    // needle: red half points at the target
    const needle = new THREE.Group();
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.082, 4), needleN);
    tip.rotation.x = -Math.PI / 2; // cone +y → local -z (forward)
    tip.position.z = -0.041;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.082, 4), needleS);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = 0.041;
    needle.add(tip, tail);
    needle.position.y = 0.027;

    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.012, 14), glassMat);
    glass.position.y = 0.034;

    body.add(casing, rim, face, pin, lug, needle, glass);
    body.rotation.x = BASE_TILT;

    const holder = new THREE.Group();
    holder.add(body);
    holder.scale.setScalar(SCALE);
    holder.position.set(HAND_X, HIDDEN_Y, -1.05);
    holder.visible = false;
    camera.add(holder);

    // state
    let deployed = false;
    let sx = 0, sz = 0, vsx = 0, vsz = 0;   // swing angles + velocities
    let needleAngle = 0, needleVel = 0;
    let prevYaw = null, prevCamY = null;
    let t = 0;

    function wrap(a) {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    }

    function toggle() {
      deployed = !deployed;
      if (deployed) holder.visible = true;
      // pulling it out / putting it away jostles it
      vsx += deployed ? 0.9 : -0.5;
    }

    function impulse(j) {
      vsx += j;
      vsz += j * 0.4 * (Math.random() < 0.5 ? -1 : 1);
    }

    function update(dt, player, motion) {
      t += dt;

      // slide in/out of the pocket
      const targetY = deployed ? SHOWN_Y : HIDDEN_Y;
      holder.position.y += (targetY - holder.position.y) * (1 - Math.exp(-7 * dt));
      if (!deployed && holder.position.y < HIDDEN_Y + 0.08) {
        holder.visible = false;
        return;
      }

      // inertia inputs
      const yaw = camera.rotation.y;
      if (prevYaw === null) prevYaw = yaw;
      const dYaw = wrap(yaw - prevYaw);
      prevYaw = yaw;
      const camY = camera.position.y;
      if (prevCamY === null) prevCamY = camY;
      const dy = camY - prevCamY;
      prevCamY = camY;

      vsz += -dYaw * 1.7;        // turning → sideways sway (lags behind, like on a rope)
      vsx += -dy * 2.4;          // vertical motion (bob, jump, terrain) → pitch sway

      // gait shake: barely-there when walking, lively when running
      if (motion.speed > 0.4 && !motion.airborne) {
        const vigor = motion.running ? 0.85 : 0.14;
        vsx += Math.sin(t * (motion.running ? 11 : 7.5)) * vigor * dt;
        vsz += Math.cos(t * (motion.running ? 8.7 : 5.9)) * vigor * 0.7 * dt;
      }

      // damped spring
      const K = 42, C = 6.5;
      vsx += (-K * sx - C * vsx) * dt;
      vsz += (-K * sz - C * vsz) * dt;
      sx = Math.max(-0.6, Math.min(0.6, sx + vsx * dt));
      sz = Math.max(-0.6, Math.min(0.6, sz + vsz * dt));
      body.rotation.x = BASE_TILT + sx;
      body.rotation.z = sz;

      // needle → nearest unfound paper (approximate is fine; it's a compass)
      const info = world.landmarks.nearestPaperInfo(player.x, player.z);
      if (info) {
        const heading = Math.atan2(-(info.x - player.x), -(info.z - player.z)); // 0 = facing -z
        const diff = wrap(heading - yaw - needleAngle);
        needleVel += (diff * 26 - needleVel * 7.5) * dt;
        needleAngle += needleVel * dt;
      } else {
        // all 13 papers found: nothing left to point at — a slow, peaceful spin
        needleVel *= Math.exp(-3 * dt);
        needleAngle += (0.45 + needleVel) * dt;
      }
      needle.rotation.y = needleAngle + Math.sin(t * 6.7) * 0.012; // faint tremor
    }

    return { toggle, impulse, update, isDeployed: () => deployed };
  }

  return { create };
})();
