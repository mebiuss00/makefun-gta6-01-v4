// missions.js — Story jobs and errands, the spine of the empire. TEN chained
// jobs teach then test every system: driving, recruiting Lila, the steal-and-
// spray heat tutorial, racing, the boat-smuggling run, pushing city control to
// 40% (unlocks Marco), buying the safehouse, and the two-part finale. Each job
// is a stage machine (reach / event / survive) with an objective line and a
// world marker. FIVE kinds of timed repeatable errands (taxi, courier, tow,
// vigilante, stunt delivery) pay through the district multiplier between jobs.

import { colX, rowY, clamp, dist } from './world.js';
import { addStanding, paid, cityControl } from './districts.js';

const M = (c, r) => ({ x: colX(c), y: rowY(r) });

export const STORY = [
  {
    id: 'j1', title: 'Job 1 — First Wheels', district: 'downtown',
    intro: 'Get in the teal Vice Sedan by the corner and drive it to the Neon Palms Casino.',
    stages: [{ kind: 'event', event: 'jack', label: 'Get in the teal sedan by the corner (E)', at: { x: 796, y: 300 } },
             { kind: 'reach', at: { x: 2260, y: 760 }, label: 'Drive to the Neon Palms Casino', radius: 85, needCar: true }],
    pay: 200, standing: 6,
    outro: 'Clean run. The city is watching now — a friend at Club Sirena wants to meet you.',
  },
  {
    id: 'j2', title: 'Job 2 — Switch', district: 'neonbay',
    intro: 'Drive to Club Sirena and meet Lila "Switch" Vega. She joins your crew.',
    stages: [{ kind: 'reach', at: { x: 560, y: 1560 }, label: 'Meet Lila at Club Sirena', radius: 80, needCar: false, recruit: 'lila' }],
    pay: 150, standing: 6,
    outro: 'Lila rides shotgun from now on. Time to learn how heat works.',
  },
  {
    id: 'j3', title: 'Job 3 — Hot Paint (heat tutorial)', district: 'downtown',
    intro: 'Steal any car downtown. The theft will draw heat — then lose it at a Pay \'N Spray.',
    stages: [{ kind: 'event', event: 'jack', label: 'Steal any car (walk up, press E)', at: { x: 1760, y: 330 } },
             { kind: 'event', event: 'sprayed', label: 'Lose the heat at any Pay \'N Spray ($100 + $25/star)', at: { x: 2260, y: 590 } }],
    pay: 250, standing: 7,
    outro: 'New paint, no heat. That trick will save your empire a hundred times.',
  },
  {
    id: 'j4', title: 'Job 4 — Prove It On The Street', district: 'neonbay',
    intro: 'Roxy only respects lap times. Win any race — podium pays, first place talks.',
    stages: [{ kind: 'event', event: 'raceTop2', label: 'Finish 1st or 2nd in any race', at: { x: 260, y: 1710 } }],
    pay: 300, standing: 8,
    outro: 'Roxy nods at you now. The Portside crews are hiring muscle with boats.',
  },
  {
    id: 'j5', title: 'Job 5 — Salt Run (boat smuggling)', district: 'portside',
    intro: 'Take a boat from Marina Palmera, run the cargo to the Ferry Dock buoy line, and bring it home dry.',
    stages: [{ kind: 'reach', at: { x: 700, y: 2560 }, label: 'Board a boat at Marina Palmera', radius: 90, needBoat: false },
             { kind: 'reach', at: { x: 2760, y: 2790 }, label: 'Run the cargo east to the Ferry buoy line', radius: 110, needBoat: true },
             { kind: 'reach', at: { x: 700, y: 2560 }, label: 'Bring the boat back to the Marina', radius: 110, needBoat: true }],
    pay: 600, standing: 10,
    outro: 'The bay is yours too. Portside standing is climbing — push the whole city now.',
  },
  {
    id: 'j6', title: 'Job 6 — Forty Percent', district: 'central',
    intro: 'Grow the empire: raise CITY CONTROL to 40% with jobs, errands and races (Tab shows standing). Marco unlocks at 40%.',
    stages: [{ kind: 'event', event: 'control40', label: 'Reach 40% city control (Tab = standing)', at: { x: 2060, y: 1660 } }],
    pay: 500, standing: 6,
    outro: 'Forty percent. Marco "Wrench" Ruiz is at Sunset Auto Works — go recruit your mechanic.',
  },
  {
    id: 'j7', title: 'Job 7 — Home Island', district: 'isla',
    intro: 'Buy the Isla Verde safehouse for $5,000. An empire needs a home with a garage.',
    stages: [{ kind: 'reach', at: { x: 1740, y: 2740 }, label: 'Cross the causeway to Isla Verde', radius: 120, needCar: false },
             { kind: 'event', event: 'safehouse', label: 'Buy the safehouse ($5,000) at its door', at: { x: 1745, y: 2800 } }],
    pay: 400, standing: 10,
    outro: 'Home. Sleep, heal, store a car. Two jobs left: the Portside vault run, then the crown.',
  },
  {
    id: 'j8', title: 'Job 8 — Portside Vault', district: 'portside',
    intro: 'Hit Harbor Warehouse 9, grab the vault cash, and outrun the response. Expect 3+ stars.',
    stages: [{ kind: 'reach', at: { x: 2960, y: 1960 }, label: 'Reach Harbor Warehouse 9', radius: 80, needCar: false, armHeat: 3 },
             { kind: 'reach', at: { x: 1745, y: 2800 }, label: 'Escape to the Isla Verde safehouse', radius: 130, needCar: false }],
    pay: 1500, standing: 12,
    outro: 'The vault money is empire money now. One crown left to take.',
  },
  {
    id: 'j9', title: 'Job 9 — Empire Finale I: The Depot', district: 'central',
    intro: 'The Vice Central Depot holds the last rival crew\'s fleet. Wreck three of their cars.',
    stages: [{ kind: 'event', event: 'wreck3', label: 'Wreck 3 rival cars near the Vice Central Depot', at: { x: 2060, y: 1660 } }],
    pay: 1200, standing: 12,
    outro: 'Their fleet is scrap. Their boss is coming himself — finale, part two.',
  },
  {
    id: 'j10', title: 'Job 10 — Empire Finale II: King of Palmera', district: 'downtown',
    intro: 'Survive the boss\'s 5-star siege downtown for 90 seconds, then reach Vice Tower to claim the city.',
    stages: [{ kind: 'survive', seconds: 90, label: 'Survive the 5-star siege (90s)', at: { x: 1760, y: 330 }, armHeat: 5 },
             { kind: 'reach', at: { x: 1760, y: 330 }, label: 'Reach Vice Tower — claim Palmera City', radius: 95, needCar: false }],
    pay: 5000, standing: 15,
    outro: 'PALMERA CITY IS YOURS. The empire stands — keep racing, keep collecting, keep it.',
  },
];

export const ERRAND_KINDS = [
  { id: 'taxi',    name: 'Taxi Fare',    blurb: 'Pick up the fare and drop them across town, fast.', base: 130, standing: 3, time: 75 },
  { id: 'courier', name: 'Courier Run',  blurb: 'A parcel, a deadline, no questions.', base: 150, standing: 3, time: 70 },
  { id: 'tow',     name: 'Tow Job',      blurb: 'Collect the stranded car\'s driver and bring them to a Spray garage.', base: 170, standing: 4, time: 95 },
  { id: 'vigil',   name: 'Vigilante',    blurb: 'Ram the marked getaway car until it stops. The city thanks you quietly.', base: 220, standing: 5, time: 90 },
  { id: 'stunt',   name: 'Stunt Delivery', blurb: 'Deliver the car WITHOUT wrecking it — arrive above 60% health.', base: 240, standing: 5, time: 100 },
];

export function createMissionState() {
  return { storyIdx: 0, stageIdx: 0, active: null, errand: null, errandCd: 20, counters: { jacked: 0, sprayed: 0, wreckedNearDepot: 0 }, surviveT: 0, done: false };
}

/** Start the current story job (called at its marker / automatically when free). */
export function startStoryJob(G) {
  const MS = G.missions;
  if (MS.done || MS.active) return;
  const job = STORY[MS.storyIdx];
  MS.active = { job, stageIdx: 0 };
  MS.surviveT = 0;
  G.banner(job.title.toUpperCase(), job.intro);
  const st = job.stages[0];
  if (st.armHeat) G.setWanted(st.armHeat, 'the job demands attention');
  if (G.audio) G.audio.sting('job');
}

export function currentStage(G) {
  const MS = G.missions;
  if (!MS.active) return null;
  return MS.active.job.stages[MS.active.stageIdx] || null;
}

export function objectiveText(G) {
  const MS = G.missions;
  if (MS.errand) return `ERRAND — ${MS.errand.kind.name}: ${MS.errand.label} (${Math.max(0, Math.ceil(MS.errand.t))}s)`;
  const st = currentStage(G);
  if (st) return `${MS.active.job.title}: ${st.label}`;
  if (MS.done) return 'Empire complete — free roam: races, packages, errands, standing.';
  const job = STORY[MS.storyIdx];
  return job ? `Go to the ★ marker: ${job.title}` : '';
}

/** The world point the objective arrow and minimap should point at. */
export function objectivePoint(G) {
  const MS = G.missions;
  if (MS.errand) return MS.errand.at;
  const st = currentStage(G);
  if (st) return st.at;
  if (!MS.done) { const job = STORY[MS.storyIdx]; if (job) return job.stages[0].at; }
  return null;
}

function completeJob(G) {
  const MS = G.missions;
  const job = MS.active.job;
  const amount = paid(G, job.district, job.pay);
  G.cash += amount;
  addStanding(G, job.district, job.standing, job.title);
  G.banner('JOB COMPLETE', `${job.title} — +$${amount.toLocaleString('en-US')}. ${job.outro}`);
  if (G.audio) { G.audio.sfx('cash'); G.audio.sting('job'); }
  MS.active = null;
  MS.storyIdx++;
  MS.stageIdx = 0;
  if (MS.storyIdx >= STORY.length) { MS.done = true; G.flags.empireDone = true; }
  G.saveGame();
}

function advanceStage(G) {
  const MS = G.missions;
  MS.active.stageIdx++;
  MS.surviveT = 0;
  const st = currentStage(G);
  if (!st) { completeJob(G); return; }
  if (st.armHeat) G.setWanted(st.armHeat, 'the job escalates');
  G.toast(`Objective: ${st.label}`);
  if (G.audio) G.audio.sfx('checkpoint');
}

/** Events fired by other systems (traffic jacking, properties, races, districts). */
export function missionEvent(G, kind, data) {
  const MS = G.missions;
  if (kind === 'jack') MS.counters.jacked++;
  if (kind === 'spray') MS.counters.sprayed++;
  if (kind === 'wreckNearDepot') MS.counters.wreckedNearDepot++;
  if (!MS.active) return;
  const st = currentStage(G);
  if (!st || st.kind !== 'event') return;
  const ev = st.event;
  const ok =
    (ev === 'jack' && kind === 'jack') ||
    (ev === 'sprayed' && kind === 'spray') ||
    (ev === 'raceTop2' && kind === 'race' && data && data.pos <= 2) ||
    (ev === 'control40' && cityControl(G) >= 40) ||
    (ev === 'safehouse' && G.flags.safehouseOwned) ||
    (ev === 'wreck3' && MS.counters.wreckedNearDepot >= 3);
  if (ok) advanceStage(G);
}

/** Per-frame mission logic: reach checks, survive timers, errand spawning. */
export function updateMissions(G, dt) {
  const MS = G.missions;
  // Story availability: the next job auto-offers when you near its first marker.
  if (!MS.active && !MS.done) {
    const job = STORY[MS.storyIdx];
    if (job && dist(G.player.x, G.player.y, job.stages[0].at.x, job.stages[0].at.y) < 130) startStoryJob(G);
  }
  const st = currentStage(G);
  if (MS.active && st) {
    if (st.kind === 'reach') {
      const vehicleOk = st.needCar ? G.player.inCar : st.needBoat ? G.player.inBoat : true;
      if (vehicleOk && dist(G.player.x, G.player.y, st.at.x, st.at.y) < (st.radius || 80)) {
        if (st.recruit === 'lila' && !G.crew.lila.recruited) G.recruitLila();
        advanceStage(G);
      }
    } else if (st.kind === 'survive') {
      MS.surviveT += dt;
      G.objectiveSub = `Survived ${Math.floor(MS.surviveT)}/${st.seconds}s — keep moving, stay alive!`;
      if (MS.surviveT >= st.seconds) { G.objectiveSub = ''; advanceStage(G); }
    } else if (st.kind === 'event' && st.event === 'control40') {
      if (cityControl(G) >= 40) advanceStage(G);
    } else if (st.kind === 'event' && st.event === 'safehouse') {
      if (G.flags.safehouseOwned) advanceStage(G);
    }
  }
  updateErrands(G, dt);
}

// ------------------------------------------------------------------ errands
function spawnErrand(G) {
  const MS = G.missions;
  const kind = ERRAND_KINDS[Math.floor(G.rng() * ERRAND_KINDS.length)];
  // Two-point errands: pickup A, deliver B; vigilante marks a car instead.
  const a = { x: 200 + G.rng() * 3600, y: 200 + G.rng() * 2000 };
  const b = { x: 200 + G.rng() * 3600, y: 200 + G.rng() * 2000 };
  MS.errand = {
    kind, phase: kind.id === 'vigil' ? 'hunt' : 'pickup',
    at: kind.id === 'vigil' ? null : a, from: a, to: b,
    t: kind.time, label: kind.id === 'vigil' ? 'Find and stop the marked car' : `Pick up: ${kind.name}`,
    targetCar: null,
  };
  if (kind.id === 'vigil') {
    // Mark the nearest traffic car as the getaway car.
    const car = G.cars.find((c) => c.ai && c.ai.mode === 'traffic');
    if (car) { car.ai.mode = 'getaway'; MS.errand.targetCar = car; MS.errand.at = car; }
    else { MS.errand = null; return; }
  }
  G.toast(`Errand offered: ${kind.name} — ${kind.blurb}`);
  if (G.audio) G.audio.sfx('beep');
}

function updateErrands(G, dt) {
  const MS = G.missions;
  if (G.missions.storyIdx < 2 && !MS.done) return; // errands open after job 2
  if (!MS.errand) {
    MS.errandCd -= dt;
    if (MS.errandCd <= 0) { MS.errandCd = 45 + G.rng() * 40; spawnErrand(G); }
    return;
  }
  const E = MS.errand;
  E.t -= dt;
  if (E.t <= 0) { G.toast('Errand failed — out of time. Another will come.'); if (E.targetCar && E.targetCar.ai) E.targetCar.ai.mode = 'traffic'; MS.errand = null; MS.errandCd = 18; return; }
  if (E.kind.id === 'vigil') {
    const car = E.targetCar;
    if (!car || car.dead) { MS.errand = null; return; }
    E.at = car; // marker reads the car's live position
    if (car.hp <= 12) {
      payErrand(G, E, 'Getaway stopped');
      if (car.ai) car.ai.mode = 'traffic';
      MS.errand = null; MS.errandCd = 25;
    }
    return;
  }
  const target = E.phase === 'pickup' ? E.from : E.to;
  E.at = target;
  if (dist(G.player.x, G.player.y, target.x, target.y) < 64) {
    if (E.phase === 'pickup') {
      E.phase = 'deliver';
      E.t = Math.max(E.t, E.kind.time * 0.8);
      E.label = `Deliver: ${E.kind.name}`;
      G.toast('Picked up! Deliver it — the clock is running.');
      if (G.audio) G.audio.sfx('pickup');
      if (E.kind.id === 'stunt' && G.player.inCar) E.startHp = G.playerCar.hp / G.playerCar.maxHp;
    } else {
      if (E.kind.id === 'stunt') {
        const frac = G.player.inCar ? G.playerCar.hp / G.playerCar.maxHp : 0;
        if (frac < 0.6) { G.toast('Too damaged — the stunt client refuses delivery. Errand failed.'); MS.errand = null; MS.errandCd = 20; return; }
      }
      payErrand(G, E, 'Delivered');
      MS.errand = null; MS.errandCd = 25;
    }
  }
}

function payErrand(G, E, verb) {
  const districtId = G.player.districtId || 'downtown';
  const amount = paid(G, districtId, E.kind.base);
  G.cash += amount;
  addStanding(G, districtId, E.kind.standing, E.kind.name);
  G.toast(`${E.kind.name} — ${verb}! +$${amount.toLocaleString('en-US')}`);
  if (G.audio) G.audio.sfx('cash');
}
