# Sunset Bay — Open-World Crime Game

[![Make.fun — GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Cm11w/sunset-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Cm11w/sunset-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) — a fictional sunset beach city, **Sunset Bay**, where **Jax Marlowe**, a hired driver new in town and in debt to Mama Rosa, works his way up through 8 story missions to become the **King of the Bay**.

Everything is original: the city, characters, vehicles, story, art, sound and music. No Rockstar Games name, logo, character, map or asset. No library, no network request — raw WebGL2 and WebAudio, running offline from static files in a desktop browser.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Walk / drive |
| Shift | Run |
| Space | Jump (on foot) / handbrake (driving) |
| E | Enter / exit car — steal it if occupied |
| F | Punch |
| Mouse drag / wheel | Orbit camera / zoom |
| R | Start next mission, or change radio station |
| T | Retry mission |
| P / Esc | Pause |

## What's in the game

- **Sunset Bay** — a 10×10-block grid city: downtown towers, suburb houses, Palm Park, Bay Stadium, Sunset Beach and the sea, Sunset Docks, the North Bridge and Lighthouse Point.
- **8 story missions** — Welcome to the Bay, The Pickup, Getaway Driver, Repo Man, Cab Fare, The Drop, Harbor Heist, and the finale, King of the Bay — with markers, objective text, distance readout, timers, rewards, and pass/fail screens.
- **Driving** — 5 car models (sedan, taxi, sport, van, police cruiser) with arcade physics, damage and smoke; carjacking with witnesses raising your wanted level.
- **Traffic & pedestrians** — AI cars follow the road grid and stop at red lights; pedestrians walk the sidewalks and flee from violence.
- **Wanted 0–5 stars** — police cruisers chase and ram, foot cops try to arrest you, roadblocks at 3+, and a **police helicopter with a searchlight** at 3+. Lose the cops by staying out of sight.
- **HUD + minimap** — health, money, wanted stars, clock, speed, mission objective with distance, and a live minimap (player, traffic, police blips, helicopter, mission marker).
- **Radio & sound** — 3 original synthesised WebAudio stations (Bay FM Synthwave, Harbor Rock, Night Drive) plus engine hum, sirens, crashes, punches and pickups. No audio files, no copyrighted music.
- **Day/night cycle** — golden-hour sunset into night, with street lamps glowing after dark.
- **Side work** — taxi fares, marked-car delivery, and 10 hidden packages worth $100 each.
- **Save** — progress (money, missions, packages, position) autosaves to localStorage; Continue from the title screen.

## Screenshots

Deterministic scenes (`?shot=<name>&seed=1`, 1280×720):

1. `1-start.jpg` — title screen over the city vista at sunset.
2. `2-drive.jpg` — driving downtown at 187 km/h, traffic ahead.
3. `3-chase.jpg` — night pursuit: 3 stars, helicopter overhead, cruiser on your bumper.
4. `4-mission.jpg` — on foot at the docks, mission marker on the pickup.

## Tech

- Raw **WebGL2** (one shader, vertex-colour flat-shaded boxes, directional sun + hemisphere ambient + distance fog) — no three.js, no dependencies.
- Fixed-step 60 Hz simulation with a seeded RNG (`?seed=N`), so the city, traffic and screenshots are reproducible.
- `game/src/` — `main.js` (boot/loop/screens/save), `config.js`, `random.js`, `city.js`, `engine.js`, `world.js`, `missions.js`, `wanted.js`, `audio.js`, `hud.js`, `input.js`, `shots.js`.

## License

MIT — see [LICENSE](LICENSE).
