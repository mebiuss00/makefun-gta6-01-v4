// crew.js — Your crew. Lila "Switch" Vega (story job 2) follows on foot, rides
// shotgun in cars and boats, and shoots at police at 2+ stars; H toggles
// follow/stay. Marco "Wrench" Ruiz unlocks at 40% city control and repairs any
// vehicle he rides in, sparks included. Crew who fall 900+ units behind catch up
// off-screen — a crew member lost to pathfinding is a bug, not a feature. Both
// persist in the save once recruited.

import { clamp, dist, angLerp, hitsBuilding, isWater } from './world.js';

export function createCrew() {
  return {
    lila: { active: false, recruited: false, x: 0, y: 0, angle: 0, mode: 'follow', fireT: 0, inVehicle: false, hp: 100 },
    marco: { active: false, recruited: false, x: 2260, y: 560, angle: 0, mode: 'follow', inVehicle: false, hp: 100 },
  };
}

export const LILA_HOME = { x: 560, y: 1560 };       // outside Club Sirena
export const MARCO_HOME = { x: 1660, y: 2060 };     // Sunset Auto Works

function movePerson(G, p, tx, ty, speed, dt) {
  const d = dist(p.x, p.y, tx, ty);
  if (d < 8) return d;
  const want = Math.atan2(ty - p.y, tx - p.x);
  p.angle = angLerp(p.angle, want, dt * 9);
  const step = Math.min(d, speed * dt);
  const nx = p.x + Math.cos(p.angle) * step;
  const ny = p.y + Math.sin(p.angle) * step;
  if (!hitsBuilding(G.buildings, nx, ny, 7) && !isWater(nx, ny)) { p.x = nx; p.y = ny; }
  else if (!hitsBuilding(G.buildings, nx, p.y, 7) && !isWater(nx, p.y)) p.x = nx;
  else if (!hitsBuilding(G.buildings, p.x, ny, 7) && !isWater(p.x, ny)) p.y = ny;
  return d;
}

function nearestThreat(G, x, y, range) {
  let best = null, bd = range;
  for (const u of G.police.units) { if (u.hp > 0) { const d = dist(x, y, u.x, u.y); if (d < bd) { bd = d; best = { x: u.x, y: u.y, car: u }; } } }
  for (const o of G.police.officers) { if (!o.dead) { const d = dist(x, y, o.x, o.y); if (d < bd) { bd = d; best = { x: o.x, y: o.y, officer: o }; } } }
  if (G.patrolBoat) { const d = dist(x, y, G.patrolBoat.x, G.patrolBoat.y); if (d < bd) best = { x: G.patrolBoat.x, y: G.patrolBoat.y, boat: G.patrolBoat }; }
  return best;
}

export function updateCrew(G, dt) {
  const P = G.player;
  // ---- Lila ---------------------------------------------------------------
  const L = G.crew.lila;
  if (L.recruited && L.active) {
    if (P.inCar || P.inBoat) {
      // Riding shotgun: glued to the vehicle, shooting from the window at 2+.
      L.inVehicle = true;
      const veh = P.inCar ? G.playerCar : G.playerBoat;
      L.x = veh.x; L.y = veh.y; L.angle = veh.angle;
      L.fireT -= dt;
      if (Math.ceil(G.wanted) >= 2 && L.fireT <= 0) {
        const th = nearestThreat(G, L.x, L.y, 320);
        if (th) {
          L.fireT = 0.42 + G.rng() * 0.3;
          G.crewShoot(L.x, L.y, Math.atan2(th.y - L.y, th.x - L.x), th);
        }
      }
    } else {
      L.inVehicle = false;
      // Catch-up teleport: never strand her across the map.
      if (dist(L.x, L.y, P.x, P.y) > 900) {
        L.x = P.x + 60; L.y = P.y + 40;
        if (hitsBuilding(G.buildings, L.x, L.y, 8) || isWater(L.x, L.y)) { L.x = P.x - 60; L.y = P.y - 40; }
      }
      if (L.mode === 'follow') {
        const d = movePerson(G, L, P.x - Math.cos(P.angle) * 26, P.y - Math.sin(P.angle) * 26, d2speed(G, L), dt);
        if (d < 20) L.angle = angLerp(L.angle, P.angle, dt * 6);
      }
      // On foot she still covers you at 2+ stars.
      L.fireT -= dt;
      if (Math.ceil(G.wanted) >= 2 && L.fireT <= 0) {
        const th = nearestThreat(G, L.x, L.y, 280);
        if (th) {
          L.fireT = 0.5 + G.rng() * 0.35;
          L.angle = Math.atan2(th.y - L.y, th.x - L.x);
          G.crewShoot(L.x, L.y, L.angle, th);
        }
      }
    }
  }
  // ---- Marco ----------------------------------------------------------------
  const M = G.crew.marco;
  if (M.recruited && M.active) {
    if (P.inCar) {
      M.inVehicle = true;
      M.x = G.playerCar.x; M.y = G.playerCar.y; M.angle = G.playerCar.angle;
      // The wrench at work: steady repair while riding, with spark effects.
      if (G.playerCar.hp > 0 && G.playerCar.hp < G.playerCar.maxHp) {
        G.playerCar.hp = Math.min(G.playerCar.maxHp, G.playerCar.hp + 7.5 * dt);
        if (G.rng() < dt * 2.2) G.effects.push({ kind: 'spark', x: G.playerCar.x + (G.rng() - 0.5) * 30, y: G.playerCar.y + (G.rng() - 0.5) * 20, t: 0, life: 0.3, color: '#ffd76a' });
      }
    } else {
      M.inVehicle = false;
      if (dist(M.x, M.y, P.x, P.y) > 900) { M.x = P.x - 55; M.y = P.y + 45; }
      if (M.mode === 'follow') movePerson(G, M, P.x + 30, P.y - 24, 150, dt);
    }
  }
}

function d2speed(G, L) {
  const d = dist(L.x, L.y, G.player.x, G.player.y);
  return d > 130 ? 215 : d > 46 ? 132 : 60; // sprint to catch up, stroll when close
}

/** Recruit checks run by missions and by walking up to a waiting crew member. */
export function recruitLila(G) {
  const L = G.crew.lila;
  L.recruited = true; L.active = true;
  L.x = G.player.x + 30; L.y = G.player.y + 10;
  G.banner('CREW +1', 'Lila "Switch" Vega rides with you now. She shoots at 2+ stars. H = follow / stay.');
  if (G.audio) G.audio.sting('unlock');
}
export function recruitMarco(G) {
  const M = G.crew.marco;
  M.recruited = true; M.active = true;
  M.x = G.player.x - 30; M.y = G.player.y + 10;
  G.banner('CREW +1', 'Marco "Wrench" Ruiz joins the empire. He repairs any vehicle he rides in.');
  if (G.audio) G.audio.sting('unlock');
}

/** Draw a crew member (skipped while riding — they're inside the vehicle). */
export function drawCrewMember(ctx, p, cam, style) {
  if (p.inVehicle || !p.active) return;
  const sx = p.x - cam.x, sy = p.y - cam.y;
  if (sx < -40 || sy < -40 || sx > cam.w + 40 || sy > cam.h + 40) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = style.body;
  ctx.fillRect(-8, -7, 16, 14);
  ctx.fillStyle = style.trim;
  ctx.fillRect(-8, 4, 16, 3);
  ctx.fillStyle = style.skin;
  ctx.beginPath(); ctx.arc(2, 0, 5.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = style.hair;
  ctx.beginPath(); ctx.arc(0.5, 0, 5.2, Math.PI * 0.6, Math.PI * 1.7); ctx.fill();
  ctx.restore();
  // Name tag
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  const label = style.name;
  ctx.fillRect(sx - ctx.measureText(label).width / 2 - 4, sy - 30, ctx.measureText(label).width + 8, 13);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, sx, sy - 20);
}

export function drawCrew(ctx, G, cam) {
  drawCrewMember(ctx, G.crew.lila, cam, { body: '#8a1f4d', trim: '#ff4fd8', skin: '#c98d5e', hair: '#1c1420', name: 'LILA "SWITCH"' });
  drawCrewMember(ctx, G.crew.marco, cam, { body: '#3a5a78', trim: '#ffd76a', skin: '#8a5a34', hair: '#0e0e12', name: 'MARCO "WRENCH"' });
  // Marco waiting marker before recruitment (after the 40% unlock).
  if (G.flags.marcoUnlocked && !G.crew.marco.recruited) {
    const sx = MARCO_HOME.x - cam.x, sy = MARCO_HOME.y - cam.y;
    if (sx > -40 && sy > -60 && sx < cam.w + 40 && sy < cam.h + 40) {
      drawCrewMember(ctx, { x: MARCO_HOME.x, y: MARCO_HOME.y, angle: -Math.PI / 2, active: true, inVehicle: false }, cam, { body: '#3a5a78', trim: '#ffd76a', skin: '#8a5a34', hair: '#0e0e12', name: 'MARCO — RECRUIT' });
      const bob = Math.sin(G.time * 3) * 4;
      ctx.fillStyle = '#ffd76a';
      ctx.font = 'bold 20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('!', sx, sy - 40 + bob);
    }
  }
}
