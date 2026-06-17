// First-person controls: pointer-lock mouse look, WASD, Shift to run,
// Space to jump. Colliders are queried per-frame from chunks around the
// player (the world is infinite).

const Controls = (() => {
  const WALK_SPEED = 4.2;   // m/s
  const RUN_SPEED = 12.95;  // 85% faster than the old 7.0
  const ZEN_SPEED = 2.2;    // slow, hands-off forward drift in zen mode
  const EYE = 1.6;
  const RADIUS = 0.45;
  const PITCH_LIMIT = Math.PI / 2 - 0.08;
  const STEP_WALK = 0.46;   // s between footsteps
  const STEP_RUN = 0.30;
  const JUMP_V = 4.4;       // m/s
  const GRAVITY = 11.5;     // m/s²

  function create(camera, world, domElement, hooks) {
    hooks = hooks || {};
    // targets move instantly with input; the camera eases toward them with
    // frame-rate-independent exponential smoothing → fluid at any refresh rate
    let yawT = 0, pitchT = 0;   // targets (raw input)
    let yaw = 0, pitch = 0;     // smoothed (what the camera uses)
    let vx = 0, vz = 0;         // smoothed velocity
    let smoothGy = null;        // smoothed ground height under the feet
    let lastRunning = false;
    let tester = false;         // secret tester mode: pure multipliers on top
                                // of the defaults — base movement untouched
    let zen = false;            // zen mode: hands-off slow walk down the road
    let zenYaw = 0;             // the road heading locked in when zen begins
    let bobT = 0;
    let stepT = 0;
    let jumpH = 0;
    let vy = 0;
    let airborne = false;
    let spaceHeld = false;       // tracks a held Space so auto-repeat can't re-fire
    let doubleJumpUsed = false;  // one extra mid-air jump per leap (tester only)
    const pos = new THREE.Vector3(0, EYE, 4);
    const keys = {};

    camera.rotation.order = 'YXZ';

    function locked() {
      return document.pointerLockElement === domElement;
    }

    domElement.addEventListener('click', () => {
      if (!locked()) domElement.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      if (!locked()) return;
      yawT -= e.movementX * 0.0024;
      pitchT -= e.movementY * 0.0024;
      pitchT = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitchT));
    });

    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      // no jumping until the game has started (pointer locked), and never in zen
      if (e.code === 'Space' && !spaceHeld && locked() && !zen) {
        // fresh press only (keydown auto-repeats while held)
        if (!airborne) {
          // 5× jump height in tester mode → √5 × launch velocity
          vy = JUMP_V * (tester ? Math.sqrt(5) : 1);
          airborne = true;
          doubleJumpUsed = false;
          if (hooks.onJump) hooks.onJump();
        } else if (tester && !doubleJumpUsed) {
          // tester-only double jump: a second leap while still in the air
          vy = JUMP_V * Math.sqrt(5);
          doubleJumpUsed = true;
          if (hooks.onJump) hooks.onJump();
        }
      }
      if (e.code === 'Space') spaceHeld = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
      if (e.code === 'Space') spaceHeld = false;
    });
    window.addEventListener('blur', () => {
      for (const k of Object.keys(keys)) keys[k] = false;
      spaceHeld = false;
    });

    function collides(x, z, colliders) {
      for (const c of colliders) {
        if (
          x > c.x - c.hw - RADIUS && x < c.x + c.hw + RADIUS &&
          z > c.z - c.hd - RADIUS && z < c.z + c.hd + RADIUS
        ) return true;
      }
      return false;
    }

    // frame-rate-independent smoothing factor
    function ease(rate, dt) {
      return 1 - Math.exp(-rate * dt);
    }

    function update(dt) {
      let fwd = 0;
      let strafe = 0;
      if (keys.KeyW || keys.ArrowUp) fwd += 1;
      if (keys.KeyS || keys.ArrowDown) fwd -= 1;
      if (keys.KeyA || keys.ArrowLeft) strafe -= 1;
      if (keys.KeyD || keys.ArrowRight) strafe += 1;
      // no walking until the game has started (pointer locked)
      if (!locked()) { fwd = 0; strafe = 0; }
      // zen mode: the player can't steer — face straight down the road and walk
      // slowly forward on autopilot (mouse + WASD are ignored)
      if (zen) {
        yawT = zenYaw; pitchT = 0;
        if (locked()) { fwd = 1; strafe = 0; } // auto-walk only while unpaused
      }
      const hasInput = fwd !== 0 || strafe !== 0;
      const running = !zen && hasInput && (keys.ShiftLeft || keys.ShiftRight);
      lastRunning = !!running;

      // look: ease toward the targets (gently in zen, so the heading aligns smoothly)
      const lookK = ease(zen ? 3 : 28, dt);
      yaw += (yawT - yaw) * lookK;
      pitch += (pitchT - pitch) * lookK;

      // velocity: accelerate toward the target, decelerate a bit softer
      let tx = 0, tz = 0;
      if (hasInput) {
        const len = Math.hypot(fwd, strafe);
        const speed = zen ? ZEN_SPEED : (running ? RUN_SPEED : WALK_SPEED) * (tester ? 10 : 1);
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = -fz, rz = fx;
        tx = ((fx * fwd + rx * strafe) / len) * speed;
        tz = ((fz * fwd + rz * strafe) / len) * speed;
      }
      const moveK = ease(hasInput ? 14 : 10, dt);
      vx += (tx - vx) * moveK;
      vz += (tz - vz) * moveK;

      const speedNow = Math.hypot(vx, vz);
      const moving = speedNow > 0.3;
      if (moving) {
        const nx = pos.x + vx * dt;
        const nz = pos.z + vz * dt;
        if (tester || zen) {
          // collision off in tester and zen (the road is clear)
          pos.x = nx;
          pos.z = nz;
        } else {
          const colliders = world.collidersNear(pos.x, pos.z);
          if (!collides(nx, pos.z, colliders)) pos.x = nx; else vx = 0;
          if (!collides(pos.x, nz, colliders)) pos.z = nz; else vz = 0;
        }
      }

      // zen: glide smoothly onto the centre of the stone road (x = 0), capped so
      // a far-off start drifts in rather than snapping
      if (zen) {
        const dx = -pos.x;
        pos.x += Math.sign(dx) * Math.min(Math.abs(dx), 5 * dt);
      }

      // jump physics
      if (airborne) {
        vy -= GRAVITY * dt;
        jumpH += vy * dt;
        if (jumpH <= 0) {
          jumpH = 0;
          vy = 0;
          airborne = false;
          if (hooks.onLand) hooks.onLand();
        }
      }

      // footsteps + head bob, grounded only
      if (hasInput && !airborne) {
        bobT += dt * (running ? 13 : 9);
        stepT += dt;
        const interval = running ? STEP_RUN : STEP_WALK;
        if (stepT >= interval) {
          stepT = 0;
          if (hooks.onStep) hooks.onStep(running);
        }
      } else if (!hasInput) {
        stepT = STEP_WALK * 0.6; // quick first step on restart
      }

      // ground height: eased so hill edges don't kick the camera
      const gy = world.groundHeight ? world.groundHeight(pos.x, pos.z) : 0;
      if (smoothGy === null) smoothGy = gy;
      smoothGy += (gy - smoothGy) * ease(16, dt);

      const bob = hasInput && !airborne ? Math.sin(bobT) * (running ? 0.05 : 0.035) : 0;
      camera.position.set(pos.x, smoothGy + EYE + jumpH + bob, pos.z);
      camera.rotation.set(pitch, yaw, 0);
      return moving;
    }

    return {
      update,
      position: pos,
      isLocked: locked,
      isAirborne: () => airborne,
      setTester: (v) => { tester = !!v; },
      isZen: () => zen,
      // enter/leave zen: on entry, lock the heading to whichever way down the
      // road we're already facing (no jarring 180° spin) and level the pitch
      setZen: (on) => {
        zen = !!on;
        if (zen) {
          const norm = Math.atan2(Math.sin(yaw), Math.cos(yaw));
          zenYaw = Math.abs(norm) < Math.PI / 2 ? 0 : Math.PI;
          pitchT = 0;
        }
      },
      // teleport: drop the player at a new spot/heading and clear all motion
      // state so there's no drift or camera kick on arrival (used by the finale)
      setPose: (x, z, ya) => {
        pos.x = x; pos.z = z;
        yawT = ya; yaw = ya;
        pitchT = 0; pitch = 0;
        vx = 0; vz = 0;
        smoothGy = null;
        jumpH = 0; vy = 0; airborne = false;
      },
      getState: () => ({ speed: Math.hypot(vx, vz), running: lastRunning, airborne }),
    };
  }

  return { create };
})();
