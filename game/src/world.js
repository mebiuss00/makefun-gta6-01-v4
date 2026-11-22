// world.js — The city: a 4000x3000 coastal world on an 8x6 avenue grid, ~90
// procedural buildings, 24 named landmarks, 6 districts, a beach and navigable
// sea, Isla Verde island with the safehouse, docks, garages, and every spatial
// query the other systems need (roads, collision, occlusion, districts, clock).

// ---- constants
export const WORLD_W = 4000;
export const WORLD_H = 3000;
export const COAST_Y = 2380;          // land ends here; sand runs COAST_Y..SAND_Y
export const SAND_Y = 2520;           // open water starts here
export const ROAD_W = 104;            // avenue width in world units
export const COLS = 8;                // avenue columns
export const ROWS = 6;                // avenue rows
export const COL_PITCH = 500;         // horizontal distance between avenue centres
export const ROW_PITCH = 380;         // vertical distance between avenue centres
export const COL_X0 = 260;            // centre x of avenue column 0
export const ROW_Y0 = 210;            // centre y of avenue row 0

// The island of Isla Verde: a rectangle of land sitting in the sea, joined to the
// mainland by a causeway at its north-west corner. The safehouse stands on it.
export const ISLAND = { x: 1560, y: 2620, w: 880, h: 300 };
export const CAUSEWAY = { x: 1620, y: 2380, w: 90, h: 260 };

// ---- districts
// Six districts tile the city. Each has a colour used for the minimap tint, the
// standing panel and the welcome banner, plus the flavour line shown on entry.
export const DISTRICTS = [
  { id: 'coral',    name: 'Coral Heights', color: '#e2703a', x0: 0,    y0: 0,    x1: 1330, y1: 1180, blurb: 'Quiet avenues, rich marks, nosy neighbours.' },
  { id: 'downtown', name: 'Downtown',      color: '#37b6ff', x0: 1330, y0: 0,    x1: 2670, y1: 1180, blurb: 'Neon, money and cameras on every corner.' },
  { id: 'market',   name: 'Old Market',    color: '#e8c33a', x0: 2670, y0: 0,    x1: 4000, y1: 1180, blurb: 'Stalls, scooters and a thousand side deals.' },
  { id: 'neonbay',  name: 'Neon Bay',      color: '#ff4fd8', x0: 0,    y0: 1180, x1: 1330, y1: 2400, blurb: 'Clubs, boardwalk lights and fast boats.' },
  { id: 'central',  name: 'Vice Central',  color: '#8d7bff', x0: 1330, y0: 1180, x1: 2670, y1: 2400, blurb: 'Warehouses and wide roads. Driver country.' },
  { id: 'portside', name: 'Portside',      color: '#3ad08a', x0: 2670, y0: 1180, x1: 4000, y1: 2400, blurb: 'Cranes, containers and cargo worth stealing.' },
  { id: 'isla',     name: 'Isla Verde',    color: '#37e0c8', x0: ISLAND.x - 60, y0: ISLAND.y - 40, x1: ISLAND.x + ISLAND.w + 60, y1: ISLAND.y + ISLAND.h + 60, blurb: 'Your island. Your rules.' },
];

// ---- landmarks
// 24 named landmarks. They are drawn as signed buildings or props, named on the
// minimap when close, and several anchor missions, packages and race starts.
export const LANDMARKS = [
  { name: 'Palmera Grand Hotel', x: 760,  y: 420,  kind: 'hotel' },
  { name: 'Vice Tower',          x: 1760, y: 330,  kind: 'tower' },
  { name: 'Neon Palms Casino',   x: 2260, y: 760,  kind: 'casino' },
  { name: 'City Hall',           x: 1560, y: 1080, kind: 'civic' },
  { name: 'St. Coral Chapel',    x: 460,  y: 1080, kind: 'chapel' },
  { name: 'Old Market Bazaar',   x: 3260, y: 430,  kind: 'market' },
  { name: 'Smuggler\'s Rest Inn', x: 3560, y: 1080, kind: 'hotel' },
  { name: 'Portside Cranes',     x: 3360, y: 1560, kind: 'cranes' },
  { name: 'Harbor Warehouse 9',  x: 2960, y: 1960, kind: 'warehouse' },
  { name: 'Vice Port Authority', x: 3760, y: 1960, kind: 'civic' },
  { name: 'Club Sirena',         x: 560,  y: 1560, kind: 'club' },
  { name: 'The Pink Flamingo',   x: 960,  y: 2060, kind: 'club' },
  { name: 'Bayview Diner',       x: 1260, y: 2060, kind: 'diner' },
  { name: 'Marina Palmera',      x: 760,  y: 2330, kind: 'marina' },
  { name: 'Neon Bay Boardwalk',  x: 360,  y: 2330, kind: 'boardwalk' },
  { name: 'Coral Heights School', x: 1160, y: 430, kind: 'civic' },
  { name: 'Palm General Hospital', x: 2060, y: 1080, kind: 'hospital' },
  { name: 'Vice Central Depot',  x: 2060, y: 1660, kind: 'warehouse' },
  { name: 'Sunset Auto Works',   x: 1660, y: 2060, kind: 'garage' },
  { name: 'Isla Verde Safehouse', x: ISLAND.x + 180, y: ISLAND.y + 120, kind: 'safehouse' },
  { name: 'Isla Verde Lighthouse', x: ISLAND.x + ISLAND.w - 90, y: ISLAND.y + 90, kind: 'lighthouse' },
  { name: 'Ferry Terminal',      x: 2760, y: 2330, kind: 'marina' },
  { name: 'Turtle Rock',         x: 3160, y: 2760, kind: 'rock' },
  { name: 'The Sunken Buoy',     x: 660,  y: 2820, kind: 'buoy' },
];

// Pay 'N Spray garages (see properties.js).
export const GARAGES = [
  { name: 'Spray — Neon Bay',  x: 560,  y: 1290, district: 'neonbay' },
  { name: 'Spray — Downtown',  x: 2260, y: 590,  district: 'downtown' },
  { name: 'Spray — Portside',  x: 3260, y: 1490, district: 'portside' },
];

// Docks and piers where boats are moored (see boats.js).
export const DOCKS = [
  { name: 'Marina Palmera Pier', x: 700,  y: 2470, side: 'south' },
  { name: 'Boardwalk Jetty',     x: 330,  y: 2470, side: 'south' },
  { name: 'Ferry Dock',          x: 2760, y: 2470, side: 'south' },
  { name: 'Portside Slip',       x: 3560, y: 2470, side: 'south' },
  { name: 'Isla Verde Dock',     x: 1900, y: 2955, side: 'north' },
];

// ---- seeded rng
// A tiny deterministic generator so the city is identical on every load and every
// staged screenshot: same seed, same buildings, same parked cars, same packages.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const angLerp = (a, b, t) => a + angDiff(b, a) * clamp(t, 0, 1);

// ---- road grid
export const colX = (i) => COL_X0 + i * COL_PITCH;
export const rowY = (j) => ROW_Y0 + j * ROW_PITCH;

/** True when (x,y) lies on a road (avenue, intersection, causeway or island road). */
export function onRoad(x, y) {
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
  if (inRect(x, y, CAUSEWAY.x - 6, CAUSEWAY.y - 6, CAUSEWAY.w + 12, CAUSEWAY.h + 12)) return true;
  if (inIsland(x, y)) return islandRoad(x, y);
  if (y > COAST_Y) return false; // beach and sea are not roads
  for (let i = 0; i < COLS; i++) if (Math.abs(x - colX(i)) <= ROAD_W / 2) return true;
  for (let j = 0; j < ROWS; j++) if (Math.abs(y - rowY(j)) <= ROAD_W / 2) return true;
  return false;
}

/** The island has one ring road and one cross street so cars can reach the safehouse. */
export function islandRoad(x, y) {
  const cx = ISLAND.x + ISLAND.w / 2, cy = ISLAND.y + ISLAND.h / 2;
  if (Math.abs(y - cy) <= 44 && x > ISLAND.x + 30 && x < ISLAND.x + ISLAND.w - 30) return true;
  if (Math.abs(x - (ISLAND.x + 190)) <= 44 && y > ISLAND.y + 30 && y < ISLAND.y + ISLAND.h - 30) return true;
  if (Math.abs(x - cx) <= 10 && Math.abs(y - cy) <= 10) return true;
  return false;
}

export function inRect(x, y, rx, ry, rw, rh) { return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh; }
export function inIsland(x, y) { return inRect(x, y, ISLAND.x, ISLAND.y, ISLAND.w, ISLAND.h); }

/** Water: south of the sand line and not island, causeway or pier. */
export function isWater(x, y) {
  if (y < SAND_Y) return false;
  if (inIsland(x, y)) return false;
  if (inRect(x, y, CAUSEWAY.x, CAUSEWAY.y, CAUSEWAY.w, CAUSEWAY.h)) return false;
  return x >= 0 && x <= WORLD_W && y <= WORLD_H;
}
export function isSand(x, y) { return y >= COAST_Y && y < SAND_Y && !inIsland(x, y); }
/** Land a pedestrian or car may occupy: anything that is not open water. */
export function isLand(x, y) { return x >= 0 && y >= 0 && x <= WORLD_W && y <= WORLD_H && !isWater(x, y); }

export function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  if (isWater(x, y)) return DISTRICTS[4]; // open sea counts as Vice Central water
  return DISTRICTS[1];
}

// ---- buildings
// Buildings fill each block: 2-4 per block, ~90 total, each with a footprint,
// height (shadow + rooftop packages), palette, a window grid (lit at night) and
// sometimes a neon sign naming it after a landmark.
const ROOF_COLORS = ['#3a3f52', '#46384a', '#2f4858', '#51423a', '#39424e', '#423a5e', '#503a44', '#33524a'];
const WALL_COLORS = ['#6b5a72', '#7a6248', '#54677d', '#77655a', '#5d5470', '#486a63', '#7d5468', '#5a6e4e'];
const NEON_COLORS = ['#ff4fd8', '#37e0ff', '#ffe14f', '#7dff6a', '#ff8a3d', '#b78bff'];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  let bid = 0;
  for (let c = 0; c < COLS - 1; c++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const bx0 = colX(c) + ROAD_W / 2 + 26, bx1 = colX(c + 1) - ROAD_W / 2 - 26;
      const by0 = rowY(r) + ROAD_W / 2 + 26, by1 = rowY(r + 1) - ROAD_W / 2 - 26;
      const bw = bx1 - bx0, bh = by1 - by0;
      const split = rng() < 0.5 ? 2 : 3;
      for (let k = 0; k < split; k++) {
        if (rng() < 0.12) continue; // the odd empty lot / car park
        const w = bw / split - 18;
        const x = bx0 + (bw / split) * k + 9;
        const h = bh - 20 - rng() * 30;
        const y = by0 + 10 + rng() * 20;
        const floors = 2 + Math.floor(rng() * 6);
        buildings.push({
          id: bid++, x, y, w, h, floors,
          height: 14 + floors * 9,
          roof: ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)],
          wall: WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)],
          neon: rng() < 0.3 ? NEON_COLORS[Math.floor(rng() * NEON_COLORS.length)] : null,
          winSeed: Math.floor(rng() * 1e9),
          name: null,
        });
      }
    }
  }
  // Island buildings: the safehouse, a lighthouse keeper's hut and two villas.
  buildings.push({ id: bid++, x: ISLAND.x + 110, y: ISLAND.y + 60, w: 150, h: 110, floors: 2, height: 30, roof: '#5e3a3a', wall: '#a8765e', neon: '#37e0c8', winSeed: 777, name: 'Isla Verde Safehouse', safehouse: true });
  buildings.push({ id: bid++, x: ISLAND.x + 560, y: ISLAND.y + 55, w: 120, h: 95, floors: 3, height: 42, roof: '#3f4a5e', wall: '#7d6a54', neon: null, winSeed: 778, name: 'Villa Sirena' });
  buildings.push({ id: bid++, x: ISLAND.x + 330, y: ISLAND.y + 185, w: 130, h: 90, floors: 2, height: 32, roof: '#44503a', wall: '#6e7d54', neon: null, winSeed: 779, name: 'Villa Tortuga' });
  // Name the buildings nearest each mainland landmark so signs match the map.
  for (const lm of LANDMARKS) {
    if (lm.kind === 'safehouse' || lm.kind === 'rock' || lm.kind === 'buoy' || lm.kind === 'lighthouse') continue;
    let best = null, bd = 1e12;
    for (const b of buildings) {
      if (b.name) continue;
      const d = dist2(b.x + b.w / 2, b.y + b.h / 2, lm.x, lm.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best && bd < 320 * 320) { best.name = lm.name; if (!best.neon) best.neon = NEON_COLORS[best.id % NEON_COLORS.length]; }
  }
  return buildings;
}

/** Solid test for a point against every building footprint (with a small shrink). */
export function hitsBuilding(buildings, x, y, pad = 0) {
  for (const b of buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

/** Circle vs buildings: returns a push-out vector or null. Used by every mover. */
export function collideCircle(buildings, x, y, r) {
  const b = hitsBuilding(buildings, x, y, r * 0.6);
  if (!b) return null;
  const left = x - (b.x - r), right = (b.x + b.w + r) - x;
  const top = y - (b.y - r), bot = (b.y + b.h + r) - y;
  const m = Math.min(left, right, top, bot);
  if (m === left) return { x: b.x - r, y };
  if (m === right) return { x: b.x + b.w + r, y };
  if (m === top) return { x, y: b.y - r };
  return { x, y: b.y + b.h + r };
}

/** Segment vs building: true when a building blocks the straight line (occlusion). */
export function lineBlocked(buildings, ax, ay, bx, by) {
  const steps = Math.max(4, Math.floor(dist(ax, ay, bx, by) / 26));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (hitsBuilding(buildings, ax + (bx - ax) * t, ay + (by - ay) * t, -4)) return true;
  }
  return false;
}

// ---- day / night
// A full cycle lasts DAY_LENGTH seconds. t is normalised 0..1 (0.30 ≈ noon).
export const DAY_LENGTH = 240;
export function daylight(t) {
  const s = Math.sin((t - 0.05) * Math.PI * 2);
  return clamp(0.25 + s * 0.85, 0.04, 1);
}
export function isNight(t) { return daylight(t) < 0.45; }
export function timeLabel(t) {
  const mins = Math.floor(t * 24 * 60) % (24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(Math.floor(mins % 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}
/** Sky tint for a normalised time: deep night blue -> dawn pink -> day cyan -> dusk orange. */
export function skyTint(t) {
  const d = daylight(t);
  if (d > 0.8) return [0.25, 0.55, 0.75];
  if (d > 0.45) return [0.55, 0.42, 0.45];
  return [0.05, 0.06, 0.16];
}

// ---- spawn helpers
/** A random point on a random road, away from (x,y) by at least minD. */
export function randomRoadPoint(rng, x, y, minD) {
  for (let tries = 0; tries < 40; tries++) {
    let px, py;
    if (rng() < 0.5) { px = colX(Math.floor(rng() * COLS)) + (rng() - 0.5) * 60; py = 80 + rng() * (COAST_Y - 160); }
    else { px = 80 + rng() * (WORLD_W - 160); py = rowY(Math.floor(rng() * ROWS)) + (rng() - 0.5) * 60; }
    if (dist(px, py, x, y) >= minD) return { x: px, y: py };
  }
  return { x: colX(1), y: rowY(1) };
}

/** Snap a point to the nearest road centre line (used to place parked cars neatly). */
export function nearestRoadAxis(x, y) {
  let bestC = 0, bd = 1e12;
  for (let i = 0; i < COLS; i++) { const d = Math.abs(x - colX(i)); if (d < bd) { bd = d; bestC = i; } }
  let bestR = 0; bd = 1e12;
  for (let j = 0; j < ROWS; j++) { const d = Math.abs(y - rowY(j)); if (d < bd) { bd = d; bestR = j; } }
  return { col: bestC, row: bestR, dx: Math.abs(x - colX(bestC)), dy: Math.abs(y - rowY(bestR)) };
}
