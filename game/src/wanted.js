// The wanted system: heat 0-5, police response, roadblocks and the helicopter.
// The spawn/despawn logic lives in world.js (stepWanted); this module is the public
// face missions and the world use to raise heat, plus the HUD helpers.

import { WANTED } from './config.js';

export function raiseWanted(world, n, reason) {
  world.addWanted(n, reason);
}

export function clearWanted(world) {
  world.state.wanted = 0;
  world.state.hiddenTimer = 0;
  world.state.roadblockSpawned = false;
  world.state.heli.active = false;
}

/** Stars for the HUD: filled count = current heat. */
export function wantedStars(wanted) {
  let out = '';
  for (let i = 0; i < WANTED.max; i += 1) out += i < wanted ? '★' : '☆';
  return out;
}

/** Short label for the current heat, shown under the stars. */
export function wantedLabel(wanted) {
  if (wanted === 0) return 'Clean';
  if (wanted === 1) return 'Minor offence';
  if (wanted === 2) return 'Police pursuit';
  if (wanted === 3) return 'Roadblocks + helicopter';
  if (wanted === 4) return 'Major manhunt';
  return 'Maximum heat';
}
