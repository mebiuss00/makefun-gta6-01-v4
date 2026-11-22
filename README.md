[![gta6-01 bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/mebiuss00/makefun-gta6-01-v4/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/mebiuss00/makefun-gta6-01-v4/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Palmera Heat: Vice Empire

A top-down 2D open-world crime game that runs as a static page in a desktop
browser — no build step, no libraries, no network, no external assets. Every
sprite is drawn in canvas 2D code and every sound is synthesized with WebAudio.
Open `game/index.html` (or `node serve.ts`, then http://localhost:8080) and
click to play. Run `node main.ts` to package the entry and its dossier.

**Controls:** WASD / arrows move and drive · Shift sprint · E enter/exit
vehicles and boats, buy, sleep, store · mouse aim, click or Space to shoot ·
F punch · H crew follow/stay · R start a race at its marker · Tab district
standing · M mute · P / Esc pause · Enter start/restart.

## The world

- **4,000 × 3,000 coastal city** on an **8 × 6 avenue grid** with **~90
  procedural buildings**, **24 named landmarks** (Vice Tower, Neon Palms
  Casino, Club Sirena, Portside Cranes, the Isla Verde Lighthouse…) and
  **6 districts** — Neon Bay, Downtown, Portside, Coral Heights, Old Market,
  Vice Central — plus Isla Verde island, joined by a causeway.
- **Beach and open sea to the south, fully navigable by boat**, with 5 docks
  and piers, buoys, and a sunset-to-night **day/night cycle** (240 seconds):
  windows light up, neon signs glow, cars switch on headlight cones.

## On foot and behind the wheel

- Walk and sprint on foot; **7 vehicle types** — Palm Hatch, Vice Sedan,
  Sabre Muscle, Dune Pickup, Cargo Van, Comet Sports, Box Truck — each with
  distinct top speed, acceleration, grip, toughness, size and colours, plus
  the police Interceptor. **~30 parked cars** wait at kerbs; **carjack**
  anything with E.
- **Lane-following traffic AI**: right-hand traffic that brakes for cars,
  pedestrians and you, turns at intersections and stops for gunfights.
- **40 pedestrians** who stroll, cross streets, flee danger and cower under
  fire. Vehicle damage is real — smoke, wrecks, and Marco can fix it (below).

## Police and combat

- **Wanted 1–5 stars**: Interceptors that pursue a lead point and ram, foot
  officers from 2 stars, **shooting at 3+ stars**, and a **Patrol Boat on
  water at 4+ stars**.
- **Line-of-sight heat**: buildings occlude police vision; break sight and
  heat decays star by star. Get cornered at low speed and the **bust ring**
  fills — BUSTED. Die and it's WASTED. Both cost you money, not progress.
- **Fists (F) and mouse-aimed shooting**, including drive-bys from cars and
  boats, with tracers, panic ripples through traffic and crowds.

## Boats — the water half

- **2 boat types**: the fast, loose **Vice Speedboat** and the nimble
  **Jet Ski**, moored at **5 docks/piers**. Boats carry momentum, slide wide,
  throw foam **wakes**, and bounce off piers and buoys.
- The **Port Authority Patrol Boat** chases at 4+ stars on water and rams;
  disable it for a salvage bonus. Two hidden packages are boat-only spots.

## Hidden packages

- **30 hidden packages** on rooftops, in alleys, under piers, on the island
  and on a buoy: **+$150 each**, with **cash milestones at 10 / 20 / 30**
  paying **$1,000 / $2,500 / $6,000** and a minimap **hint pulse** that
  reveals the nearest remaining package. HUD and Tab panel track the count.

## Races — vs Roxy, Dex and Mara

Five repeatable courses with entry fees, 3-2-1-GO countdowns, live
**POS / lap / checkpoint / timer** HUD, gold-silver-bronze medal times,
position payouts scaled by district standing, and **saved medals and best
times**:

1. **Bay Run Sprint** — 6 checkpoints along the bay (car)
2. **Verde Loop Circuit** — tight 2-lap loop, 4 checkpoints per lap (car)
3. **Portside Midnight** — 8 checkpoints between the cranes (car)
4. **Harbor Dash** — 6 water checkpoints across the bay (**boat race**)
5. **Vice City Run** — 10 checkpoints, corner to corner of the city (car)

## District standing and city control

- Jobs, errands and races raise each district's **standing 0–100%**; every
  25% tier adds **+10% to all payouts** earned there. The **Tab panel** shows
  all six bars, multipliers, and **city control %**; the **minimap tints**
  each district as your empire spreads. **40% city control unlocks Marco**
  and gates the finale.

## Crew

- **Lila "Switch" Vega** (story job 2): follows on foot, rides shotgun in
  cars and boats, and **shoots at police at 2+ stars**. H toggles follow/stay.
- **Marco "Wrench" Ruiz** (40% city control, at Sunset Auto Works): a rolling
  pit crew who **continuously repairs the vehicle he rides in**, sparks and
  all. Crew never get lost — stragglers catch up off-screen.

## Properties

- **Pay 'N Spray × 3**: $100 + $25 per wanted star for a full repair, a fresh
  repaint and a completely cleared wanted level.
- **Isla Verde Safehouse — $5,000**: sleep to heal, save, wake to morning
  with the heat gone. Its **one-car personal garage** stores your current car
  (model, colour, health persist in the save) and retrieves it on demand.

## Story and errands

- **10 chained story jobs**: first wheels, recruiting Lila, the
  steal-and-spray **heat tutorial**, proving yourself in a race, the
  **boat-smuggling Salt Run**, the push to **40% control**, buying the
  island home, the Portside vault run, and the **two-part Empire Finale**
  ending in a 90-second 5-star siege.
- **5 kinds of repeatable timed errands** — taxi fares, courier runs, tow
  jobs, vigilante stops, stunt deliveries — the steady income and standing
  engine between story beats.

## Presentation and tech

- **HUD**: cash, health, vehicle health, wanted stars, clock, district name,
  spotted/hidden heat readout, objective line, prompts, toasts and banners.
- **Live minimap**: player arrow, police (cars, officers, patrol boat),
  crew, garages, safehouse, garage car, objectives, checkpoints, package
  hint pulses and district tints.
- **Procedural WebAudio**: a synthwave loop, throttle-following engine,
  proximity sirens, and synthesized SFX and stings — zero audio files.
- Title, pause, BUSTED and WASTED screens; **localStorage save** (cash,
  standing, packages, race records, story progress, crew, safehouse, garage
  car, position). Fixed 60 Hz timestep, capped entities, deterministic
  seeded city, and a staging hook (`?stage=cover|boat|combat|district&
  time=day|night&wanted=N`, signalling `window.__shotReady`) that poses the
  scenes the screenshots were captured from.

## Layout

- `game/index.html` — the page; `game/src/` — the engine, one module per
  system: `main.js` (loop, player, combat, render, HUD), `world.js` (city),
  `traffic.js` (vehicles, traffic, peds), `police.js` (wanted/heat),
  `boats.js`, `races.js`, `crew.js`, `districts.js`, `missions.js`,
  `collectibles.js`, `properties.js`, `audio.js`.
- `main.ts` — packages `game/` + `screenshots/` into `/output` with the
  vendored `vendor/makefun-game.ts` dossier builder (byte-identical to the
  bounty kit). `serve.ts` — local dev server. MIT licensed.
