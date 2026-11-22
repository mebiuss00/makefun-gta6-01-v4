// boats.js — The water half of Palmera Heat. The sea is fully navigable: a fast,
// loose Speedboat and a nimble Jet Ski moored at five docks, boarded with E.
// Boats carry momentum, slide wide in turns, throw foam wakes and bounce off
// piers and buoys. At 4+ stars on water the Port Authority sends a Patrol Boat
// that rams. Harbor Dash races here, and two packages are boat-only spots.

import { WORLD_W, WORLD_H, SAND_Y, DOCKS, ISLAND, clamp, dist, hitsBuilding, isWater, isLand } from './world.js';

export const BOAT_TYPES = [
  { id: 'speedboat', label: 'Vice Speedboat', top: 305, accel: 165, turn: 1.55, w: 30, l: 62, colors: ['#ff2e88', '#37e0ff', '#f2f2f2', '#ffe14f'] },
  { id: 'jetski',    label: 'Jet Ski',        top: 265, accel: 240, turn: 2.6,  w: 18, l: 34, colors: ['#7dff6a', '#ff8a3d', '#b78bff', '#e8e8e8'] },
];
export const boatTypeById = (id) => BOAT_TYPES.find((b) => b.id === id) || BOAT_TYPES[0];

// Solid water obstacles: piers (rectangles running south from each dock) and
// buoys scattered in the bay. Boats bounce off both; packages sit on two of them.
export const PIERS = DOCKS.map((d) => ({ x: d.x - 16, y: d.side === 'south' ? 2440 : d.y - 90, w: 32, h: d.side === 'south' ? 130 : 110, name: d.name }));
export const BUOYS = [
  { x: 660, y: 2820, r: 16 }, { x: 3160, y: 2760, r: 22 }, { x: 1200, y: 2700, r: 13 },
  { x: 2300, y: 2850, r: 13 }, { x: 2900, y: 2650, r: 13 }, { x: 420, y: 2680, r: 13 },
];

let nextBoatId = 1;
export function makeBoat(typeId, x, y, angle, colorIdx) {
  const t = boatTypeById(typeId);
  return {
    id: nextBoatId++, kind: 'boat', type: typeId, label: t.label,
    x, y, angle, speed: 0, w: t.w, l: t.l,
    color: t.colors[(colorIdx ?? 0) % t.colors.length],
    hp: 120, maxHp: 120, wake: [], patrol: false,
  };
}

/** The moored fleet: two boats at the marina, one at each other dock. */
export function spawnBoats(G) {
  const boats = [];
  boats.push(makeBoat('speedboat', 700, 2620, Math.PI / 2, 0));
  boats.push(makeBoat('jetski', 760, 2620, Math.PI / 2, 0));
  boats.push(makeBoat('jetski', 330, 2640, Math.PI / 2, 1));
  boats.push(makeBoat('speedboat', 2760, 2620, Math.PI / 2, 1));
  boats.push(makeBoat('speedboat', 3560, 2640, Math.PI / 2, 2));
  boats.push(makeBoat('jetski', 1900, 2880, -Math.PI / 2, 2));
  return boats;
}

export function makePatrolBoat(G) {
  const b = makeBoat('speedboat', G.player.x + 700, Math.max(SAND_Y + 120, G.player.y + 200), -Math.PI / 2, 2);
  b.label = 'Patrol Boat'; b.patrol = true; b.hp = 220; b.maxHp = 220; b.color = '#e8ecf2';
  return b;
}

/** Boat physics: throttle, sliding turns, drag, collisions. */
export function stepBoat(G, boat, dt, throttle, steer) {
  const t = boatTypeById(boat.type);
  const top = boat.patrol ? 330 : t.top;
  const accel = boat.patrol ? 185 : t.accel;
  if (throttle > 0) boat.speed += accel * throttle * dt;
  else if (throttle < 0) boat.speed += accel * 0.45 * throttle * dt;
  boat.speed -= boat.speed * 0.42 * dt; // water drag
  boat.speed = clamp(boat.speed, -70, top);
  const authority = clamp(Math.abs(boat.speed) / 80, 0, 1) * (boat.speed < 0 ? -1 : 1);
  boat.angle += steer * t.turn * authority * dt;
  // Boats slide: velocity lags heading, giving that wide, drifty turn.
  const vx = Math.cos(boat.angle) * boat.speed;
  const vy = Math.sin(boat.angle) * boat.speed;
  boat.vx = (boat.vx ?? vx) + (vx - (boat.vx ?? vx)) * Math.min(1, dt * 2.6);
  boat.vy = (boat.vy ?? vy) + (vy - (boat.vy ?? vy)) * Math.min(1, dt * 2.6);
  let nx = boat.x + boat.vx * dt;
  let ny = boat.y + boat.vy * dt;
  nx = clamp(nx, 26, WORLD_W - 26);
  ny = clamp(ny, 26, WORLD_H - 26);
  // Land is a wall for boats (except sliding up the sand a touch when beaching).
  if (isLand(nx, ny) && ny < SAND_Y + 6 || (isLand(nx, ny) && !isWater(nx, ny) && ny >= SAND_Y + 6)) {
    // allow a slow beach: stop at the waterline
    if (Math.abs(boat.speed) > 60 && G.audio) G.audio.sfx('crash');
    boat.speed *= 0.3; boat.vx *= 0.3; boat.vy *= 0.3;
    nx = boat.x; ny = boat.y;
  }
  // Island shore is solid too.
  if (nx > ISLAND.x - 14 && nx < ISLAND.x + ISLAND.w + 14 && ny > ISLAND.y - 14 && ny < ISLAND.y + ISLAND.h + 14 && !isWater(nx, ny)) {
    boat.speed *= 0.35; nx = boat.x; ny = boat.y;
  }
  // Piers and buoys bounce.
  for (const p of PIERS) {
    if (nx > p.x - 12 && nx < p.x + p.w + 12 && ny > p.y - 12 && ny < p.y + p.h + 12) {
      boat.speed *= -0.3; boat.vx *= -0.3; boat.vy *= -0.3;
      nx = boat.x; ny = boat.y;
      if (G.audio && Math.abs(boat.speed) > 2) G.audio.sfx('crash');
    }
  }
  for (const b of BUOYS) {
    if (dist(nx, ny, b.x, b.y) < b.r + 14) {
      const a = Math.atan2(ny - b.y, nx - b.x);
      nx = b.x + Math.cos(a) * (b.r + 15);
      ny = b.y + Math.sin(a) * (b.r + 15);
      boat.speed *= 0.55;
      if (G.audio) G.audio.sfx('splash');
    }
  }
  boat.x = nx; boat.y = ny;
  // Wake: a fading foam trail, capped so a long run never grows memory.
  if (Math.abs(boat.speed) > 26) {
    boat.wake.push({ x: boat.x - Math.cos(boat.angle) * boat.l * 0.5, y: boat.y - Math.sin(boat.angle) * boat.l * 0.5, t: 0, life: 1.15, w: boat.w * (0.5 + Math.abs(boat.speed) / boatTypeById(boat.type).top) });
    if (boat.wake.length > 90) boat.wake.splice(0, boat.wake.length - 90);
  }
  for (let i = boat.wake.length - 1; i >= 0; i--) { boat.wake[i].t += dt; if (boat.wake[i].t > boat.wake[i].life) boat.wake.splice(i, 1); }
}

/** Patrol boat brain: chase on water at 4+ stars, give up at the shore. */
export function updatePatrolBoat(G, dt) {
  const wantPatrol = G.player.inBoat && Math.ceil(G.wanted) >= 4;
  if (wantPatrol && !G.patrolBoat) {
    G.patrolBoat = makePatrolBoat(G);
    G.toast('Port Authority patrol boat on your tail!');
    if (G.audio) G.audio.sting('tier');
  }
  if (!G.patrolBoat) return;
  const b = G.patrolBoat;
  if (!wantPatrol && (!G.player.inBoat || Math.ceil(G.wanted) < 3)) {
    // Break off: head out to sea and despawn.
    stepBoat(G, b, dt, 0.6, 0);
    b.angle += (Math.PI / 2 - b.angle) * dt;
    if (dist(b.x, b.y, G.player.x, G.player.y) > 1000) G.patrolBoat = null;
    return;
  }
  const tx = G.player.x + (G.playerBoat ? G.playerBoat.vx || 0 : 0) * 0.4;
  const ty = G.player.y + (G.playerBoat ? G.playerBoat.vy || 0 : 0) * 0.4;
  const want = Math.atan2(ty - b.y, tx - b.x);
  let steer = 0;
  const diff = ((want - b.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  steer = clamp(diff * 1.6, -1, 1);
  const d = dist(b.x, b.y, G.player.x, G.player.y);
  stepBoat(G, b, dt, d > 60 ? 1 : 0.3, steer);
  // Ramming damages both hulls.
  if (G.playerBoat && d < 44 && Math.abs(b.speed) > 120) {
    G.playerBoat.hp -= 7; b.hp -= 3;
    G.shake = 6;
    if (G.audio) G.audio.sfx('crash');
    b.speed *= 0.45;
    if (G.playerBoat.hp <= 0) { G.playerBoat.hp = 0; G.toast('Your boat is sinking! Swim for it — press E.'); }
  }
  if (b.hp <= 0) {
    G.effects.push({ kind: 'boom', x: b.x, y: b.y, t: 0, life: 0.8, color: '#7dd8ff' });
    G.cash += 250;
    G.toast('Patrol boat disabled! +$250 salvage nerve bonus.');
    G.patrolBoat = null;
  }
}

/** Nearest boat the player can board: moored boat near a dock or beside them in water. */
export function nearestBoardableBoat(G, range) {
  let best = null, bd = range;
  for (const b of G.boats) {
    const d = dist(b.x, b.y, G.player.x, G.player.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** Draw one boat with hull, stripe, windshield and its foam wake. */
export function drawBoat(ctx, boat, cam) {
  // Wake first, under the hull.
  for (const w of boat.wake) {
    const a = 0.30 * (1 - w.t / w.life);
    ctx.fillStyle = `rgba(220,245,255,${a})`;
    ctx.beginPath();
    ctx.ellipse(w.x - cam.x, w.y - cam.y, w.w * (0.6 + w.t * 0.9), w.w * 0.4 * (0.6 + w.t * 0.9), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const sx = boat.x - cam.x, sy = boat.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(boat.angle);
  ctx.fillStyle = 'rgba(0,20,40,0.35)';
  ctx.beginPath(); ctx.ellipse(2, 4, boat.l * 0.52, boat.w * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = boat.color;
  ctx.beginPath();
  ctx.moveTo(boat.l * 0.55, 0);
  ctx.lineTo(boat.l * 0.2, -boat.w * 0.5);
  ctx.lineTo(-boat.l * 0.5, -boat.w * 0.5);
  ctx.lineTo(-boat.l * 0.5, boat.w * 0.5);
  ctx.lineTo(boat.l * 0.2, boat.w * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-boat.l * 0.42, -boat.w * 0.3, boat.l * 0.5, boat.w * 0.6);
  ctx.fillStyle = boat.patrol ? '#27324a' : '#17384a';
  ctx.fillRect(-boat.l * 0.05, -boat.w * 0.26, boat.l * 0.2, boat.w * 0.52); // cabin / console
  if (boat.patrol) {
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-boat.l * 0.02, -3, 6, 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('PORT AUTH', -boat.l * 0.22, 3);
  }
  if (boat.type === 'jetski') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-4, -3, 10, 6);
  }
  ctx.restore();
}

/** Draw piers and buoys in world space. */
export function drawWaterProps(ctx, G, cam) {
  ctx.fillStyle = '#7a5c3e';
  for (const p of PIERS) {
    const sx = p.x - cam.x, sy = p.y - cam.y;
    if (sx < -80 || sy < -160 || sx > cam.w + 80 || sy > cam.h + 160) continue;
    ctx.fillRect(sx, sy, p.w, p.h);
    ctx.fillStyle = '#937550';
    for (let y = sy + 8; y < sy + p.h - 4; y += 16) ctx.fillRect(sx + 2, y, p.w - 4, 3);
    ctx.fillStyle = '#7a5c3e';
  }
  for (const b of BUOYS) {
    const sx = b.x - cam.x, sy = b.y - cam.y;
    if (sx < -60 || sy < -60 || sx > cam.w + 60 || sy > cam.h + 60) continue;
    const bob = Math.sin(G.time * 2 + b.x) * 2;
    ctx.fillStyle = '#ff5533';
    ctx.beginPath(); ctx.arc(sx, sy + bob, b.r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - b.r * 0.7, sy + bob - 3, b.r * 1.4, 5);
  }
}
