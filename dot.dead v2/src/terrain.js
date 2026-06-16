// Pure terrain math, shared by chunk generation, object placement, the
// player's feet, and landmark layout. Everything is a continuous function of
// world coordinates — no seams, fully deterministic.
//
// Landscape: rolling hills, a flat path corridor, and scattered shallow
// lakes — small enough that the far shore is always visible through the fog,
// shallow enough that wading is harmless.

const Terrain = (() => {
  const CHUNK = 22;
  const LAKE_CELL = CHUNK * 7;   // one lake cell ≈ 154 m
  const LAKE_CHANCE = 0.76;      // 2× more lakes than before
  const LAKE_DEPTH = 1.05;       // bowl depth; water sits 0.42 below local ground
  const WATER_OFFSET = 0.42;

  function terrainNoise(x, z) {
    return (
      Math.sin(x * 0.31 + z * 0.17) * 0.5 +
      Math.sin(x * 0.83 - z * 0.51 + 1.7) * 0.3 +
      Math.sin(x * 1.7 + z * 1.3 + 4.2) * 0.2
    );
  }

  function pathEdge(z) {
    return 1.7 + terrainNoise(z * 0.7, z * 0.21) * 0.5;
  }

  // large rolling hills — amplitude doubled for steeper inclines/declines (±~3.6 m)
  function largeRoll(x, z) {
    return (
      Math.sin(x * 0.021 + 1.3) +
      Math.sin(z * 0.017 + 0.7) +
      Math.sin((x + z) * 0.0128 + 2.1)
    ) * 1.2;
  }

  // the path corridor stays near-flat so the walk is never a climb
  function corridor(x) {
    return Math.min(1, Math.max(0, (Math.abs(x) - 4) / 12));
  }

  // --- lakes -------------------------------------------------------------------
  const lakeCache = new Map();

  function lakeHash(i, j, salt) {
    let h = (Math.imul(i, 0x6c8e9cf5) ^ Math.imul(j, 0x9e3779b1) ^ salt) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function lakeFor(lx, lz) {
    const key = `${lx},${lz}`;
    if (lakeCache.has(key)) return lakeCache.get(key);
    let lake = null;
    if (lakeHash(lx, lz, 0x1b873593) < LAKE_CHANCE) {
      const R = 18 + lakeHash(lx, lz, 0x2e1b2138) * 16; // 18–34 m radius (2× larger)
      const x = lx * LAKE_CELL + (lakeHash(lx, lz, 0x517cc1b7) - 0.5) * 76;
      const z = lz * LAKE_CELL + (lakeHash(lx, lz, 0x27220a95) - 0.5) * 76;
      const clearOfPath = Math.abs(x) > R + 9;
      const clearOfMonuments =
        typeof Landmarks === 'undefined' || Landmarks.clearance(x, z);
      if (clearOfPath && clearOfMonuments) {
        const centerRoll = largeRoll(x, z);
        lake = { x, z, R, centerRoll, waterY: centerRoll - WATER_OFFSET };
      }
    }
    lakeCache.set(key, lake);
    return lake;
  }

  function lakeCellOf(v) {
    return Math.floor(v / LAKE_CELL + 0.5);
  }

  // nearest lake influencing this point (rim blend reaches R*1.2)
  function lakeAt(x, z) {
    const lx = lakeCellOf(x);
    const lz = lakeCellOf(z);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const lake = lakeFor(lx + dx, lz + dz);
        if (!lake) continue;
        const d = Math.hypot(x - lake.x, z - lake.z);
        if (d < lake.R * 1.2) return { lake, d };
      }
    }
    return null;
  }

  function groundHeight(x, z) {
    const n = terrainNoise(x, z);
    const micro = Math.abs(x) < pathEdge(z) ? n * 0.04 : n * 0.16;
    let lc = largeRoll(x, z);
    let bowl = 0;
    const la = lakeAt(x, z);
    if (la) {
      // flatten the rolling terrain toward the lake's base, then carve the bowl
      const s = Math.max(0, 1 - la.d / (la.lake.R * 1.2));
      const ss = s * s * (3 - 2 * s);
      lc = lc * (1 - ss * 0.95) + la.lake.centerRoll * ss * 0.95;
      const b = Math.max(0, 1 - la.d / la.lake.R);
      bowl = -LAKE_DEPTH * b * b * (3 - 2 * b);
    }
    let bump = 0;
    if (typeof Landmarks !== 'undefined') {
      const m = Landmarks.fieldMod(x, z);
      if (m) {
        lc = lc * (1 - m.flatW) + m.flatTarget * m.flatW;
        bump = m.bump;
      }
    }
    return micro + (lc + bowl) * corridor(x) + bump;
  }

  // water surface height at this point, or null if no lake covers it
  function waterLevel(x, z) {
    const la = lakeAt(x, z);
    if (la && la.d < la.lake.R * 1.05) return la.lake.waterY;
    return null;
  }

  // is a walker at (x,z) standing in water?
  function inWater(x, z) {
    const wl = waterLevel(x, z);
    return wl !== null && groundHeight(x, z) < wl - 0.03;
  }

  // the lake whose center lies inside chunk (cx,cz), if any — for water meshes
  function lakeInChunk(cx, cz) {
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const lake = lakeFor(lakeCellOf(ox), lakeCellOf(oz));
    if (
      lake &&
      Math.abs(lake.x - ox) <= CHUNK / 2 &&
      Math.abs(lake.z - oz) <= CHUNK / 2
    ) return lake;
    return null;
  }

  return {
    terrainNoise, pathEdge, largeRoll, corridor,
    groundHeight, walkHeight: groundHeight, // no bridges anymore
    lakeAt, waterLevel, inWater, lakeInChunk,
  };
})();
