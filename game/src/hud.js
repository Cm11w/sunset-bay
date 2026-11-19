// HUD: DOM panels (health, money, wanted stars, clock, speed, radio, mission,
// messages, banners) plus the 2D minimap canvas and the title/pause/end overlays.
// The game loop calls update() every frame; text is only rewritten when it changes.

import { CITY_MAX, CITY_MIN, FONT, LOC, SEA_X } from './config.js';
import { wantedLabel, wantedStars } from './wanted.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud(callbacks) {
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const cache = new Map();

  function setText(id, text) {
    if (cache.get(id) !== text) {
      cache.set(id, text);
      const node = el(id);
      if (node) node.textContent = text;
    }
  }

  function setStars(wanted) {
    const stars = wantedStars(wanted);
    setText('wanted', stars);
    const node = el('wanted');
    if (node) node.className = wanted > 0 ? 'stars hot' : 'stars';
    setText('wanted-label', wantedLabel(wanted));
  }

  function clock(timeOfDay) {
    const h = Math.floor(timeOfDay) % 24;
    const m = Math.floor((timeOfDay % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Main HUD refresh; cheap enough every frame. */
  function update(state, missions, speedKmh, radioName) {
    setText('money', `$${Math.floor(state.money).toLocaleString('en-US')}`);
    setText('health-fill', '');
    const healthFill = el('health-fill');
    if (healthFill) {
      const pct = Math.max(0, Math.round(state.health));
      healthFill.style.width = `${pct}%`;
      healthFill.style.background = pct > 50 ? '#4caf50' : pct > 25 ? '#ff9800' : '#f44336';
    }
    setStars(state.wanted);
    setText('clock', clock(state.timeOfDay));
    setText('speed', state.player.onFoot ? 'ON FOOT' : `${Math.round(speedKmh)} km/h`);
    setText('radio', radioName);
    setText('packages', `Packages ${state.packagesFound}/10`);
    // Mission line: objective + distance.
    let missionLine = '';
    if (missions.active) {
      const obj = missions.currentObjective();
      const m = state.marker;
      if (m) {
        const px = state.player.onFoot ? state.player.x : state.player.car.x;
        const pz = state.player.onFoot ? state.player.z : state.player.car.z;
        const d = Math.round(Math.hypot(px - m.x, pz - m.z));
        missionLine = `${obj} — ${d}m`;
      } else {
        missionLine = obj;
      }
    } else if (missions.done) {
      missionLine = 'Story complete — King of the Bay!';
    } else {
      missionLine = state.missionText || 'Press R to start the next mission';
    }
    setText('mission', missionLine);
    // Toast message.
    const toast = el('toast');
    if (toast) {
      if (state.messageTimer > 0 && state.message) {
        toast.textContent = state.message;
        toast.style.opacity = '1';
      } else {
        toast.style.opacity = '0';
      }
    }
  }

  /** Minimap: roads, beach, docks, buildings, player arrow, mission marker, police. */
  function drawMinimap(state) {
    const w = minimap.width;
    const h = minimap.height;
    const span = CITY_MAX - CITY_MIN + 90;
    const toMap = (x, z) => [
      ((x - CITY_MIN + 45) / span) * w,
      ((z - CITY_MIN + 45) / span) * h,
    ];
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
    mctx.fillRect(0, 0, w, h);
    // Sea + beach.
    const [seaX] = toMap(SEA_X, 0);
    mctx.fillStyle = '#1a5f8a';
    mctx.fillRect(seaX, 0, w - seaX, h);
    mctx.fillStyle = '#c9b078';
    const [beachX] = toMap(302, 0);
    mctx.fillRect(beachX, 0, seaX - beachX, h);
    // Roads.
    mctx.strokeStyle = '#5a5f6b';
    mctx.lineWidth = 2;
    for (let i = 0; i <= 10; i += 1) {
      const c = -290 + i * 58;
      const [x0, y0] = toMap(c, CITY_MIN);
      const [x1, y1] = toMap(c, CITY_MAX);
      mctx.beginPath(); mctx.moveTo(x0, y0); mctx.lineTo(x1, y1); mctx.stroke();
      const [hx0, hy0] = toMap(CITY_MIN, c);
      const [hx1, hy1] = toMap(CITY_MAX, c);
      mctx.beginPath(); mctx.moveTo(hx0, hy0); mctx.lineTo(hx1, hy1); mctx.stroke();
    }
    // Buildings.
    mctx.fillStyle = '#3a4152';
    for (const b of state.city.buildings) {
      const [bx, by] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      mctx.fillRect(bx, by, Math.max(1.5, (b.w / span) * w), Math.max(1.5, (b.d / span) * h));
    }
    // Docks.
    mctx.fillStyle = '#8a6a3a';
    const [dx, dy] = toMap(-13, 316);
    mctx.fillRect(dx, dy, (200 / span) * w, (24 / span) * h);
    // Traffic (white), police (flashing red/blue), helicopter (yellow).
    for (const car of state.cars) {
      const [cx, cy] = toMap(car.x, car.z);
      if (car.ai === 'police') {
        mctx.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? '#ff2222' : '#2266ff';
      } else {
        mctx.fillStyle = '#dddddd';
      }
      mctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    if (state.heli.active) {
      const [hx, hy] = toMap(state.heli.x, state.heli.z);
      mctx.fillStyle = '#ffdd00';
      mctx.beginPath(); mctx.arc(hx, hy, 4, 0, Math.PI * 2); mctx.fill();
    }
    // Mission marker.
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      const pulse = 5 + Math.sin(state.time * 4) * 2;
      mctx.fillStyle = '#ffdd00';
      mctx.beginPath();
      mctx.moveTo(mx, my - pulse);
      mctx.lineTo(mx + pulse, my);
      mctx.lineTo(mx, my + pulse);
      mctx.lineTo(mx - pulse, my);
      mctx.closePath();
      mctx.fill();
    }
    // Player arrow.
    const p = state.player;
    const px = p.onFoot ? p.x : p.car.x;
    const pz = p.onFoot ? p.z : p.car.z;
    const heading = p.onFoot ? p.heading : p.car.heading;
    const [ax, ay] = toMap(px, pz);
    mctx.fillStyle = '#ffffff';
    mctx.strokeStyle = '#111111';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.moveTo(ax + Math.sin(heading) * 8, ay + Math.cos(heading) * 8);
    mctx.lineTo(ax + Math.sin(heading + 2.6) * 6, ay + Math.cos(heading + 2.6) * 6);
    mctx.lineTo(ax + Math.sin(heading - 2.6) * 6, ay + Math.cos(heading - 2.6) * 6);
    mctx.closePath();
    mctx.fill();
    mctx.stroke();
    // North marker.
    mctx.fillStyle = '#ffffff';
    mctx.font = `bold 11px ${FONT}`;
    mctx.textAlign = 'left';
    mctx.fillText('N', 6, 14);
  }

  function show(id, visible) {
    const node = el(id);
    if (node) node.style.display = visible ? 'flex' : 'none';
  }

  function setBanner(title, sub, tone) {
    setText('banner-title', title);
    setText('banner-sub', sub || '');
    const banner = el('banner');
    if (banner) {
      banner.className = `banner ${tone || ''}`;
      banner.style.display = 'flex';
    }
  }

  function hideBanner() {
    const banner = el('banner');
    if (banner) banner.style.display = 'none';
  }

  function setEnd(title, lines, showRetry) {
    setText('end-title', title);
    const list = el('end-lines');
    if (list) list.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    const retry = el('btn-retry');
    if (retry) retry.style.display = showRetry ? 'inline-block' : 'none';
    show('end-screen', true);
  }

  function hideEnd() {
    show('end-screen', false);
  }

  // Wire the buttons.
  const wire = (id, fn) => {
    const node = el(id);
    if (node) node.addEventListener('click', fn);
  };
  wire('btn-new', () => callbacks.onNewGame());
  wire('btn-continue', () => callbacks.onContinue());
  wire('btn-resume', () => callbacks.onResume());
  wire('btn-restart', () => callbacks.onRestart());
  wire('btn-retry', () => callbacks.onRetry());
  wire('btn-title', () => callbacks.onTitle());
  wire('btn-end-title', () => callbacks.onTitle());
  wire('btn-quit-pause', () => callbacks.onTitle());

  // Continue is only offered when a save exists.
  function setContinueEnabled(enabled) {
    const node = el('btn-continue');
    if (node) node.disabled = !enabled;
  }

  return {
    update, drawMinimap, show, setBanner, hideBanner, setEnd, hideEnd, setContinueEnabled,
  };
}

export { LOC };
