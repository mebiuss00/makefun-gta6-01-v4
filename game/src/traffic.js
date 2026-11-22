// traffic.js — Vehicles, parked cars, traffic AI and pedestrians. Seven civilian
// vehicle types (plus the police Interceptor) with distinct speed/grip/toughness.
// ~30 parked cars wait at kerbs; traffic follows the avenue lanes (right-hand
// traffic), brakes for cars/peds/the player, turns at intersections and stops
// when a gunfight erupts nearby. 40 pedestrians stroll, flee and cower. Vehicle
// damage is real: smoke when hurt, and a wrecked car will not drive.

import { WORLD_W, WORLD_H, COAST_Y, colX, rowY, COLS, ROWS, ROAD_W, clamp, dist, angDiff, angLerp, hitsBuilding, makeRng, onRoad, isWater } from './world.js';

export const VEHICLE_TYPES = [
  { id: 'hatch',   label: 'Palm Hatch',   top: 235, accel: 150, grip: 3.4, tough: 70,  w: 34, l: 56, colors: ['#c94f6d', '#4f79c9', '#c9c94f', '#7ac94f'] },
  { id: 'sedan',   label: 'Vice Sedan',   top: 265, accel: 165, grip: 3.2, tough: 90,  w: 36, l: 64, colors: ['#b8bec9', '#3a3f4a', '#7a2e35', '#2e4a7a'] },
  { id: 'muscle',  label: 'Sabre Muscle', top: 320, accel: 235, grip: 2.5, tough: 110, w: 38, l: 68, colors: ['#e2703a', '#22242c', '#8a1f2d', '#e8c33a'] },
  { id: 'pickup',  label: 'Dune Pickup',  top: 250, accel: 170, grip: 2.9, tough: 130, w: 40, l: 70, colors: ['#6e7d54', '#8a6a42', '#54677d', '#a84f2e'] },
  { id: 'van',     label: 'Cargo Van',    top: 225, accel: 135, grip: 2.7, tough: 150, w: 42, l: 78, colors: ['#d8d8d8', '#7a8a99', '#4a5568', '#997a2e'] },
  { id: 'sports',  label: 'Comet Sports', top: 380, accel: 300, grip: 3.8, tough: 80,  w: 36, l: 62, colors: ['#ff2e88', '#37e0ff', '#ffe14f', '#f2f2f2'] },
  { id: 'truck',   label: 'Box Truck',    top: 200, accel: 110, grip: 2.2, tough: 190, w: 46, l: 96, colors: ['#c9c9c9', '#5a7a99', '#99703a', '#687a4a'] },
];
export const typeById = (id) => VEHICLE_TYPES.find((t) => t.id === id) || VEHICLE_TYPES[1];

let nextCarId = 1;
export function makeCar(typeId, x, y, angle, colorIdx) {
  const t = typeById(typeId);
  return {
    id: nextCarId++, kind: 'car', type: typeId, label: t.label,
    x, y, angle, speed: 0, w: t.w, l: t.l,
    color: t.colors[(colorIdx ?? Math.floor(Math.random() * t.colors.length)) % t.colors.length],
    hp: t.tough, maxHp: t.tough, driver: null, parked: false,
    ai: null, damageFx: 0, horn: 0,
  };
}

/** ~30 parked cars at kerbs and in lots, deterministic from the city seed. */
export function spawnParkedCars(G) {
  const rng = makeRng(G.seed ^ 0x51ab);
  const cars = [];
  const spots = [];
  // Kerb spots along avenues, offset to the right lane edge.
  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS - 1; j++) {
    spots.push({ x: colX(i) + ROAD_W / 2 - 16, y: rowY(j) + 120 + rng() * 120, a: 0 });
    spots.push({ x: colX(i) - ROAD_W / 2 + 16, y: rowY(j) + 120 + rng() * 120, a: Math.PI });
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS - 1; i++) {
    spots.push({ x: colX(i) + 120 + rng() * 200, y: rowY(j) + ROAD_W / 2 - 16, a: Math.PI / 2 });
  }
  // The player's starter car is always the same teal sedan near spawn.
  const starter = makeCar('sedan', 796, 300, Math.PI / 2, 3);
  starter.parked = true; starter.color = '#1fa8a0';
  cars.push(starter);
  let placed = 1;
  for (const s of spots) {
    if (placed >= 30) break;
    if (rng() < 0.45) continue;
    if (dist(s.x, s.y, 830, 300) < 130) continue;
    if (hitsBuilding(G.buildings, s.x, s.y, 4)) continue;
    const c = makeCar(VEHICLE_TYPES[Math.floor(rng() * VEHICLE_TYPES.length)].id, s.x, s.y, s.a, Math.floor(rng() * 4));
    c.parked = true;
    cars.push(c); placed++;
  }
  return cars;
}

/** A traffic car with a lane-following brain, spawned on a road away from view. */
export function spawnTrafficCar(G) {
  const rng = G.rng;
  const vertical = rng() < 0.5;
  let x, y, angle, dir;
  if (vertical) {
    const c = Math.floor(rng() * COLS);
    dir = rng() < 0.5 ? 1 : -1;
    // Right-hand traffic: heading south (+y) uses the east lane, north the west.
    x = colX(c) + (dir > 0 ? 24 : -24);
    y = 100 + rng() * (COAST_Y - 200);
    angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    const r = Math.floor(rng() * ROWS);
    dir = rng() < 0.5 ? 1 : -1;
    y = rowY(r) + (dir > 0 ? -24 : 24);
    x = 100 + rng() * (WORLD_W - 200);
    angle = dir > 0 ? 0 : Math.PI;
  }
  const c = makeCar(VEHICLE_TYPES[Math.floor(rng() * VEHICLE_TYPES.length)].id, x, y, angle, Math.floor(rng() * 4));
  c.ai = { mode: 'traffic', dir, vertical, turnAt: null, wait: 0 };
  c.speed = 60;
  return c;
}

const PED_COLORS = ['#e8b04f', '#4fb8e8', '#e84f7a', '#7ae84f', '#b48fe8', '#e8e8e8', '#e87a4f', '#4fe8c8'];
export function spawnPeds(G) {
  const rng = makeRng(G.seed ^ 0x77c3);
  const peds = [];
  for (let i = 0; i < 40; i++) {
    const vertical = rng() < 0.5;
    let x, y;
    if (vertical) { x = colX(Math.floor(rng() * COLS)) + (rng() < 0.5 ? -ROAD_W / 2 - 12 : ROAD_W / 2 + 12); y = 90 + rng() * (COAST_Y - 180); }
    else { x = 90 + rng() * (WORLD_W - 180); y = rowY(Math.floor(rng() * ROWS)) + (rng() < 0.5 ? -ROAD_W / 2 - 12 : ROAD_W / 2 + 12); }
    peds.push({
      id: i + 1, kind: 'ped', x, y, angle: rng() * Math.PI * 2, speed: 0,
      color: PED_COLORS[i % PED_COLORS.length], skin: ['#f2c79b', '#c98d5e', '#8a5a34', '#6e4226'][i % 4],
      state: 'stroll', tx: x, ty: y, wait: rng() * 2, panic: 0, hp: 30, dead: false, deadT: 0,
    });
  }
  return peds;
}

/** Shared car physics step: accelerate along heading, steer, integrate, collide. */
export function stepCarPhysics(G, car, dt, throttle, steer) {
  const t = typeById(car.type);
  if (car.hp <= 0) { car.speed = Math.max(0, car.speed - 120 * dt); }
  else {
    car.speed += throttle * t.accel * dt;
    if (throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 60 * dt);
    if (throttle < 0 && car.speed <= 1) car.speed = Math.max(car.speed + throttle * t.accel * 0.5 * dt, -90);
    const drag = car.speed * 0.35;
    car.speed -= drag * dt * Math.sign(car.speed) * 0.4;
    car.speed = clamp(car.speed, -90, t.top);
  }
  const steerAuthority = clamp(Math.abs(car.speed) / 60, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * t.grip * steerAuthority * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  moveCarWithCollision(G, car, nx, ny, dt);
}

/** Move a car, resolving building/world collision with damage on hard hits. */
export function moveCarWithCollision(G, car, nx, ny, dt) {
  const ox = car.x, oy = car.y;
  nx = clamp(nx, 30, WORLD_W - 30);
  ny = clamp(ny, 30, WORLD_H - 30);
  if (isWater(nx, ny) && !G.flags.debug) { nx = ox; ny = oy; if (Math.abs(car.speed) > 40) { car.speed *= 0.4; damageCar(G, car, 4); } }
  const hit = hitsBuilding(G.buildings, nx, ny, car.w * 0.32);
  if (hit) {
    const impact = Math.abs(car.speed);
    if (impact > 90) { damageCar(G, car, (impact - 80) * 0.12); if (G.audio) G.audio.sfx('crash'); G.shake = Math.min(10, impact / 30); }
    car.speed *= -0.25;
    nx = ox; ny = oy;
  }
  car.x = nx; car.y = ny;
  // Car vs car: soft push apart, small damage at speed.
  for (const o of G.cars) {
    if (o === car || o.sunk) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    const min = (car.l + o.l) * 0.32;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const ux = (car.x - o.x) / d, uy = (car.y - o.y) / d;
      car.x += ux * push; car.y += uy * push;
      o.x -= ux * push; o.y -= uy * push;
      if (Math.abs(car.speed) > 120 && car === G.playerCar) { damageCar(G, o, 5); G.addWanted(0.12, 'hit-and-run'); }
      car.speed *= 0.82;
    }
  }
}

export function damageCar(G, car, amount) {
  if (car.hp <= 0) return;
  car.hp = Math.max(0, car.hp - amount);
  car.damageFx = 0.25;
  if (car.hp <= 0) {
    G.effects.push({ kind: 'boom', x: car.x, y: car.y, t: 0, life: 0.6, color: '#ff8a3d' });
    if (G.audio) G.audio.sfx('crash');
    if (car === G.playerCar) G.toast('Your ride is wrecked! Get out and find another.');
  }
}

/** Traffic brains: lanes, braking, intersection turns. */
export function updateTraffic(G, dt) {
  const px = G.player.x, py = G.player.y;
  for (const car of G.cars) {
    if (!car.ai || car.ai.mode !== 'traffic' || car === G.playerCar) continue;
    if (car.hp <= 0) continue;
    const dPlayer = dist(car.x, car.y, px, py);
    if (dPlayer > 1500) { // far away: cheap drift, no decisions
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (car.x < 40 || car.x > WORLD_W - 40 || car.y < 40 || car.y > COAST_Y - 30) { car.angle += Math.PI; car.x = clamp(car.x, 40, WORLD_W - 40); car.y = clamp(car.y, 40, COAST_Y - 30); }
      continue;
    }
    const ai = car.ai;
    // Obstacle scan ahead: cars, peds, the player, gunfire panic.
    const fx = car.x + Math.cos(car.angle) * (car.l * 0.7 + 46);
    const fy = car.y + Math.sin(car.angle) * (car.l * 0.7 + 46);
    let blocked = G.panicAt && dist(car.x, car.y, G.panicAt.x, G.panicAt.y) < 200;
    if (!blocked) for (const o of G.cars) { if (o !== car && dist(fx, fy, o.x, o.y) < 44) { blocked = true; break; } }
    if (!blocked && dist(fx, fy, px, py) < 40 && !G.player.inCar) blocked = true;
    if (!blocked) for (const p of G.peds) { if (!p.dead && dist(fx, fy, p.x, p.y) < 30) { blocked = true; break; } }
    const target = blocked ? 0 : 95;
    car.speed += clamp(target - car.speed, -260 * dt * 60 / 60, 90 * dt) * 1;
    car.speed = clamp(car.speed + (target > car.speed ? 90 * dt : -280 * dt), 0, 110);
    // At an intersection, sometimes turn onto the crossing avenue.
    const nearCol = Math.abs(car.x - colX(Math.round((car.x - 260) / 500))) < 30;
    const nearRow = Math.abs(car.y - rowY(Math.round((car.y - 210) / 380))) < 30;
    if (nearCol && nearRow && G.rng() < dt * 0.55) {
      const turn = G.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      ai.turnTarget = car.angle + turn;
    }
    if (ai.turnTarget !== undefined && ai.turnTarget !== null) {
      car.angle = angLerp(car.angle, ai.turnTarget, dt * 3.2);
      if (Math.abs(angDiff(car.angle, ai.turnTarget)) < 0.06) ai.turnTarget = null;
    }
    // Keep to the right lane for the current heading.
    const laneOff = 24;
    let lx = car.x, ly = car.y;
    const heading = ((Math.round(car.angle / (Math.PI / 2)) % 4) + 4) % 4; // 0 E, 1 S, 2 W, 3 N
    if (heading === 1 || heading === 3) { const c = colX(Math.round((car.x - 260) / 500)); lx = c + (heading === 1 ? laneOff : -laneOff); car.x += clamp(lx - car.x, -40 * dt, 40 * dt); }
    if (heading === 0 || heading === 2) { const r = rowY(Math.round((car.y - 210) / 380)); ly = r + (heading === 0 ? -laneOff : laneOff); car.y += clamp(ly - car.y, -40 * dt, 40 * dt); }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!hitsBuilding(G.buildings, nx, ny, car.w * 0.32) && !isWater(nx, ny)) { car.x = nx; car.y = ny; }
    else { car.speed = 0; ai.turnTarget = car.angle + Math.PI / 2; }
    // Despawn the very far ones occasionally so fresh traffic cycles in.
    if (dPlayer > 1400 && G.rng() < dt * 0.05) { car.dead = true; }
  }
  // Maintain the traffic population near the player.
  const alive = G.cars.filter((c) => c.ai && c.ai.mode === 'traffic' && !c.dead).length;
  if (alive < 9 && G.rng() < dt * 1.4) {
    const c = spawnTrafficCar(G);
    if (dist(c.x, c.y, px, py) > 620 && dist(c.x, c.y, px, py) < 1500) G.cars.push(c);
  }
  G.cars = G.cars.filter((c) => !c.dead);
}

/** Pedestrian brains: stroll between waypoints, flee danger, cower under fire. */
export function updatePeds(G, dt) {
  const px = G.player.x, py = G.player.y;
  for (const p of G.peds) {
    if (p.dead) { p.deadT += dt; continue; }
    const dP = dist(p.x, p.y, px, py);
    const danger = (G.panicAt && dist(p.x, p.y, G.panicAt.x, G.panicAt.y) < 240) || (G.wanted >= 2 && dP < 130 && G.player.inCar && Math.abs(G.playerCarSpeed) > 60);
    if (danger) p.panic = Math.max(p.panic, 1.6);
    if (p.panic > 0) {
      p.panic -= dt;
      const src = G.panicAt || G.player;
      const away = Math.atan2(p.y - src.y, p.x - src.x);
      p.state = G.wanted >= 3 && dP < 90 ? 'cower' : 'flee';
      if (p.state === 'flee') {
        p.angle = angLerp(p.angle, away, dt * 8);
        p.speed = 118;
      } else p.speed = 0;
    } else {
      p.state = 'stroll';
      p.wait -= dt;
      if (p.wait <= 0 || dist(p.x, p.y, p.tx, p.ty) < 14) {
        // New waypoint: along the pavement, sometimes crossing the street.
        const cross = G.rng() < 0.3;
        p.tx = clamp(p.x + (G.rng() - 0.5) * 420, 40, WORLD_W - 40);
        p.ty = clamp(p.y + (G.rng() - 0.5) * (cross ? 300 : 140), 40, COAST_Y - 30);
        p.wait = 2 + G.rng() * 4;
      }
      p.angle = angLerp(p.angle, Math.atan2(p.ty - p.y, p.tx - p.x), dt * 5);
      p.speed = 44;
    }
    const nx = p.x + Math.cos(p.angle) * p.speed * dt;
    const ny = p.y + Math.sin(p.angle) * p.speed * dt;
    if (!hitsBuilding(G.buildings, nx, ny, 6) && !isWater(nx, ny)) { p.x = nx; p.y = ny; }
    else p.wait = 0;
    // Run over check (only at real speed, and it costs you stars).
    if (G.player.inCar && Math.abs(G.playerCarSpeed) > 90 && dist(p.x, p.y, px, py) < 24) {
      p.dead = true; p.deadT = 0;
      G.addWanted(1, 'vehicular assault');
      if (G.audio) G.audio.sfx('crash');
      G.toast('You ran someone down! The heat is coming.');
    }
  }
  G.peds = G.peds.filter((p) => !p.dead || p.deadT < 6);
  while (G.peds.length < 40) {
    const fresh = spawnPeds({ seed: G.seed + G.peds.length * 31 + Math.floor(G.time), rng: G.rng });
    const p = fresh[0];
    if (dist(p.x, p.y, px, py) > 500) G.peds.push(p); else break;
  }
}

/** Nearest car the player could enter/jack, within range, or null. */
export function nearestEnterableCar(G, range) {
  let best = null, bd = range;
  for (const c of G.cars) {
    if (c.sunk) continue;
    const d = dist(c.x, c.y, G.player.x, G.player.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
