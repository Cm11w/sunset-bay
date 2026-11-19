// Sunset Bay itself: a 10x10 block grid city with a beach and sea to the east, docks
// along the south edge, a river and bridge to the north, a park, a stadium and a
// downtown of tall towers. generateCity(seed) is deterministic; buildStatic() pushes
// every immovable box into a batch once. Colliders (building footprints, crates,
// bridge rails) are returned for the physics in world.js.

import { BEACH_X, CITY_MAX, CITY_MIN, DOCKS_Z, GRID, LOC, PALETTE, RIVER_Z0, RIVER_Z1, SEA_X } from './config.js';
import { blockAt, roadAt } from './config.js';
import { clamp, randInt, randPick, randRange } from './random.js';

export function generateCity(random) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const crates = [];
  const colliders = []; // {x0,z0,x1,z1}
  const packages = []; // hidden-package spots (world.js places the pickups)

  const downtown = (bi, bj) => bi >= 4 && bi <= 5 && bj >= 3 && bj <= 6;

  for (let bi = 0; bi < GRID.blocks; bi += 1) {
    for (let bj = 0; bj < GRID.blocks; bj += 1) {
      const cx = blockAt(bi);
      const cz = blockAt(bj);
      // Special blocks.
      if (bi === 5 && bj === 4) { // Palm Park
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: cx + randRange(random, -20, 20), z: cz + randRange(random, -20, 20), s: randRange(random, 0.8, 1.4) });
        }
        continue;
      }
      if (bi === 8 && bj === 8) { // Bay Stadium
        buildings.push({ x: cx, z: cz, w: 44, d: 34, h: 9, color: [0.85, 0.85, 0.88], roof: [0.2, 0.55, 0.35], kind: 'stadium' });
        colliders.push({ x0: cx - 22, z0: cz - 17, x1: cx + 22, z1: cz + 17 });
        continue;
      }
      if (bi === 1 && bj === 1) { // Mama Rosa's Garage lot: low garage + open yard
        buildings.push({ x: cx - 8, z: cz, w: 18, d: 22, h: 7, color: [0.75, 0.35, 0.3], roof: PALETTE.roof, kind: 'garage' });
        colliders.push({ x0: cx - 17, z0: cz - 11, x1: cx + 1, z1: cz + 11 });
        continue;
      }
      if (bi === 2 && bj === 8) { // Bay General hospital
        buildings.push({ x: cx, z: cz, w: 30, d: 20, h: 14, color: [0.92, 0.92, 0.9], roof: [0.7, 0.2, 0.2], kind: 'hospital' });
        colliders.push({ x0: cx - 15, z0: cz - 10, x1: cx + 15, z1: cz + 10 });
        continue;
      }
      const tall = downtown(bi, bj);
      const count = tall ? randInt(random, 2, 4) : randInt(random, 1, 3);
      for (let k = 0; k < count; k += 1) {
        const w = tall ? randRange(random, 14, 20) : randRange(random, 10, 18);
        const d = tall ? randRange(random, 14, 20) : randRange(random, 10, 18);
        const h = tall ? randRange(random, 22, 58) : randRange(random, 5, 13);
        const x = cx + randRange(random, -14 + w / 2, 14 - w / 2);
        const z = cz + randRange(random, -14 + d / 2, 14 - d / 2);
        const color = randPick(random, PALETTE.building);
        buildings.push({ x, z, w, d, h, color, roof: PALETTE.roof, kind: tall ? 'tower' : 'house' });
        colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
      }
      if (random() < 0.7) {
        trees.push({ x: cx + randRange(random, -20, 20), z: cz + randRange(random, -20, 20), s: randRange(random, 0.8, 1.3) });
      }
    }
  }

  // Street lamps along every road, every other block.
  for (let i = 0; i <= GRID.blocks; i += 1) {
    for (let j = 0; j < GRID.blocks; j += 2) {
      const c = roadAt(i);
      const b = blockAt(j);
      lamps.push({ x: c + 8.5, z: b });
      lamps.push({ x: b, z: c + 8.5 });
    }
  }

  // Docks: three piers with crates.
  const pierXs = [29, 87, 145];
  for (const px of pierXs) {
    for (let k = 0; k < 4; k += 1) {
      const x = px + randRange(random, -8, 8);
      const z = DOCKS_Z + 6 + randRange(random, 0, 10);
      const s = randRange(random, 1.6, 2.6);
      crates.push({ x, z, s, color: randPick(random, [[0.8, 0.5, 0.2], [0.3, 0.5, 0.7], [0.6, 0.3, 0.3]]) });
      colliders.push({ x0: x - s / 2, z0: z - s / 2, x1: x + s / 2, z1: z + s / 2 });
    }
  }

  // Hidden packages: 10 spots spread across districts.
  const packageSpots = [
    { x: -203, z: -180 }, { x: 29, z: -29 }, { x: 203, z: 203 }, { x: 318, z: 60 },
    { x: 58, z: 322 }, { x: -261, z: 87 }, { x: 87, z: -203 }, { x: -87, z: 261 },
    { x: 261, z: -87 }, { x: 0, z: -368 },
  ];
  for (const p of packageSpots) packages.push({ ...p, taken: false });

  // Lighthouse on the island.
  buildings.push({ x: 0, z: -368, w: 6, d: 6, h: 26, color: [0.95, 0.95, 0.9], roof: [0.9, 0.2, 0.2], kind: 'lighthouse' });
  colliders.push({ x0: -3, z0: -371, x1: 3, z1: -365 });

  return { buildings, trees, lamps, crates, colliders, packages };
}

/** Push all immovable geometry into `batch`. Counts stay modest (~2.5k boxes). */
export function buildStatic(batch, city) {
  // Ground: grass base under the whole map.
  batch.quad(0, -0.05, 0, 900, 900, PALETTE.grass);
  // City ground slab (concrete) under the grid.
  batch.quad(0, 0, 0, CITY_MAX - CITY_MIN + 40, CITY_MAX - CITY_MIN + 40, [0.42, 0.42, 0.44]);
  // Roads: dark strips along every grid line, plus centre dashes.
  for (let i = 0; i <= GRID.blocks; i += 1) {
    const c = roadAt(i);
    batch.quad(c, 0.02, 0, GRID.road, CITY_MAX - CITY_MIN + 28, PALETTE.road);
    batch.quad(0, 0.02, c, CITY_MAX - CITY_MIN + 28, GRID.road, PALETTE.road);
    for (let j = 0; j < GRID.blocks; j += 1) {
      const b = blockAt(j);
      batch.quad(c, 0.04, b, 0.5, 8, [0.9, 0.8, 0.2]);
      batch.quad(b, 0.04, c, 8, 0.5, [0.9, 0.8, 0.2]);
    }
  }
  // Sidewalks: lighter strips bordering each block.
  for (let bi = 0; bi < GRID.blocks; bi += 1) {
    for (let bj = 0; bj < GRID.blocks; bj += 1) {
      batch.quad(blockAt(bi), 0.03, blockAt(bj), 44, 44, PALETTE.sidewalk);
    }
  }
  // Park lawn.
  batch.quad(blockAt(5), 0.05, blockAt(4), 44, 44, PALETTE.grass);
  // Stadium field.
  batch.quad(blockAt(8), 0.05, blockAt(8), 40, 30, [0.2, 0.6, 0.3]);
  // Beach sand + sea.
  batch.quad((BEACH_X + CITY_MAX) / 2 + 12, 0.02, 0, 62, 760, PALETTE.sand);
  batch.quad(SEA_X + 130, 0.0, 0, 260, 900, PALETTE.sea);
  // River at the north edge + bridge deck.
  batch.quad(0, 0.0, (RIVER_Z0 + RIVER_Z1) / 2, 900, RIVER_Z1 - RIVER_Z0, PALETTE.sea);
  batch.quad(0, 0.3, (RIVER_Z0 + RIVER_Z1) / 2, GRID.road, RIVER_Z1 - RIVER_Z0 + 8, PALETTE.road);
  // Docks wooden strip.
  batch.quad(87, 0.06, DOCKS_Z + 8, 200, 24, [0.5, 0.38, 0.22]);
  // Island ground.
  batch.quad(0, 0.02, -368, 90, 40, PALETTE.grass);

  // Buildings: body + roof cap + window band.
  for (const b of city.buildings) {
    batch.box(b.x, b.h / 2, b.z, b.w, b.h, b.d, b.color, 0, b.roof);
    if (b.kind === 'tower') {
      // Window bands: thin darker boxes on the faces.
      const floors = Math.floor(b.h / 6);
      for (let f = 1; f <= floors; f += 1) {
        const y = f * 6 - 1.5;
        batch.box(b.x, y, b.z + b.d / 2 + 0.06, b.w * 0.8, 1.6, 0.12, [0.15, 0.18, 0.28]);
        batch.box(b.x, y, b.z - b.d / 2 - 0.06, b.w * 0.8, 1.6, 0.12, [0.15, 0.18, 0.28]);
      }
    } else if (b.kind === 'lighthouse') {
      batch.box(b.x, b.h + 1.2, b.z, 3, 2.4, 3, [0.9, 0.2, 0.2]);
    } else if (b.kind === 'stadium') {
      batch.box(b.x, 9.6, b.z, 40, 1.2, 30, [0.2, 0.55, 0.35]);
    }
  }
  // Trees: trunk + two leaf boxes.
  for (const t of city.trees) {
    batch.box(t.x, 1.2 * t.s, t.z, 0.5 * t.s, 2.4 * t.s, 0.5 * t.s, PALETTE.trunk);
    batch.box(t.x, 3.0 * t.s, t.z, 2.6 * t.s, 2.2 * t.s, 2.6 * t.s, PALETTE.leaves);
    batch.box(t.x, 4.4 * t.s, t.z, 1.6 * t.s, 1.4 * t.s, 1.6 * t.s, PALETTE.leaves);
  }
  // Lamp poles (heads glow in the dynamic batch at night).
  for (const l of city.lamps) {
    batch.box(l.x, 2.5, l.z, 0.25, 5, 0.25, [0.25, 0.25, 0.28]);
    batch.box(l.x, 5.1, l.z, 1.2, 0.25, 0.25, [0.3, 0.3, 0.32]);
  }
  // Dock crates.
  for (const c of city.crates) {
    batch.box(c.x, c.s / 2 + 0.1, c.z, c.s, c.s, c.s, c.color);
  }
  // Bridge rails.
  batch.box(-7.5, 1.0, (RIVER_Z0 + RIVER_Z1) / 2, 0.5, 1.4, RIVER_Z1 - RIVER_Z0 + 8, [0.6, 0.6, 0.65]);
  batch.box(7.5, 1.0, (RIVER_Z0 + RIVER_Z1) / 2, 0.5, 1.4, RIVER_Z1 - RIVER_Z0 + 8, [0.6, 0.6, 0.65]);
  // Beach umbrellas (a few bright cones-as-boxes).
  for (const [ux, uz, col] of [[318, -60, [0.95, 0.3, 0.3]], [318, 40, [0.3, 0.6, 0.95]], [312, 120, [0.95, 0.8, 0.2]]]) {
    batch.box(ux, 1.1, uz, 0.25, 2.2, 0.25, [0.7, 0.7, 0.7]);
    batch.box(ux, 2.5, uz, 4.5, 0.3, 4.5, col);
  }
}

/** True when the circle (x, z, r) overlaps any collider; pushes the circle out. */
export function resolveColliders(city, x, z, r) {
  let px = x;
  let pz = z;
  for (const c of city.colliders) {
    const nx = clamp(px, c.x0, c.x1);
    const nz = clamp(pz, c.z0, c.z1);
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * r;
        pz = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pushL = px - c.x0 + r;
        const pushR = c.x1 - px + r;
        const pushT = pz - c.z0 + r;
        const pushB = c.z1 - pz + r;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) px = c.x0 - r;
        else if (m === pushR) px = c.x1 + r;
        else if (m === pushT) pz = c.z0 - r;
        else pz = c.z1 + r;
      }
    }
  }
  // World bounds: sea wall east, river banks north except the bridge, docks south edge.
  px = clamp(px, CITY_MIN - 24, SEA_X + 6);
  pz = clamp(pz, RIVER_Z0 - 26, CITY_MAX + 52); // +52 reaches the docks piers (z ~336)
  // River is only crossable on the bridge (x within the road).
  if (pz > RIVER_Z0 && pz < RIVER_Z1 && Math.abs(px) > 7) {
    pz = pz < (RIVER_Z0 + RIVER_Z1) / 2 ? RIVER_Z0 : RIVER_Z1;
  }
  return [px, pz];
}

/** Nearest road line to (x, z): {axis: 'x'|'z', coord} — roads run along x at fixed z and vice versa. */
export function nearestRoad(x, z) {
  let best = { axis: 'z', coord: roadAt(0), d: Infinity };
  for (let i = 0; i <= GRID.blocks; i += 1) {
    const c = roadAt(i);
    const dz = Math.abs(z - c);
    if (dz < best.d) best = { axis: 'x', coord: c, d: dz };
    const dx = Math.abs(x - c);
    if (dx < best.d) best = { axis: 'z', coord: c, d: dx };
  }
  return best;
}

/** Snap a point onto the nearest road centre line. */
export function snapToRoad(x, z) {
  const r = nearestRoad(x, z);
  return r.axis === 'x' ? [x, r.coord] : [r.coord, z];
}
