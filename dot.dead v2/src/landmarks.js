// Landmarks: 10 legendary dead projects with unique, massive monuments.
// One landmark per ~350 m "supercell" (about half of them), so they're never
// close together. From afar you see only a dark silhouette against the sky
// (unaffected by fog); the real monument materializes as you approach.
// Monuments are metaphors, not logos.

const Landmarks = (() => {
  const SC = 352;            // supercell size, meters (16 chunks)
  const XP_IDX = 3;          // the one landmark that is a hill, not a building (Windows XP)

  // --- the legends ----------------------------------------------------------
  // build functions are filled in below; data is what the panel shows
  const DEFS = [
    {
      key: 'flash',
      data: {
        repo: null, name: 'Adobe Flash', born: 1996, died: 2020, status: 'dead',
        epitaph: 'It made the web move.',
        cause: 'Declared insecure and obsolete; the platforms it had animated switched it off together, by appointment.',
      },
      monument: 'an empty stage',
    },
    {
      key: 'ie',
      data: {
        repo: null, name: 'Internet Explorer', born: 1995, died: 2022, status: 'dead',
        epitaph: 'The window through which a generation first saw the web.',
        cause: 'Standards moved on, then everyone else did; finally even its maker walked away.',
      },
      monument: 'a window onto nothing',
    },
    {
      key: 'netscape',
      data: {
        repo: null, name: 'Netscape Navigator', born: 1994, died: 2008, status: 'dead',
        epitaph: 'It navigated first.',
        cause: 'Lost the first browser war. Its code was set free and became Firefox.',
      },
      monument: 'a dark lighthouse',
    },
    {
      key: 'xp',
      data: {
        repo: null, name: 'Windows XP', born: 2001, died: 2014, status: 'dead',
        epitaph: 'The green hill is still there.',
        cause: 'Retired after thirteen years of service. Some ATMs never noticed.',
      },
      monument: 'a green hill with one tree',
    },
    {
      key: 'wave',
      data: {
        repo: null, name: 'Google Wave', born: 2009, died: 2012, status: 'dead',
        epitaph: 'Email, if it were invented today.',
        cause: 'Too new to explain, too complex to need. Pulled fifteen months after launch.',
      },
      monument: 'a wave that never broke',
    },
    {
      key: 'geocities',
      data: {
        repo: null, name: 'GeoCities', born: 1994, died: 2009, status: 'dead',
        epitaph: 'Thirty-eight million homepages, under construction forever.',
        cause: 'Yahoo closed the city. Volunteer archivists saved what they could carry.',
      },
      monument: 'a ruined miniature city',
    },
    {
      key: 'winamp',
      data: {
        repo: null, name: 'Winamp', born: 1997, died: 2013, status: 'dead',
        epitaph: 'It really whipped the llama\'s ass.',
        cause: 'Bought, shelved, and slowly forgotten while music became a stream instead of a file.',
      },
      monument: 'a stone llama',
    },
    {
      key: 'vine',
      data: {
        repo: null, name: 'Vine', born: 2013, died: 2017, status: 'dead',
        epitaph: 'Six seconds, looped forever.',
        cause: 'Closed by Twitter just as short video conquered the world — a few years too early.',
      },
      monument: 'a broken loop',
    },
    {
      key: 'aim',
      data: {
        repo: null, name: 'AIM', born: 1997, died: 2017, status: 'dead',
        epitaph: 'Away.',
        cause: 'The phones came, and one by one everyone signed off for good.',
      },
      monument: 'a door left ajar',
    },
    {
      key: 'napster',
      data: {
        repo: null, name: 'Napster', born: 1999, died: 2001, status: 'dead',
        epitaph: 'It taught the world that music was a file.',
        cause: 'Sued out of existence in two years. The idea outlived the verdict by decades.',
      },
      monument: 'split headphones',
    },
  ];

  // 10 quotes, one per monument type (same order as DEFS)
  const QUOTES = [
    'A journey of a thousand miles begins with a single step.',
    'Waste no more time arguing what a good man should be. Be one.',
    'It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.',
    'He who has a why to live can bear almost any how.',
    'Life can only be understood backwards; but it must be lived forwards.',
    'Whatever you can do, or dream you can, begin it. Boldness has genius, power, and magic in it.',
    'The struggle itself toward the heights is enough to fill a man\'s heart.',
    'Our main business is not to see what lies dimly at a distance, but to do what lies clearly at hand.',
    'All things excellent are as difficult as they are rare.',
    'Everything in a person should be beautiful: the face, the clothes, the soul, and the thoughts.',
  ];

  // where the paper hangs on each monument (local coords + facing)
  const PAPER_SPOTS = [
    { x: -3.7, y: 1.6, z: -1.78, ry: 0 },        // flash: left pillar
    { x: -2.3, y: 1.5, z: 0.48, ry: 0 },         // ie: left post
    { x: 0.9, y: 1.5, z: 1.82, ry: 0.2 },        // netscape: tower wall by the door
    { x: 0, y: 2.4, z: 3.2, ry: 0 },             // xp: in front of the tree, facing the Bliss vista
    { x: 0, y: 0.45, z: 1.55, ry: 0 },           // wave: front of the base
    { x: 0, y: 0.45, z: 3.65, ry: 0 },           // geocities: plinth side
    { x: 0, y: 0.6, z: 1.0, ry: 0 },             // winamp: pedestal front
    { x: 0, y: 0.42, z: 0.85, ry: 0 },           // vine: base front
    { x: -0.2, y: 1.5, z: 0.95, ry: 0.55 },      // aim: on the door itself
    { x: 0, y: 0.42, z: 1.15, ry: 0 },           // napster: base front
  ];

  // --- deterministic layout ---------------------------------------------------
  function hashSC(sx, sz) {
    let h = (Math.imul(sx, 0x9e3779b1) ^ Math.imul(sz, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  const cellCache = new Map();

  function cellInfo(sx, sz) {
    const key = `${sx},${sz}`;
    if (cellCache.has(key)) return cellCache.get(key);
    let L = null;
    if (sx === 0 && sz === 0) {
      // the spawn supercell always holds the lighthouse, ahead and to the side:
      // the first mysterious shape the player sees in the fog
      L = { type: 2, x: 58, z: -98 };
    } else {
      const h = hashSC(sx, sz);
      if (h % 100 < 52) {
        const type = (h >>> 4) % DEFS.length;
        let x = sx * SC + (((h >>> 8) & 0xff) / 255 - 0.5) * 240;
        let z = sz * SC + (((h >>> 16) & 0xff) / 255 - 0.5) * 240;
        if (Math.abs(x) < 14) x += x < 0 ? -22 : 22; // never on the path
        L = { type, x, z };
      }
    }
    if (L) {
      // ground level the monument will stand on (flattened / raised)
      L.flatTarget = Terrain.largeRoll(L.x, L.z);
    }
    cellCache.set(key, L);
    return L;
  }

  function cellOf(v) {
    return Math.floor(v / SC + 0.5);
  }

  // terrain modification: flatten under monuments, raise the XP hill
  function fieldMod(x, z) {
    const L = cellInfo(cellOf(x), cellOf(z));
    if (!L) return null;
    const d = Math.hypot(x - L.x, z - L.z);
    if (L.type === XP_IDX) {
      if (d > 19) return null;
      const t = Math.max(0, 1 - d / 19);
      const s = t * t * (3 - 2 * t); // smoothstep
      return { flatW: s * 0.85, flatTarget: L.flatTarget, bump: 3.1 * s };
    }
    if (d > 16) return null;
    const t = Math.max(0, Math.min(1, 1 - d / 16));
    const s = t * t * (3 - 2 * t);
    return { flatW: s, flatTarget: L.flatTarget, bump: 0 };
  }

  // chunks must not scatter props inside a monument's court
  function clearance(x, z) {
    const L = cellInfo(cellOf(x), cellOf(z));
    if (!L) return true;
    return Math.hypot(x - L.x, z - L.z) > (L.type === XP_IDX ? 20 : 14);
  }

  // --- monument construction ---------------------------------------------------
  function buildersFor(mats) {
    const { stoneA, stoneB, stoneDark, ivy, wood, leaf, white } = mats;
    function box(w, h, d, mat, x, y, z, ry, rz) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (ry) m.rotation.y = ry;
      if (rz) m.rotation.z = rz;
      return m;
    }
    function cyl(r1, r2, h, seg, mat, x, y, z) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
      m.position.set(x, y, z);
      return m;
    }

    // The "Bliss" wallpaper, painted procedurally onto a canvas (built once):
    // a deep-blue sky with scattered cumulus over a single rolling green hill.
    // Used as a vista billboard behind the Windows XP tree. Edges fade to
    // transparent so the bright picture dissolves into the graveyard's fog.
    let _bliss = null;
    function blissTexture() {
      if (_bliss) return _bliss;
      const W = 320, H = 180;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d');

      // sky
      const sky = x.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2f78cf');
      sky.addColorStop(0.45, '#66a0de');
      sky.addColorStop(0.6, '#c2def2');
      x.fillStyle = sky;
      x.fillRect(0, 0, W, H);

      // fluffy cumulus
      function cloud(cx, cy, s) {
        const puffs = [[0, 0, 1], [-0.75, 0.18, 0.66], [0.72, 0.12, 0.74],
          [-0.32, -0.28, 0.58], [0.36, -0.22, 0.62], [0.05, 0.28, 0.5]];
        for (const [ox, oy, r] of puffs) {
          const g2 = x.createRadialGradient(cx + ox * s, cy + oy * s, 1, cx + ox * s, cy + oy * s, r * s);
          g2.addColorStop(0, 'rgba(255,255,255,0.97)');
          g2.addColorStop(0.7, 'rgba(247,251,255,0.85)');
          g2.addColorStop(1, 'rgba(247,251,255,0)');
          x.fillStyle = g2;
          x.beginPath();
          x.arc(cx + ox * s, cy + oy * s, r * s, 0, 7);
          x.fill();
        }
      }
      cloud(W * 0.18, H * 0.22, 17);
      cloud(W * 0.50, H * 0.12, 22);
      cloud(W * 0.80, H * 0.24, 18);
      cloud(W * 0.64, H * 0.36, 12);
      cloud(W * 0.10, H * 0.42, 11);
      cloud(W * 0.38, H * 0.30, 9);

      // the single rolling green hill (the Bliss curve)
      const hz = H * 0.6;
      x.beginPath();
      x.moveTo(0, H);
      x.lineTo(0, hz + 16);
      x.bezierCurveTo(W * 0.22, hz - 12, W * 0.45, hz + 8, W * 0.66, hz - 6);
      x.bezierCurveTo(W * 0.82, hz - 14, W * 0.93, hz - 3, W, hz + 4);
      x.lineTo(W, H);
      x.closePath();
      const grass = x.createLinearGradient(0, hz - 16, 0, H);
      grass.addColorStop(0, '#9ace4a');
      grass.addColorStop(0.35, '#74b035');
      grass.addColorStop(1, '#3c7a22');
      x.fillStyle = grass;
      x.save();
      x.fill();
      x.clip();
      // sunlit highlight on the crest
      const hl = x.createRadialGradient(W * 0.4, hz, 4, W * 0.4, hz, 120);
      hl.addColorStop(0, 'rgba(195,226,128,0.55)');
      hl.addColorStop(1, 'rgba(195,226,128,0)');
      x.fillStyle = hl;
      x.fillRect(0, hz - 30, W, H);
      // grass speckle for texture
      for (let i = 0; i < 1400; i++) {
        const px = Math.random() * W, py = hz - 6 + Math.random() * (H - hz + 6);
        x.fillStyle = Math.random() < 0.5 ? 'rgba(60,110,30,0.5)' : 'rgba(150,200,90,0.4)';
        x.fillRect(px, py, 1, 1);
      }
      x.restore();

      // soften the edges to transparent so the billboard melts into the fog
      const img = x.getImageData(0, 0, W, H);
      const d = img.data;
      const fX = 48, fT = 42, fB = 16;
      for (let yy = 0; yy < H; yy++) {
        for (let xx = 0; xx < W; xx++) {
          const ax = Math.min(1, Math.min(xx, W - 1 - xx) / fX);
          const at = Math.min(1, yy / fT);
          const ab = Math.min(1, (H - 1 - yy) / fB);
          const a = Math.min(ax, at, ab);
          const o = (yy * W + xx) * 4 + 3;
          d[o] = d[o] * a;
        }
      }
      x.putImageData(img, 0, 0);

      _bliss = new THREE.CanvasTexture(c);
      _bliss.magFilter = THREE.NearestFilter;
      _bliss.minFilter = THREE.NearestFilter;
      _bliss.generateMipmaps = false;
      return _bliss;
    }

    return [
      // flash — the empty stage
      () => {
        const g = new THREE.Group();
        g.add(box(9, 0.7, 5.5, stoneB, 0, 0.35, 0));
        g.add(box(7, 0.35, 1.2, stoneDark, 0, 0.17, 3.2));
        g.add(box(0.75, 6.2, 0.75, stoneA, -3.7, 3.1, -2.2));
        g.add(box(0.75, 6.2, 0.75, stoneA, 3.7, 3.1, -2.2));
        g.add(box(8.6, 0.85, 0.85, stoneA, 0, 6.4, -2.2));
        g.add(box(0.22, 5.2, 1.5, stoneDark, -3.55, 3.4, -1.4, 0, 0.05));
        g.add(box(0.22, 5.2, 1.5, stoneDark, 3.55, 3.4, -1.4, 0, -0.05));
        g.cols = [{ dx: 0, dz: 0, hw: 4.6, hd: 2.9 }];
        return g;
      },
      // ie — the window onto nothing
      () => {
        const g = new THREE.Group();
        g.add(box(5.4, 0.7, 1.1, stoneB, 0, 0.35, 0));
        g.add(box(0.75, 6.6, 0.85, stoneA, -2.3, 3.9, 0));
        g.add(box(0.75, 6.6, 0.85, stoneA, 2.3, 3.9, 0));
        g.add(box(5.4, 0.75, 0.95, stoneA, 0, 7.45, 0));
        g.add(box(0.3, 6.0, 0.3, stoneDark, 0, 3.9, 0));
        g.add(box(4.2, 0.3, 0.3, stoneDark, 0, 4.7, 0));
        g.cols = [{ dx: 0, dz: 0, hw: 2.8, hd: 0.7 }];
        return g;
      },
      // netscape — the dark lighthouse
      () => {
        const g = new THREE.Group();
        g.add(cyl(2.3, 2.6, 1.2, 10, stoneDark, 0, 0.6, 0));
        g.add(cyl(1.25, 1.9, 9, 9, stoneA, 0, 5.7, 0));
        g.add(cyl(1.75, 1.75, 0.5, 9, stoneDark, 0, 10.4, 0));
        g.add(cyl(1.05, 1.2, 1.5, 8, stoneB, 0, 11.3, 0));
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.4, 8), stoneDark);
        cap.position.y = 12.7;
        g.add(cap);
        g.add(box(1.0, 1.8, 0.4, stoneDark, 0, 1.0, 2.2));
        g.cols = [{ dx: 0, dz: 0, hw: 2.3, hd: 2.3 }];
        return g;
      },
      // xp — the green hill with one tree (terrain raises the hill), and the
      // famous Bliss wallpaper standing as a vista behind the tree
      () => {
        const g = new THREE.Group();
        const trunk = cyl(0.18, 0.32, 2.4, 6, wood, 0, 1.2, 0);
        g.add(trunk);
        for (const [bx, by, bz, r] of [
          [0, 3.4, 0, 1.5], [-1.1, 2.9, 0.4, 1.0], [1.0, 3.0, -0.3, 1.05], [0.2, 4.1, 0.3, 0.9],
        ]) {
          const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
          blob.position.set(bx, by, bz);
          blob.scale.y = 0.8;
          g.add(blob);
        }
        g.add(box(0.7, 0.85, 0.14, white, 1.9, 0.42, 0.6, 0.4)); // small XP-white stone
        // the Bliss vista: a bright wallpaper billboard behind the tree. It
        // respects fog, so it emerges as you approach and frames the sky-and-
        // hill exactly when you reach the paper. Hidden from the far silhouette.
        const wp = new THREE.Mesh(
          new THREE.PlaneGeometry(46, 26),
          new THREE.MeshBasicMaterial({
            map: blissTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false,
          })
        );
        wp.position.set(0, 14, -7.5);
        wp.userData.noSilhouette = true;
        g.add(wp);
        g.cols = [{ dx: 0, dz: 0, hw: 0.5, hd: 0.5 }];
        return g;
      },
      // wave — the wave that never broke
      () => {
        const g = new THREE.Group();
        g.add(box(7.5, 0.6, 3, stoneB, 0, 0.3, 0));
        const crest = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.6, 5, 12, 3.7), stoneA);
        crest.position.set(0.4, 3.4, 0);
        crest.rotation.z = 2.45;
        g.add(crest);
        const foam = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.32, 5, 9, 2.6), stoneDark);
        foam.position.set(-1.4, 2.2, 0);
        foam.rotation.z = 2.1;
        g.add(foam);
        g.cols = [{ dx: 0, dz: 0, hw: 3.8, hd: 1.6 }];
        return g;
      },
      // geocities — the ruined miniature city
      () => {
        const g = new THREE.Group();
        g.add(box(7.2, 0.55, 7.2, stoneB, 0, 0.27, 0));
        const spots = [
          [-2.2, -2.2, 0], [0.1, -2.4, 0], [2.3, -2.1, 1], [-2.4, 0.1, 0],
          [0, 0, 0], [2.2, 0.2, 0], [-2.1, 2.3, 1], [0.2, 2.2, 0], [2.4, 2.4, 1],
        ];
        spots.forEach(([hx, hz, fallen], i) => {
          const house = new THREE.Group();
          const body = box(1.05, 0.95, 1.05, i % 2 ? stoneA : stoneDark, 0, 0.47, 0);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.65, 4), stoneB);
          roof.position.y = 1.27;
          roof.rotation.y = Math.PI / 4;
          house.add(body, roof);
          house.position.set(hx, 0.55, hz);
          if (fallen) {
            house.rotation.z = 1.35;
            house.position.y = 0.75;
          }
          g.add(house);
        });
        g.cols = [{ dx: 0, dz: 0, hw: 3.7, hd: 3.7 }];
        return g;
      },
      // winamp — the stone llama
      () => {
        const g = new THREE.Group();
        g.add(box(3.0, 1.1, 1.9, stoneB, 0, 0.55, 0));
        g.add(box(2.1, 1.05, 0.85, stoneA, 0, 2.15, 0));
        for (const [lx, lz] of [[-0.75, -0.28], [0.75, -0.28], [-0.75, 0.28], [0.75, 0.28]]) {
          g.add(box(0.24, 1.0, 0.24, stoneA, lx, 1.6, lz));
        }
        g.add(box(0.4, 1.5, 0.38, stoneA, 0.85, 3.15, 0, 0, -0.22));
        g.add(box(0.72, 0.42, 0.36, stoneA, 1.22, 3.95, 0));
        g.add(box(0.1, 0.34, 0.1, stoneA, 1.05, 4.3, -0.12));
        g.add(box(0.1, 0.34, 0.1, stoneA, 1.05, 4.3, 0.12));
        g.add(box(0.3, 0.5, 0.3, stoneA, -1.0, 1.85, 0, 0, 0.5));
        g.cols = [{ dx: 0, dz: 0, hw: 1.6, hd: 1.1 }];
        return g;
      },
      // vine — the broken loop
      () => {
        const g = new THREE.Group();
        g.add(box(3.4, 0.55, 1.6, stoneB, 0, 0.27, 0));
        const loop = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.42, 6, 16, 5.1), stoneA);
        loop.position.y = 3.1;
        loop.rotation.z = 1.85; // the missing piece points skyward
        g.add(loop);
        for (let i = 0; i < 4; i++) {
          const v = box(0.12, 1.4 + i * 0.3, 0.12, ivy, -1.6 + i * 1.05, 0.9, 0.45, 0, (i - 1.5) * 0.25);
          g.add(v);
        }
        g.cols = [{ dx: 0, dz: 0, hw: 1.8, hd: 0.9 }];
        return g;
      },
      // aim — the door left ajar
      () => {
        const g = new THREE.Group();
        g.add(box(3.2, 0.5, 1.6, stoneB, 0, 0.25, 0));
        g.add(box(0.45, 5.0, 0.5, stoneA, -1.25, 2.75, 0));
        g.add(box(0.45, 5.0, 0.5, stoneA, 1.25, 2.75, 0));
        g.add(box(2.95, 0.5, 0.55, stoneA, 0, 5.25, 0));
        const door = box(2.0, 4.7, 0.18, stoneDark, -0.35, 2.6, 0.75, 0.55);
        g.add(door);
        g.cols = [{ dx: 0, dz: 0, hw: 1.7, hd: 0.9 }];
        return g;
      },
      // napster — the split headphones
      () => {
        const g = new THREE.Group();
        g.add(box(6.5, 0.55, 2.2, stoneB, 0, 0.27, 0));
        const arcL = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.3, 5, 10, 1.25), stoneA);
        arcL.position.set(-0.5, 3.4, 0);
        arcL.rotation.z = 1.75;
        g.add(arcL);
        const arcR = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.3, 5, 10, 1.25), stoneA);
        arcR.position.set(0.5, 3.4, 0);
        arcR.rotation.z = 0.15;
        g.add(arcR);
        const cupL = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.7, 9), stoneDark);
        cupL.position.set(-2.9, 2.0, 0);
        cupL.rotation.z = Math.PI / 2;
        g.add(cupL);
        const cupR = cupL.clone();
        cupR.position.x = 2.9;
        g.add(cupR);
        g.cols = [{ dx: -2.9, dz: 0, hw: 0.8, hd: 1.1 }, { dx: 2.9, dz: 0, hw: 0.8, hd: 1.1 }];
        return g;
      },
    ];
  }

  // --- registry: silhouettes far, real monuments near ---------------------------
  function createRegistry(scene) {
    const mats = {
      stoneA: new THREE.MeshLambertMaterial({ color: 0x878d96 }),
      stoneB: new THREE.MeshLambertMaterial({ color: 0x6f757e }),
      stoneDark: new THREE.MeshLambertMaterial({ color: 0x565b63 }),
      ivy: new THREE.MeshLambertMaterial({ color: 0x4d5435 }),
      wood: new THREE.MeshLambertMaterial({ color: 0x4a3f30 }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x3f6b2f }),
      white: new THREE.MeshLambertMaterial({ color: 0xc9ccc2 }),
    };
    const builders = buildersFor(mats);
    const templates = [];
    const instances = new Map();

    // collected papers reset on every page load — each visit is a fresh hunt
    const collected = new Set();

    // warm halo sprite texture (shared)
    const haloTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,214,140,0.8)');
      grad.addColorStop(0.4, 'rgba(255,190,110,0.25)');
      grad.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    function buildPaper(type) {
      const spot = PAPER_SPOTS[type];
      const g = new THREE.Group();
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.56),
        new THREE.MeshBasicMaterial({ color: 0xffe9bb, side: THREE.DoubleSide })
      );
      sheet.userData.paperType = type;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: 0xffc97a, transparent: true, depthWrite: false,
      }));
      halo.scale.set(2.4, 2.4, 1);
      const light = new THREE.PointLight(0xffc27a, 1.1, 8);
      light.position.set(0, 0.2, 0.4);
      g.add(sheet, halo, light);
      g.position.set(spot.x, spot.y, spot.z);
      g.rotation.y = spot.ry;
      return g;
    }

    function template(type) {
      if (!templates[type]) templates[type] = builders[type]();
      return templates[type];
    }

    function makeSilhouette(type, mat) {
      const g = template(type).clone();
      g.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.noSilhouette) o.visible = false; // e.g. the Bliss vista — close-up only
        else o.material = mat;
      });
      return g;
    }

    function update(px, pz) {
      const scx = cellOf(px);
      const scz = cellOf(pz);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const L = cellInfo(scx + dx, scz + dz);
          if (!L) continue;
          const key = `${scx + dx},${scz + dz}`;
          let st = instances.get(key);
          if (!st) {
            st = { L, real: null, sil: null, silMat: null, baseY: Terrain.groundHeight(L.x, L.z) };
            instances.set(key, st);
          }
          const d = Math.hypot(px - L.x, pz - L.z);

          // real monument near (with hysteresis)
          if (d < 75 && !st.real) {
            st.real = template(L.type).clone();
            st.real.position.set(L.x, st.baseY, L.z);
            if (!collected.has(L.type)) {
              st.paper = buildPaper(L.type);
              st.real.add(st.paper);
            }
            scene.add(st.real);
          } else if (d > 90 && st.real) {
            scene.remove(st.real);
            st.real = null;
            st.paper = null;
          }

          // silhouette in the distance, fading with approach
          if (d > 22 && d < 320) {
            if (!st.sil) {
              st.silMat = new THREE.MeshBasicMaterial({
                color: 0x8a97a3, fog: false, transparent: true, opacity: 0, depthWrite: false,
              });
              st.sil = makeSilhouette(L.type, st.silMat);
              st.sil.position.set(L.x, st.baseY, L.z);
              scene.add(st.sil);
            }
            const fadeFar = Math.max(0, Math.min(1, (300 - d) / 90));
            const fadeNear = Math.max(0, Math.min(1, (d - 26) / 16));
            st.silMat.opacity = 0.55 * fadeFar * fadeNear;
          } else if (st.sil) {
            scene.remove(st.sil);
            st.sil.traverse((o) => { if (o.isMesh) o.material.dispose && o.material.dispose(); });
            st.sil = null;
            st.silMat = null;
          }
        }
      }
      // drop instances far behind
      for (const [key, st] of instances) {
        if (Math.abs(st.L.x - px) > 720 || Math.abs(st.L.z - pz) > 720) {
          if (st.real) scene.remove(st.real);
          if (st.sil) scene.remove(st.sil);
          instances.delete(key);
        }
      }
    }

    function sitesNear(px, pz) {
      const out = [];
      const scx = cellOf(px);
      const scz = cellOf(pz);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const L = cellInfo(scx + dx, scz + dz);
          if (!L) continue;
          if (Math.hypot(px - L.x, pz - L.z) < 50) {
            out.push({ kind: 'landmark', grave: DEFS[L.type].data, x: L.x, z: L.z, radius: 8 });
          }
        }
      }
      return out;
    }

    function collidersNear(px, pz) {
      const out = [];
      const scx = cellOf(px);
      const scz = cellOf(pz);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const L = cellInfo(scx + dx, scz + dz);
          if (!L) continue;
          if (Math.hypot(px - L.x, pz - L.z) < 40) {
            for (const c of template(L.type).cols || []) {
              out.push({ x: L.x + c.dx, z: L.z + c.dz, hw: c.hw, hd: c.hd });
            }
          }
        }
      }
      return out;
    }

    // active paper meshes near the player, for raycast pickup
    function papersNear(px, pz) {
      const out = [];
      for (const [, st] of instances) {
        if (!st.real || !st.paper) continue;
        const spot = PAPER_SPOTS[st.L.type];
        const wx = st.L.x + spot.x;
        const wz = st.L.z + spot.z;
        const d = Math.hypot(px - wx, pz - wz);
        if (d < 12) {
          out.push({ type: st.L.type, group: st.paper, x: wx, y: st.baseY + spot.y, z: wz, d });
        }
      }
      return out;
    }

    // nearest uncollected paper: position + distance, from layout math alone —
    // works long before any mesh exists. Drives both the organ and the compass.
    // Searches in expanding rings: late in the hunt the remaining papers can
    // be kilometers away, and the needle must still point somewhere real.
    function nearestPaperInfo(px, pz) {
      if (collected.size >= DEFS.length) return null;
      const scx = cellOf(px);
      const scz = cellOf(pz);
      for (let r = 2; r <= 24; r += 2) {
        let best = null;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            const L = cellInfo(scx + dx, scz + dz);
            if (!L || collected.has(L.type)) continue;
            const spot = PAPER_SPOTS[L.type];
            const x = L.x + spot.x;
            const z = L.z + spot.z;
            const d = Math.hypot(px - x, pz - z);
            if (!best || d < best.d) best = { x, z, d };
          }
        }
        if (best) return best; // closer rings were empty
      }
      return null;
    }

    function nearestPaperDist(px, pz) {
      const info = nearestPaperInfo(px, pz);
      return info ? info.d : null;
    }

    function collect(type) {
      if (collected.has(type)) return null;
      collected.add(type);
      for (const [, st] of instances) {
        if (st.L.type === type && st.paper && st.real) {
          st.real.remove(st.paper);
          st.paper = null;
        }
      }
      return { quote: QUOTES[type], count: collected.size, total: DEFS.length };
    }

    function collectedCount() {
      return collected.size;
    }

    return { update, sitesNear, collidersNear, papersNear, nearestPaperDist, nearestPaperInfo, collect, collectedCount, total: DEFS.length };
  }

  return { fieldMod, clearance, createRegistry, SC, DEFS, QUOTES };
})();
