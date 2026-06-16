// Boot: merge grave data, infinite world, pixel renderer, controls, audio,
// proximity panel, paper pickup.

(() => {
  const NEAR_DIST = 2.6;
  const PAPER_REACH = 4.5; // hint distance; pickup needs aim + E

  // full pool = hand-curated tier 1 + lighter tier 2, overlaid with baked
  // GitHub data (stars, dates, last words) fetched by scripts/fetch-graves.mjs
  const GRAVES = FAMOUS_GRAVES.concat(typeof MORE_GRAVES !== 'undefined' ? MORE_GRAVES : []);
  if (typeof BAKED !== 'undefined') {
    for (const g of GRAVES) {
      const b = BAKED[g.repo];
      if (!b) continue;
      if (b.stars != null) g.stars = b.stars;
      if (b.born != null) g.born = b.born;
      if (b.archived != null) g.archived = b.archived;
      if (b.lastCommitDate) g.lastCommitDate = b.lastCommitDate;
      if (b.lastWords !== undefined) g.lastWords = b.lastWords;
      g.baked = true;
    }
  }

  const container = document.getElementById('game');
  const graveWorld = Scene3D.build(GRAVES);
  // far plane is generous so the towering Athena is visible across the field
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
  graveWorld.scene.add(camera); // the compass is parented to the camera

  // the graveyard is the active world; the finale swaps in a "summit" world that
  // reuses the same scene but adds the mountain. Controls/loop read activeWorld.
  let activeWorld = graveWorld;
  let onSummit = false;

  const pix = PixelRenderer.create(container);
  const compass = Compass.create(camera, graveWorld);
  const rain = Rain.create(graveWorld, camera);

  // controls reach the live world through a thin proxy, so a world swap is seamless
  const worldForControls = {
    collidersNear: (x, z) => activeWorld.collidersNear(x, z),
    groundHeight: (x, z) => activeWorld.groundHeight(x, z),
  };
  const controls = Controls.create(camera, worldForControls, pix.renderer.domElement, {
    onStep: (running) => {
      // a wet splash while wading (graveyard lakes only), a dry footstep otherwise
      if (!onSummit && Terrain.inWater(controls.position.x, controls.position.z)) Audio3D.splash(running);
      else Audio3D.step(running);
    },
    onLand: () => { Audio3D.land(); compass.impulse(0.55); },
    onJump: () => compass.impulse(0.35),
  });

  function onResize() {
    pix.resize(window.innerWidth, window.innerHeight, camera);
  }
  window.addEventListener('resize', onResize);
  onResize();

  graveWorld.update(0, 4);

  // Pointer lock <-> intro overlay; audio starts on first gesture
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === pix.renderer.domElement) {
      UI.dismissIntro();
      Audio3D.start();
    } else {
      UI.showIntro();
    }
  });
  document.getElementById('intro').addEventListener('click', () => {
    pix.renderer.domElement.requestPointerLock();
    Audio3D.start();
  });

  // paper pickup: aim at the glowing sheet and press E
  const raycaster = new THREE.Raycaster();
  let aimedPaper = null;

  function updatePaperAim() {
    aimedPaper = null;
    const p = controls.position;
    const papers = activeWorld.landmarks.papersNear(p.x, p.z);
    let nearD = Infinity;
    let anyClose = false;
    for (const paper of papers) {
      if (paper.d < nearD) nearD = paper.d;
      if (paper.d < PAPER_REACH) anyClose = true;
    }
    if (anyClose) {
      raycaster.setFromCamera({ x: 0, y: 0 }, camera);
      for (const paper of papers) {
        if (paper.d >= PAPER_REACH) continue;
        const hits = raycaster.intersectObject(paper.group, true);
        if (hits.length && hits[0].distance < PAPER_REACH + 1) {
          aimedPaper = paper;
          break;
        }
      }
      UI.setHint(aimedPaper ? '[E] take the paper' : 'aim at the paper · press E');
    } else {
      UI.setHint(null);
    }
  }

  // secret tester mode: Q + T together toggles it (undocumented on purpose)
  let qDown = false;
  let tDown = false;
  let comboLatch = false;
  let testerOn = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyQ') qDown = true;
    if (e.code === 'KeyT') tDown = true;
    if (qDown && tDown && !comboLatch) {
      comboLatch = true; // one toggle per simultaneous press
      testerOn = !testerOn;
      controls.setTester(testerOn);
      UI.setTester(testerOn);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyQ') { qDown = false; comboLatch = false; }
    if (e.code === 'KeyT') { tDown = false; comboLatch = false; }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') Audio3D.toggleMute();
    if (e.code === 'KeyE') {
      // E takes the paper you're aiming at
      if (aimedPaper) {
        const result = activeWorld.landmarks.collect(aimedPaper.type);
        if (result) {
          Audio3D.organFadeOut();
          UI.showQuote(result.quote, result.count, result.total);
          UI.setHint(null);
          aimedPaper = null;
          // the thirteenth paper: the fog comes for the world
          if (result.count >= result.total) startFinale();
        }
      }
    }
    if (e.code === 'KeyC') {
      // C draws / pockets the compass
      compass.toggle();
    }
  });

  // nearest interactable: graves (r 2.6), landmarks (r 8)
  function nearestSite() {
    const p = controls.position;
    let best = null;
    let bestScore = Infinity;
    for (const site of activeWorld.sitesNear(p.x, p.z)) {
      const r = site.radius || NEAR_DIST;
      const d = Math.hypot(site.x - p.x, site.z - p.z);
      if (d < r && d / r < bestScore) {
        bestScore = d / r;
        best = site;
      }
    }
    return best;
  }

  let lastNear = null;
  const clock = new THREE.Clock();

  // --- the finale ------------------------------------------------------------
  // Taking the last paper draws in an extreme fog: it thickens over 3 s to ten
  // times the usual density, holds for 7 s, then closes to a total white-out
  // over 3 s. At the white-out the graveyard transforms — a giant mountain has
  // risen in its middle and the player is standing on its peak; the fog then
  // lifts over ~6 s to reveal a clear sky and the land rolling to the horizon.
  // All state is in memory, so a reload returns to a fresh hunt.
  const summit = Summit.create(graveWorld, camera);
  const greySky = new THREE.Color(0xaab7c2);    // the graveyard's own sky/fog
  const whiteFog = new THREE.Color(0xeef5f8);   // the bright fog of the crossing
  const horizonBlue = new THREE.Color(0xcfe6f5); // the cleared summit haze
  const fogColor = new THREE.Color();
  const EXTREME_FAR = 3.4;                       // 10× denser than the usual 34 m

  let finaleStarted = false;
  let finaleActive = false;
  let finaleT = 0;
  let arrived = false;
  let vivid = 0; // eased clear-day grade, driven on the summit
  // fog state captured at the trigger so the thickening starts from wherever
  // the weather already was — no instant jump
  let startNear = 10;
  let startFar = 34;
  const startFogColor = new THREE.Color();

  function startFinale() {
    if (finaleStarted) return;
    finaleStarted = true;
    finaleActive = true;
    finaleT = 0;
    arrived = false;
    Audio3D.puff();          // the gentle whoosh as the fog rushes in
    Audio3D.silenceBirds();
    rain.disable();          // the rain eases out smoothly...
    rain.releaseFog();       // ...while the finale takes over the fog
    summit.build();          // build the (hidden) mountain + horizon while the fog gathers
    const fog = graveWorld.scene.fog;
    startNear = fog.near;
    startFar = fog.far;
    startFogColor.copy(fog.color);
  }

  function arrive() {
    arrived = true;
    onSummit = true;
    activeWorld = summit.world;     // same scene; ground now includes the mountain
    summit.activate();              // show the mountain/horizon, daylight, far camera
    // set the player on the peak, still inside the white-out
    controls.setPose(summit.world.spawn.x, summit.world.spawn.z, summit.world.spawn.yaw);
  }

  function updateFinale(dt) {
    if (!finaleActive) return;
    finaleT += dt;
    const t = finaleT;
    if (!arrived) {
      const fog = graveWorld.scene.fog;
      let near, far, cloudFade;
      if (t < 3) {                       // thicken to 10× over 3 s, from wherever
        const k = t / 3;                 // the fog already was (rain or clear)
        near = startNear + (1 - startNear) * k;
        far = startFar + (EXTREME_FAR - startFar) * k;
        fogColor.copy(startFogColor).lerp(greySky, k); // settle to the grey base
        cloudFade = 1 - k;               // clouds fade out as the sky vanishes
      } else if (t < 10) {               // hold the extreme fog for 7 s
        near = 1; far = EXTREME_FAR; fogColor.copy(greySky); cloudFade = 0;
      } else {                           // close to a white-out over 3 s
        const k = Math.min(1, (t - 10) / 3);
        near = 1 + (0.1 - 1) * k;
        far = EXTREME_FAR + (0.4 - EXTREME_FAR) * k;
        fogColor.copy(greySky).lerp(whiteFog, k);
        cloudFade = 0;
      }
      fog.near = near;
      fog.far = far;
      fog.color.copy(fogColor);
      graveWorld.scene.background.copy(fogColor); // fold the sky into the fog
      graveWorld.setCloudFade(cloudFade);
      if (t >= 13) arrive();
    } else {                             // on the summit: lift the fog to the horizon
      const k = Math.min(1, (t - 13) / 6);
      const fog = graveWorld.scene.fog;
      const far = 0.4 * Math.pow(7000 / 0.4, k); // exponential, so the reveal rolls outward
      fog.far = far;
      fog.near = far * 0.25;
      fogColor.copy(whiteFog).lerp(horizonBlue, k);
      fog.color.copy(fogColor);
      graveWorld.scene.background.copy(fogColor);
      summit.setReveal(k);               // fade the blue sky dome in
      if (k >= 1) finaleActive = false;  // free roam — walk or drop down the mountain
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update(dt);
    const p = controls.position;
    activeWorld.update(p.x, p.z, dt);
    rain.update(dt); // after the finale starts, rain no longer touches the fog
    updateFinale(dt);
    compass.update(dt, p, controls.getState());

    // ease the clear-day grade in on the summit
    vivid += ((onSummit ? 1 : 0) - vivid) * (1 - Math.exp(-1.4 * dt));
    pix.setVivid(vivid);

    // the organ marks the nearest unfound paper (silent once all are found)
    Audio3D.updateOrgan(activeWorld.landmarks.nearestPaperDist(p.x, p.z));
    updatePaperAim();

    const near = nearestSite();
    if (near !== lastNear) {
      lastNear = near;
      if (!near) UI.hide();
      else UI.show(near.grave);
    }
    UI.setLabel(near ? near.grave.name : null);

    pix.render(activeWorld.scene, camera);
  }
  loop();
})();
