// Sunset Bay — boot, the fixed-step loop, screens (title / play / pause / end),
// the chase camera, save/load and the ?shot= screenshot staging.
// ?seed=N fixes the city. ?shot=start|drive|chase|mission stages that scene,
// paints it twice and sets window.__shotReady for a screenshot.

import { LOC, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildStatic } from './city.js';
import { Batch, createEngine, matLookAt, matPerspective } from './engine.js';
import { createWorld } from './world.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_JUMP, ACTION_PAUSE, ACTION_PUNCH,
  ACTION_RADIO, ACTION_RETRY, createInput,
} from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const engine = createEngine(canvas);
const world = createWorld(createRandom(seed));
const missions = createMissions(world);
const audio = createAudio();
const input = createInput(canvas);

// Static city geometry, built once.
const staticBatch = new Batch(60000);
buildStatic(staticBatch, world.city);
const dynamicBatch = new Batch(40000);
const skyBatch = new Batch(1000);

// Camera: orbit yaw/pitch around the player (or the car), smoothed.
const camera = {
  yaw: Math.PI * 0.75, pitch: 0.32, dist: 10,
  eye: [-190, 30, -190], target: [-174, 2, -174],
};

function announce(message) {
  status.textContent = message;
}

// ---- save / load ----------------------------------------------------------

function saveGame() {
  try {
    const s = world.state;
    const p = s.player;
    const data = {
      money: s.money, health: s.health, missionIndex: s.missionIndex,
      packagesFound: s.packagesFound,
      packagesTaken: s.city.packages.map((pkg) => pkg.taken),
      player: { x: p.x, z: p.z, heading: p.heading },
      time: s.time, missionsDone: s.stats.missionsDone,
      station: audio.stationName, savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* storage can be off; the game still plays */ }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySave(data) {
  const s = world.state;
  s.money = data.money;
  s.health = data.health;
  s.missionIndex = data.missionIndex;
  s.packagesFound = data.packagesFound || 0;
  s.city.packages.forEach((pkg, i) => { pkg.taken = !!(data.packagesTaken && data.packagesTaken[i]); });
  s.player.x = data.player.x;
  s.player.z = data.player.z;
  s.player.heading = data.player.heading;
  s.time = data.time || 0;
  s.stats.missionsDone = data.missionsDone || 0;
  s.missionText = `Next: mission ${data.missionIndex + 1} of 8 — press R to start`;
  camera.yaw = data.player.heading;
}

// ---- screens ---------------------------------------------------------------

let screen = 'title';
let bannerTimer = 0;
let endKind = '';

const hud = createHud({
  onNewGame: () => { audio.unlock(); startNewGame(); },
  onContinue: () => { audio.unlock(); startContinue(); },
  onResume: () => { audio.unlock(); screen = 'play'; syncOverlays(); announce('Playing.'); },
  onRestart: () => { audio.unlock(); respawn(); },
  onRetry: () => { audio.unlock(); retryMission(); },
  onTitle: () => { audio.unlock(); toTitle(); },
});

function syncOverlays() {
  hud.show('title-screen', screen === 'title');
  hud.show('pause-screen', screen === 'paused');
  hud.show('hud', screen === 'play' || screen === 'paused');
  if (screen !== 'end') hud.hideEnd();
}

function startNewGame() {
  world.reset();
  missions.setActive(null);
  missions.setDone(false);
  world.state.missionText = 'Press R to start the first mission';
  screen = 'play';
  syncOverlays();
  announce('Sunset Bay. Press R to start the first mission.');
  world.say('Welcome to Sunset Bay, Jax. Press R to start mission 1.', 6);
}

function startContinue() {
  const data = loadSave();
  world.reset();
  missions.setActive(null);
  missions.setDone(false);
  if (data) applySave(data);
  screen = 'play';
  syncOverlays();
  announce('Continued your Sunset Bay save.');
  world.say('Welcome back to Sunset Bay.', 4);
}

function toTitle() {
  saveGame();
  screen = 'title';
  syncOverlays();
  hud.setContinueEnabled(!!loadSave());
  announce('Sunset Bay. Title screen.');
}

function respawn() {
  const s = world.state;
  s.health = 100;
  s.wanted = 0;
  s.heli.active = false;
  s.player.arrest = 0;
  s.player.x = LOC.hospital.x;
  s.player.z = LOC.hospital.z;
  s.player.y = 0;
  s.player.vy = 0;
  if (s.player.car) {
    s.player.car.driver = null;
    s.player.car = null;
  }
  s.player.onFoot = true;
  s.money = Math.max(0, s.money - 100);
  hud.hideEnd();
  screen = 'play';
  syncOverlays();
  world.say('Patched up at Bay General. -$100 hospital bill.', 5);
  announce('Respawned at Bay General.');
}

function retryMission() {
  const s = world.state;
  s.health = 100;
  s.wanted = 0;
  s.heli.active = false;
  s.player.arrest = 0;
  // Clear every police cruiser and roadblock: stepPoliceCar chases and rams
  // the player regardless of wanted level, while the wanted-0 cleanup in
  // world.js despawns only ~0.2 cruisers/s — without this, a retry after
  // WASTED at wanted 3 drops the player on foot next to live cruisers
  // that ram them to death within seconds.
  for (let i = s.cars.length - 1; i >= 0; i -= 1) {
    if (s.cars[i].ai === 'police' || s.cars[i].ai === 'roadblock') s.cars.splice(i, 1);
  }
  hud.hideEnd();
  missions.retry();
  screen = 'play';
  syncOverlays();
  announce('Mission restarted.');
}

function showEnd(kind, title, lines, showRetry) {
  endKind = kind;
  screen = 'end';
  hud.setEnd(title, lines, showRetry);
  syncOverlays();
  hud.show('hud', false);
  announce(`${title}. ${lines.join(' ')}`);
}

function handleWorldEvent(ev) {
  const s = world.state;
  switch (ev.type) {
    case 'wasted':
      missions.onEvent('wasted');
      saveGame();
      showEnd('wasted', 'WASTED', [
        `Jax went down in Sunset Bay.`,
        `Money: $${Math.floor(s.money)} — Missions done: ${s.stats.missionsDone}/8`,
        `Packages found: ${s.packagesFound}/10`,
      ], !!missions.active || s.missionIndex < 8);
      audio.sfx('wasted');
      break;
    case 'busted':
      missions.onEvent('busted');
      saveGame();
      showEnd('busted', 'BUSTED', [
        'The Bay PD caught you. Bail posted, ride impounded.',
        `Money: $${Math.floor(s.money)} — Missions done: ${s.stats.missionsDone}/8`,
      ], true);
      audio.sfx('wasted');
      break;
    case 'missionPassed':
      hud.setBanner('MISSION PASSED', `${ev.name} — +$${ev.reward}`, 'pass');
      bannerTimer = 3.5;
      audio.sfx('missionPassed');
      saveGame();
      break;
    case 'missionFailed':
      hud.setBanner('MISSION FAILED', `${ev.name} — ${ev.reason}. Press T to retry.`, 'fail');
      bannerTimer = 4;
      audio.sfx('missionFailed');
      break;
    case 'missionStart':
      audio.sfx('missionStart');
      break;
    case 'objectiveDone':
      audio.sfx('objectiveDone');
      break;
    case 'gameWon':
      saveGame();
      showEnd('won', 'KING OF THE BAY', [
        'All 8 missions complete. Sunset Bay is yours, Jax.',
        `Money: $${Math.floor(s.money)} — Packages: ${s.packagesFound}/10 — Cars stolen: ${s.stats.carsStolen}`,
        'Free roam continues — press Respawn to keep playing.',
      ], false);
      break;
    case 'crash': audio.sfx('crash'); break;
    case 'punch': audio.sfx('punch'); break;
    case 'pickup': audio.sfx('pickup'); break;
    case 'door': audio.sfx('door'); break;
    case 'carjack': audio.sfx('carjack'); break;
    case 'jump': audio.sfx('jump'); break;
    case 'lost': audio.sfx('lost'); break;
    default: break;
  }
}

// ---- camera + render -------------------------------------------------------

function updateCamera(dt) {
  const s = world.state;
  const p = s.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  const py = p.onFoot ? p.y : 0;
  const mouse = input.takeMouse();
  camera.yaw -= mouse.dx * 0.005;
  camera.pitch = Math.max(0.08, Math.min(1.1, camera.pitch + mouse.dy * 0.003));
  const wheel = input.takeWheel();
  if (wheel !== 0) camera.dist = Math.max(6, Math.min(24, camera.dist + wheel * 0.01));
  // When driving, gently swing the camera behind the car.
  if (!p.onFoot && p.car) {
    const behind = p.car.heading;
    let d = behind - camera.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    camera.yaw += d * Math.min(1, dt * 1.2);
  }
  const targetX = px;
  const targetY = py + 2.2;
  const targetZ = pz;
  const dist = camera.dist;
  const eyeX = targetX - Math.sin(camera.yaw) * Math.cos(camera.pitch) * dist;
  const eyeY = targetY + Math.sin(camera.pitch) * dist + 1.5;
  const eyeZ = targetZ - Math.cos(camera.yaw) * Math.cos(camera.pitch) * dist;
  const k = 1 - Math.exp(-dt * 8);
  camera.target[0] += (targetX - camera.target[0]) * k;
  camera.target[1] += (targetY - camera.target[1]) * k;
  camera.target[2] += (targetZ - camera.target[2]) * k;
  camera.eye[0] += (eyeX - camera.eye[0]) * k;
  camera.eye[1] += (eyeY - camera.eye[1]) * k;
  camera.eye[2] += (eyeZ - camera.eye[2]) * k;
}

function render() {
  const s = world.state;
  const light = world.computeLight();
  const { width, height } = engine.resize();
  engine.clear(light.sky);
  const aspect = width / Math.max(1, height);
  const proj = matPerspective((62 * Math.PI) / 180, aspect, 0.1, 1500);
  let eye = camera.eye;
  let target = camera.target;
  if (s.shotCamera) {
    eye = s.shotCamera.eye;
    target = s.shotCamera.target;
  } else if (s.cameraShake > 0 && !shot) {
    // Camera shake is random: keep screenshots deterministic by skipping it in shot mode.
    const sh = s.cameraShake;
    eye = [eye[0] + (Math.random() - 0.5) * sh, eye[1] + (Math.random() - 0.5) * sh, eye[2] + (Math.random() - 0.5) * sh];
  }
  const view = matLookAt(eye[0], eye[1], eye[2], target[0], target[1], target[2]);
  engine.draw(staticBatch, proj, view, light);
  dynamicBatch.reset();
  skyBatch.reset();
  world.drawDynamic(dynamicBatch, skyBatch, s.time);
  engine.draw(dynamicBatch, proj, view, light);
  engine.draw(skyBatch, proj, view, { ...light, fog: [2000, 4000] });
}

// ---- shot mode --------------------------------------------------------------

function snapCamera() {
  const s = world.state;
  const p = s.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  const heading = p.onFoot ? p.heading : p.car.heading;
  camera.yaw = heading;
  camera.pitch = 0.32;
  camera.dist = p.onFoot ? 10 : 13;
  const targetX = px;
  const targetY = (p.onFoot ? p.y : 0) + 2.2;
  const targetZ = pz;
  camera.target = [targetX, targetY, targetZ];
  camera.eye = [
    targetX - Math.sin(camera.yaw) * Math.cos(camera.pitch) * camera.dist,
    targetY + Math.sin(camera.pitch) * camera.dist + 1.5,
    targetZ - Math.cos(camera.yaw) * Math.cos(camera.pitch) * camera.dist,
  ];
}

function runShot(name) {
  const staged = stageShot(name, world, missions);
  screen = staged.screen;
  syncOverlays();
  if (screen === 'title') {
    hud.show('title-screen', true);
    hud.show('hud', false);
  } else {
    hud.show('hud', true);
    snapCamera();
  }
  hud.setContinueEnabled(false);
  let painted = 0;
  function paint() {
    render();
    const s = world.state;
    if (screen === 'play') {
      hud.update(s, missions, Math.abs(s.player.car ? s.player.car.speed * 3.6 : 0), audio.stationName);
      hud.drawMinimap(s);
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// ---- live game --------------------------------------------------------------

function runGame() {
  const hudState = { lastSave: 0 };
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = 0;

  function stepOnce(actions) {
    const axis = input.axis();
    const inputState = {
      forward: axis.forward,
      strafe: axis.strafe,
      run: axis.run,
      jumpPressed: !!(actions & ACTION_JUMP),
      punchPressed: !!(actions & ACTION_PUNCH),
      enterPressed: !!(actions & ACTION_ENTER),
      handbrake: input.has('Space') && !world.state.player.onFoot,
    };
    if (actions & ACTION_PAUSE) {
      screen = 'paused';
      syncOverlays();
      announce('Paused.');
      return;
    }
    if (actions & ACTION_RADIO) {
      if (!missions.active) {
        if (missions.startNext()) audio.sfx('missionStart');
      } else {
        const name = audio.cycleStation();
        world.say(`Radio: ${name}`, 2);
      }
    }
    if (actions & ACTION_RETRY) {
      if (!missions.active) missions.retry();
    }
    const events = world.step(STEP, inputState, camera.yaw);
    for (const ev of events) handleWorldEvent(ev);
    missions.update(STEP);
    // Engine hum + siren follow the world.
    const p = world.state.player;
    const speed01 = p.onFoot ? 0 : Math.abs(p.car.speed) / p.car.spec.top;
    audio.setEngine(speed01, !p.onFoot);
    audio.setSiren(world.state.wanted > 0);
    audio.update(STEP);
    autosaveTimer += STEP;
    if (autosaveTimer > 20) {
      autosaveTimer = 0;
      saveGame();
    }
    void hudState;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dtFrame = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dtFrame;
    last = now;
    // Screen-level keys: the fixed-step loop below only runs on title/play, so
    // confirm/pause on the other screens is handled here, once per frame.
    let actions = input.takeActions();
    if (screen === 'title' && (actions & ACTION_CONFIRM)) {
      startNewGame();
      actions = 0;
    } else if (screen === 'end' && (actions & ACTION_CONFIRM)) {
      if (endKind === 'won') respawn();
      else retryMission();
      actions = 0;
    } else if (screen === 'paused' && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = 'play';
      syncOverlays();
      announce('Playing.');
      actions = 0;
    }
    if (screen === 'play' || screen === 'title') {
      while (accumulator >= STEP) {
        if (screen === 'title') {
          // Attract mode: traffic rolls behind the title card.
          const events = world.step(STEP, { forward: 0, strafe: 0 }, 0);
          for (const ev of events) handleWorldEvent(ev);
        } else {
          stepOnce(actions);
          actions = 0;
        }
        accumulator -= STEP;
        if (screen !== 'play' && screen !== 'title') break;
      }
    } else {
      accumulator = 0;
    }
    if (bannerTimer > 0) {
      bannerTimer -= dtFrame;
      if (bannerTimer <= 0) hud.hideBanner();
    }
    updateCamera(1 / 60);
    render();
    if (screen === 'play' || screen === 'paused') {
      const s = world.state;
      const speedKmh = s.player.onFoot ? 0 : Math.abs(s.player.car.speed) * 3.6;
      hud.update(s, missions, speedKmh, audio.stationName);
      hud.drawMinimap(s);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      syncOverlays();
      announce('Paused.');
    }
  });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

  hud.setContinueEnabled(!!loadSave());
  announce('Sunset Bay. Press Space or click New Game to start.');
  requestAnimationFrame(frame);
}

syncOverlays();
// Debug / verification handle (read-only state for play-testing; no network, no cheats in UI).
window.__sunsetBay = { world, missions, get screen() { return screen; } };
if (shot) runShot(shot);
else runGame();
