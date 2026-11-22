// main.js — Palmera Heat: Vice Empire, a top-down 2D open-world crime game.
// Owns the canvas, fixed-timestep loop, the player (foot / cars / boats), combat
// (fists + mouse-aimed shooting incl. drive-bys), the save, HUD + minimap, the
// screens (title / pause / BUSTED / WASTED), the screenshot staging hook, and the
// world render (roads, beach, sea, day/night buildings, neon, headlight cones).
// Systems: world (city), traffic (7 vehicles, peds), police (wanted/heat),
// boats (incl. patrol boat), races (5 vs Roxy/Dex/Mara), crew (Lila + Marco),
// districts (standing), missions (10 jobs + errands), collectibles (30 packages),
// properties (Pay 'N Spray, safehouse + garage), audio (synthwave/engine/sirens).
// Controls: WASD move/drive, Shift sprint, E interact, mouse aim + click/Space
// shoot, F punch, H crew follow/stay, R race, Tab standing, M mute, P pause.

import { WORLD_W, WORLD_H, COAST_Y, SAND_Y, ISLAND, DISTRICTS, LANDMARKS, GARAGES, DOCKS, clamp, lerp, dist, angDiff, daylight, isNight, timeLabel, buildCity, hitsBuilding, collideCircle, isWater, isSand, districtAt, makeRng, colX, rowY } from './world.js';
import { VEHICLE_TYPES, typeById, makeCar, spawnParkedCars, spawnTrafficCar, spawnPeds, stepCarPhysics, damageCar, updateTraffic, updatePeds, nearestEnterableCar } from './traffic.js';
import { createPolice, addWanted as policeAddWanted, clearWanted as policeClearWanted, updatePolice, drawOfficer, playerSpotted } from './police.js';
import { spawnBoats, makePatrolBoat, stepBoat, updatePatrolBoat, nearestBoardableBoat, drawBoat, drawWaterProps, PIERS } from './boats.js';
import { createRaceState, raceAtPlayer, startRace, updateRace, drawRaceHUD, drawRaceWorld, currentTarget } from './races.js';
import { createCrew, updateCrew, drawCrew, recruitLila, recruitMarco, MARCO_HOME } from './crew.js';
import { createStanding, cityControl, drawStandingPanel } from './districts.js';
import { createMissionState, updateMissions, missionEvent, objectiveText, objectivePoint } from './missions.js';
import { createPackages, updatePackages, drawPackages } from './collectibles.js';
import { updateProperties, propertyAction, SAFEHOUSE_DOOR } from './properties.js';
import { AudioEngine } from './audio.js';

// ---- canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VW = 1280, VH = 720;
function resize() {
  VW = canvas.width = window.innerWidth;
  VH = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---- input
const keys = {};
const mouse = { x: 0, y: 0, down: false };
let pressed = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  G.audio.ensure();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => { mouse.down = true; G.audio.ensure(); handleClick(); });
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function keyHit(code) { return !!pressed[code]; }

// ---- state
const SAVE_KEY = 'palmera-heat-vice-empire-v4';
const G = {
  time: 0, dayT: 0.34, seed: 20261122,
  rng: makeRng(987654321),
  state: { mode: 'title' }, // title | play | pause | over
  overKind: null, overT: 0,
  buildings: [], cars: [], peds: [], boats: [], bullets: [], effects: [],
  patrolBoat: null,
  player: null, playerCar: null, playerBoat: null, playerCarSpeed: 0,
  cash: 250, wanted: 0,
  police: createPolice(),
  standing: createStanding(),
  crew: createCrew(),
  race: createRaceState(),
  missions: createMissionState(),
  packages: [], packagesFound: 0, hintPulse: null,
  records: { races: {} },
  flags: {},
  garageCar: null,
  log: [],
  bannerQ: [], bannerT: 0, toastQ: [], toastT: 0,
  prompt: '', sprayPrompt: null, housePrompt: false, garagePrompt: false,
  objectiveSub: '',
  showPanel: false, shake: 0, panicAt: null, panicT: 0,
  fireT: 0, punchT: 0, muted: false,
  staged: null,
};
G.audio = new AudioEngine();

function resetPlayer(x, y) {
  G.player = {
    x, y, angle: -Math.PI / 2, vx: 0, vy: 0, hp: 100, maxHp: 100,
    inCar: false, inBoat: false, districtId: 'downtown', walkPhase: 0,
  };
}
resetPlayer(760, 300);

// ---- helpers on G
G.toast = (text) => { G.toastQ.push(text); if (G.toastQ.length > 3) G.toastQ.shift(); G.toastT = 3.4; };
G.banner = (title, sub) => { G.bannerQ.push({ title, sub }); };
G.addWanted = (amount, reason) => policeAddWanted(G, amount, reason);
G.setWanted = (level, reason) => { G.wanted = Math.max(G.wanted, level); G.police.heat = Math.max(G.police.heat, 60); G.police.lastSeen = G.time; if (reason) G.toast(reason); };
G.clearWanted = () => policeClearWanted(G);
G.missionEvent = (kind, data) => missionEvent(G, kind, data);
G.recruitLila = () => recruitLila(G);
G.recruitMarco = () => recruitMarco(G);

G.saveGame = () => {
  try {
    const data = {
      cash: G.cash, standing: G.standing, dayT: G.dayT,
      packages: G.packages.filter((p) => p.found).map((p) => p.id),
      records: G.records, storyIdx: G.missions.storyIdx, storyDone: G.missions.done,
      flags: G.flags, garageCar: G.garageCar,
      crew: { lila: G.crew.lila.recruited, marco: G.crew.marco.recruited },
      px: Math.round(G.player.x), py: Math.round(G.player.y),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable: play on unsaved */ }
};
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    G.cash = d.cash ?? G.cash;
    Object.assign(G.standing, d.standing || {});
    G.dayT = d.dayT ?? G.dayT;
    for (const id of d.packages || []) if (G.packages[id]) { G.packages[id].found = true; G.packagesFound++; }
    G.records = d.records || G.records;
    G.missions.storyIdx = d.storyIdx || 0;
    G.missions.done = !!d.storyDone;
    G.flags = d.flags || {};
    G.garageCar = d.garageCar || null;
    if (d.crew && d.crew.lila) { G.crew.lila.recruited = true; G.crew.lila.active = true; G.crew.lila.x = (d.px || 760) + 30; G.crew.lila.y = (d.py || 300) + 10; }
    if (d.crew && d.crew.marco) { G.crew.marco.recruited = true; G.crew.marco.active = true; G.crew.marco.x = (d.px || 760) - 30; G.crew.marco.y = (d.py || 300) + 10; }
    if (d.px) resetPlayer(d.px, d.py);
    return true;
  } catch (e) { return false; }
}

// ---- world setup
function buildWorld() {
  G.buildings = buildCity(G.seed);
  G.cars = spawnParkedCars(G);
  for (let i = 0; i < 8; i++) { const c = spawnTrafficCar(G); G.cars.push(c); }
  G.peds = spawnPeds(G);
  G.boats = spawnBoats(G);
  G.packages = createPackages(G.seed);
}
buildWorld();
loadGame();

// ---- enter / exit
G.enterCar = (car) => {
  G.player.inCar = true; G.player.inBoat = false;
  G.playerCar = car; car.parked = false;
  if (car.ai && car.ai.mode === 'traffic') { car.ai = null; }
  G.player.x = car.x; G.player.y = car.y;
  if (G.audio) G.audio.sfx('door');
};
G.exitVehicle = (silent) => {
  const veh = G.playerCar || G.playerBoat;
  if (veh) {
    // Step out to the left side; find a dry, solid-free spot.
    const side = veh.angle + Math.PI / 2;
    for (const d of [30, 44, 60]) {
      const x = veh.x + Math.cos(side) * d, y = veh.y + Math.sin(side) * d;
      if (!hitsBuilding(G.buildings, x, y, 8) && !isWater(x, y)) { G.player.x = x; G.player.y = y; break; }
      const x2 = veh.x - Math.cos(side) * d, y2 = veh.y - Math.sin(side) * d;
      if (!hitsBuilding(G.buildings, x2, y2, 8) && !isWater(x2, y2)) { G.player.x = x2; G.player.y = y2; break; }
    }
  }
  G.player.inCar = false; G.player.inBoat = false;
  G.playerCar = null; G.playerBoat = null;
  if (!silent && G.audio) G.audio.sfx('door');
};
function enterBoat(boat) {
  G.player.inBoat = true; G.player.inCar = false;
  G.playerBoat = boat;
  G.player.x = boat.x; G.player.y = boat.y;
  if (G.audio) { G.audio.sfx('door'); G.audio.sfx('splash'); }
  G.toast(`${boat.label} — W/S throttle, A/D steer. E at a dock or beach to step off.`);
}

function tryEnterExit() {
  if (G.player.inCar || G.player.inBoat) {
    const veh = G.playerCar || G.playerBoat;
    if (Math.abs(veh.speed) > 60) { G.toast('Too fast to bail out!'); return; }
    G.exitVehicle(false);
    return;
  }
  const car = nearestEnterableCar(G, 52);
  if (car) {
    const wasParked = car.parked;
    const hadDriver = !!(car.ai && car.ai.mode === 'traffic');
    G.enterCar(car);
    if (hadDriver || wasParked) {
      // Carjacking a driven car is a crime; borrowing a parked one, a small one.
      G.addWanted(hadDriver ? 1 : 0.34, hadDriver ? 'carjacking in plain sight' : 'stolen vehicle reported');
      missionEvent(G, 'jack', {});
      if (hadDriver) G.panicAt = { x: car.x, y: car.y };
    }
    return;
  }
  const boat = nearestBoardableBoat(G, 58);
  if (boat) { enterBoat(boat); return; }
  // Marco recruitment by walking up after the 40% unlock.
  if (G.flags.marcoUnlocked && !G.crew.marco.recruited && dist(G.player.x, G.player.y, MARCO_HOME.x, MARCO_HOME.y) < 60) {
    recruitMarco(G);
    return;
  }
}

// ---- combat
function spawnBullet(x, y, angle, from, spread) {
  const a = angle + (G.rng() - 0.5) * 2 * (spread || 0);
  G.bullets.push({ x, y, vx: Math.cos(a) * 780, vy: Math.sin(a) * 780, from, t: 0, life: 0.55 });
  if (G.bullets.length > 90) G.bullets.splice(0, G.bullets.length - 90);
}
G.enemyShoot = (x, y, angle, spread) => {
  spawnBullet(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14, angle, 'enemy', spread || 0.13);
  if (G.audio && dist(x, y, G.player.x, G.player.y) < 700) G.audio.sfx('shotEnemy');
  G.panicAt = { x: G.player.x, y: G.player.y }; G.panicT = 2;
};
G.crewShoot = (x, y, angle, threat) => {
  spawnBullet(x + Math.cos(angle) * 12, y + Math.sin(angle) * 12, angle, 'crew', 0.07);
  if (G.audio) G.audio.sfx('shotEnemy');
};

function playerShoot(dt) {
  G.fireT -= dt;
  const wantFire = (mouse.down || keys['Space']) && G.state.mode === 'play';
  if (!wantFire || G.fireT > 0) return;
  G.fireT = 0.16;
  const cam = camera();
  const aim = Math.atan2(mouse.y + cam.y - G.player.y, mouse.x + cam.x - G.player.x);
  G.player.angle = aim;
  const ox = G.player.x + Math.cos(aim) * 16, oy = G.player.y + Math.sin(aim) * 16;
  spawnBullet(ox, oy, aim, 'player', 0.028);
  if (G.audio) G.audio.sfx('shot');
  G.panicAt = { x: G.player.x, y: G.player.y }; G.panicT = 2.5;
  G.addWanted(0.22, 'shots fired');
}

function playerPunch() {
  if (G.punchT > 0 || G.player.inCar || G.player.inBoat) return;
  G.punchT = 0.34;
  if (G.audio) G.audio.sfx('punch');
  const px = G.player.x + Math.cos(G.player.angle) * 30;
  const py = G.player.y + Math.sin(G.player.angle) * 30;
  G.effects.push({ kind: 'swipe', x: px, y: py, t: 0, life: 0.16, color: '#ffffff' });
  for (const p of G.peds) if (!p.dead && dist(p.x, p.y, px, py) < 30) { p.hp -= 16; p.panic = 2; if (p.hp <= 0) { p.dead = true; p.deadT = 0; } G.addWanted(0.3, 'assault'); }
  for (const o of G.police.officers) if (!o.dead && dist(o.x, o.y, px, py) < 30) { o.hp -= 18; if (o.hp <= 0) killOfficer(o); G.addWanted(0.4, 'assaulting an officer'); }
  for (const c of G.cars) if (dist(c.x, c.y, px, py) < 40) damageCar(G, c, 3);
}
function killOfficer(o) {
  o.dead = true; o.deadT = 0;
  G.addWanted(1, 'officer down');
  G.effects.push({ kind: 'sparkle', x: o.x, y: o.y, t: 0, life: 0.4, color: '#ff5533' });
}

function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.t += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.t > b.life || hitsBuilding(G.buildings, b.x, b.y, 0);
    if (!dead && b.from !== 'enemy') {
      // Player & crew bullets hunt police first, then cars and peds.
      for (const o of G.police.officers) {
        if (!o.dead && dist(b.x, b.y, o.x, o.y) < 11) { o.hp -= b.from === 'crew' ? 14 : 20; dead = true; if (o.hp <= 0) killOfficer(o); break; }
      }
      if (!dead) for (const u of G.police.units) {
        if (u.hp > 0 && Math.abs(b.x - u.x) < u.l * 0.42 && Math.abs(b.y - u.y) < u.l * 0.42 && dist(b.x, b.y, u.x, u.y) < u.l * 0.5) { damageCar(G, u, b.from === 'crew' ? 5 : 8); dead = true; if (u.hp <= 0) { G.addWanted(0.6, 'police vehicle destroyed'); G.cash += 40; } break; }
      }
      if (!dead && G.patrolBoat && dist(b.x, b.y, G.patrolBoat.x, G.patrolBoat.y) < 30) { G.patrolBoat.hp -= 7; dead = true; }
      if (!dead && b.from === 'player') for (const p of G.peds) {
        if (!p.dead && dist(b.x, b.y, p.x, p.y) < 10) { p.hp -= 22; p.panic = 2; dead = true; if (p.hp <= 0) { p.dead = true; p.deadT = 0; G.addWanted(0.8, 'civilian shot'); } break; }
      }
      if (!dead && b.from === 'player') for (const c of G.cars) {
        if (c !== G.playerCar && dist(b.x, b.y, c.x, c.y) < c.l * 0.45) {
          damageCar(G, c, 6); dead = true;
          if (c.hp <= 0 && G.missions.active && G.missions.active.job.id === 'j9' && dist(c.x, c.y, 2060, 1660) < 700) missionEvent(G, 'wreckNearDepot', {});
          break;
        }
      }
    }
    if (!dead && b.from === 'enemy') {
      if (G.player.inCar && dist(b.x, b.y, G.player.x, G.player.y) < G.playerCar.l * 0.5) { damageCar(G, G.playerCar, 4); dead = true; }
      else if (G.player.inBoat && dist(b.x, b.y, G.player.x, G.player.y) < 30) { G.playerBoat.hp -= 4; dead = true; }
      else if (!G.player.inCar && !G.player.inBoat && dist(b.x, b.y, G.player.x, G.player.y) < 11) { hurtPlayer(7); dead = true; }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}
function hurtPlayer(amount) {
  G.player.hp -= amount;
  G.shake = Math.min(8, G.shake + 2.5);
  if (G.audio) G.audio.sfx('hurt');
  if (G.player.hp <= 0) G.gameOver('wasted');
}

// ---- game over
G.gameOver = (kind) => {
  if (G.state.mode !== 'play') return;
  G.state.mode = 'over';
  G.overKind = kind; G.overT = 0;
  if (G.audio) G.audio.sfx(kind === 'busted' ? 'busted' : 'wasted');
};
function respawn() {
  policeClearWanted(G);
  G.police.units = []; G.police.officers = [];
  G.cars = G.cars.filter((c) => !c.cop);
  G.patrolBoat = null;
  if (G.player.inCar || G.player.inBoat) G.exitVehicle(true);
  const fee = G.overKind === 'busted' ? Math.min(400, Math.floor(G.cash * 0.15) + 50) : Math.min(300, Math.floor(G.cash * 0.1) + 25);
  G.cash = Math.max(0, G.cash - fee);
  G.player.hp = G.player.maxHp;
  if (G.overKind === 'busted') resetPlayerPos(colX(3) + 90, rowY(2)); // precinct steps, Downtown
  else resetPlayerPos(colX(4) - 90, rowY(2)); // Palm General Hospital
  G.toast(G.overKind === 'busted' ? `Busted. Bail and fines: -$${fee}.` : `You wake up at Palm General. Bill: -$${fee}.`);
  G.state.mode = 'play';
  G.saveGame();
}
function resetPlayerPos(x, y) { G.player.x = x; G.player.y = y; G.player.vx = 0; G.player.vy = 0; }

// ---- player update
function updatePlayer(dt) {
  const P = G.player;
  const up = keys['KeyW'] || keys['ArrowUp'], down = keys['KeyS'] || keys['ArrowDown'];
  const left = keys['KeyA'] || keys['ArrowLeft'], right = keys['KeyD'] || keys['ArrowRight'];
  G.punchT = Math.max(0, G.punchT - dt);

  if (P.inCar) {
    const car = G.playerCar;
    const throttle = up ? 1 : down ? -1 : 0;
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const prevHp = car.hp;
    stepCarPhysics(G, car, dt, throttle, steer);
    // Hard building hits while wanted near the depot count for the finale.
    P.x = car.x; P.y = car.y; P.angle = car.angle;
    P.vx = Math.cos(car.angle) * car.speed; P.vy = Math.sin(car.angle) * car.speed;
    G.playerCarSpeed = car.speed;
    if (car.hp <= 0 && prevHp > 0) { /* wreck handled by damage toast */ }
    // Running peds over in a car is checked in traffic.js via playerCarSpeed.
    for (const p of G.peds) {
      if (!p.dead && Math.abs(car.speed) > 80 && dist(p.x, p.y, P.x, P.y) < 26) {
        p.dead = true; p.deadT = 0; G.addWanted(1, 'vehicular assault'); if (G.audio) G.audio.sfx('crash');
      }
    }
  } else if (P.inBoat) {
    const boat = G.playerBoat;
    const throttle = up ? 1 : down ? -1 : 0;
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    stepBoat(G, boat, dt, throttle, steer);
    P.x = boat.x; P.y = boat.y; P.angle = boat.angle;
    P.vx = boat.vx || 0; P.vy = boat.vy || 0;
    G.playerCarSpeed = boat.speed;
  } else {
    // On foot: WASD in screen space, Shift sprint, mouse turns the body when firing.
    let mx = (right ? 1 : 0) - (left ? 1 : 0);
    let my = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(mx, my) || 1;
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = sprint ? 218 : 128;
    mx = mx / len * speed; my = my / len * speed;
    if (mx || my) { P.angle = Math.atan2(my, mx); P.walkPhase += dt * (sprint ? 13 : 9); }
    let nx = P.x + mx * dt, ny = P.y + my * dt;
    nx = clamp(nx, 16, WORLD_W - 16); ny = clamp(ny, 16, WORLD_H - 16);
    const push = collideCircle(G.buildings, nx, ny, 10);
    if (push) { nx = push.x; ny = push.y; }
    if (isWater(nx, ny)) { nx = P.x; ny = P.y; } // the sea is for boats
    P.vx = (nx - P.x) / dt; P.vy = (ny - P.y) / dt;
    P.x = nx; P.y = ny;
    G.playerCarSpeed = 0;
  }
  P.districtId = districtAt(P.x, P.y).id;
  // Slow health regen when calm and unshot.
  if (G.wanted === 0 && P.hp > 0 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + dt * 1.6);
}

// ---- camera
function camera() {
  const look = 0.22;
  const tx = G.player.x + G.player.vx * look - VW / 2;
  const ty = G.player.y + G.player.vy * look - VH / 2;
  camera.x = lerp(camera.x ?? tx, tx, 0.12);
  camera.y = lerp(camera.y ?? ty, ty, 0.12);
  camera.x = clamp(camera.x, 0, Math.max(0, WORLD_W - VW));
  camera.y = clamp(camera.y, 0, Math.max(0, WORLD_H - VH));
  camera.w = VW; camera.h = VH;
  return camera;
}

// ---- main update
function update(dt) {
  G.time += dt;
  if (G.state.mode !== 'play') { if (G.state.mode === 'over') G.overT += dt; pressed = {}; return; }
  G.dayT = (G.dayT + dt / 240) % 1; // full day/night cycle: 4 minutes
  if (G.panicT > 0) { G.panicT -= dt; if (G.panicT <= 0) G.panicAt = null; }
  G.shake = Math.max(0, G.shake - dt * 26);

  updatePlayer(dt);
  playerShoot(dt);
  if (keyHit('KeyF')) playerPunch();
  if (keyHit('KeyE')) {
    if (!propertyAction(G)) tryEnterExit();
  }
  if (keyHit('KeyH')) {
    const L = G.crew.lila;
    if (L.recruited) { L.mode = L.mode === 'follow' ? 'stay' : 'follow'; G.toast(`Lila: ${L.mode === 'follow' ? 'following you' : 'holding position'}.`); }
  }
  if (keyHit('KeyM')) { G.muted = !G.muted; G.audio.setMuted(G.muted); G.toast(G.muted ? 'Sound off' : 'Sound on'); }
  if (keyHit('Tab')) G.showPanel = !G.showPanel;
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updatePatrolBoat(G, dt);
  updateCrew(G, dt);
  updateBullets(dt);
  updatePackages(G, dt);
  G.prompt = '';
  updateProperties(G, dt);
  // Race offer: standing in a start marker in the right vehicle, R enters.
  const raceOffer = raceAtPlayer(G);
  if (raceOffer && !G.prompt) {
    G.prompt = `Press R — start ${raceOffer.name} (entry $${raceOffer.fee}, gold ${raceOffer.gold}s)`;
    if (keyHit('KeyR')) startRace(G, raceOffer);
  }
  updateRace(G, dt);
  updateMissions(G, dt);
  // Effects
  for (let i = G.effects.length - 1; i >= 0; i--) { const e = G.effects[i]; e.t += dt; if (e.t > e.life) G.effects.splice(i, 1); }
  // District entry banner
  const dNow = districtAt(G.player.x, G.player.y);
  if (G._districtId !== dNow.id) {
    if (G._districtId !== undefined && G.time > 2) G.toast(`${dNow.name} — ${dNow.blurb}`);
    G._districtId = dNow.id;
  }
  // Audio layers
  const veh = G.playerCar || G.playerBoat;
  const speed01 = veh ? clamp(Math.abs(veh.speed) / 320, 0, 1) : 0;
  const throttle = (G.player.inCar || G.player.inBoat) && (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
  let siren = 0;
  for (const u of G.police.units) siren = Math.max(siren, 1 - clamp(dist(u.x, u.y, G.player.x, G.player.y) / 620, 0, 1));
  if (G.patrolBoat) siren = Math.max(siren, 0.8 * (1 - clamp(dist(G.patrolBoat.x, G.patrolBoat.y, G.player.x, G.player.y) / 620, 0, 1)));
  G.audio.update(dt, G.player.inCar || G.player.inBoat ? speed01 : 0, throttle, G.wanted > 0 ? siren : 0, G.player.inBoat);
  // Toast / banner timers
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) G.toastQ = []; }
  if (G.bannerQ.length) { G.bannerT += dt; if (G.bannerT > 4.2) { G.bannerQ.shift(); G.bannerT = 0; } } else G.bannerT = 0;
  pressed = {};
}

function handleClick() {
  if (G.state.mode === 'title') { G.state.mode = 'play'; G.audio.ensure(); }
  else if (G.state.mode === 'over' && G.overT > 0.8) respawn();
}

// ---- staging hook
// Deterministic screenshot scenes: ?stage=cover|boat|combat|district with
// &time=day|night and &wanted=N; window.__shotReady flips once the pose settles.
function applyStaging() {
  const q = new URLSearchParams(location.search);
  const stage = q.get('stage');
  if (!stage) return;
  G.staged = stage;
  G.state.mode = 'play';
  const timeQ = q.get('time');
  if (timeQ === 'night') G.dayT = 0.88;
  else if (timeQ === 'day') G.dayT = 0.32;
  const wantedQ = parseInt(q.get('wanted') || '0', 10);
  if (stage === 'cover') {
    G.dayT = 0.88;
    resetPlayerPos(1760, 590);
    const car = makeCar('muscle', 1760, 590, 0.4, 0);
    G.cars.push(car); G.enterCar(car); car.speed = 120;
    G.wanted = 4; G.police.heat = 100; G.police.lastSeen = 0;
    const spots = [[1560, 480], [1980, 520], [1660, 760], [1900, 740]];
    for (const [x, y] of spots) {
      const u = makeCar('sedan', x, y, Math.atan2(590 - y, 1760 - x));
      u.type = 'cop'; u.label = 'Interceptor'; u.cop = true; u.color = '#e8ecf2'; u.hp = 150; u.maxHp = 150; u.ai = { mode: 'cop' };
      G.police.units.push(u); G.cars.push(u);
    }
    for (let i = 0; i < 3; i++) G.police.officers.push({ kind: 'officer', x: 1660 + i * 60, y: 700 + (i % 2) * 40, angle: -1.2, hp: 40, dead: false, deadT: 0, fireT: 99, state: 'hold', coverT: 0, fromCar: null });
    G.crew.lila.recruited = true; G.crew.lila.active = true; G.crew.lila.inVehicle = true;
  } else if (stage === 'boat') {
    G.dayT = 0.74; // sunset
    G.cash = Math.max(G.cash, 500);
    const race = G.race; // start Harbor Dash posed at its start line
    resetPlayerPos(2760, 2680);
    const boat = G.boats.find((b) => b.type === 'speedboat') || G.boats[0];
    boat.x = 2760; boat.y = 2680; boat.angle = -0.5; boat.speed = 170;
    G.player.inBoat = true; G.playerBoat = boat; G.player.x = boat.x; G.player.y = boat.y;
    G.wanted = 4; G.police.heat = 90;
    G.patrolBoat = makePatrolBoat(G);
    G.patrolBoat.x = 3180; G.patrolBoat.y = 2620; G.patrolBoat.angle = 2.9;
    // Pose two rival racers nearby so the shot reads as a live boat race.
    const rivalA = G.boats.find((b) => b.type === 'jetski');
    if (rivalA) { rivalA.x = 2650; rivalA.y = 2760; rivalA.angle = -0.4; rivalA.color = '#ff2e88'; rivalA.speed = 140; }
    const rivalB = G.boats.filter((b) => b.type === 'speedboat')[1];
    if (rivalB) { rivalB.x = 2920; rivalB.y = 2790; rivalB.angle = -0.7; rivalB.color = '#37e0ff'; rivalB.speed = 120; }
    // Pre-fill foam wakes behind the posed boats so the still reads as motion.
    for (const b of [boat, rivalA, rivalB, G.patrolBoat]) {
      if (!b) continue;
      b.wake = [];
      for (let i = 1; i <= 7; i++) b.wake.push({ x: b.x - Math.cos(b.angle) * i * 26, y: b.y - Math.sin(b.angle) * i * 26, t: i * 0.14, life: 1.6, w: b.w * 0.9 });
    }
    G._stageRaceHUD = { name: 'Harbor Dash', pos: 2, cp: 2, total: 6, time: 41.3, gold: 110 };
  } else if (stage === 'combat') {
    G.dayT = 0.36;
    resetPlayerPos(1500, 980);
    G.player.angle = 0.4;
    G.crew.lila.recruited = true; G.crew.lila.active = true;
    G.crew.lila.x = 1450; G.crew.lila.y = 1010; G.crew.lila.angle = 0.2;
    G.wanted = 3; G.police.heat = 95; G.police.lastSeen = 0;
    // Clear passing traffic out of the frame so the fight reads cleanly.
    G.cars = G.cars.filter((c) => dist(c.x, c.y, 1500, 980) > 520);
    const arc = [[1650, 940], [1700, 995], [1635, 1010], [1755, 935]];
    arc.forEach(([x, y], i) => G.police.officers.push({ kind: 'officer', x, y, angle: Math.PI + 0.3, hp: 40, dead: false, deadT: 0, fireT: 0.35 + i * 0.3, state: 'hold', coverT: 0, fromCar: null }));
    const u = makeCar('sedan', 1790, 1140, -2.4);
    u.type = 'cop'; u.label = 'Interceptor'; u.cop = true; u.color = '#e8ecf2'; u.hp = 150; u.maxHp = 150; u.ai = null; // parked prop: its crew is on foot
    G.police.units.push(u); G.cars.push(u);
    G.panicAt = { x: 1500, y: 980 }; G.panicT = 99;
  } else if (stage === 'district') {
    G.dayT = 0.32;
    resetPlayerPos(2000, 900);
    G.standing = { coral: 62, downtown: 45, market: 28, neonbay: 74, central: 38, portside: 51, isla: 20 };
    G.showPanel = true;
    G.cash = 6840; G.packagesFound = 17;
    G.flags.safehouseOwned = true;
  }
  if (wantedQ && stage !== 'cover' && stage !== 'combat') { G.wanted = wantedQ; G.police.heat = 90; }
  let frames = 0;
  const settle = () => { frames++; if (frames > 40) { window.__shotReady = true; return; } requestAnimationFrame(settle); };
  requestAnimationFrame(settle);
}

// ---- rendering
function drawWorld(cam) {
  const dl = daylight(G.dayT);
  // Sea base
  ctx.fillStyle = '#0d3d5c';
  ctx.fillRect(0, 0, VW, VH);
  // Water sparkle south of the sand line
  const wy = SAND_Y - cam.y;
  if (wy < VH) {
    const grad = ctx.createLinearGradient(0, Math.max(0, wy), 0, VH);
    grad.addColorStop(0, '#14608c'); grad.addColorStop(1, '#082a44');
    ctx.fillStyle = grad;
    ctx.fillRect(0, Math.max(0, wy), VW, VH - Math.max(0, wy));
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 173 + Math.floor(G.time * 14)) % (VW + 60)) - 30;
      const sy = wy + 16 + ((i * 97) % Math.max(40, VH - wy - 20));
      ctx.fillRect(sx, sy, 22, 2);
    }
  }
  // Land base: district tints first (the empire made visible), then ground.
  for (const d of DISTRICTS) {
    const sx = d.x0 - cam.x, sy = d.y0 - cam.y, sw = d.x1 - d.x0, sh = d.y1 - d.y0;
    if (sx > VW || sy > VH || sx + sw < 0 || sy + sh < 0) continue;
    const s = (G.standing[d.id] || 0) / 100;
    ctx.fillStyle = '#2c2f3a';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.globalAlpha = 0.05 + s * 0.16;
    ctx.fillStyle = d.color;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.globalAlpha = 1;
  }
  // Island land
  ctx.fillStyle = '#3a4149';
  ctx.fillRect(ISLAND.x - cam.x, ISLAND.y - cam.y, ISLAND.w, ISLAND.h);
  ctx.fillStyle = '#c9b083';
  ctx.fillRect(ISLAND.x - cam.x - 8, ISLAND.y - cam.y - 8, ISLAND.w + 16, 10);
  ctx.fillRect(ISLAND.x - cam.x - 8, ISLAND.y + ISLAND.h - cam.y - 2, ISLAND.w + 16, 10);
  // Beach sand
  ctx.fillStyle = '#c9b083';
  ctx.fillRect(0 - cam.x, COAST_Y - cam.y, WORLD_W, SAND_Y - COAST_Y);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0 - cam.x, SAND_Y - cam.y - 4, WORLD_W, 3);
  // Roads: avenues, then lane markings, then the causeway.
  ctx.fillStyle = '#22242e';
  for (let i = 0; i < 8; i++) ctx.fillRect(colX(i) - 52 - cam.x, -cam.y, 104, COAST_Y);
  for (let j = 0; j < 6; j++) ctx.fillRect(-cam.x, rowY(j) - 52 - cam.y, WORLD_W, 104);
  ctx.fillRect(1620 - cam.x, 2380 - cam.y, 90, 260); // causeway
  ctx.fillStyle = '#3a4149';
  ctx.fillRect(ISLAND.x + 30 - cam.x, ISLAND.y + ISLAND.h / 2 - 44 - cam.y, ISLAND.w - 60, 88);
  ctx.fillRect(ISLAND.x + 146 - cam.x, ISLAND.y + 30 - cam.y, 88, ISLAND.h - 60);
  ctx.strokeStyle = 'rgba(255,214,64,0.5)';
  ctx.lineWidth = 3; ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { ctx.moveTo(colX(i) - cam.x, -cam.y); ctx.lineTo(colX(i) - cam.x, COAST_Y - cam.y); }
  for (let j = 0; j < 6; j++) { ctx.moveTo(-cam.x, rowY(j) - cam.y); ctx.lineTo(WORLD_W - cam.x, rowY(j) - cam.y); }
  ctx.stroke(); ctx.setLineDash([]);
  // Crosswalks at a few intersections
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  for (let i = 0; i < 8; i += 2) for (let j = 0; j < 6; j += 2) {
    const cxp = colX(i) - cam.x, cyp = rowY(j) - cam.y;
    for (let k = -2; k <= 2; k++) ctx.fillRect(cxp + k * 18 - 6, cyp - 60, 12, 16);
  }
  drawWaterProps(ctx, G, cam);
  // Buildings with shadows, roofs, windows (lit at night) and neon signs.
  const night = isNight(G.dayT);
  for (const b of G.buildings) {
    const sx = b.x - cam.x, sy = b.y - cam.y;
    if (sx < -240 || sy < -240 || sx > VW + 240 || sy > VH + 240) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + b.height * 0.5, sy + b.height * 0.5, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(sx - 3, sy - 3, b.w + 6, b.h + 6);
    ctx.fillStyle = b.roof;
    ctx.fillRect(sx, sy, b.w, b.h);
    // Window grid: deterministic per building; lit fraction rises at night.
    const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 24));
    for (let cx2 = 0; cx2 < cols; cx2++) for (let ry = 0; ry < rows; ry++) {
      const h = Math.sin(b.winSeed + cx2 * 127.1 + ry * 311.7) * 43758.5453;
      const frac = h - Math.floor(h);
      const lit = night ? frac < 0.55 : frac < 0.08;
      ctx.fillStyle = lit ? 'rgba(255,214,110,0.9)' : 'rgba(16,20,32,0.55)';
      ctx.fillRect(sx + 8 + cx2 * 24, sy + 8 + ry * 22, 11, 9);
    }
    if (b.neon) {
      ctx.save();
      ctx.shadowColor = b.neon; ctx.shadowBlur = night ? 16 : 6;
      ctx.fillStyle = b.neon;
      ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText((b.name || 'PALMERA').toUpperCase().slice(0, 22), sx + b.w / 2, sy - 8);
      ctx.restore();
    } else if (b.name) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(b.name, sx + b.w / 2, sy - 6);
    }
  }
  // Garages (Pay 'N Spray) pads
  for (const g of GARAGES) {
    const sx = g.x - cam.x, sy = g.y - cam.y;
    ctx.fillStyle = '#31435c'; ctx.fillRect(sx - 46, sy - 34, 92, 68);
    ctx.strokeStyle = '#37e0ff'; ctx.lineWidth = 3; ctx.strokeRect(sx - 46, sy - 34, 92, 68);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText("PAY 'N SPRAY", sx, sy - 44);
  }
  // Safehouse marker
  {
    const sx = SAFEHOUSE_DOOR.x - cam.x, sy = SAFEHOUSE_DOOR.y - cam.y;
    ctx.fillStyle = G.flags.safehouseOwned ? '#37e0c8' : '#ffd76a';
    ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(G.flags.safehouseOwned ? 'SAFEHOUSE' : 'SAFEHOUSE $5,000', sx, sy - 14);
  }
  // Night darkness + headlight cones
  if (dl < 0.75) {
    ctx.fillStyle = `rgba(6,8,26,${(0.75 - dl) * 0.52})`;
    ctx.fillRect(0, 0, VW, VH);
    drawHeadlights(cam);
  }
}

function drawHeadlights(cam) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cone = (x, y, a, len, spread, alpha) => {
    const sx = x - cam.x, sy = y - cam.y;
    const grad = ctx.createRadialGradient(sx, sy, 8, sx, sy, len);
    grad.addColorStop(0, `rgba(255,240,190,${alpha})`);
    grad.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, len, a - spread, a + spread);
    ctx.closePath(); ctx.fill();
  };
  for (const c of G.cars) if (!c.sunk && (Math.abs(c.speed) > 4 || c === G.playerCar)) cone(c.x + Math.cos(c.angle) * c.l * 0.5, c.y + Math.sin(c.angle) * c.l * 0.5, c.angle, 190, 0.32, 0.16);
  ctx.restore();
}

function drawCarShape(car, cam) {
  const sx = car.x - cam.x, sy = car.y - cam.y;
  if (sx < -120 || sy < -120 || sx > VW + 120 || sy > VH + 120) return;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(3, 5, car.l * 0.52, car.w * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = car.color;
  ctx.beginPath(); ctx.roundRect(-car.l / 2, -car.w / 2, car.l, car.w, 7); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.roundRect(-car.l / 2, -car.w / 2, car.l * 0.24, car.w, 7); ctx.fill(); // trunk
  ctx.fillStyle = '#a8d4e8';
  ctx.beginPath(); ctx.roundRect(-car.l * 0.08, -car.w * 0.36, car.l * 0.3, car.w * 0.72, 4); ctx.fill(); // cabin glass
  ctx.fillStyle = 'rgba(20,24,36,0.85)';
  ctx.fillRect(car.l * 0.24, -car.w * 0.34, car.l * 0.07, car.w * 0.68); // windshield split
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(car.l / 2 - 3, -car.w * 0.32, 3, 7);
  ctx.fillRect(car.l / 2 - 3, car.w * 0.32 - 7, 3, 7);
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(-car.l / 2, -car.w * 0.32, 3, 7);
  ctx.fillRect(-car.l / 2, car.w * 0.32 - 7, 3, 7);
  if (car.cop) {
    ctx.fillStyle = '#27324a';
    ctx.fillRect(-car.l * 0.3, -car.w / 2, car.l * 0.55, car.w);
    ctx.fillStyle = (Math.floor(G.time * 3) % 2 === 0) ? '#ff3b30' : '#37a0ff';
    ctx.fillRect(-6, -5, 12, 10);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, car.w * 0.28);
  }
  if (car.hp < car.maxHp * 0.45 && car.hp > 0) {
    ctx.fillStyle = `rgba(60,60,60,${0.35 + Math.sin(G.time * 9) * 0.1})`;
    ctx.beginPath(); ctx.arc(car.l * 0.32, 0, 8 + Math.sin(G.time * 7) * 2, 0, Math.PI * 2); ctx.fill();
  }
  if (car.hp <= 0) { ctx.fillStyle = 'rgba(10,10,10,0.45)'; ctx.beginPath(); ctx.roundRect(-car.l / 2, -car.w / 2, car.l, car.w, 7); ctx.fill(); }
  ctx.restore();
  if (car === G.playerCar && G.crew.marco.recruited && G.crew.marco.inVehicle) { /* sparks drawn as effects */ }
}

function drawPed(p, cam) {
  const sx = p.x - cam.x, sy = p.y - cam.y;
  if (sx < -30 || sy < -30 || sx > VW + 30 || sy > VH + 30) return;
  ctx.save();
  ctx.translate(sx, sy);
  if (p.dead) {
    ctx.rotate(1.3);
    ctx.fillStyle = p.color; ctx.fillRect(-9, -5, 18, 10);
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(12, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); return;
  }
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 3, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.color; ctx.fillRect(-7.5, -6.5, 15, 13);
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(2, 0, 5.2, 0, Math.PI * 2); ctx.fill();
  if (p.state === 'cower') { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.fillText('!', -2, -12); }
  ctx.restore();
}

function drawPlayer(cam) {
  const P = G.player;
  if (P.inCar || P.inBoat) return;
  const sx = P.x - cam.x, sy = P.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(P.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 3, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(P.walkPhase) * 1.6;
  ctx.fillStyle = '#12303f'; // legs
  ctx.fillRect(-6, -7 + bob * 0.4, 6, 5);
  ctx.fillRect(-6, 2 - bob * 0.4, 6, 5);
  ctx.fillStyle = '#ff8a3d'; // jacket
  ctx.fillRect(-8, -7.5, 16, 15);
  ctx.fillStyle = '#ffd76a';
  ctx.fillRect(-8, -7.5, 5, 15); // stripe
  ctx.fillStyle = '#e8b08a';
  ctx.beginPath(); ctx.arc(2.5, 0, 5.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#14100c';
  ctx.beginPath(); ctx.arc(0.8, 0, 5.4, Math.PI * 0.55, Math.PI * 1.75); ctx.fill(); // hair
  // Gun arm when aiming/firing
  if (mouse.down || keys['Space']) { ctx.fillStyle = '#111'; ctx.fillRect(8, -1.8, 13, 3.6); }
  ctx.restore();
  // Direction tick toward the objective
}

function drawEffects(cam) {
  for (const e of G.effects) {
    const sx = e.x - cam.x, sy = e.y - cam.y;
    const a = 1 - e.t / e.life;
    ctx.save();
    ctx.globalAlpha = a;
    if (e.kind === 'boom') {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(sx, sy, 12 + e.t * 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe14f';
      ctx.beginPath(); ctx.arc(sx, sy, 6 + e.t * 30, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'sparkle' || e.kind === 'spark') {
      ctx.fillStyle = e.color;
      for (let i = 0; i < 6; i++) { const an = i * 1.047 + e.t * 4; ctx.fillRect(sx + Math.cos(an) * (4 + e.t * 22) - 1.5, sy + Math.sin(an) * (4 + e.t * 22) - 1.5, 3, 3); }
    } else if (e.kind === 'swipe') {
      ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, 14, -0.7, 0.9); ctx.stroke();
    }
    ctx.restore();
  }
  // Bullets as tracers
  ctx.strokeStyle = 'rgba(255,230,150,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const b of G.bullets) {
    ctx.moveTo(b.x - cam.x, b.y - cam.y);
    ctx.lineTo(b.x - b.vx * 0.016 - cam.x, b.y - b.vy * 0.016 - cam.y);
  }
  ctx.stroke();
  // Objective marker: pulsing star + beam
  const op = objectivePoint(G);
  if (op && G.state.mode === 'play') {
    const sx = op.x - cam.x, sy = op.y - cam.y;
    if (sx > -60 && sy > -60 && sx < VW + 60 && sy < VH + 60) {
      ctx.fillStyle = 'rgba(255,215,106,0.16)';
      ctx.fillRect(sx - 9, sy - 170, 18, 170);
      ctx.fillStyle = '#ffd76a';
      ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('★', sx, sy - 118 + Math.sin(G.time * 3) * 5);
    }
  }
  // Bust ring
  if (G.police.bust > 0.02) {
    const sx = G.player.x - cam.x, sy = G.player.y - cam.y;
    ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(sx, sy, 30, -Math.PI / 2, -Math.PI / 2 + G.police.bust * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ff3b30'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', sx, sy - 42);
  }
}

// ---- HUD & minimap
function drawHUD() {
  ctx.save();
  // Top-left: cash, health, car health
  ctx.fillStyle = 'rgba(5,6,16,0.66)';
  ctx.beginPath(); ctx.roundRect(14, 12, 252, 86, 10); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7dff6a'; ctx.font = 'bold 24px system-ui';
  ctx.fillText(`$${Math.floor(G.cash).toLocaleString('en-US')}`, 26, 42);
  ctx.font = '12px system-ui'; ctx.fillStyle = '#cfe6ff';
  ctx.fillText(`PACKAGES ${G.packagesFound}/30`, 26, 62);
  bar(26, 70, 150, 9, G.player.hp / G.player.maxHp, '#ff5470');
  ctx.fillStyle = '#cfe6ff'; ctx.font = '10px system-ui';
  ctx.fillText('HEALTH', 182, 78);
  if (G.player.inCar) { bar(26, 84, 150, 7, G.playerCar.hp / G.playerCar.maxHp, '#37e0ff'); ctx.fillText('CAR', 182, 91); }
  if (G.player.inBoat) { bar(26, 84, 150, 7, Math.max(0, G.playerBoat.hp) / G.playerBoat.maxHp, '#37e0ff'); ctx.fillText('BOAT', 182, 91); }
  // Top-right: wanted stars + clock
  ctx.fillStyle = 'rgba(5,6,16,0.66)';
  ctx.beginPath(); ctx.roundRect(VW - 246, 12, 232, 86, 10); ctx.fill();
  const stars = Math.ceil(G.wanted);
  ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd76a' : 'rgba(255,255,255,0.18)';
    ctx.fillText('★', VW - 30 - i * 30, 44);
  }
  ctx.font = '13px system-ui'; ctx.fillStyle = '#cfe6ff';
  ctx.fillText(`${timeLabel(G.dayT)}  ${districtAt(G.player.x, G.player.y).name}`, VW - 26, 66);
  ctx.fillStyle = playerSpotted(G) && G.wanted > 0 ? '#ff8070' : '#8fa3bf';
  ctx.font = '11px system-ui';
  ctx.fillText(G.wanted > 0 ? (playerSpotted(G) ? 'POLICE HAVE EYES ON YOU' : `HIDDEN — heat ${Math.max(0, Math.round(G.police.heat))}%`) : 'No heat', VW - 26, 84);
  // Objective line under the race HUD space
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(5,6,16,0.6)';
  const obj = objectiveText(G);
  const wObj = Math.min(VW - 620, ctx.measureText(obj).width + 30);
  if (!G.race.active && obj && !G._stageRaceHUD) { ctx.beginPath(); ctx.roundRect((VW - wObj) / 2, 12, wObj, 30, 8); ctx.fill(); }
  ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 14px system-ui';
  if (!G.race.active && obj && !G._stageRaceHUD) ctx.fillText(obj, VW / 2, 32);
  if (G.objectiveSub) { ctx.fillStyle = '#ff9d7a'; ctx.font = '13px system-ui'; ctx.fillText(G.objectiveSub, VW / 2, 96); }
  // Prompt (bottom centre)
  if (G.prompt) {
    ctx.fillStyle = 'rgba(5,6,16,0.78)';
    const wP = ctx.measureText(G.prompt).width + 36;
    ctx.beginPath(); ctx.roundRect((VW - wP) / 2, VH - 118, wP, 30, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui';
    ctx.fillText(G.prompt, VW / 2, VH - 98);
  }
  // Toasts
  ctx.textAlign = 'center';
  let ty = VH - 150;
  ctx.font = '14px system-ui';
  for (let i = G.toastQ.length - 1; i >= 0; i--) {
    ctx.fillStyle = 'rgba(255,233,168,0.95)';
    ctx.fillText(G.toastQ[i], VW / 2, ty);
    ty -= 20;
  }
  // Banner (centre top third)
  if (G.bannerQ.length) {
    const b = G.bannerQ[0];
    const a = G.bannerT < 0.3 ? G.bannerT / 0.3 : G.bannerT > 3.8 ? Math.max(0, (4.2 - G.bannerT) / 0.4) : 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,6,16,0.72)';
    ctx.beginPath(); ctx.roundRect(VW / 2 - 330, 120, 660, 74, 12); ctx.fill();
    ctx.fillStyle = '#37e0ff'; ctx.font = 'bold 25px system-ui';
    ctx.fillText(b.title, VW / 2, 152);
    ctx.fillStyle = '#fff'; ctx.font = '13.5px system-ui';
    wrapText(b.sub, VW / 2, 174, 620, 16);
    ctx.globalAlpha = 1;
  }
  drawMinimap();
  ctx.restore();
}
function bar(x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color;
  if (frac > 0.01) { ctx.beginPath(); ctx.roundRect(x, y, w * clamp(frac, 0, 1), h, h / 2); ctx.fill(); }
}
function wrapText(text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '', yy = y;
  for (const w of words) {
    if (ctx.measureText(line + ' ' + w).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawMinimap() {
  const mw = 218, mh = 164, mx = VW - mw - 14, my = VH - mh - 14;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(5,10,20,0.82)';
  ctx.beginPath(); ctx.roundRect(mx - 4, my - 4, mw + 8, mh + 8, 10); ctx.fill();
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 6); ctx.clip();
  // District tints
  for (const d of DISTRICTS) {
    ctx.globalAlpha = 0.25 + (G.standing[d.id] || 0) / 100 * 0.45;
    ctx.fillStyle = d.color;
    ctx.fillRect(mx + d.x0 * sx, my + d.y0 * sy, (d.x1 - d.x0) * sx, (d.y1 - d.y0) * sy);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#14608c';
  ctx.fillRect(mx, my + SAND_Y * sy, mw, (WORLD_H - SAND_Y) * sy);
  ctx.fillStyle = '#3a4149';
  ctx.fillRect(mx + ISLAND.x * sx, my + ISLAND.y * sy, ISLAND.w * sx, ISLAND.h * sy);
  // Roads
  ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { ctx.moveTo(mx + colX(i) * sx, my); ctx.lineTo(mx + colX(i) * sx, my + COAST_Y * sy); }
  for (let j = 0; j < 6; j++) { ctx.moveTo(mx, my + rowY(j) * sy); ctx.lineTo(mx + mw, my + rowY(j) * sy); }
  ctx.stroke();
  const dot = (x, y, color, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2); ctx.fill(); };
  for (const g of GARAGES) dot(g.x, g.y, '#37e0ff', 3);
  dot(SAFEHOUSE_DOOR.x, SAFEHOUSE_DOOR.y, '#37e0c8', 3.4);
  const target = currentTarget(G) || objectivePoint(G);
  if (target) { const pulse = 3 + Math.sin(G.time * 5) * 1.2; dot(target.x, target.y, '#ffd76a', pulse + 1.6); }
  if (G.hintPulse) dot(G.hintPulse.x, G.hintPulse.y, '#ffe14f', 4);
  if (G.garageCar) dot(ISLAND.x + 330, ISLAND.y + 178, '#ffffff', 2.6);
  for (const u of G.police.units) if (u.hp > 0) dot(u.x, u.y, Math.floor(G.time * 3) % 2 ? '#ff3b30' : '#37a0ff', 2.8);
  for (const o of G.police.officers) if (!o.dead) dot(o.x, o.y, '#ff3b30', 2);
  if (G.patrolBoat) dot(G.patrolBoat.x, G.patrolBoat.y, '#ff3b30', 3);
  if (G.crew.lila.active) dot(G.crew.lila.x, G.crew.lila.y, '#ff4fd8', 2.6);
  if (G.crew.marco.active) dot(G.crew.marco.x, G.crew.marco.y, '#ffd76a', 2.6);
  // Player arrow
  ctx.translate(mx + G.player.x * sx, my + G.player.y * sy);
  ctx.rotate(G.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '10px system-ui'; ctx.textAlign = 'right';
  ctx.fillText(`CITY CONTROL ${cityControl(G).toFixed(0)}%`, VW - 18, VH - mh - 22);
}

// ---- screens
function drawTitle() {
  const grad = ctx.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, '#0b0620'); grad.addColorStop(0.55, '#2a0f3a'); grad.addColorStop(1, '#0d3d5c');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, VW, VH);
  // Skyline silhouette with lit windows
  ctx.fillStyle = '#120a24';
  for (let i = 0; i < 14; i++) { const bh = 90 + (i * 97) % 190; ctx.fillRect(i * (VW / 14), VH - bh, VW / 14 - 14, bh); }
  ctx.fillStyle = 'rgba(255,214,110,0.85)';
  for (let i = 0; i < 90; i++) ctx.fillRect((i * 137) % VW, VH - 330 + (i * 61) % 130, 4, 5);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 34;
  ctx.fillStyle = '#ff4fd8';
  ctx.font = 'bold 74px system-ui';
  ctx.fillText('PALMERA HEAT', VW / 2, VH * 0.30);
  ctx.shadowColor = '#37e0ff';
  ctx.fillStyle = '#37e0ff';
  ctx.font = 'bold 44px system-ui';
  ctx.fillText('VICE EMPIRE', VW / 2, VH * 0.30 + 56);
  ctx.restore();
  ctx.fillStyle = '#ffe9a8'; ctx.font = '17px system-ui';
  ctx.fillText('A top-down open-world crime game: steal cars, run boats, dodge the heat, buy the island, take the city.', VW / 2, VH * 0.30 + 96);
  ctx.fillStyle = '#fff'; ctx.font = '15px system-ui';
  const lines = [
    'WASD drive & walk - Shift sprint - E enter/exit, buy, sleep - mouse aim, click/Space shoot - F punch',
    'H crew follow/stay - R start race at a marker - Tab district standing - M mute - P pause',
    '10 story jobs - 5 races vs Roxy, Dex & Mara - 30 hidden packages - 6 districts - boats & a patrol boat',
    '',
    'CLICK OR PRESS ENTER TO PLAY',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, VH * 0.52 + i * 24));
  if (G.missions.storyIdx > 0 || G.flags.empireDone) { ctx.fillStyle = '#7dff6a'; ctx.fillText('Save found — your empire continues where you left it.', VW / 2, VH * 0.52 + 130); }
}
function drawOver() {
  ctx.fillStyle = G.overKind === 'busted' ? 'rgba(20,10,40,0.72)' : 'rgba(50,4,8,0.72)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.fillStyle = G.overKind === 'busted' ? '#b78bff' : '#ff5470';
  ctx.font = 'bold 84px system-ui';
  ctx.fillText(G.overKind === 'busted' ? 'BUSTED' : 'WASTED', VW / 2, VH * 0.44);
  ctx.fillStyle = '#fff'; ctx.font = '17px system-ui';
  ctx.fillText(G.overKind === 'busted' ? 'The Vice City PD books you, fines you, and lets you walk.' : 'Palm General patches you up and sends the bill.', VW / 2, VH * 0.44 + 42);
  ctx.fillText('Click or press Enter to continue', VW / 2, VH * 0.44 + 72);
}
function drawPause() {
  ctx.fillStyle = 'rgba(4,6,14,0.7)'; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#37e0ff'; ctx.font = 'bold 46px system-ui';
  ctx.fillText('PAUSED', VW / 2, VH * 0.4);
  ctx.fillStyle = '#fff'; ctx.font = '15px system-ui';
  ctx.fillText('P or Esc to resume - Tab for district standing - M to mute', VW / 2, VH * 0.4 + 36);
  ctx.fillText(`Cash $${Math.floor(G.cash).toLocaleString('en-US')} - Packages ${G.packagesFound}/30 - City control ${cityControl(G).toFixed(1)}%`, VW / 2, VH * 0.4 + 62);
}

// ------------------------------------------------------------------ frame
function render() {
  const cam = camera();
  const shX = G.shake ? (G.rng() - 0.5) * G.shake : 0;
  const shY = G.shake ? (G.rng() - 0.5) * G.shake : 0;
  const view = { x: cam.x + shX, y: cam.y + shY, w: VW, h: VH };
  if (G.state.mode === 'title') { drawTitle(); return; }
  drawWorld(view);
  drawRaceWorld(ctx, G, view);
  drawPackages(ctx, G, view);
  for (const b of G.boats) if (b !== G.playerBoat) drawBoat(ctx, b, view);
  if (G.patrolBoat) drawBoat(ctx, G.patrolBoat, view);
  if (G.playerBoat) drawBoat(ctx, G.playerBoat, view);
  for (const c of G.cars) if (c !== G.playerCar) drawCarShape(c, view);
  if (G.playerCar) drawCarShape(G.playerCar, view);
  for (const p of G.peds) drawPed(p, view);
  drawCrew(ctx, G, view);
  for (const o of G.police.officers) drawOfficer(ctx, o, view);
  drawPlayer(view);
  drawEffects(view);
  drawHUD();
  if (G._stageRaceHUD) {
    // Posed race HUD for the boat screenshot scene.
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,16,0.72)';
    ctx.beginPath(); ctx.roundRect(VW / 2 - 215, 12, 430, 64, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 19px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Harbor Dash   POS 2/4', VW / 2, 38);
    ctx.fillStyle = '#9fd8ff'; ctx.font = '14px system-ui';
    ctx.fillText('CP 3/6   TIME 0:41.3   GOLD 110s', VW / 2, 60);
    ctx.restore();
  }
  drawRaceHUD(ctx, G, VW);
  if (G.showPanel) drawStandingPanel(ctx, G, VW, VH);
  if (G.state.mode === 'pause') drawPause();
  if (G.state.mode === 'over') drawOver();
}

// ---- loop & boot
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  render();
  // NOTE: `pressed` is cleared inside update(), never here — a frame with no
  // fixed step must not eat a key tap.
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    if (G.state.mode === 'title') { G.state.mode = 'play'; G.audio.ensure(); }
    else if (G.state.mode === 'over' && G.overT > 0.8) respawn();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && G.state.mode === 'play') G.state.mode = 'pause';
  else if ((e.code === 'KeyP' || e.code === 'Escape') && G.state.mode === 'pause') G.state.mode = 'play';
});
applyStaging();
window.__G = G; // debug/testing hook: the whole game state, read by our smoke tests
requestAnimationFrame(frame);
