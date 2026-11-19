// The story: 8 missions for Jax Marlowe, from new driver in town to King of the Bay,
// plus the side work (taxi fares, marked-car delivery, hidden packages) that keeps
// the city paying between missions. Each mission is a list of steps; a step completes
// when its condition holds, and the next one starts. Failing (Wasted / Busted /
// timer out) ends the mission with a retry.

import { CAR_MODELS, LOC, MISSION_NAMES } from './config.js';
import { dist2d } from './random.js';
import { clearWanted, raiseWanted } from './wanted.js';

export const MISSION_REWARDS = [200, 350, 500, 600, 450, 700, 1200, 1500];

function step(kind, x, z, text, extra) {
  return { kind, x, z, text, ...(extra || {}) };
}

export const MISSIONS = [
  {
    name: MISSION_NAMES[0],
    intro: "Mama Rosa gave you a shot. Walk to the garage, take the sedan, and drive to the contact at Bay Plaza.",
    steps: [
      step('goto', LOC.garage.x + 4, LOC.garage.z + 4, 'Walk to Mama Rosa\'s Garage'),
      step('enterCar', LOC.garage.x + 14, LOC.garage.z + 6, 'Get in the sedan'),
      step('driveTo', LOC.contact.x, LOC.contact.z, 'Drive to the contact at Bay Plaza'),
    ],
  },
  {
    name: MISSION_NAMES[1],
    intro: 'A package is waiting on Pier 1 at the docks. Pick it up on foot and bring it back to the garage.',
    steps: [
      step('driveTo', LOC.docks.x, LOC.docks.z, 'Drive to Sunset Docks'),
      step('pickup', LOC.docksCrateA.x, LOC.docksCrateA.z, 'Pick up the package on foot (E to grab it)'),
      step('driveTo', LOC.garageYard.x, LOC.garageYard.z, 'Bring the package back to the garage'),
    ],
  },
  {
    name: MISSION_NAMES[2],
    intro: 'The pickup put you on the board — 2 stars. Lose the cops, then get back to the garage.',
    steps: [
      step('escape', 0, 0, 'Lose the cops — stay out of sight until the heat drops', { onEnter: (w) => raiseWanted(w, 2, 'The Bay PD spotted the package run — wanted!') }),
      step('driveTo', LOC.garageYard.x, LOC.garageYard.z, 'Get back to the garage'),
    ],
  },
  {
    name: MISSION_NAMES[3],
    intro: 'A yellow sport car is parked at Bay Stadium. Take it — quietly — and bring it to the garage.',
    steps: [
      step('goto', LOC.stadiumGate.x, LOC.stadiumGate.z, 'Go to Bay Stadium'),
      step('stealCar', LOC.stadiumGate.x + 10, LOC.stadiumGate.z, 'Take the marked sport car'),
      step('driveTo', LOC.garageYard.x, LOC.garageYard.z, 'Deliver the sport car to the garage'),
    ],
  },
  {
    name: MISSION_NAMES[4],
    intro: 'Mama Rosa lent you a taxi. Three fares are waiting around the city — beat the clock.',
    steps: [
      step('enterCar', LOC.taxiStand.x, LOC.taxiStand.z, 'Get in the taxi at the stand', { onEnter: (w) => spawnTaxi(w) }),
      step('timedDrive', -116, 203, 'Fare 1: pick up the passenger', { time: 75 }),
      step('timedDrive', 232, -87, 'Fare 2: cross town', { time: 90 }),
      step('timedDrive', LOC.beach.x - 10, LOC.beach.z, 'Fare 3: drop at Sunset Beach', { time: 90 }),
    ],
  },
  {
    name: MISSION_NAMES[5],
    intro: 'A drop is stashed in Palm Park. Grab it on foot and deliver it to the beach — patrols are out tonight.',
    steps: [
      step('pickup', LOC.park.x, LOC.park.z, 'Pick up the drop in Palm Park', { onEnter: (w) => raiseWanted(w, 1, 'A patrol car is circling the park…') }),
      step('driveTo', LOC.beach.x - 12, LOC.beach.z, 'Deliver the drop to Sunset Beach'),
    ],
  },
  {
    name: MISSION_NAMES[6],
    intro: 'The big one: three crates on the docks, then get out before the helicopter boxes you in.',
    steps: [
      step('collect', LOC.docksCrateA.x, LOC.docksCrateA.z, 'Crate 1 of 3 — Pier 1', { spots: [LOC.docksCrateA, LOC.docksCrateB, LOC.docksCrateC] }),
      step('escape', 0, 0, 'Lose the 3-star heat — helicopter is up', { onEnter: (w) => raiseWanted(w, 3, 'Harbor Heist — the whole Bay PD is coming!') }),
      step('driveTo', LOC.garageYard.x, LOC.garageYard.z, 'Get back to the garage with the crates'),
    ],
  },
  {
    name: MISSION_NAMES[7],
    intro: 'Finale: take the goods over the North Bridge to Lighthouse Point, then bring the payment home. The whole city is watching.',
    steps: [
      step('driveTo', LOC.bridge.x, LOC.bridge.z, 'Cross the North Bridge', { onEnter: (w) => raiseWanted(w, 2, 'The finale is on — 2 stars and climbing.') }),
      step('pickup', LOC.island.x + 8, LOC.island.z, 'Grab the goods at Lighthouse Point'),
      step('driveTo', LOC.downtown.x, LOC.downtown.z, 'Bring it home to Downtown — 4 stars!', { onEnter: (w) => raiseWanted(w, 2, 'Maximum heat — 4 stars! Lose them or outrun them.') }),
    ],
  },
];

function spawnTaxi(world) {
  const s = world.state;
  const taxi = world.makeCar('taxi', LOC.taxiStand.x, LOC.taxiStand.z, Math.PI / 2, null, null);
  return taxi;
}

function spawnMarkedSport(world) {
  const car = world.makeCar('sport', LOC.stadiumGate.x + 10, LOC.stadiumGate.z, 0, null, null);
  car.color = [0.95, 0.8, 0.1]; // yellow — the marked car
  return car;
}

export function createMissions(world) {
  const s = world.state;
  let active = null; // {index, step, timer, collected, taxi}
  let done = false;

  function startMission(index) {
    const def = MISSIONS[index];
    active = { index, step: 0, timer: 0, collected: 0, taxi: null };
    s.missionIndex = index;
    s.missionText = def.name;
    world.say(`${def.name}: ${def.intro}`, 7);
    world.event('missionStart', { name: def.name });
    if (index === 3) spawnMarkedSport(world);
    enterStep();
  }

  function enterStep() {
    if (!active) return;
    const def = MISSIONS[active.index];
    const st = def.steps[active.step];
    if (!st) return;
    active.timer = st.time || 0;
    if (st.kind === 'collect') active.collected = 0;
    if (st.onEnter) st.onEnter(world);
    updateMarker();
  }

  function updateMarker() {
    if (!active) { s.marker = null; return; }
    const def = MISSIONS[active.index];
    const st = def.steps[active.step];
    if (!st) { s.marker = null; return; }
    if (st.kind === 'escape') { s.marker = null; return; }
    if (st.kind === 'collect' && st.spots) {
      const next = st.spots[active.collected];
      s.marker = next ? { x: next.x, z: next.z, label: st.text } : null;
      return;
    }
    s.marker = { x: st.x, z: st.z, label: st.text };
  }

  function currentObjective() {
    if (!active) return '';
    const def = MISSIONS[active.index];
    const st = def.steps[active.step];
    if (!st) return '';
    let text = st.text;
    if (st.kind === 'collect' && st.spots) text = `Crate ${active.collected + 1} of ${st.spots.length} — ${st.spots[active.collected].name || 'the docks'}`;
    if (active.timer > 0) text += ` — ${Math.ceil(active.timer)}s left`;
    return text;
  }

  function failMission(reason) {
    if (!active) return;
    world.event('missionFailed', { name: MISSIONS[active.index].name, reason });
    world.say(`Mission failed: ${reason} — press R to retry.`, 6);
    s.marker = null;
    active = null;
  }

  function completeMission() {
    const def = MISSIONS[active.index];
    const reward = MISSION_REWARDS[active.index];
    s.money += reward;
    s.stats.missionsDone += 1;
    world.event('missionPassed', { name: def.name, reward });
    world.say(`Mission passed: ${def.name} — +$${reward}!`, 6);
    active = null;
    s.marker = null;
    const next = s.missionIndex + 1;
    if (next >= MISSIONS.length) {
      done = true;
      world.event('gameWon');
      world.say('KING OF THE BAY — you own Sunset Bay. Story complete!', 10);
      s.missionText = 'Story complete — King of the Bay';
    } else {
      s.missionIndex = next;
      s.missionText = `Next: ${MISSIONS[next].name} — press R to start`;
    }
  }

  function stepDone() {
    active.step += 1;
    world.event('objectiveDone');
    const def = MISSIONS[active.index];
    if (active.step >= def.steps.length) completeMission();
    else enterStep();
  }

  function update(dt) {
    if (!active) return;
    const p = s.player;
    const px = p.onFoot ? p.x : p.car.x;
    const pz = p.onFoot ? p.z : p.car.z;
    const def = MISSIONS[active.index];
    const st = def.steps[active.step];
    if (!st) return;
    if (active.timer > 0) {
      active.timer -= dt;
      if (active.timer <= 0) { failMission('Out of time'); return; }
    }
    const near = (x, z, r) => dist2d(px, pz, x, z) < r;
    switch (st.kind) {
      case 'goto':
        if (near(st.x, st.z, 4)) stepDone();
        break;
      case 'enterCar':
        if (!p.onFoot) stepDone();
        break;
      case 'driveTo':
      case 'timedDrive':
        if (!p.onFoot && near(st.x, st.z, 7)) stepDone();
        break;
      case 'pickup':
        if (p.onFoot && near(st.x, st.z, 3.5)) {
          world.event('pickup');
          stepDone();
        }
        break;
      case 'stealCar':
        if (!p.onFoot && p.car && p.car.model === 'sport') stepDone();
        break;
      case 'collect':
        if (p.onFoot && st.spots && near(st.spots[active.collected].x, st.spots[active.collected].z, 3.5)) {
          active.collected += 1;
          world.event('pickup');
          world.say(`Crate ${active.collected} of ${st.spots.length} secured.`, 3);
          if (active.collected >= st.spots.length) stepDone();
          else updateMarker();
        }
        break;
      case 'escape':
        if (s.wanted === 0) stepDone();
        break;
      default:
        break;
    }
  }

  function onEvent(type) {
    if (type === 'wasted' || type === 'busted') {
      if (active) failMission(type === 'wasted' ? 'Wasted' : 'Busted');
    }
  }

  function startNext() {
    if (done) return false;
    if (active) return false;
    const next = s.missionIndex;
    if (next >= MISSIONS.length) return false;
    startMission(next);
    return true;
  }

  function retry() {
    if (active) return false;
    startMission(s.missionIndex);
    return true;
  }

  return {
    get active() { return active; },
    get done() { return done; },
    startMission, startNext, retry, update, onEvent, currentObjective,
    setDone(v) { done = v; },
    setActive(v) { active = v; },
  };
}

/** Side work: taxi fares pay per drop; called from the world when Jax is in a taxi. */
export function taxiFare(world) {
  const s = world.state;
  const fare = 20 + Math.floor(s.random() * 40);
  s.money += fare;
  world.say(`Fare paid: +$${fare}.`, 3);
  world.event('pickup');
}
