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
  // the finale: the last paper makes the world come apart (see src/dissolve.js)
  const dissolve = Dissolve.create(graveWorld, pix, rain);

  // controls reach the live world through a thin proxy. Once the world has
  // fully dissolved there is nothing left to bump into — drift freely in white.
  const worldForControls = {
    collidersNear: (x, z) => (dissolve.collapsed ? [] : activeWorld.collidersNear(x, z)),
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
    if (e.code === 'KeyP') dissolve.start(); // debug: trigger the dissolution now
    if (e.code === 'KeyE') {
      // E takes the paper you're aiming at
      if (aimedPaper) {
        const result = activeWorld.landmarks.collect(aimedPaper.type);
        if (result) {
          Audio3D.organFadeOut();
          UI.showQuote(result.quote, result.count, result.total);
          UI.setHint(null);
          aimedPaper = null;
          // the thirteenth paper: the world begins to come apart
          if (result.count >= result.total) dissolve.start();
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
  // The thirteenth paper triggers the dissolution (src/dissolve.js): the fog
  // lifts and the world itself simplifies and fades, step by step, until only an
  // empty white infinity remains. All state is in memory, so a reload returns to
  // a fresh hunt.

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update(dt);
    const p = controls.position;
    activeWorld.update(p.x, p.z, dt);
    rain.update(dt);
    dissolve.update(dt); // once the last paper is taken, the world comes apart
    compass.update(dt, p, controls.getState());

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
