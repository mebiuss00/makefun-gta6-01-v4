// races.js — Five courses vs Roxy, Dex and Mara: four car races on the avenue
// grid plus Harbor Dash, a boat race on the bay. Each has an entry fee, a start
// marker, a 3-2-1-GO countdown, live POS/lap/checkpoint/timer HUD, gold/silver/
// bronze medal times, payouts scaled by position and the home district's standing
// multiplier, and saved medals + best times. Repeatable forever. The rivals drive
// the same checkpoints with per-driver skill (Roxy quick/clean, Dex fast/sloppy,
// Mara steady) on the shared vehicle physics, so races are won by driving.

import { colX, rowY, clamp, dist, angDiff, hitsBuilding, isWater } from './world.js';
import { makeCar, stepCarPhysics } from './traffic.js';
import { makeBoat, stepBoat } from './boats.js';
import { addStanding, paid } from './districts.js';

export const RIVAL_NAMES = ['Roxy', 'Dex', 'Mara'];
const RIVAL_SKILL = [
  { name: 'Roxy', top: 0.94, steer: 1.0, color: '#ff2e88', car: 'sports' },
  { name: 'Dex',  top: 0.97, steer: 0.82, color: '#37e0ff', car: 'muscle' },
  { name: 'Mara', top: 0.90, steer: 1.06, color: '#ffe14f', car: 'sports' },
];

// Checkpoint helper: a point on a named avenue crossing.
const CP = (c, r) => ({ x: colX(c), y: rowY(r) });
const WCP = (x, y) => ({ x, y });

export const RACES = [
  {
    id: 'bayrun', name: 'Bay Run Sprint', kind: 'car', district: 'neonbay',
    fee: 50, laps: 1, start: CP(0, 4),
    checkpoints: [CP(1, 4), CP(2, 4), CP(3, 4), CP(3, 3), CP(2, 3), CP(1, 3)],
    gold: 62, silver: 78, bronze: 100, pay: [400, 220, 120, 40],
    blurb: 'Six checkpoints along the bay avenues. Flat out, no mercy.',
  },
  {
    id: 'verde', name: 'Verde Loop Circuit', kind: 'car', district: 'coral',
    fee: 100, laps: 2, start: CP(1, 1),
    checkpoints: [CP(2, 1), CP(2, 2), CP(1, 2), CP(1, 1)],
    gold: 95, silver: 115, bronze: 145, pay: [650, 350, 180, 60],
    blurb: 'A tight two-lap loop through Coral Heights. Braking zones win this.',
  },
  {
    id: 'midnight', name: 'Portside Midnight', kind: 'car', district: 'portside',
    fee: 150, laps: 1, start: CP(6, 2),
    checkpoints: [CP(7, 2), CP(7, 3), CP(6, 3), CP(6, 4), CP(5, 4), CP(5, 3), CP(6, 3), CP(7, 3)],
    gold: 105, silver: 130, bronze: 165, pay: [900, 480, 250, 80],
    blurb: 'Eight checkpoints between the cranes. Run it after dark for the vibe.',
  },
  {
    id: 'harbor', name: 'Harbor Dash', kind: 'boat', district: 'portside',
    fee: 75, laps: 1, start: WCP(2760, 2680),
    checkpoints: [WCP(3160, 2760), WCP(2500, 2880), WCP(1900, 2790), WCP(1200, 2700), WCP(660, 2820), WCP(1500, 2660)],
    gold: 110, silver: 140, bronze: 180, pay: [700, 380, 200, 70],
    blurb: 'Six buoys across the bay in a speedboat. Mind the piers, feed the wake.',
  },
  {
    id: 'vice', name: 'Vice City Run', kind: 'car', district: 'downtown',
    fee: 250, laps: 1, start: CP(0, 0),
    checkpoints: [CP(2, 0), CP(4, 1), CP(6, 0), CP(7, 2), CP(5, 3), CP(6, 4), CP(4, 4), CP(2, 3), CP(1, 4), CP(0, 2)],
    gold: 170, silver: 210, bronze: 265, pay: [1600, 850, 450, 150],
    blurb: 'The big one: ten checkpoints, corner to corner of the whole city.',
  },
];
export const raceById = (id) => RACES.find((r) => r.id === id);

export function createRaceState() {
  return { active: null, phase: 'idle', countdown: 0, time: 0, playerCp: 0, playerLap: 1, rivals: [], finished: [], playerFinish: 0, resultsT: 0 };
}

/** The race the player is close enough to start (standing at its marker), or null. */
export function raceAtPlayer(G) {
  if (G.race.active) return null;
  for (const r of RACES) {
    const inRightVehicle = r.kind === 'boat' ? G.player.inBoat : G.player.inCar;
    if (inRightVehicle && dist(G.player.x, G.player.y, r.start.x, r.start.y) < 74) return r;
  }
  return null;
}

export function startRace(G, race) {
  if (G.cash < race.fee) { G.toast(`Entry fee is $${race.fee} — you have $${Math.floor(G.cash)}.`); return false; }
  G.cash -= race.fee;
  const R = G.race;
  R.active = race; R.phase = 'countdown'; R.countdown = 3.2; R.time = 0;
  R.playerCp = 0; R.playerLap = 1; R.finished = []; R.playerFinish = 0; R.resultsT = 0;
  R.rivals = [];
  // Grid the rivals beside/behind the start, in their signature cars or boats.
  RIVAL_SKILL.forEach((s, i) => {
    const off = (i - 1) * 52;
    if (race.kind === 'boat') {
      const b = makeBoat(i === 1 ? 'jetski' : 'speedboat', race.start.x - 60 - i * 46, race.start.y + off, 0, i);
      b.color = s.color;
      R.rivals.push({ name: s.name, skill: s, boat: b, cp: 0, lap: 1, finish: 0, progress: 0 });
      G.boats.push(b);
    } else {
      const c = makeCar(s.car, race.start.x - 70 - (i % 2) * 56, race.start.y + off, 0);
      c.color = s.color;
      c.ai = { mode: 'racer' };
      R.rivals.push({ name: s.name, skill: s, car: c, cp: 0, lap: 1, finish: 0, progress: 0 });
      G.cars.push(c);
    }
  });
  G.banner(race.name.toUpperCase(), `${race.blurb} Fee $${race.fee} paid — gold under ${race.gold}s.`);
  if (G.audio) G.audio.sfx('beep');
  return true;
}

function rivalTarget(race, rv) {
  const list = race.checkpoints;
  if (rv.cp >= list.length) return race.start;
  return list[rv.cp];
}

function advanceIfReached(G, race, x, y, holder) {
  const target = rivalTarget(race, holder);
  const radius = race.kind === 'boat' ? 74 : 66;
  if (dist(x, y, target.x, target.y) > radius) return;
  if (holder.cp >= race.checkpoints.length) {
    // Crossed the start line: lap or finish.
    holder.lap++;
    holder.cp = 0;
    if (holder.lap > race.laps) { holder.finish = G.race.time; return; }
    if (G.audio && holder === G.race) G.audio.sfx('checkpoint');
    return;
  }
  holder.cp++;
}

export function updateRace(G, dt) {
  const R = G.race;
  if (!R.active) return;
  const race = R.active;
  if (R.phase === 'countdown') {
    const before = Math.ceil(R.countdown);
    R.countdown -= dt;
    const after = Math.ceil(R.countdown);
    if (after < before && after > 0 && G.audio) G.audio.sfx('beep');
    if (R.countdown <= 0) { R.phase = 'run'; if (G.audio) G.audio.sfx('go'); G.toast('GO!'); }
    return;
  }
  if (R.phase === 'results') {
    R.resultsT -= dt;
    if (R.resultsT <= 0) endRace(G);
    return;
  }
  R.time += dt;
  // ---- player progress ------------------------------------------------------
  const pHolder = { cp: R.playerCp, lap: R.playerLap };
  const prevCp = R.playerCp, prevLap = R.playerLap;
  advanceIfReached(G, race, G.player.x, G.player.y, pHolder);
  if (pHolder.cp !== prevCp || pHolder.lap !== prevLap) {
    R.playerCp = pHolder.cp; R.playerLap = pHolder.lap;
    if (G.audio) G.audio.sfx('checkpoint');
    if (pHolder.lap > race.laps && !R.playerFinish) {
      R.playerFinish = R.time;
      finishRace(G, 0);
    } else {
      G.toast(`Checkpoint ${Math.min(R.playerCp + 1, race.checkpoints.length)}/${race.checkpoints.length}${race.laps > 1 ? ` — lap ${Math.min(R.playerLap, race.laps)}/${race.laps}` : ''}`);
    }
  }
  // ---- rivals ---------------------------------------------------------------
  for (const rv of R.rivals) {
    if (rv.finish) continue;
    const veh = race.kind === 'boat' ? rv.boat : rv.car;
    const target = rivalTarget(race, rv);
    const want = Math.atan2(target.y - veh.y, target.x - veh.x);
    const diff = angDiff(want, veh.angle);
    const steer = clamp(diff * 1.7, -1, 1) * rv.skill.steer;
    if (race.kind === 'boat') stepBoat(G, rv.boat, dt, 0.92 * rv.skill.top + 0.08, steer);
    else {
      // Drive the rival car with the shared physics toward its checkpoint.
      const throttle = Math.abs(diff) > 1.9 ? -0.4 : rv.skill.top;
      const beforeX = veh.x, beforeY = veh.y;
      stepCarPhysics(G, veh, dt, throttle, steer);
      if (dist(beforeX, beforeY, veh.x, veh.y) < 2 && Math.abs(veh.speed) < 8) {
        // Stuck on a corner: reverse out like a human would.
        veh.speed = -70; veh.angle += dt * 1.4;
      }
      if (isWater(veh.x, veh.y)) { veh.x = beforeX; veh.y = beforeY; veh.speed = 0; }
    }
    const holder = { cp: rv.cp, lap: rv.lap };
    advanceIfReached(G, race, veh.x, veh.y, holder);
    rv.cp = holder.cp; rv.lap = holder.lap;
    if (holder.lap > race.laps && !rv.finish) {
      rv.finish = R.time;
      R.finished.push(rv);
      if (!R.playerFinish) G.toast(`${rv.name} finished! Hurry!`);
    }
    rv.progress = (rv.lap - 1) * race.checkpoints.length + rv.cp + (1 - clamp(dist(veh.x, veh.y, target.x, target.y) / 900, 0, 1));
  }
  // Abandon: leaving the vehicle kind or wandering 1600+ from the next CP quits.
  const inRight = race.kind === 'boat' ? G.player.inBoat : G.player.inCar;
  const nextCp = R.playerCp >= race.checkpoints.length ? race.start : race.checkpoints[R.playerCp];
  if (!inRight || dist(G.player.x, G.player.y, nextCp.x, nextCp.y) > 1700) {
    G.toast('Race abandoned.');
    endRace(G);
  }
}

/** Player position 1..4 right now, from progress scores. */
export function playerPosition(G) {
  const R = G.race;
  if (!R.active) return 1;
  const race = R.active;
  const nextCp = R.playerCp >= race.checkpoints.length ? race.start : race.checkpoints[R.playerCp];
  const mine = (R.playerLap - 1) * race.checkpoints.length + R.playerCp + (1 - clamp(dist(G.player.x, G.player.y, nextCp.x, nextCp.y) / 900, 0, 1));
  let pos = 1;
  for (const rv of R.rivals) if (rv.progress > mine || rv.finish) pos++;
  return clamp(pos, 1, 4);
}

function finishRace(G, _unused) {
  const R = G.race;
  const race = R.active;
  const pos = 1 + R.finished.length; // rivals who finished before the player
  R.finalPos = clamp(pos, 1, 4);
  R.phase = 'results';
  R.resultsT = 5;
  const base = race.pay[R.finalPos - 1] || 0;
  const amount = paid(G, race.district, base);
  G.cash += amount;
  const t = R.playerFinish;
  const medal = t <= race.gold ? 'GOLD' : t <= race.silver ? 'SILVER' : t <= race.bronze ? 'BRONZE' : null;
  // Save best + medal (best medal kept, best time kept).
  const rec = G.records.races[race.id] || { best: 0, medal: null };
  if (!rec.best || t < rec.best) rec.best = t;
  const rank = { GOLD: 3, SILVER: 2, BRONZE: 1 };
  if (medal && (!rec.medal || rank[medal] > rank[rec.medal])) rec.medal = medal;
  G.records.races[race.id] = rec;
  addStanding(G, race.district, R.finalPos === 1 ? 9 : R.finalPos === 2 ? 6 : 4, `${race.name} P${R.finalPos}`);
  G.banner(`${race.name} — P${R.finalPos}`, `${medal ? medal + ' medal! ' : ''}Time ${t.toFixed(1)}s — payout $${amount.toLocaleString('en-US')} (x${(amount / Math.max(1, base)).toFixed(1)} district bonus).`);
  if (G.audio) { G.audio.sfx('cash'); if (medal === 'GOLD') G.audio.sting('win'); }
  if (G.missionEvent) G.missionEvent('race', { raceId: race.id, pos: R.finalPos });
  G.saveGame();
}

function endRace(G) {
  const R = G.race;
  if (!R.active) return;
  for (const rv of R.rivals) {
    if (rv.car) { G.cars = G.cars.filter((c) => c !== rv.car); }
    if (rv.boat) { G.boats = G.boats.filter((b) => b !== rv.boat); }
  }
  R.active = null; R.phase = 'idle'; R.rivals = [];
}

/** The checkpoint the player should head to (for the arrow, beacon and minimap). */
export function currentTarget(G) {
  const R = G.race;
  if (!R.active || R.phase !== 'run') return null;
  return R.playerCp >= R.active.checkpoints.length ? R.active.start : R.active.checkpoints[R.playerCp];
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Race HUD: POS, lap, checkpoint, timer and the medal target, top-centre. */
export function drawRaceHUD(ctx, G, W) {
  const R = G.race;
  if (!R.active) return;
  const race = R.active;
  ctx.save();
  ctx.textAlign = 'center';
  if (R.phase === 'countdown') {
    ctx.font = 'bold 84px system-ui';
    ctx.fillStyle = '#ffe14f';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 8;
    const label = R.countdown > 0.2 ? String(Math.ceil(R.countdown)) : 'GO!';
    ctx.strokeText(label, W / 2, 190); ctx.fillText(label, W / 2, 190);
  }
  const pw = 430;
  ctx.fillStyle = 'rgba(5,6,16,0.72)';
  ctx.beginPath(); ctx.roundRect((W - pw) / 2, 12, pw, 64, 10); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 19px system-ui';
  ctx.fillText(`${race.name}   POS ${playerPosition(G)}/4`, W / 2, 38);
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#9fd8ff';
  const cpText = `CP ${Math.min(R.playerCp + 1, race.checkpoints.length)}/${race.checkpoints.length}${race.laps > 1 ? `  LAP ${Math.min(R.playerLap, race.laps)}/${race.laps}` : ''}`;
  ctx.fillText(`${cpText}   TIME ${fmtTime(R.time)}   GOLD ${race.gold}s`, W / 2, 60);
  if (R.phase === 'results') {
    ctx.font = 'bold 30px system-ui';
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(`FINISHED — P${R.finalPos}`, W / 2, 116);
  }
  ctx.restore();
}

/** World-space race art: start arch marker and the next-checkpoint beacon. */
export function drawRaceWorld(ctx, G, cam) {
  const t = G.time;
  for (const r of RACES) {
    const active = G.race.active === r;
    if (!active && (G.race.active || dist(G.player.x, G.player.y, r.start.x, r.start.y) > 800)) continue;
    const sx = r.start.x - cam.x, sy = r.start.y - cam.y;
    if (sx < -100 || sy < -100 || sx > cam.w + 100 || sy > cam.h + 100) continue;
    ctx.save();
    ctx.strokeStyle = active ? '#7dff6a' : (r.kind === 'boat' ? '#37e0ff' : '#ffd76a');
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 9]);
    ctx.beginPath(); ctx.arc(sx, sy, 46 + Math.sin(t * 3) * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(r.kind === 'boat' ? 'BOAT RACE' : 'RACE', sx, sy - 56);
    ctx.font = '11px system-ui';
    ctx.fillText(r.name, sx, sy + 66);
    ctx.restore();
  }
  const target = currentTarget(G);
  if (target) {
    const sx = target.x - cam.x, sy = target.y - cam.y;
    const grad = ctx.createLinearGradient(0, sy - 190, 0, sy);
    grad.addColorStop(0, 'rgba(125,255,106,0)');
    grad.addColorStop(1, 'rgba(125,255,106,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - 13, sy - 190, 26, 190);
    ctx.strokeStyle = '#7dff6a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sx, sy, 40 + Math.sin(t * 5) * 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#7dff6a';
    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('CHECKPOINT', sx, sy - 200);
  }
}
