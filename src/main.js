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
  const world = Scene3D.build(GRAVES);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
  world.scene.add(camera); // the compass is parented to the camera
  const pix = PixelRenderer.create(container);
  const compass = Compass.create(camera, world);
  const controls = Controls.create(camera, world, pix.renderer.domElement, {
    onStep: (running) => Audio3D.step(running),
    onLand: () => { Audio3D.land(); compass.impulse(0.55); },
    onJump: () => compass.impulse(0.35),
  });

  function onResize() {
    pix.resize(window.innerWidth, window.innerHeight, camera);
  }
  window.addEventListener('resize', onResize);
  onResize();

  world.update(0, 4);

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
    const papers = world.landmarks.papersNear(p.x, p.z);
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
      if (aimedPaper) {
        // aiming at a paper: E takes it
        const result = world.landmarks.collect(aimedPaper.type);
        if (result) {
          Audio3D.organFadeOut();
          UI.showQuote(result.quote, result.count, result.total);
          UI.setHint(null);
          aimedPaper = null;
        }
      } else {
        // otherwise: E draws / pockets the compass
        compass.toggle();
      }
    }
  });

  // nearest interactable: graves (r 2.6), landmarks (r 8)
  function nearestSite() {
    const p = controls.position;
    let best = null;
    let bestScore = Infinity;
    for (const site of world.sitesNear(p.x, p.z)) {
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

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update(dt);
    const p = controls.position;
    world.update(p.x, p.z, dt);
    compass.setSuppressed(Terrain.inWater(p.x, p.z)); // no compass while wading
    compass.update(dt, p, controls.getState());

    // the organ marks the nearest unfound paper
    Audio3D.updateOrgan(world.landmarks.nearestPaperDist(p.x, p.z));
    updatePaperAim();

    const near = nearestSite();
    if (near !== lastNear) {
      lastNear = near;
      if (!near) UI.hide();
      else UI.show(near.grave);
    }
    UI.setLabel(near ? near.grave.name : null);

    pix.render(world.scene, camera);
  }
  loop();
})();
