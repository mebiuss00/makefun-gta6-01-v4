// police.js — The wanted system, 1-5 stars of Vice City PD. Interceptors spawn
// off-screen (capped per star), pursue a lead point on your velocity and ram;
// foot officers arrive at 2+ stars and shoot at 3+. HEAT is line-of-sight based
// (buildings occlude): spotted = heat builds; hidden long enough = heat decays
// and stars fall one at a time. Near an officer at low speed the BUST ring fills
// — full ring is BUSTED. On water, land units hold at the shore for the patrol boat.

import { colX, rowY, COLS, ROWS, clamp, dist, angDiff, angLerp, lineBlocked, hitsBuilding, isWater, onRoad, COAST_Y } from './world.js';
import { makeCar, damageCar } from './traffic.js';

export const INTERCEPTOR = { id: 'cop', label: 'Interceptor', top: 345, accel: 265, grip: 3.4, tough: 150, w: 37, l: 66 };

export function createPolice() {
  return { units: [], officers: [], heat: 0, lastSeen: 0, bust: 0, spawnT: 0, shotsT: 0 };
}

const CAPS = [0, 2, 3, 5, 7, 9];        // interceptors per star level
const OFFICER_CAPS = [0, 0, 2, 4, 6, 8]; // foot officers per star level

function spawnPoint(G) {
  // A road point 700-950 units from the player, off camera, on land.
  for (let tries = 0; tries < 24; tries++) {
    const a = G.rng() * Math.PI * 2;
    const r = 720 + G.rng() * 240;
    const x = clamp(G.player.x + Math.cos(a) * r, 80, 3920);
    const y = clamp(G.player.y + Math.sin(a) * r, 80, COAST_Y - 60);
    if (onRoad(x, y) && !hitsBuilding(G.buildings, x, y, 20)) return { x, y };
  }
  return { x: colX(2), y: rowY(2) };
}

function makeInterceptor(G, x, y) {
  const c = makeCar('sedan', x, y, Math.atan2(G.player.y - y, G.player.x - x));
  c.type = 'cop'; c.label = 'Interceptor';
  c.w = INTERCEPTOR.w; c.l = INTERCEPTOR.l;
  c.hp = INTERCEPTOR.tough; c.maxHp = INTERCEPTOR.tough;
  c.color = '#e8ecf2'; c.cop = true;
  c.ai = { mode: 'cop', ramT: 0 };
  return c;
}

function makeOfficer(G, x, y) {
  return {
    kind: 'officer', x, y, angle: 0, speed: 0, hp: 40, dead: false, deadT: 0,
    fireT: 1 + G.rng() * 1.4, state: 'advance', coverT: 0, fromCar: null,
  };
}

/** Add wanted level (fractional internally; the star count is the ceiling). */
export function addWanted(G, amount, reason) {
  if (G.state.mode !== 'play') return;
  const before = Math.ceil(G.wanted);
  G.wanted = clamp(G.wanted + amount, 0, 5);
  G.police.heat = Math.min(100, G.police.heat + amount * 26);
  G.police.lastSeen = G.time;
  if (Math.ceil(G.wanted) > before && G.audio) G.audio.sting('tier');
  if (reason && Math.ceil(G.wanted) > before) G.toast(`Wanted level ${Math.ceil(G.wanted)} — ${reason}`);
}

export function clearWanted(G) {
  G.wanted = 0;
  G.police.heat = 0;
  G.police.bust = 0;
  for (const u of G.police.units) u.ai.mode = 'leave';
  for (const o of G.police.officers) o.state = 'leave';
}

/** Can any police element currently see the player? Buildings block the view. */
export function playerSpotted(G) {
  const px = G.player.x, py = G.player.y;
  const check = (x, y, range) => dist(x, y, px, py) < range && !lineBlocked(G.buildings, x, y, px, py);
  for (const u of G.police.units) if (check(u.x, u.y, 430)) return true;
  for (const o of G.police.officers) if (!o.dead && check(o.x, o.y, 380)) return true;
  if (G.patrolBoat && check(G.patrolBoat.x, G.patrolBoat.y, 430)) return true;
  return false;
}

export function updatePolice(G, dt) {
  const P = G.police;
  const stars = Math.ceil(G.wanted);
  const px = G.player.x, py = G.player.y;
  const spotted = stars > 0 && playerSpotted(G);

  // ---- heat & decay -------------------------------------------------------
  if (stars > 0) {
    if (spotted) { P.heat = Math.min(100, P.heat + dt * 14); P.lastSeen = G.time; }
    else {
      const hiddenFor = G.time - P.lastSeen;
      if (hiddenFor > 2.2) {
        P.heat -= dt * (G.player.inCar || G.player.inBoat ? 7 : 9);
        if (P.heat <= 0) {
          G.wanted = Math.max(0, G.wanted - 1);
          P.heat = G.wanted > 0 ? 55 : 0;
          if (G.wanted <= 0) { clearWanted(G); G.toast('You lost the heat. Lay low a while.'); if (G.audio) G.audio.sfx('cash'); }
          else G.toast(`Heat cooling — down to ${Math.ceil(G.wanted)} star${Math.ceil(G.wanted) > 1 ? 's' : ''}. Stay hidden.`);
        }
      }
    }
  } else P.heat = 0;

  // ---- spawning ------------------------------------------------------------
  P.spawnT -= dt;
  const onWaterNow = G.player.inBoat;
  if (stars > 0 && P.spawnT <= 0) {
    P.spawnT = 1.1;
    const landUnits = P.units.filter((u) => u.ai && u.ai.mode === 'cop' && u.hp > 0);
    if (!onWaterNow && landUnits.length < CAPS[stars]) {
      const s = spawnPoint(G);
      const car = makeInterceptor(G, s.x, s.y);
      P.units.push(car); G.cars.push(car);
    }
    const offs = P.officers.filter((o) => !o.dead);
    if (!onWaterNow && offs.length < OFFICER_CAPS[stars] && G.rng() < 0.7) {
      // Officers arrive on foot near the action or step out of a stopped unit.
      const stopped = landUnits.find((u) => Math.abs(u.speed) < 24 && dist(u.x, u.y, px, py) < 420);
      if (stopped) { const o = makeOfficer(G, stopped.x + 26, stopped.y + 10); o.fromCar = stopped; P.officers.push(o); }
      else {
        const a = G.rng() * Math.PI * 2;
        const ox = clamp(px + Math.cos(a) * 330, 40, 3960), oy = clamp(py + Math.sin(a) * 330, 40, COAST_Y - 30);
        if (!hitsBuilding(G.buildings, ox, oy, 8) && !isWater(ox, oy)) P.officers.push(makeOfficer(G, ox, oy));
      }
    }
  }

  // ---- interceptors ---------------------------------------------------------
  for (const u of P.units) {
    if (!u.ai) continue;
    if (u.ai.mode === 'leave') {
      u.speed = Math.min(u.speed + 120 * dt, 170);
      u.x += Math.cos(u.angle) * u.speed * dt;
      u.y += Math.sin(u.angle) * u.speed * dt;
      if (dist(u.x, u.y, px, py) > 800) u.dead = true;
      continue;
    }
    if (u.hp <= 0) continue;
    if (onWaterNow) { // land units hold at the shore
      u.speed = Math.max(0, u.speed - 200 * dt);
      continue;
    }
    // Aim at a lead point: where the player will be in half a second.
    const lead = G.player.inCar || G.player.inBoat ? 0.45 : 0.1;
    const tx = px + G.player.vx * lead, ty = py + G.player.vy * lead;
    const want = Math.atan2(ty - u.y, tx - u.x);
    const d = dist(u.x, u.y, px, py);
    const speedTarget = d > 260 ? INTERCEPTOR.top : d > 90 ? 240 : 120;
    u.speed += clamp(speedTarget - u.speed, -300 * dt, INTERCEPTOR.accel * dt);
    u.angle = angLerp(u.angle, want, dt * INTERCEPTOR.grip * clamp(Math.abs(u.speed) / 90, 0.15, 1));
    let nx = u.x + Math.cos(u.angle) * u.speed * dt;
    let ny = u.y + Math.sin(u.angle) * u.speed * dt;
    if (hitsBuilding(G.buildings, nx, ny, u.w * 0.32) || isWater(nx, ny)) {
      // Slide along the wall: try axis-separated moves, else back out.
      if (!hitsBuilding(G.buildings, nx, u.y, u.w * 0.32) && !isWater(nx, u.y)) u.x = nx;
      else if (!hitsBuilding(G.buildings, u.x, ny, u.w * 0.32) && !isWater(u.x, ny)) u.y = ny;
      else { u.speed = -60; u.x -= Math.cos(u.angle) * 30 * dt * 4; u.y -= Math.sin(u.angle) * 30 * dt * 4; }
    } else { u.x = nx; u.y = ny; }
    // Ramming a slow player car damages both.
    if (G.player.inCar && d < 46 && Math.abs(u.speed) > 130) {
      damageCar(G, G.playerCar, 6);
      damageCar(G, u, 3);
      G.shake = Math.min(9, Math.abs(u.speed) / 36);
      if (G.audio) G.audio.sfx('crash');
      u.speed *= 0.5;
    }
    // An officer steps out when the unit is stopped close to an on-foot player.
    if (!G.player.inCar && !G.player.inBoat && Math.abs(u.speed) < 16 && d < 120 && P.officers.filter((o) => !o.dead).length < OFFICER_CAPS[stars]) {
      if (G.rng() < dt * 0.8) { const o = makeOfficer(G, u.x + 24, u.y); o.fromCar = u; P.officers.push(o); }
    }
    if (d > 1700) u.dead = true; // lost you entirely; despawn and let spawner work
  }
  P.units = P.units.filter((u) => !u.dead);
  G.cars = G.cars.filter((c) => !c.dead);

  // ---- foot officers ---------------------------------------------------------
  for (const o of P.officers) {
    if (o.dead) { o.deadT += dt; continue; }
    if (o.state === 'leave') {
      o.angle = angLerp(o.angle, Math.atan2(o.y - py, o.x - px), dt * 6);
      o.x += Math.cos(o.angle) * 90 * dt; o.y += Math.sin(o.angle) * 90 * dt;
      if (dist(o.x, o.y, px, py) > 700) o.dead = true;
      continue;
    }
    const d = dist(o.x, o.y, px, py);
    const sees = d < 400 && !lineBlocked(G.buildings, o.x, o.y, px, py);
    if (sees) o.angle = Math.atan2(py - o.y, px - o.x);
    // Advance until in firing range (or arrest range on foot), then hold & shoot.
    const wantRange = G.player.inCar || G.player.inBoat ? 210 : 120;
    if (d > wantRange) {
      o.state = 'advance';
      const nx = o.x + Math.cos(o.angle) * 96 * dt;
      const ny = o.y + Math.sin(o.angle) * 96 * dt;
      if (!hitsBuilding(G.buildings, nx, ny, 7) && !isWater(nx, ny)) { o.x = nx; o.y = ny; }
    } else o.state = 'hold';
    // Shooting at 3+ stars: bursts with honest inaccuracy, blocked by buildings.
    if (stars >= 3 && sees && d < 300 && G.state.mode === 'play') {
      o.fireT -= dt;
      if (o.fireT <= 0) {
        o.fireT = 0.85 + G.rng() * 0.9;
        G.enemyShoot(o.x, o.y, o.angle, 0.14);
      }
    }
    if (d > 1600) o.dead = true;
  }
  P.officers = P.officers.filter((o) => !o.dead || o.deadT < 5);

  // ---- bust ring ---------------------------------------------------------------
  const playerSpeed = Math.hypot(G.player.vx, G.player.vy);
  let nearOfficer = false;
  for (const o of P.officers) if (!o.dead && dist(o.x, o.y, px, py) < 54) nearOfficer = true;
  for (const u of P.units) if (u.hp > 0 && Math.abs(u.speed) < 30 && dist(u.x, u.y, px, py) < 64) nearOfficer = true;
  const bustable = stars > 0 && nearOfficer && playerSpeed < 26 && !G.player.inBoat;
  if (bustable) {
    P.bust += dt / 1.5;
    if (P.bust >= 1) { P.bust = 0; G.gameOver('busted'); }
  } else P.bust = Math.max(0, P.bust - dt * 1.4);
}

/** Draw a foot officer: uniform, cap, gun arm when holding. */
export function drawOfficer(ctx, o, cam) {
  const sx = o.x - cam.x, sy = o.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  if (o.dead) {
    ctx.rotate(1.2);
    ctx.fillStyle = '#27324a'; ctx.fillRect(-9, -5, 18, 10);
    ctx.fillStyle = '#e8b08a'; ctx.beginPath(); ctx.arc(12, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(o.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#27324a';
  ctx.fillRect(-8, -7, 16, 14);
  ctx.fillStyle = '#ffd76a';
  ctx.fillRect(-8, -7, 16, 3); // hi-vis stripe
  ctx.fillStyle = '#e8b08a';
  ctx.beginPath(); ctx.arc(2, 0, 5.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#16203a';
  ctx.beginPath(); ctx.arc(3.4, 0, 5, -1.2, 1.2); ctx.fill(); // cap
  if (o.state === 'hold') { ctx.fillStyle = '#111'; ctx.fillRect(8, -1.6, 11, 3.2); }
  ctx.restore();
}
