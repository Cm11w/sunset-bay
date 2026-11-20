// The living world: Jax on foot and behind the wheel, traffic AI that follows the
// road grid and stops at red lights, pedestrians, police cruisers and foot cops,
// the police helicopter, particles, hidden packages and the day/night clock.
// No drawing API here except drawDynamic(), which pushes the actors into a batch.

import {
  BEACH_X, CAR_MODELS, CITY_MAX, CITY_MIN, DAY_LENGTH, DOCKS_Z, GRID,
  LOC, PACKAGE_COUNT, PALETTE, PLAYER, START_TIME, TRAFFIC_COUNT, PED_COUNT, WANTED,
} from './config.js';
import { blockAt, roadAt } from './config.js';
import { angleDiff, clamp, dist2d, lerp, randInt, randPick, randRange } from './random.js';
import { generateCity, nearestRoad, resolveColliders } from './city.js';

const GRAVITY = 22;
const TWO_PI = Math.PI * 2;

function normAngle(a) {
  a %= TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

function forwardVec(heading) {
  return [Math.sin(heading), Math.cos(heading)];
}

export function createWorld(random) {
  const city = generateCity(random);
  const state = {
    random,
    city,
    time: 0,
    timeOfDay: START_TIME,
    money: 250,
    health: PLAYER.health,
    wanted: 0,
    hiddenTimer: 0,
    roadblockSpawned: false,
    player: {
      x: -174, z: -174, y: 0, vy: 0, heading: Math.PI * 0.75, speed: 0,
      onFoot: true, car: null, punchTimer: 0, invuln: 0, walkPhase: 0, arrest: 0,
    },
    cars: [],
    peds: [],
    particles: [],
    heli: { active: false, angle: 0, x: 0, z: 0, y: 38 },
    marker: null, // {x, z, label}
    missionText: '',
    missionIndex: 0,
    packagesFound: 0,
    stats: { carsStolen: 0, missionsDone: 0, distance: 0 },
    events: [],
    message: '',
    messageTimer: 0,
    cameraShake: 0,
    danger: null, // {x, z, timer} — pedestrians flee from this
  };

  function event(type, data) {
    state.events.push({ type, ...(data || {}) });
  }

  function say(text, seconds = 4) {
    state.message = text;
    state.messageTimer = seconds;
  }

  // ---- spawning -----------------------------------------------------------

  function makeCar(model, x, z, heading, ai, driver) {
    const spec = CAR_MODELS[model];
    const color = randPick(random, spec.colors);
    const car = {
      id: state.cars.length, model, spec, x, z, heading, speed: 0,
      color, ai, driver: driver || null, health: 100,
      targetHeading: heading, stopped: 0, lastCross: '', honk: 0,
    };
    state.cars.push(car);
    return car;
  }

  function spawnParkedCars() {
    // Jax's own ride outside the garage.
    makeCar('sedan', LOC.garage.x + 14, LOC.garage.z + 6, Math.PI / 2, null, null);
    const spots = [
      [-170, 29], [4, -141], [120, -83], [-83, 149], [178, -25],
      [-25, 207], [91, 91], [265, 33], [-199, 91], [62, 265],
    ];
    const models = ['sedan', 'taxi', 'sport', 'van', 'sedan', 'taxi', 'van', 'sport', 'sedan', 'taxi'];
    for (let i = 0; i < spots.length; i += 1) {
      const [x, z] = spots[i];
      const axis = random() < 0.5 ? 0 : Math.PI / 2;
      makeCar(models[i], x, z, axis + (random() < 0.5 ? 0 : Math.PI), null, null);
    }
  }

  function spawnTraffic() {
    const models = ['sedan', 'sedan', 'taxi', 'van', 'sedan', 'taxi', 'sport', 'van'];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const road = randInt(random, 0, GRID.blocks + 1);
      const along = randRange(random, CITY_MIN, CITY_MAX);
      const vertical = random() < 0.5;
      const x = vertical ? roadAt(road) : along;
      const z = vertical ? along : roadAt(road);
      const heading = vertical ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const car = makeCar(randPick(random, models), x, z, heading, 'traffic', 'ped');
      // Lane offset: keep right.
      const [fx, fz] = forwardVec(heading);
      car.x += -fz * 3.2;
      car.z += fx * 3.2;
      car.speed = randRange(random, 8, 13);
      car.targetSpeed = randRange(random, 9, 14);
    }
  }

  function spawnPeds() {
    const shirts = [[0.9, 0.3, 0.3], [0.3, 0.6, 0.9], [0.9, 0.8, 0.3], [0.4, 0.8, 0.4], [0.8, 0.5, 0.9], [0.9, 0.6, 0.4], [0.5, 0.5, 0.5]];
    for (let i = 0; i < PED_COUNT; i += 1) {
      const x = randRange(random, CITY_MIN + 10, CITY_MAX - 10);
      const z = randRange(random, CITY_MIN + 10, CITY_MAX + 10);
      state.peds.push({
        x, z, heading: randPick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
        speed: randRange(random, 1.2, 2.2), color: randPick(random, shirts),
        walkPhase: random() * 6, flee: 0, lastCross: '', skin: randPick(random, [[0.85, 0.65, 0.45], [0.7, 0.5, 0.35], [0.95, 0.8, 0.65]]),
      });
    }
  }

  function spawnParticles(x, y, z, n, color, speed, life) {
    for (let i = 0; i < n; i += 1) {
      if (state.particles.length > 220) return;
      const a = random() * TWO_PI;
      const s = randRange(random, speed * 0.3, speed);
      state.particles.push({
        x, y, z, vx: Math.cos(a) * s, vy: randRange(random, 1, speed * 0.7), vz: Math.sin(a) * s,
        life: randRange(random, life * 0.5, life), maxLife: life, color, size: randRange(random, 0.15, 0.4),
      });
    }
  }

  function reset() {
    state.time = 0;
    state.timeOfDay = START_TIME;
    state.money = 250;
    state.health = PLAYER.health;
    state.wanted = 0;
    state.hiddenTimer = 0;
    state.roadblockSpawned = false;
    state.cars.length = 0;
    state.peds.length = 0;
    state.particles.length = 0;
    state.heli.active = false;
    state.marker = null;
    state.missionText = '';
    state.missionIndex = 0;
    state.packagesFound = 0;
    state.stats = { carsStolen: 0, missionsDone: 0, distance: 0 };
    state.events.length = 0;
    state.message = '';
    state.messageTimer = 0;
    state.cameraShake = 0;
    const p = state.player;
    p.x = -174; p.z = -174; p.y = 0; p.vy = 0; p.heading = Math.PI * 0.75; p.speed = 0;
    p.onFoot = true; p.car = null; p.punchTimer = 0; p.invuln = 0; p.walkPhase = 0; p.arrest = 0;
    for (const pkg of city.packages) pkg.taken = false;
    spawnParkedCars();
    spawnTraffic();
    spawnPeds();
  }

  // ---- helpers ------------------------------------------------------------

  function nearestCar(x, z, maxDist, exclude) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car === exclude) continue;
      const d = dist2d(x, z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function carAhead(car, dist) {
    const [fx, fz] = forwardVec(car.heading);
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < dist && side < 2.6) return other;
    }
    return null;
  }

  /** Traffic-light phase at downtown intersections: 'x' green or 'z' green. */
  function lightPhase() {
    return Math.floor(state.time / 8) % 2 === 0 ? 'x' : 'z';
  }

  function damagePlayer(amount, cause) {
    if (state.player.invuln > 0) return;
    state.health -= amount;
    state.player.invuln = 0.6;
    state.cameraShake = Math.max(state.cameraShake, 0.35);
    if (state.health <= 0) {
      state.health = 0;
      event('wasted');
    } else if (cause) {
      say(cause);
    }
  }

  function addWanted(n, reason) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, WANTED.max);
    state.hiddenTimer = 0;
    if (state.wanted > before) {
      say(reason || `Wanted level ${state.wanted} — the Bay PD is on you!`);
      event('siren');
    }
  }

  // ---- player -------------------------------------------------------------

  function stepPlayer(dt, input, camYaw) {
    const p = state.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.punchTimer > 0) p.punchTimer -= dt;
    if (!p.onFoot) return;

    const fwd = input.forward || 0;
    const strafe = input.strafe || 0;
    const run = !!input.run;
    const speed = run ? PLAYER.run : PLAYER.walk;
    // Movement relative to the camera yaw.
    const mx = Math.sin(camYaw) * fwd + Math.cos(camYaw) * strafe;
    const mz = Math.cos(camYaw) * fwd - Math.sin(camYaw) * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      const nx = mx / len;
      const nz = mz / len;
      const targetHeading = Math.atan2(nx, nz);
      p.heading += angleDiff(p.heading, targetHeading) * Math.min(1, dt * 12);
      p.x += nx * speed * dt;
      p.z += nz * speed * dt;
      p.speed = speed;
      p.walkPhase += dt * speed * 1.6;
      state.stats.distance += speed * dt;
    } else {
      p.speed = 0;
    }
    // Jump + gravity.
    if (input.jumpPressed && p.y === 0) {
      p.vy = PLAYER.jump;
      event('jump');
    }
    if (p.y > 0 || p.vy !== 0) {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    // Punch.
    if (input.punchPressed && p.punchTimer <= 0) {
      p.punchTimer = PLAYER.punchCooldown;
      event('punch');
      const [fx, fz] = forwardVec(p.heading);
      state.danger = { x: p.x + fx * 2, z: p.z + fz * 2, timer: 2 };
      for (const ped of state.peds) {
        if (dist2d(p.x, p.z, ped.x, ped.z) < PLAYER.punchRange + 0.8) {
          ped.flee = 3;
          ped.x += fx * 2.5;
          ped.z += fz * 2.5;
          say('That pedestrian will remember this.');
        }
      }
      for (const car of state.cars) {
        if (dist2d(p.x, p.z, car.x, car.z) < 3.2 && car.ai === 'police') {
          car.health -= PLAYER.punchDamage;
          spawnParticles(car.x, 1.2, car.z, 6, [1, 0.9, 0.4], 4, 0.5);
        }
      }
      if (state.wanted === 0 && random() < 0.5) addWanted(1, 'Assault in broad daylight — wanted!');
    }
    // Building collision.
    const [rx, rz] = resolveColliders(city, p.x, p.z, PLAYER.radius);
    p.x = rx; p.z = rz;
    // Hidden packages.
    for (const pkg of city.packages) {
      if (!pkg.taken && dist2d(p.x, p.z, pkg.x, pkg.z) < 1.6) {
        pkg.taken = true;
        state.packagesFound += 1;
        state.money += 100;
        event('pickup');
        say(`Hidden package found! +$100 (${state.packagesFound}/${PACKAGE_COUNT})`);
      }
    }
  }

  function tryEnterCar() {
    const p = state.player;
    if (!p.onFoot) return;
    const car = nearestCar(p.x, p.z, 4.2, null);
    if (!car) return;
    if (car.driver === 'ped' && car.ai === 'traffic') {
      // Carjacking: the driver bails and runs.
      car.driver = null;
      car.ai = null;
      const witnessed = state.peds.some((ped) => dist2d(p.x, p.z, ped.x, ped.z) < 45)
        || state.cars.some((c) => c.ai === 'police' && dist2d(p.x, p.z, c.x, c.z) < 60);
      state.peds.push({
        x: car.x + 2, z: car.z + 2, heading: random() * TWO_PI, speed: 4,
        color: [0.9, 0.3, 0.3], walkPhase: 0, flee: 4, lastCross: '',
        skin: [0.85, 0.65, 0.45],
      });
      state.stats.carsStolen += 1;
      if (witnessed) addWanted(1, 'Carjacking witnessed — wanted!');
      else say('Nice ride. Nobody saw a thing.');
      event('carjack');
    }
    p.onFoot = false;
    p.car = car;
    car.driver = 'player';
    car.ai = null;
    event('door');
    say(`${car.spec.name} — W/S drive, A/D steer, Space handbrake, E to get out.`);
  }

  function exitCar() {
    const p = state.player;
    if (p.onFoot || !p.car) return;
    const car = p.car;
    car.driver = null;
    car.speed *= 0.2;
    p.car = null;
    p.onFoot = true;
    p.x = car.x + Math.cos(car.heading) * 2.6;
    p.z = car.z - Math.sin(car.heading) * 2.6;
    p.y = 0;
    p.heading = car.heading;
    event('door');
  }

  // ---- cars ---------------------------------------------------------------

  function stepPlayerCar(dt, input) {
    const p = state.player;
    const car = p.car;
    if (p.onFoot || !car) return;
    const spec = car.spec;
    const throttle = input.forward || 0;
    const steer = input.strafe || 0;
    if (throttle > 0) car.speed += spec.accel * throttle * dt;
    else if (throttle < 0) car.speed += (car.speed > 0.5 ? -spec.brake : -spec.accel * 0.6) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    car.speed = clamp(car.speed, -spec.top * 0.35, spec.top);
    const spd = Math.abs(car.speed);
    if (spd > 0.2) {
      car.heading += steer * spec.turn * dt * clamp(spd / 12, 0.25, 1) * Math.sign(car.speed);
    }
    const [fx, fz] = forwardVec(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    state.stats.distance += spd * dt;
    // Collisions with buildings.
    const before = [car.x, car.z];
    const [rx, rz] = resolveColliders(city, car.x, car.z, 2.1);
    car.x = rx; car.z = rz;
    if ((rx !== before[0] || rz !== before[1]) && spd > 6) {
      car.health -= spd * 0.3;
      car.speed *= 0.4;
      state.cameraShake = Math.max(state.cameraShake, 0.5);
      spawnParticles(car.x, 1, car.z, 10, [1, 0.7, 0.2], 6, 0.6);
      event('crash', { speed: spd });
      state.danger = { x: car.x, z: car.z, timer: 2 };
      if (spd > 18 && state.wanted === 0 && random() < 0.3) addWanted(1, 'Reckless driving spotted — wanted!');
    }
    // Smoke when wrecked.
    if (car.health < 45 && random() < dt * 8) {
      spawnParticles(car.x, 1.4, car.z, 1, [0.35, 0.35, 0.38], 2, 1.2);
    }
    if (car.health <= 0 && car.speed !== 0) {
      car.speed = 0;
      say('This car is wrecked. Find another ride.');
    }
  }

  function stepTrafficCar(dt, car) {
    const [fx, fz] = forwardVec(car.heading);
    // Red light: stop before a downtown intersection.
    const greenAxis = lightPhase();
    const myAxis = Math.abs(fx) > 0.5 ? 'x' : 'z';
    let wantSpeed = car.targetSpeed || 11;
    if (myAxis !== greenAxis) {
      // Approaching an intersection centre?
      const crossCoord = myAxis === 'x'
        ? nearestRoad(car.x + fx * 12, car.z).coord
        : nearestRoad(car.x, car.z + fz * 12).coord;
      const along = myAxis === 'x' ? car.x : car.z;
      const distToCross = Math.abs(crossCoord - along);
      if (distToCross < 16 && distToCross > 4) wantSpeed = 0;
    }
    const ahead = carAhead(car, 11);
    if (ahead) wantSpeed = Math.min(wantSpeed, Math.max(0, ahead.speed - 1));
    car.speed += clamp(wantSpeed - car.speed, -14 * dt, 8 * dt);
    // Turn at intersections.
    const crossKey = `${Math.round(car.x / 58)}:${Math.round(car.z / 58)}`;
    const onRoadX = Math.abs(car.z - (Math.round((car.z + 290) / 58) * 58 - 290)) < 3;
    const onRoadZ = Math.abs(car.x - (Math.round((car.x + 290) / 58) * 58 - 290)) < 3;
    if ((onRoadX || onRoadZ) && car.lastCross !== crossKey) {
      car.lastCross = crossKey;
      const roll = random();
      if (roll < 0.16) car.targetHeading = normAngle(car.heading + Math.PI / 2);
      else if (roll < 0.32) car.targetHeading = normAngle(car.heading - Math.PI / 2);
    }
    const dh = angleDiff(car.heading, car.targetHeading);
    car.heading = normAngle(car.heading + clamp(dh, -2.4 * dt, 2.4 * dt));
    const [nfx, nfz] = forwardVec(car.heading);
    car.x += nfx * car.speed * dt;
    car.z += nfz * car.speed * dt;
    // Stay inside the city; wrap around the far edge.
    if (car.x < CITY_MIN - 10 || car.x > CITY_MAX + 10 || car.z < CITY_MIN - 10 || car.z > CITY_MAX + 20) {
      car.heading = normAngle(car.heading + Math.PI);
      car.x = clamp(car.x, CITY_MIN, CITY_MAX);
      car.z = clamp(car.z, CITY_MIN, CITY_MAX);
    }
    const [rx, rz] = resolveColliders(city, car.x, car.z, 2.0);
    car.x = rx; car.z = rz;
  }

  function stepPoliceCar(dt, car) {
    const p = state.player;
    const tx = p.onFoot ? p.x : p.car.x;
    const tz = p.onFoot ? p.z : p.car.z;
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    const dh = angleDiff(car.heading, wantHeading);
    car.heading = normAngle(car.heading + clamp(dh, -3.2 * dt, 3.2 * dt));
    const targetSpeed = dist > 26 ? 42 : dist > 8 ? 34 : 16;
    car.speed += clamp(targetSpeed - car.speed, -20 * dt, 14 * dt);
    const [fx, fz] = forwardVec(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    const [rx, rz] = resolveColliders(city, car.x, car.z, 2.0);
    if (rx !== car.x || rz !== car.z) car.speed *= 0.5;
    car.x = rx; car.z = rz;
    // Ram the player's car.
    if (!p.onFoot && p.car && dist < 5.5) {
      p.car.health -= 14 * dt;
      p.car.speed *= 1 - 0.4 * dt;
      state.cameraShake = Math.max(state.cameraShake, 0.4);
      if (random() < dt * 3) {
        spawnParticles(p.car.x, 1, p.car.z, 8, [1, 0.7, 0.2], 5, 0.5);
        event('crash', { speed: 10 });
      }
    }
    // Arrest on foot: close in and hold still next to Jax.
    if (p.onFoot && dist < 3.2) {
      p.arrest += dt;
      if (p.arrest > 1.4) event('busted');
      else if (p.speed < 1) say('The cops are grabbing you — RUN!');
    } else {
      p.arrest = Math.max(0, p.arrest - dt * 2);
    }
    // Siren flash timing is derived from state.time in drawDynamic.
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.flee > 0) ped.flee -= dt;
      if (state.danger && state.danger.timer > 0 && dist2d(ped.x, ped.z, state.danger.x, state.danger.z) < 22) {
        ped.flee = 2;
      }
      const speed = ped.flee > 0 ? 5.5 : ped.speed;
      if (ped.flee > 0) {
        // Run away from the player/danger.
        const dx = ped.x - (state.danger ? state.danger.x : p.x);
        const dz = ped.z - (state.danger ? state.danger.z : p.z);
        ped.heading = Math.atan2(dx, dz);
      } else {
        // Wander the sidewalks; turn at intersections.
        const crossKey = `${Math.round(ped.x / 58)}:${Math.round(ped.z / 58)}`;
        const onRoadX = Math.abs(ped.z - (Math.round((ped.z + 290) / 58) * 58 - 290)) < 2.5;
        const onRoadZ = Math.abs(ped.x - (Math.round((ped.x + 290) / 58) * 58 - 290)) < 2.5;
        if ((onRoadX || onRoadZ) && ped.lastCross !== crossKey) {
          ped.lastCross = crossKey;
          const roll = random();
          if (roll < 0.3) ped.heading = normAngle(ped.heading + Math.PI / 2);
          else if (roll < 0.6) ped.heading = normAngle(ped.heading - Math.PI / 2);
        }
      }
      const [fx, fz] = forwardVec(ped.heading);
      ped.x += fx * speed * dt;
      ped.z += fz * speed * dt;
      ped.walkPhase += dt * speed * 2.2;
      const [rx, rz] = resolveColliders(city, ped.x, ped.z, 0.5);
      ped.x = rx; ped.z = rz;
      ped.x = clamp(ped.x, CITY_MIN - 20, BEACH_X + 4);
      ped.z = clamp(ped.z, CITY_MIN - 20, CITY_MAX + 22);
    }
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { state.particles.splice(i, 1); continue; }
      pt.vy -= 6 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      if (pt.y < 0.05) { pt.y = 0.05; pt.vy = 0; }
    }
  }

  // ---- wanted -------------------------------------------------------------

  function stepWanted(dt) {
    const p = state.player;
    const px = p.onFoot ? p.x : p.car.x;
    const pz = p.onFoot ? p.z : p.car.z;
    const cops = state.cars.filter((c) => c.ai === 'police');
    if (state.wanted > 0) {
      const nearestCop = cops.reduce((m, c) => Math.min(m, dist2d(px, pz, c.x, c.z)), Infinity);
      const copSeen = nearestCop < 55;
      // The helicopter slows the escape but can never prevent it: while it is
      // up, the hidden timer still runs at half speed, so a player who breaks
      // away from every cruiser loses the heat (twice as slowly at wanted 3+).
      if (!copSeen) {
        state.hiddenTimer += dt * (state.heli.active ? 0.5 : 1);
        if (state.hiddenTimer > WANTED.loseTime) {
          state.wanted = 0;
          state.hiddenTimer = 0;
          state.roadblockSpawned = false;
          say('You lost the cops. Heat is off — for now.');
          event('lost');
        }
      } else {
        state.hiddenTimer = 0;
      }
      // Spawn / despawn cruisers to match the level.
      const wantCruisers = WANTED.cruisers[state.wanted];
      if (cops.length < wantCruisers) {
        const angle = random() * TWO_PI;
        const sx = px + Math.cos(angle) * 70;
        const sz = pz + Math.sin(angle) * 70;
        const [cx, cz] = resolveColliders(city, clamp(sx, CITY_MIN, CITY_MAX), clamp(sz, CITY_MIN, CITY_MAX), 2);
        makeCar('cruiser', cx, cz, Math.atan2(px - cx, pz - cz), 'police', 'ped');
        event('siren');
      } else if (cops.length > wantCruisers) {
        const far = cops.sort((a, b) => dist2d(px, pz, b.x, b.z) - dist2d(px, pz, a.x, a.z))[0];
        state.cars.splice(state.cars.indexOf(far), 1);
      }
      // Helicopter at 3+.
      state.heli.active = state.wanted >= WANTED.heliAt;
      // Roadblock at 3+: two cruisers parked across the road ahead.
      if (state.wanted >= WANTED.roadblockAt && !state.roadblockSpawned) {
        state.roadblockSpawned = true;
        const [fx, fz] = p.onFoot ? forwardVec(p.heading) : forwardVec(p.car.heading);
        const bx = px + fx * 55;
        const bz = pz + fz * 55;
        const perp = Math.atan2(fx, fz) + Math.PI / 2;
        makeCar('cruiser', bx + Math.sin(perp) * 4, bz + Math.cos(perp) * 4, perp, 'roadblock', null);
        makeCar('cruiser', bx - Math.sin(perp) * 4, bz - Math.cos(perp) * 4, perp, 'roadblock', null);
        say('Roadblock ahead! Find another way around.');
      }
    } else {
      state.heli.active = false;
      // Clear leftover police and roadblocks slowly.
      if (cops.length > 0 && random() < dt * 0.2) {
        state.cars.splice(state.cars.indexOf(cops[0]), 1);
      }
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        if (state.cars[i].ai === 'roadblock') state.cars.splice(i, 1);
      }
      state.roadblockSpawned = false;
    }
    if (state.heli.active) {
      state.heli.angle += dt * 0.55;
      state.heli.x = px + Math.cos(state.heli.angle) * 26;
      state.heli.z = pz + Math.sin(state.heli.angle) * 26;
      state.heli.y = 26;
    }
  }

  // ---- car-vs-car collisions ----------------------------------------------

  function stepCarCollisions(dt) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 4.2;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
          const closing = Math.abs(a.speed - b.speed);
          if (closing > 6) {
            a.health -= closing * 0.35;
            b.health -= closing * 0.35;
            a.speed *= 0.6; b.speed *= 0.6;
            spawnParticles((a.x + b.x) / 2, 1, (a.z + b.z) / 2, 10, [1, 0.7, 0.2], 6, 0.6);
            event('crash', { speed: closing });
            state.danger = { x: a.x, z: a.z, timer: 2 };
            if (a === state.player.car || b === state.player.car) {
              state.cameraShake = Math.max(state.cameraShake, 0.5);
            }
          }
        }
      }
    }
    // Player on foot hit by a car.
    const p = state.player;
    if (p.onFoot && p.invuln <= 0) {
      for (const car of state.cars) {
        if (Math.abs(car.speed) < 2) continue;
        if (dist2d(p.x, p.z, car.x, car.z) < 2.4) {
          damagePlayer(18, 'Hit by a car! Watch the road.');
          const [fx, fz] = forwardVec(car.heading);
          p.x += fx * 3;
          p.z += fz * 3;
          state.danger = { x: p.x, z: p.z, timer: 2 };
          event('crash', { speed: Math.abs(car.speed) });
          break;
        }
      }
    }
  }

  // ---- lighting -----------------------------------------------------------

  function computeLight() {
    const h = state.timeOfDay;
    const dayness = h >= 6 && h <= 18 ? Math.sin(((h - 6) / 12) * Math.PI) : 0;
    const sunset = Math.exp(-((h - 18.1) * (h - 18.1)) / 1.6);
    const night = 1 - clamp(dayness + sunset * 0.7, 0, 1);
    const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    let sky = lerp3(PALETTE.skyNight, PALETTE.skyDay, dayness);
    sky = lerp3(sky, PALETTE.skySunset, clamp(sunset, 0, 1) * 0.9);
    let fog = lerp3(PALETTE.fogNight, PALETTE.fogDay, dayness);
    fog = lerp3(fog, PALETTE.fogSunset, clamp(sunset, 0, 1) * 0.85);
    const sunCol = lerp3([0.25, 0.3, 0.55], [1.0, 0.95, 0.85], dayness);
    const sunCol2 = lerp3(sunCol, [1.0, 0.55, 0.25], clamp(sunset, 0, 1));
    const amb = lerp3([0.22, 0.24, 0.38], [0.5, 0.5, 0.5], dayness);
    const sunElev = Math.sin(((h - 6) / 12) * Math.PI);
    const sunDir = [0.55, -Math.max(0.15, sunElev), 0.35];
    const sl = Math.hypot(...sunDir);
    return {
      sky, fogColor: fog, sunDir: [sunDir[0] / sl, sunDir[1] / sl, sunDir[2] / sl],
      sunCol: sunCol2, amb, night: night > 0.55, fog: [40, 420],
    };
  }

  // ---- main step ----------------------------------------------------------

  function step(dt, input, camYaw) {
    state.time += dt;
    state.timeOfDay = (START_TIME + (state.time / DAY_LENGTH) * 24) % 24;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.danger) {
      state.danger.timer -= dt;
      if (state.danger.timer <= 0) state.danger = null;
    }
    if (state.cameraShake > 0) state.cameraShake = Math.max(0, state.cameraShake - dt * 1.6);

    if (input.enterPressed) {
      if (state.player.onFoot) tryEnterCar();
      else exitCar();
    }
    stepPlayer(dt, input, camYaw);
    stepPlayerCar(dt, input);
    for (const car of [...state.cars]) {
      if (car.ai === 'traffic') stepTrafficCar(dt, car);
      else if (car.ai === 'police') stepPoliceCar(dt, car);
    }
    stepPeds(dt);
    stepCarCollisions(dt);
    stepParticles(dt);
    stepWanted(dt);
    // Despawn wrecked traffic cars far from the player.
    const p = state.player;
    const px = p.onFoot ? p.x : p.car.x;
    const pz = p.onFoot ? p.z : p.car.z;
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.ai === 'traffic' && car.health <= 0 && dist2d(px, pz, car.x, car.z) > 80) {
        state.cars.splice(i, 1);
      }
    }
    // Keep traffic topped up.
    const traffic = state.cars.filter((c) => c.ai === 'traffic').length;
    if (traffic < TRAFFIC_COUNT && random() < dt * 0.5) {
      const road = randInt(random, 0, GRID.blocks + 1);
      const along = randRange(random, CITY_MIN, CITY_MAX);
      const vertical = random() < 0.5;
      const x = vertical ? roadAt(road) : along;
      const z = vertical ? along : roadAt(road);
      const heading = vertical ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const car = makeCar(randPick(random, ['sedan', 'taxi', 'van']), x, z, heading, 'traffic', 'ped');
      car.speed = 10;
      car.targetSpeed = 11;
    }
    return state.events.splice(0, state.events.length);
  }

  // ---- drawing ------------------------------------------------------------

  function drawCar(batch, car, t) {
    const spec = car.spec;
    const len = spec.len;
    const wid = spec.wid;
    const flash = car.model === 'cruiser' ? (Math.floor(t * 4) % 2 === 0) : false;
    // Body + cabin + wheels + lights.
    batch.box(car.x, 0.62, car.z, len, 0.75, wid, car.color, car.heading);
    batch.box(car.x, 1.25, car.z - 0.2, len * 0.52, 0.62, wid * 0.86, car.model === 'cruiser' ? [0.12, 0.12, 0.14] : [0.12, 0.14, 0.2], car.heading);
    if (car.model === 'van') {
      batch.box(car.x, 1.35, car.z, len * 0.8, 1.0, wid * 0.92, car.color, car.heading);
    }
    const [fx, fz] = forwardVec(car.heading);
    const px = -fz;
    const pz = fx;
    for (const [along, side] of [[1.35, 0.95], [1.35, -0.95], [-1.35, 0.95], [-1.35, -0.95]]) {
      batch.box(car.x + fx * along + px * side * 0.9, 0.32, car.z + fz * along + pz * side * 0.9, 0.7, 0.64, 0.3, [0.08, 0.08, 0.09], car.heading);
    }
    // Headlights (front) and taillights.
    batch.box(car.x + fx * (len / 2 + 0.03), 0.62, car.z + fz * (len / 2 + 0.03) + px * 0.6, 0.12, 0.22, 0.3, [1, 0.95, 0.7], car.heading);
    batch.box(car.x + fx * (len / 2 + 0.03), 0.62, car.z + fz * (len / 2 + 0.03) - px * 0.6, 0.12, 0.22, 0.3, [1, 0.95, 0.7], car.heading);
    batch.box(car.x - fx * (len / 2 + 0.03), 0.62, car.z - fz * (len / 2 + 0.03) + px * 0.6, 0.12, 0.22, 0.3, [0.9, 0.1, 0.1], car.heading);
    batch.box(car.x - fx * (len / 2 + 0.03), 0.62, car.z - fz * (len / 2 + 0.03) - px * 0.6, 0.12, 0.22, 0.3, [0.9, 0.1, 0.1], car.heading);
    if (car.model === 'cruiser') {
      batch.box(car.x, 1.62, car.z, 0.9, 0.22, 0.5, flash ? PALETTE.policeLightR : PALETTE.policeLightB, car.heading);
    }
    if (car.model === 'taxi') {
      batch.box(car.x, 1.62, car.z, 0.8, 0.18, 0.4, [1, 0.85, 0.1], car.heading);
    }
    // Wrecked cars sag with a dark hood.
    if (car.health < 45) {
      batch.box(car.x + fx * 1.2, 0.95, car.z + fz * 1.2, 1.2, 0.2, wid * 0.9, [0.12, 0.12, 0.12], car.heading);
    }
  }

  function drawPerson(batch, x, y, z, heading, color, skin, phase, scale = 1) {
    const swing = Math.sin(phase) * 0.35 * scale;
    const [fx, fz] = forwardVec(heading);
    const px = -fz;
    // Legs swing as the figure walks.
    batch.box(x + fx * swing, 0.45 * scale + y, z + fz * swing, 0.22 * scale, 0.9 * scale, 0.22 * scale, [0.2, 0.2, 0.28], heading);
    batch.box(x - fx * swing, 0.45 * scale + y, z - fz * swing, 0.22 * scale, 0.9 * scale, 0.22 * scale, [0.2, 0.2, 0.28], heading);
    // Torso + head.
    batch.box(x, 1.15 * scale + y, z, 0.62 * scale, 0.62 * scale, 0.36 * scale, color, heading);
    batch.box(x, 1.72 * scale + y, z, 0.4 * scale, 0.38 * scale, 0.38 * scale, skin, heading);
    void px;
  }

  function drawDynamic(batch, skyBatch, t) {
    const light = computeLight();
    const p = state.player;
    // Mission marker beacon + pulsing ground ring.
    if (state.marker) {
      const m = state.marker;
      const pulse = 2.2 + Math.sin(t * 3) * 0.5;
      batch.box(m.x, 12, m.z, 0.7, 24, 0.7, PALETTE.marker);
      batch.quad(m.x, 0.08, m.z, pulse * 2, pulse * 2, PALETTE.marker);
    }
    // Hidden packages: small glowing crates.
    for (const pkg of city.packages) {
      if (pkg.taken) continue;
      const bob = Math.sin(t * 2 + pkg.x) * 0.15;
      batch.box(pkg.x, 0.55 + bob, pkg.z, 0.7, 0.7, 0.7, [1, 0.85, 0.15]);
    }
    // Cars.
    for (const car of state.cars) drawCar(batch, car, t);
    // Pedestrians.
    for (const ped of state.peds) {
      drawPerson(batch, ped.x, 0, ped.z, ped.heading, ped.color, ped.skin, ped.walkPhase, 0.95);
    }
    // Jax on foot.
    if (p.onFoot) {
      const blink = p.invuln > 0 && Math.floor(t * 10) % 2 === 0;
      if (!blink) drawPerson(batch, p.x, p.y, p.z, p.heading, [0.15, 0.55, 0.85], [0.85, 0.65, 0.45], p.walkPhase, 1);
    }
    // Helicopter + spotlight disc on the player. White body so it reads at night,
    // with red/green nav lights and a bright searchlight under the nose.
    if (state.heli.active) {
      const h = state.heli;
      batch.box(h.x, h.y, h.z, 5.5, 1.8, 2.4, [0.85, 0.85, 0.88], h.angle);
      batch.box(h.x - Math.sin(h.angle) * 4, h.y + 0.3, h.z - Math.cos(h.angle) * 4, 3.5, 0.5, 0.5, [0.85, 0.85, 0.88], h.angle);
      batch.box(h.x, h.y + 1.2, h.z, 9, 0.12, 0.5, [0.3, 0.3, 0.32], t * 9);
      batch.box(h.x, h.y - 1.1, h.z, 1.2, 0.5, 1.2, [1, 0.95, 0.6]);
      const [hfx, hfz] = [Math.sin(h.angle), Math.cos(h.angle)];
      batch.box(h.x - hfz * 1.3, h.y, h.z + hfx * 1.3, 0.4, 0.4, 0.4, [1, 0.1, 0.1]);
      batch.box(h.x + hfz * 1.3, h.y, h.z - hfx * 1.3, 0.4, 0.4, 0.4, [0.1, 1, 0.3]);
      const px = p.onFoot ? p.x : p.car.x;
      const pz = p.onFoot ? p.z : p.car.z;
      batch.quad(px, 0.1, pz, 9, 9, [1, 0.95, 0.6]);
    }
    // Lamp glow at night.
    if (light.night) {
      for (const l of city.lamps) {
        batch.box(l.x, 5.0, l.z, 1.0, 0.3, 0.3, [1, 0.85, 0.4]);
      }
    }
    // Particles.
    for (const pt of state.particles) {
      const fade = pt.life / pt.maxLife;
      batch.box(pt.x, pt.y, pt.z, pt.size, pt.size, pt.size, [pt.color[0] * fade + 0.1, pt.color[1] * fade + 0.1, pt.color[2] * fade + 0.1]);
    }
    // Sun disc + drifting clouds in the sky batch (no fog).
    const camX = p.onFoot ? p.x : p.car.x;
    const camZ = p.onFoot ? p.z : p.car.z;
    const sunX = camX - 500;
    const sunY = light.night ? -50 : 120;
    const sunZ = camZ - 200;
    if (!light.night) {
      skyBatch.box(sunX, sunY, sunZ, 60, 60, 1, [1, 0.75, 0.35]);
    }
    for (let i = 0; i < 8; i += 1) {
      const cx = ((i * 173 + t * 1.5) % 900) - 450 + camX;
      const cz = ((i * 311) % 700) - 350 + camZ;
      skyBatch.box(cx, 150 + (i % 3) * 18, cz, 60 + (i % 3) * 22, 6, 26, [0.95, 0.9, 0.9]);
    }
  }

  reset();

  return {
    state, city, reset, step, event, say, addWanted, damagePlayer,
    makeCar, spawnParticles, computeLight, drawDynamic,
    tryEnterCar, exitCar, nearestCar,
  };
}
