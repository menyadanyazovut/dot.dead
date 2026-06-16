// Infinite graveyard: deterministic chunks around the player, dense fog.
// Detail pass: per-chunk painted ground textures (speckled grass, flowers,
// flagstone path), bushes, wrought-iron fence segments, 7 tombstone types.
// Everything heavy is a shared template cloned per chunk; per-chunk uniques
// (ground geometry + texture) are disposed on eviction.

const Scene3D = (() => {
  const CHUNK = 22;          // meters per chunk side
  const VIEW_RADIUS = 2;     // chunks loaded in each direction (5×5)
  const CACHE_MAX = 140;     // retained chunks before eviction
  const GROUND_SEG = 12;
  const TEX = 192;           // ground texture resolution per chunk (~8.7 px/m)

  const COLORS = {
    sky: 0xaab7c2,
    grassA: [78, 107, 58], grassB: [60, 85, 45], grassC: [93, 122, 68],
    dirt: [107, 90, 64], dirtDark: [89, 74, 53],
    flag: [118, 124, 148], grout: [46, 49, 60],
    stone: 0x9aa0a8,
    trunk: 0x453724,
    deadBark: 0x52493e,
    // melancholic foliage: muted greens, sickly olives, dry browns
    leafHealthy: [0x2f4527, 0x26391d, 0x3a512f],
    leafFaded: [0x4d5435, 0x565a40, 0x434b30],
    leafDry: [0x5d4f35, 0x4e4030],
    pine: 0x243a26, pineFaded: 0x46503a,
    berry: 0x5d2f35,
    mound: 0x554734,
    iron: 0x23262b,
    cloud: 0xe4e9ec,
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function chunkSeed(cx, cz) {
    let h = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 0x5bd1e995) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
    return h;
  }

  // cheap 2D hash → [0,1), used per-texel and per-flagstone
  function hash2(i, j) {
    let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return ((h ^ (h >>> 12)) >>> 0) / 4294967296;
  }

  // terrain math lives in src/terrain.js (shared with landmark layout)
  const { terrainNoise, pathEdge, groundHeight, waterLevel } = Terrain;

  // --- shared templates -----------------------------------------------------
  function buildTemplates() {
    const rand = mulberry32(424242);
    const stoneMats = [];
    for (let i = 0; i < 6; i++) {
      stoneMats.push(new THREE.MeshLambertMaterial({
        color: new THREE.Color(COLORS.stone).multiplyScalar(0.8 + i * 0.05),
      }));
    }
    const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.trunk });
    const deadBarkMat = new THREE.MeshLambertMaterial({ color: COLORS.deadBark });
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const leafHealthy = COLORS.leafHealthy.map(lam);
    const leafFaded = COLORS.leafFaded.map(lam);
    const leafDry = COLORS.leafDry.map(lam);
    const pineMat = lam(COLORS.pine);
    const pineFadedMat = lam(COLORS.pineFaded);
    const berryMat = lam(COLORS.berry);
    const moundMat = new THREE.MeshLambertMaterial({ color: COLORS.mound });
    const moundGeo = new THREE.SphereGeometry(0.55, 8, 6);
    const ironMat = new THREE.MeshLambertMaterial({ color: COLORS.iron });

    function roundedSlab(mat) {
      const w = 0.85, h = 1.15, r = w / 2, d = 0.16;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(-w / 2, h - r);
      shape.absarc(0, h - r, r, Math.PI, 0, true);
      shape.lineTo(w / 2, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      geo.translate(0, 0, -d / 2);
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.18, 0.5), mat);
      base.position.y = 0.09;
      g.add(new THREE.Mesh(geo, mat), base);
      return g;
    }
    function cross(mat) {
      const g = new THREE.Group();
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.16), mat);
      v.position.y = 0.75;
      const hbar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.16), mat);
      hbar.position.y = 1.05;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.45), mat);
      base.position.y = 0.11;
      g.add(v, hbar, base);
      return g;
    }
    function obelisk(mat) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.4, 4), mat);
      shaft.position.y = 0.85;
      shaft.rotation.y = Math.PI / 4;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4), mat);
      tip.position.y = 1.7;
      tip.rotation.y = Math.PI / 4;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), mat);
      base.position.y = 0.15;
      g.add(shaft, tip, base);
      return g;
    }
    function slab(mat) {
      const g = new THREE.Group();
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 0.15), mat);
      s.position.y = 0.45;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.45), mat);
      base.position.y = 0.08;
      g.add(s, base);
      return g;
    }
    // new: celtic cross — cross with a ring at the intersection
    function celtic(mat) {
      const g = new THREE.Group();
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.45, 0.14), mat);
      v.position.y = 0.725;
      const hbar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.14), mat);
      hbar.position.y = 1.02;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.05, 6, 14), mat);
      ring.position.y = 1.02;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.45), mat);
      base.position.y = 0.11;
      g.add(v, hbar, ring, base);
      return g;
    }
    // new: gothic slab — pointed-arch top
    function gothic(mat) {
      const w = 0.8, shoulder = 0.85, apex = 1.35, d = 0.16;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(-w / 2, shoulder);
      shape.quadraticCurveTo(-w / 4, apex - 0.12, 0, apex);
      shape.quadraticCurveTo(w / 4, apex - 0.12, w / 2, shoulder);
      shape.lineTo(w / 2, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      geo.translate(0, 0, -d / 2);
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.26, 0.16, 0.48), mat);
      base.position.y = 0.08;
      g.add(new THREE.Mesh(geo, mat), base);
      return g;
    }
    // new: ledger — flat stone bed with a small headstone (no mound)
    function ledger(mat) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.66, 0.14), mat);
      head.position.y = 0.36;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 1.8), mat);
      bed.position.set(0, 0.07, 1.05);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 1.9), mat);
      rim.position.set(0, 0.04, 1.05);
      g.add(head, bed, rim);
      return g;
    }

    const KINDS = [roundedSlab, cross, obelisk, slab, celtic, gothic, ledger];
    const KIND_NAMES = ['rounded', 'cross', 'obelisk', 'slab', 'celtic', 'gothic', 'ledger'];
    const stones = [];
    for (const mat of stoneMats) {
      KINDS.forEach((make, k) => stones.push({ tpl: make(mat), kind: KIND_NAMES[k] }));
    }
    const NKINDS = KINDS.length;

    // --- trees: three species + withered/dead variants ----------------------
    // a branch whose origin sits at its base, so it can be angled from a trunk
    function branch(mat, len, r1, r2) {
      const geo = new THREE.CylinderGeometry(r1, r2, len, 4);
      geo.translate(0, len / 2, 0);
      return new THREE.Mesh(geo, mat);
    }
    function blob(r, mat) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      m.scale.y = 0.65 + rand() * 0.2;
      return m;
    }

    // pine: stacked cone tiers (reference, left tree)
    function pine(mat, faded) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.0, 5), trunkMat);
      trunk.position.y = 0.5;
      g.add(trunk);
      const tiers = faded ? 3 : 4; // withered pines thin out at the crown
      const radii = [1.1, 0.85, 0.62, 0.4];
      const ys = [1.25, 1.9, 2.5, 3.05];
      for (let i = 0; i < tiers; i++) {
        const tier = new THREE.Mesh(new THREE.ConeGeometry(radii[i] * (0.9 + rand() * 0.2), 1.05, 7), mat);
        tier.position.y = ys[i];
        tier.rotation.y = rand() * Math.PI;
        g.add(tier);
      }
      g.userData.perch = ys[tiers - 1] + 0.6; // the crown tip
      return g;
    }

    // oak: trunk + angled branches, irregular asymmetric canopy with a low
    // side puff (reference, middle tree)
    function oak(mats, big) {
      const g = new THREE.Group();
      const h = 1.7 + rand() * 0.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, h, 5), trunkMat);
      trunk.position.y = h / 2;
      g.add(trunk);

      const nBranch = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < nBranch; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const len = 0.7 + rand() * 0.5;
        const b = branch(trunkMat, len, 0.05, 0.09);
        b.position.set(side * 0.08, h - 0.5 + rand() * 0.45, (rand() - 0.5) * 0.1);
        b.rotation.z = side * -(0.6 + rand() * 0.5);
        b.rotation.y = rand() * 1.2;
        g.add(b);
        // puff at the branch tip — child of the branch, so it stays attached
        const m = blob(0.38 + rand() * 0.2, mats[Math.floor(rand() * mats.length)]);
        m.position.set(0, len * 0.95, 0);
        b.add(m);
      }

      // main canopy: clustered, uneven, deliberately not a ball
      const nBlobs = 5 + Math.floor(rand() * 3);
      for (let i = 0; i < nBlobs; i++) {
        const r = 0.5 + rand() * 0.45;
        const m = blob(r, mats[Math.floor(rand() * mats.length)]);
        m.position.set((rand() - 0.5) * 1.9, h + 0.5 + rand() * 0.9, (rand() - 0.5) * 1.6);
        g.add(m);
      }
      if (big) g.scale.setScalar(1.3);
      g.userData.perch = h + 1.35; // atop the canopy
      return g;
    }

    // dead tree: bare trunk and reaching branches, no leaves at all
    function deadTree() {
      const g = new THREE.Group();
      const h = 2.2 + rand() * 0.9;
      g.userData.perch = h; // where a crow may sit
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.19, h, 5), deadBarkMat);
      trunk.position.y = h / 2;
      g.add(trunk);
      const nBranch = 4 + Math.floor(rand() * 3);
      for (let i = 0; i < nBranch; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const len = 0.5 + rand() * 0.7;
        const b = branch(deadBarkMat, len, 0.02, 0.06);
        b.position.set(side * 0.05, h * (0.45 + rand() * 0.5), (rand() - 0.5) * 0.1);
        b.rotation.z = side * -(0.5 + rand() * 0.9);
        b.rotation.y = rand() * Math.PI;
        g.add(b);
        // a twig partway along the branch — child of the branch so it
        // inherits the full rotation and never floats free
        if (rand() < 0.6) {
          const t = branch(deadBarkMat, len * 0.45, 0.012, 0.025);
          t.position.set(0, len * 0.55, 0);
          t.rotation.z = (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.5);
          b.add(t);
        }
      }
      return g;
    }

    // half-bare: a dead skeleton clinging to its last faded leaves
    function halfBare() {
      const g = deadTree();
      // hang the last faded leaves directly on the branches
      const branches = g.children.filter((c) => c.geometry && c.geometry.type === 'CylinderGeometry' && c !== g.children[0]);
      const n = Math.min(branches.length, 2 + Math.floor(rand() * 2));
      for (let i = 0; i < n; i++) {
        const b = branches[(i * 2 + 1) % branches.length];
        const m = blob(0.3 + rand() * 0.2, (rand() < 0.5 ? leafFaded : leafDry)[Math.floor(rand() * 2)]);
        m.position.set(0, b.geometry.parameters.height * (0.6 + rand() * 0.35), 0);
        b.add(m);
      }
      return g;
    }

    // roughly: 33% healthy, 33% faded/withered, 33% dead or dying
    const trees = [
      pine(pineMat, false),
      pine(pineFadedMat, true),
      oak(leafHealthy, false),
      oak(leafHealthy, true),
      oak(leafFaded, false),
      oak([...leafFaded.slice(0, 1), ...leafDry], false),
      halfBare(),
      deadTree(),
      deadTree(),
    ];

    // --- bushes ----------------------------------------------------------------
    // green (3 templates): leaf blobs with twigs rooted INSIDE the foliage and
    // berries sitting on blob surfaces — nothing floats.
    // dry (2 templates): skeletal — bare branches radiating from the root with
    // small pointy dry clumps at some tips. Unmistakably not a green bush.
    const bushes = [];
    for (let i = 0; i < 3; i++) {
      const mats = i === 2 ? leafFaded : leafHealthy;
      const g = new THREE.Group();
      const blobRefs = [];
      const blobs = 3 + Math.floor(rand() * 3);
      for (let j = 0; j < blobs; j++) {
        const r = 0.28 + rand() * 0.3;
        const m = blob(r, mats[Math.floor(rand() * mats.length)]);
        m.position.set((rand() - 0.5) * 0.9, 0.18 + rand() * 0.16, (rand() - 0.5) * 0.9);
        m.scale.y = 0.55 + rand() * 0.2;
        m.userData.r = r;
        g.add(m);
        blobRefs.push(m);
      }
      // twigs grow out of blobs (child of a blob: base buried in foliage)
      const twigs = 1 + Math.floor(rand() * 2);
      for (let j = 0; j < twigs; j++) {
        const host = blobRefs[Math.floor(rand() * blobRefs.length)];
        const tw = branch(deadBarkMat, 0.35 + rand() * 0.25, 0.012, 0.022);
        tw.rotation.z = (rand() - 0.5) * 1.2;
        tw.rotation.x = (rand() - 0.5) * 0.6;
        host.add(tw); // origin at blob center → base always inside
      }
      // berries rest on blob surfaces
      if (i === 0) {
        for (let j = 0; j < 4; j++) {
          const host = blobRefs[Math.floor(rand() * blobRefs.length)];
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), berryMat);
          const a = rand() * Math.PI * 2;
          const r = host.userData.r * 0.92;
          b.position.set(Math.cos(a) * r * 0.8, r * 0.55, Math.sin(a) * r * 0.8);
          host.add(b);
        }
      }
      bushes.push(g);
    }
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const nBranches = 6 + Math.floor(rand() * 4);
      for (let j = 0; j < nBranches; j++) {
        const len = 0.45 + rand() * 0.4;
        const b = branch(deadBarkMat, len, 0.008, 0.022);
        const a = (j / nBranches) * Math.PI * 2 + rand() * 0.8;
        b.rotation.z = 0.5 + rand() * 0.7;  // splayed outward
        b.rotation.y = a;
        b.position.y = 0.02;
        g.add(b);
        // forked twig
        if (rand() < 0.7) {
          const tw = branch(deadBarkMat, len * 0.5, 0.005, 0.012);
          tw.position.set(0, len * 0.6, 0);
          tw.rotation.z = (rand() < 0.5 ? 1 : -1) * (0.6 + rand() * 0.5);
          b.add(tw);
        }
        // a few pointy dry clumps clinging to tips
        if (rand() < 0.35) {
          const clump = new THREE.Mesh(
            new THREE.TetrahedronGeometry(0.1 + rand() * 0.07, 0),
            leafDry[Math.floor(rand() * 2)]
          );
          clump.position.set(0, len * 0.95, 0);
          clump.rotation.set(rand() * 3, rand() * 3, rand() * 3);
          b.add(clump);
        }
      }
      bushes.push(g);
    }

    // flower clusters — tiny stems with colored heads
    const flowerHeads = [0xe8e4d8, 0xe0c95e, 0xc492a0].map(
      (c) => new THREE.MeshLambertMaterial({ color: c })
    );
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x3f5c33 });
    const stemGeo = new THREE.BoxGeometry(0.025, 0.2, 0.025);
    const headGeo = new THREE.BoxGeometry(0.07, 0.06, 0.07);
    const flowers = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const n = 2 + Math.floor(rand() * 3);
      for (let j = 0; j < n; j++) {
        const stem = new THREE.Mesh(stemGeo, stemMat);
        const x = (rand() - 0.5) * 0.4;
        const z = (rand() - 0.5) * 0.4;
        stem.position.set(x, 0.1, z);
        const head = new THREE.Mesh(headGeo, flowerHeads[i]);
        head.position.set(x, 0.22, z);
        g.add(stem, head);
      }
      flowers.push(g);
    }

    // wrought-iron fence segment, 5.5 m long along x (rotate to place along z)
    const fence = (() => {
      const g = new THREE.Group();
      const L = 5.5;
      for (const px of [-L / 2, L / 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), ironMat);
        post.position.set(px, 0.575, 0);
        const knob = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), ironMat);
        knob.position.set(px, 1.22, 0);
        g.add(post, knob);
      }
      for (const ry of [0.35, 0.95]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.04), ironMat);
        rail.position.y = ry;
        g.add(rail);
      }
      const pickets = 9;
      for (let i = 1; i < pickets; i++) {
        const x = -L / 2 + (L / pickets) * i;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.95, 0.035), ironMat);
        p.position.set(x, 0.62, 0);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), ironMat);
        tip.position.set(x, 1.15, 0);
        g.add(p, tip);
      }
      return g;
    })();

    // crow: minimal black bird for the dry trees
    const crowMat = new THREE.MeshLambertMaterial({ color: 0x17181d });
    function crow() {
      const g = new THREE.Group();
      const bodyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), crowMat);
      bodyMesh.scale.set(1, 0.8, 1.5);
      bodyMesh.position.y = 0.1;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), crowMat);
      head.position.set(0, 0.18, -0.1);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 4), crowMat);
      beak.rotation.x = -Math.PI / 2;
      beak.position.set(0, 0.17, -0.16);
      const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.12), crowMat);
      tailMesh.position.set(0, 0.11, 0.16);
      tailMesh.rotation.x = 0.25;
      const wingGeo = new THREE.BoxGeometry(0.16, 0.012, 0.09);
      const wL = new THREE.Mesh(wingGeo, crowMat);
      wL.name = 'wingL';
      wL.geometry = wingGeo;
      wL.position.set(-0.1, 0.13, 0);
      const wR = new THREE.Mesh(wingGeo, crowMat);
      wR.name = 'wingR';
      wR.position.set(0.1, 0.13, 0);
      g.add(bodyMesh, head, beak, tailMesh, wL, wR);
      return g;
    }
    const crowTpl = crow();

    // water surface: a shared unit disc, scaled per lake
    const waterGeo = new THREE.CircleGeometry(1, 22);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x42566a, transparent: true, opacity: 0.82,
    });

    return { stones, NKINDS, trees, bushes, flowers, fence, crowTpl, waterGeo, waterMat, moundGeo, moundMat };
  }

  // --- ground: painted per-chunk texture ------------------------------------
  function paintGround(originX, originZ) {
    const canvas = document.createElement('canvas');
    canvas.width = TEX;
    canvas.height = TEX;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(TEX, TEX);
    const d = img.data;
    const { grassA, grassB, grassC, dirt, dirtDark, flag, grout } = COLORS;

    for (let py = 0; py < TEX; py++) {
      const gz = originZ - CHUNK / 2 + ((py + 0.5) * CHUNK) / TEX;
      for (let px = 0; px < TEX; px++) {
        const gx = originX - CHUNK / 2 + ((px + 0.5) * CHUNK) / TEX;
        const n = terrainNoise(gx, gz);            // -1..1
        const h = hash2(px + (originX * 31) | 0, py + (originZ * 17) | 0); // texel jitter
        let r, g, b;

        if (Math.abs(gx) < pathEdge(gz)) {
          // flagstones: jittered rows of stone cells with dark grout
          const rowZ = Math.floor(gz / 0.85);
          const ox = hash2(rowZ, 7) * 0.6;
          const u = (gx + ox) / 0.85;
          const v = gz / 0.85;
          const fu = u - Math.floor(u);
          const fv = v - Math.floor(v);
          if (fu < 0.13 || fv < 0.15) {
            const k = 0.85 + h * 0.3;
            r = grout[0] * k; g = grout[1] * k; b = grout[2] * k;
          } else {
            const ch = hash2(Math.floor(u), Math.floor(v));
            const k = 0.66 + ch * 0.5 + (h - 0.5) * 0.1;
            r = flag[0] * k; g = flag[1] * k; b = flag[2] * k;
          }
          // dirt creeping in at the ragged edges
          if (Math.abs(gx) > pathEdge(gz) - 0.45) {
            const k = 0.9 + h * 0.25;
            r = dirt[0] * k; g = dirt[1] * k; b = dirt[2] * k;
          }
        } else {
          // grass: two-tone noise + speckle
          const t = Math.abs(n);
          const base = n > 0 ? grassC : grassB;
          r = grassA[0] + (base[0] - grassA[0]) * t;
          g = grassA[1] + (base[1] - grassA[1]) * t;
          b = grassA[2] + (base[2] - grassA[2]) * t;
          const k = 0.88 + h * 0.24;
          r *= k; g *= k; b *= k;
          // lake beds: a sandy shore ring, darker mud with depth
          const wl = waterLevel(gx, gz);
          if (wl !== null) {
            const depth = wl - groundHeight(gx, gz);
            if (depth > -0.14) {
              const k2 = 0.85 + h * 0.3;
              if (depth < 0.08) {
                // wet sand at the waterline
                r = 142 * k2; g = 126 * k2; b = 96 * k2;
              } else {
                const w = Math.min(1, depth / 0.6);
                r = (120 - 80 * w) * k2;
                g = (108 - 60 * w) * k2;
                b = (86 - 32 * w) * k2;
              }
            }
          }
          if (h > 0.994) {
            // scattered flowers
            const fh = hash2(px * 3, py * 5);
            if (fh < 0.45) { r = 226; g = 222; b = 208; }       // white
            else if (fh < 0.8) { r = 224; g = 201; b = 94; }    // yellow
            else { r = 196; g = 146; b = 160; }                 // pale pink
          } else if (h < 0.012) {
            // dead leaves / pebbles
            const k2 = 0.8 + h * 20;
            r = dirtDark[0] * k2; g = dirtDark[1] * k2; b = dirtDark[2] * k2;
          }
        }

        const o = (py * TEX + px) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function buildGroundChunk(originX, originZ) {
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, GROUND_SEG, GROUND_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i) + originX;
      const gz = pos.getZ(i) + originZ;
      pos.setY(i, groundHeight(gx, gz));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: paintGround(originX, originZ) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(originX, 0, originZ);
    return mesh;
  }

  // --- engraved name plaques ---------------------------------------------------
  // canvas-text materials cached per project name (graves repeat across chunks)
  const plaqueMatCache = new Map();
  let plaqueGeo = null;

  function plaqueMaterial(name) {
    let m = plaqueMatCache.get(name);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 28;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 96, 28);
    const text = String(name).toUpperCase();
    let size = 13;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    do {
      size--;
      ctx.font = `bold ${size}px monospace`;
    } while (size > 5 && ctx.measureText(text).width > 88);
    ctx.fillStyle = 'rgba(40, 42, 50, 0.88)'; // carved shadow
    ctx.fillText(text, 48, 15);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    m = new THREE.MeshLambertMaterial({ map: tex, transparent: true });
    plaqueMatCache.set(name, m);
    return m;
  }

  // stones with a flat face big enough to carve
  const PLAQUE_SPOTS = {
    rounded: { y: 0.74, z: 0.089 },
    slab: { y: 0.52, z: 0.084 },
    gothic: { y: 0.58, z: 0.089 },
  };

  // --- chunk assembly --------------------------------------------------------
  function buildChunk(cx, cz, templates, graves) {
    const rand = mulberry32(chunkSeed(cx, cz));
    const originX = cx * CHUNK;
    const originZ = cz * CHUNK;
    const group = new THREE.Group();
    group.add(buildGroundChunk(originX, originZ));

    // a lake whose center lies in this chunk gets its water disc
    const lake = Terrain.lakeInChunk(cx, cz);
    if (lake) {
      const water = new THREE.Mesh(templates.waterGeo, templates.waterMat);
      water.scale.set(lake.R * 1.03, 1, lake.R * 1.03);
      water.position.set(lake.x, lake.waterY, lake.z);
      group.add(water);
    }

    const sites = [];
    const colliders = [];

    function localSpot(margin) {
      return {
        x: originX + (rand() - 0.5) * (CHUNK - margin * 2),
        z: originZ + (rand() - 0.5) * (CHUNK - margin * 2),
      };
    }
    function placeable(p, extra) {
      if (Math.abs(p.x) <= pathEdge(p.z) + 1.6 + (extra || 0)) return false;
      if (!Landmarks.clearance(p.x, p.z)) return false;
      const wl = waterLevel(p.x, p.z);
      return wl === null || groundHeight(p.x, p.z) > wl + 0.2; // not in a lake
    }

    // graves: 3–6 per chunk
    const nGraves = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < nGraves; i++) {
      let p = null;
      for (let tries = 0; tries < 6; tries++) {
        const cand = localSpot(2.0);
        if (placeable(cand) && !colliders.some((co) => Math.hypot(co.x - cand.x, co.z - cand.z) < 3.4)) {
          p = cand;
          break;
        }
      }
      if (!p) continue;
      const gy = groundHeight(p.x, p.z);

      const grave = graves[(chunkSeed(cx, cz) + i * 7919) % graves.length];
      const matI = Math.floor(rand() * 6);
      let kindI = Math.floor(rand() * templates.NKINDS);
      if (grave.status === 'undead') kindI = 0; // the undead get tilted rounded slabs
      const entry = templates.stones[matI * templates.NKINDS + kindI];
      const stone = entry.tpl.clone();
      stone.position.set(p.x, gy, p.z);
      stone.rotation.y = (rand() - 0.5) * 0.3;
      stone.scale.setScalar(0.92 + rand() * 0.2);
      if (grave.status === 'undead') stone.rotation.z = 0.14 + rand() * 0.08;
      // engrave the project name on stones with a flat face
      const plaqueSpot = PLAQUE_SPOTS[entry.kind];
      if (plaqueSpot) {
        if (!plaqueGeo) plaqueGeo = new THREE.PlaneGeometry(0.6, 0.175);
        const plq = new THREE.Mesh(plaqueGeo, plaqueMaterial(grave.name));
        plq.position.set(0, plaqueSpot.y, plaqueSpot.z);
        stone.add(plq);
      }
      group.add(stone);

      if (entry.kind === 'ledger') {
        colliders.push({ x: p.x, z: p.z + 1.0, hw: 0.55, hd: 1.0 });
      } else {
        const md = new THREE.Mesh(templates.moundGeo, templates.moundMat);
        md.scale.set(1.0 + rand() * 0.3, 0.22, 1.6 + rand() * 0.3);
        md.position.set(p.x, groundHeight(p.x, p.z + 1.0) + 0.02, p.z + 1.0);
        group.add(md);
        colliders.push({ x: p.x, z: p.z, hw: 0.7, hd: 0.45 });
      }

      // some graves get flowers
      if (rand() < 0.4) {
        const fx = p.x + (rand() - 0.5) * 0.9;
        const fz = p.z + 1.7 + rand() * 0.4;
        const fl = templates.flowers[Math.floor(rand() * templates.flowers.length)].clone();
        fl.position.set(fx, groundHeight(fx, fz), fz);
        group.add(fl);
      }

      sites.push({ kind: 'grave', grave, x: p.x, z: p.z, radius: 2.6 });
    }

    // (no decorative nameless stones: every grave in the field is a real project)

    // trees — dry ones (the last three templates) sometimes hold a crow
    const crowSites = [];
    const nTrees = Math.floor(rand() * 3.4);
    for (let i = 0; i < nTrees; i++) {
      const p = localSpot(1.8);
      if (!placeable(p)) continue;
      const ti = Math.floor(rand() * templates.trees.length);
      const tpl = templates.trees[ti];
      const t = tpl.clone();
      t.position.set(p.x, groundHeight(p.x, p.z), p.z);
      t.rotation.y = rand() * Math.PI * 2;
      group.add(t);
      colliders.push({ x: p.x, z: p.z, hw: 0.4, hd: 0.4 });
      // crows: dry trees only, as in the beginning
      if (ti >= 6 && tpl.userData.perch && rand() < 0.18) {
        const c = templates.crowTpl.clone();
        c.position.set(0.04, tpl.userData.perch - 0.02, 0);
        c.rotation.y = rand() * Math.PI * 2;
        t.add(c);
        crowSites.push({ mesh: c, x: p.x, z: p.z, fled: false });
      }
    }

    // bushes (no collision — you can wade through)
    const nBushes = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < nBushes; i++) {
      const p = localSpot(1.2);
      if (!placeable(p, -0.8)) continue;
      const b = templates.bushes[Math.floor(rand() * templates.bushes.length)].clone();
      b.position.set(p.x, groundHeight(p.x, p.z), p.z);
      b.rotation.y = rand() * Math.PI * 2;
      b.scale.setScalar(0.7 + rand() * 0.7);
      group.add(b);
    }

    // loose flower patches on the grass
    const nFl = Math.floor(rand() * 3);
    for (let i = 0; i < nFl; i++) {
      const p = localSpot(1.0);
      if (!placeable(p)) continue;
      const fl = templates.flowers[Math.floor(rand() * templates.flowers.length)].clone();
      fl.position.set(p.x, groundHeight(p.x, p.z), p.z);
      fl.scale.setScalar(0.9 + rand() * 0.5);
      group.add(fl);
    }

    // wrought-iron fence stretches along the path (only in path chunks)
    if (Math.abs(originX) < CHUNK / 2 + 2) {
      for (const side of [-1, 1]) {
        if (rand() < 0.45) {
          const fz = originZ + (rand() - 0.5) * (CHUNK - 7);
          const fx = side * 4.1;
          const f = templates.fence.clone();
          f.position.set(fx, groundHeight(fx, fz), fz);
          f.rotation.y = Math.PI / 2; // run along z
          group.add(f);
          colliders.push({ x: fx, z: fz, hw: 0.15, hd: 2.75 });
        }
      }
    }

    return { group, sites, colliders, crowSites, key: `${cx},${cz}`, lastUsed: 0 };
  }

  // layered cumulus texture: a flat-bottomed bank of overlapping puffs with a
  // brighter core and soft shaded underside — three variants for variety
  function cloudTexture(seed) {
    const rnd = mulberry32(seed);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext('2d');
    // shaded base layer (the cloud's darker underside)
    for (let i = 0; i < 9; i++) {
      const x = 36 + rnd() * 184;
      const y = 52 + rnd() * 18;
      const r = 22 + rnd() * 20;
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(196,204,212,0.55)');
      grad.addColorStop(1, 'rgba(196,204,212,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 96);
    }
    // bright cauliflower tops
    for (let i = 0; i < 12; i++) {
      const x = 40 + rnd() * 176;
      const y = 26 + rnd() * 26;
      const r = 14 + rnd() * 18;
      const grad = ctx.createRadialGradient(x, y - 4, 2, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.8)');
      grad.addColorStop(0.55, 'rgba(244,247,250,0.35)');
      grad.addColorStop(1, 'rgba(244,247,250,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 96);
    }
    return new THREE.CanvasTexture(c);
  }

  // --- world ------------------------------------------------------------------
  function build(graves) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.sky);
    scene.fog = new THREE.Fog(COLORS.sky, 10, 34);

    scene.add(new THREE.HemisphereLight(0xcdd6dd, 0x36452e, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 0.45);
    sun.position.set(-18, 24, -10);
    scene.add(sun);

    // clouds: a world-anchored field drifting on a slow wind. Each cloud is a
    // camera-facing sprite with a layered cumulus texture. The field wraps
    // around the player on a torus, so departing clouds are always replaced —
    // the sky is never empty.
    const CLOUD_RANGE = 180;       // half-size of the wrap region
    const WIND = { x: 1.15, z: 0.45 }; // m/s, gentle and constant
    const cloudTexs = [cloudTexture(11), cloudTexture(23), cloudTexture(47)];
    const clouds = [];
    const crand = mulberry32(7);
    for (let i = 0; i < 11; i++) {
      const mat = new THREE.SpriteMaterial({
        map: cloudTexs[i % 3],
        color: COLORS.cloud,
        transparent: true,
        opacity: 0.32 + crand() * 0.22,
        fog: false,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      const w = 34 + crand() * 30;
      sp.scale.set(w, w * 0.34, 1);
      sp.position.set(
        (crand() - 0.5) * 2 * CLOUD_RANGE,
        30 + crand() * 16,
        (crand() - 0.5) * 2 * CLOUD_RANGE
      );
      sp.userData.speed = 0.75 + crand() * 0.5; // per-cloud wind variance
      scene.add(sp);
      clouds.push(sp);
    }

    function updateClouds(px, pz, dt) {
      for (const sp of clouds) {
        sp.position.x += WIND.x * sp.userData.speed * dt;
        sp.position.z += WIND.z * sp.userData.speed * dt;
        // torus wrap around the player: one leaves, one arrives
        if (sp.position.x - px > CLOUD_RANGE) sp.position.x -= CLOUD_RANGE * 2;
        if (sp.position.x - px < -CLOUD_RANGE) sp.position.x += CLOUD_RANGE * 2;
        if (sp.position.z - pz > CLOUD_RANGE) sp.position.z -= CLOUD_RANGE * 2;
        if (sp.position.z - pz < -CLOUD_RANGE) sp.position.z += CLOUD_RANGE * 2;
      }
    }

    const templates = buildTemplates();
    const landmarks = Landmarks.createRegistry(scene);
    const active = new Map();
    const cache = new Map();
    let tick = 0;

    function getChunk(cx, cz) {
      const key = `${cx},${cz}`;
      let chunk = cache.get(key);
      if (!chunk) {
        chunk = buildChunk(cx, cz, templates, graves);
        cache.set(key, chunk);
        if (cache.size > CACHE_MAX) evict();
      }
      chunk.lastUsed = ++tick;
      return chunk;
    }

    function evict() {
      let oldestKey = null;
      let oldest = Infinity;
      for (const [key, ch] of cache) {
        if (!active.has(key) && ch.lastUsed < oldest) {
          oldest = ch.lastUsed;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        const ch = cache.get(oldestKey);
        // per-chunk uniques: ground geometry, material, texture
        const ground = ch.group.children[0];
        ground.geometry.dispose();
        if (ground.material.map) ground.material.map.dispose();
        ground.material.dispose();
        cache.delete(oldestKey);
      }
    }

    let lastCX = null;
    let lastCZ = null;
    let needed = new Set();
    let queue = []; // chunk keys waiting to be built, nearest first

    // building a fresh chunk costs a few ms (texture painting), so at most
    // BUILD_BUDGET fresh chunks are built per frame — the fog hides the rest.
    const BUILD_BUDGET = 2;

    // crows: perched ones startle at close range and fly off into the fog
    const flyers = [];
    function updateCrows(px, pz, dt) {
      for (const ch of nearbyChunks(px, pz)) {
        for (const site of ch.crowSites) {
          if (site.fled) continue;
          if (Math.hypot(site.x - px, site.z - pz) > 2.7) continue;
          site.fled = true;
          const wp = new THREE.Vector3();
          site.mesh.getWorldPosition(wp);
          site.mesh.parent.remove(site.mesh);
          site.mesh.position.copy(wp);
          site.mesh.rotation.set(0, 0, 0);
          scene.add(site.mesh);
          let dx = wp.x - px, dz = wp.z - pz;
          const len = Math.hypot(dx, dz) || 1;
          dx /= len; dz /= len;
          site.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI; // beak forward
          flyers.push({
            mesh: site.mesh, t: 0,
            vx: dx * 7.5, vz: dz * 7.5, vy: 3.2,
            wL: site.mesh.getObjectByName('wingL'),
            wR: site.mesh.getObjectByName('wingR'),
          });
          if (typeof Audio3D !== 'undefined') Audio3D.crowFlee();
        }
      }
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.t += dt;
        f.vy += (0.8 - f.vy) * 0.6 * dt; // climb levels off
        f.mesh.position.x += f.vx * dt;
        f.mesh.position.y += f.vy * dt;
        f.mesh.position.z += f.vz * dt;
        const flap = Math.sin(f.t * 16) * 0.75;
        if (f.wL) f.wL.rotation.z = flap + 0.15;
        if (f.wR) f.wR.rotation.z = -flap - 0.15;
        if (f.t > 5) { // long gone into the fog
          scene.remove(f.mesh);
          flyers.splice(i, 1);
        }
      }
    }

    function update(px, pz, dt) {
      const cx = Math.floor(px / CHUNK + 0.5);
      const cz = Math.floor(pz / CHUNK + 0.5);
      landmarks.update(px, pz);
      if (dt) {
        updateCrows(px, pz, dt);
        updateClouds(px, pz, dt);
      }

      if (cx !== lastCX || cz !== lastCZ) {
        lastCX = cx;
        lastCZ = cz;
        needed = new Set();
        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
          for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
            needed.add(`${cx + dx},${cz + dz}`);
          }
        }
        for (const [key, chunk] of active) {
          if (!needed.has(key)) {
            scene.remove(chunk.group);
            active.delete(key);
          }
        }
        queue = [...needed]
          .filter((key) => !active.has(key))
          .sort((a, b) => {
            const [ax, az] = a.split(',').map(Number);
            const [bx, bz] = b.split(',').map(Number);
            return (Math.abs(ax - cx) + Math.abs(az - cz)) - (Math.abs(bx - cx) + Math.abs(bz - cz));
          });
      }

      // first call (spawn): build everything now; afterwards spread over frames.
      // cached chunks attach for free and don't consume budget.
      let budget = active.size === 0 ? Infinity : BUILD_BUDGET;
      while (queue.length && budget > 0) {
        const key = queue.shift();
        if (active.has(key) || !needed.has(key)) continue;
        if (!cache.has(key)) budget--;
        const [kx, kz] = key.split(',').map(Number);
        const chunk = getChunk(kx, kz);
        scene.add(chunk.group);
        active.set(key, chunk);
      }
    }

    function* nearbyChunks(px, pz) {
      const cx = Math.floor(px / CHUNK + 0.5);
      const cz = Math.floor(pz / CHUNK + 0.5);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ch = active.get(`${cx + dx},${cz + dz}`);
          if (ch) yield ch;
        }
      }
    }

    function collidersNear(px, pz) {
      const out = landmarks.collidersNear(px, pz);
      for (const ch of nearbyChunks(px, pz)) out.push(...ch.colliders);
      return out;
    }

    function sitesNear(px, pz) {
      const out = landmarks.sitesNear(px, pz);
      for (const ch of nearbyChunks(px, pz)) out.push(...ch.sites);
      return out;
    }

    // the player's feet use walkHeight (terrain + bridge decks)
    return { scene, update, collidersNear, sitesNear, landmarks, groundHeight: Terrain.walkHeight, CHUNK };
  }

  return { build };
})();
