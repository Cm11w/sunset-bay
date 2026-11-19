// The screenshot scenes behind ?shot=start|drive|chase|mission (with &seed=1).
// Each one plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot, so the frame is what real play looks like
// and the same seed always gives the same frame. The loop paints it twice and
// sets window.__shotReady.

import { DAY_LENGTH, LOC, START_TIME, STEP } from './config.js';
import { angleDiff, clamp } from './random.js';

const IDLE = { forward: 0, strafe: 0, run: false, jumpPressed: false, punchPressed: false, enterPressed: false, handbrake: false };

function setTime(world, hours) {
  world.state.time = (((hours - START_TIME) % 24 + 24) % 24) / 24 * DAY_LENGTH;
  world.state.timeOfDay = hours;
}

function driveInput(world, t, weave, roadX) {
  const p = world.state.player;
  const car = p.car;
  if (!car) return IDLE;
  // Brake (never rear-end) when another car is directly ahead.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let blocked = false;
  for (const other of world.state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < 22 && side < 3.2) { blocked = true; break; }
  }
  if (blocked) return { ...IDLE, forward: car.speed > 8 ? -1 : 0.5 };
  const desired = Math.PI + clamp((car.x - roadX) * 0.02, -0.4, 0.4) + (weave ? Math.sin(t * 0.8) * 0.25 : 0);
  const err = angleDiff(car.heading, desired);
  return { ...IDLE, forward: 1, strafe: clamp(err * 2, -1, 1) };
}

export function stageShot(name, world, missions) {
  const s = world.state;
  const p = s.player;
  world.reset();
  missions.setActive(null);
  missions.setDone(false);
  s.shotCamera = null;

  if (name === 'start') {
    // Title vista: golden hour, traffic rolling through downtown, camera high
    // over the south-west looking across the towers toward the beach and sea.
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, IDLE, 0);
    s.shotCamera = { eye: [-300, 130, 330], target: [60, 15, -40] };
    return { screen: 'title' };
  }

  if (name === 'drive') {
    // Downtown drive: Jax in the sport car, north up the 0-road, traffic + peds.
    const car = world.makeCar('sport', 0, 210, Math.PI, null, null);
    p.onFoot = false;
    p.car = car;
    car.driver = 'player';
    for (let i = 0; i < 8 / STEP; i += 1) {
      world.step(STEP, driveInput(world, i * STEP, false, 0), Math.PI);
    }
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // Night pursuit: 3 stars, helicopter up, cruisers closing in.
    setTime(world, 21.6);
    const car = world.makeCar('sedan', 58, 120, Math.PI, null, null);
    p.onFoot = false;
    p.car = car;
    car.driver = 'player';
    world.addWanted(3, 'Shot: night pursuit');
    for (let i = 0; i < 6 / STEP; i += 1) {
      world.step(STEP, driveInput(world, i * STEP, true, 58), Math.PI);
    }
    // Park the helicopter in frame, ahead of the car on its patrol circle.
    // Low (12 m) so it stays under the top of the chase camera's view.
    s.heli.angle = -Math.PI / 2;
    s.heli.x = p.car.x;
    s.heli.z = p.car.z - 50;
    s.heli.y = 12;
    return { screen: 'play' };
  }

  // mission: on foot at the docks, mission 2 active, marker beacon on the crate.
  missions.startMission(1);
  p.x = LOC.docks.x;
  p.z = LOC.docks.z - 22;
  p.heading = 0;
  p.onFoot = true;
  p.car = null;
  world.makeCar('cruiser', 174, 290, 0, 'police', 'ped');
  for (let i = 0; i < 2 / STEP; i += 1) world.step(STEP, IDLE, 0);
  return { screen: 'play' };
}
