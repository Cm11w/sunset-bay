// Sunset Bay — every tuning number, colour and named place in one place.
// Original open-world crime game: a fictional sunset beach city, Jax Marlowe,
// 8 story missions, wanted 0-5 with police helicopter at 3+, 3 synth radio stations.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'sunset-bay.save.v1';

/** City grid: 10x10 blocks. Roads run on the grid lines, blocks sit between them. */
export const GRID = { blocks: 10, pitch: 58, road: 14, origin: -290 };
export const roadAt = (i) => GRID.origin + i * GRID.pitch;
export const blockAt = (i) => GRID.origin + (i + 0.5) * GRID.pitch;
export const CITY_MIN = -290;
export const CITY_MAX = 290;
/** Beach sand starts here, the sea beyond it. */
export const BEACH_X = 302;
export const SEA_X = 332;
/** Docks strip along the south edge. */
export const DOCKS_Z = 316;
/** River channel at the north edge, crossed by the bridge at x = 0. */
export const RIVER_Z0 = -344;
export const RIVER_Z1 = -302;

/** Named places the missions and the HUD refer to. */
export const LOC = {
  garage: { x: -203, z: -203, name: "Mama Rosa's Garage" },
  garageYard: { x: -187, z: -197, name: "Mama Rosa's Garage" },
  downtown: { x: 0, z: 29, name: 'Downtown' },
  contact: { x: 0, z: 87, name: 'Bay Plaza' },
  docks: { x: 58, z: 322, name: 'Sunset Docks' },
  docksCrateA: { x: 29, z: 326, name: 'Docks — Pier 1' },
  docksCrateB: { x: 87, z: 326, name: 'Docks — Pier 2' },
  docksCrateC: { x: 145, z: 322, name: 'Docks — Pier 3' },
  park: { x: 29, z: -29, name: 'Palm Park' },
  stadium: { x: 203, z: 203, name: 'Bay Stadium' },
  stadiumGate: { x: 203, z: 177, name: 'Bay Stadium Gate' },
  beach: { x: 318, z: 0, name: 'Sunset Beach' },
  bridge: { x: 0, z: -322, name: 'North Bridge' },
  island: { x: 0, z: -368, name: 'Lighthouse Point' },
  hospital: { x: -170, z: 203, name: 'Bay General' },
  taxiStand: { x: -112, z: 29, name: 'Taxi Stand' },
};

/** Car models: top speed (m/s), acceleration, turn rate, size, colour. */
export const CAR_MODELS = {
  sedan: { name: 'Sedan', top: 36, accel: 13, brake: 26, turn: 2.1, len: 4.4, wid: 2.0, colors: [[0.75, 0.2, 0.2], [0.2, 0.35, 0.7], [0.85, 0.8, 0.75], [0.25, 0.25, 0.3]] },
  taxi: { name: 'Taxi', top: 34, accel: 12, brake: 26, turn: 2.2, len: 4.4, wid: 2.0, colors: [[0.95, 0.75, 0.1]] },
  sport: { name: 'Sport', top: 52, accel: 20, brake: 30, turn: 2.6, len: 4.2, wid: 2.0, colors: [[0.9, 0.15, 0.35], [0.1, 0.8, 0.6], [0.95, 0.6, 0.05]] },
  van: { name: 'Van', top: 28, accel: 9, brake: 20, turn: 1.7, len: 5.4, wid: 2.2, colors: [[0.8, 0.8, 0.8], [0.3, 0.5, 0.35], [0.6, 0.4, 0.2]] },
  cruiser: { name: 'Police Cruiser', top: 44, accel: 17, brake: 30, turn: 2.5, len: 4.6, wid: 2.0, colors: [[0.9, 0.9, 0.92]] },
};

export const PLAYER = {
  walk: 5.5,
  run: 10,
  jump: 8.5,
  radius: 0.55,
  health: 100,
  punchRange: 2.2,
  punchDamage: 12,
  punchCooldown: 0.45,
};

export const WANTED = {
  max: 5,
  /** Seconds hidden from every cop before the heat drops. */
  loseTime: 8,
  /** Police cruisers chasing at each level. */
  cruisers: [0, 1, 2, 3, 4, 5],
  /** Foot cops at each level. */
  footCops: [0, 0, 1, 2, 2, 3],
  heliAt: 3,
  roadblockAt: 3,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 22;
export const PACKAGE_COUNT = 10;

export const DAY_LENGTH = 360; // seconds of play for a full 24h cycle
export const START_TIME = 17.4; // 17:24 — golden-hour sunset

export const PALETTE = {
  skyDay: [0.55, 0.75, 0.95],
  skySunset: [0.98, 0.55, 0.28],
  skyNight: [0.05, 0.07, 0.16],
  fogSunset: [0.94, 0.55, 0.35],
  fogNight: [0.06, 0.08, 0.18],
  fogDay: [0.6, 0.78, 0.95],
  road: [0.16, 0.16, 0.18],
  sidewalk: [0.55, 0.52, 0.48],
  grass: [0.25, 0.55, 0.3],
  sand: [0.92, 0.82, 0.6],
  sea: [0.1, 0.45, 0.65],
  building: [
    [0.85, 0.55, 0.35], [0.75, 0.35, 0.45], [0.35, 0.55, 0.75],
    [0.9, 0.7, 0.4], [0.55, 0.65, 0.4], [0.7, 0.5, 0.7],
    [0.95, 0.8, 0.55], [0.45, 0.45, 0.55], [0.85, 0.4, 0.3],
  ],
  roof: [0.3, 0.3, 0.35],
  trunk: [0.4, 0.28, 0.15],
  leaves: [0.2, 0.5, 0.25],
  marker: [1.0, 0.85, 0.1],
  policeLightR: [1.0, 0.1, 0.1],
  policeLightB: [0.1, 0.3, 1.0],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const MISSION_NAMES = [
  'Welcome to the Bay',
  'The Pickup',
  'Getaway Driver',
  'Repo Man',
  'Cab Fare',
  'The Drop',
  'Harbor Heist',
  'King of the Bay',
];
