// collectibles.js — Hidden Packages: 30 glowing parcels on rooftops, in alleys,
// under piers, on the island and on a buoy in the bay. +$150 each; milestones at
// 10/20/30 pay $1,000/$2,500/$6,000 and fire a minimap hint pulse revealing the
// nearest remaining package. Placement is seeded and deterministic; found
// packages persist in the save; HUD and Tab panel report progress.

import { WORLD_W, COAST_Y, ISLAND, dist, makeRng } from './world.js';

// Hand-placed anchors first (rooftops, piers, island, buoy), then seeded alleys.
const ANCHORS = [
  { x: 790,  y: 300,  where: 'rooftop, Palmera Grand' },
  { x: 1790, y: 210,  where: 'rooftop, Vice Tower' },
  { x: 2290, y: 640,  where: 'rooftop, Neon Palms Casino' },
  { x: 3290, y: 310,  where: 'rooftop, Old Market Bazaar' },
  { x: 700,  y: 2520, where: 'under Marina Palmera pier' },
  { x: 330,  y: 2540, where: 'end of the Boardwalk Jetty' },
  { x: 2760, y: 2520, where: 'under the Ferry Dock' },
  { x: 3560, y: 2540, where: 'Portside Slip crates' },
  { x: 1740, y: 2700, where: 'safehouse garden, Isla Verde' },
  { x: 2330, y: 2700, where: 'lighthouse rocks, Isla Verde' },
  { x: 660,  y: 2820, where: 'the Sunken Buoy (by boat)' },
  { x: 3160, y: 2760, where: 'Turtle Rock (by boat)' },
  { x: 1090, y: 940,  where: 'alley behind St. Coral Chapel' },
  { x: 2090, y: 940,  where: 'hospital service lane' },
  { x: 590,  y: 1440, where: 'behind Club Sirena' },
  { x: 3390, y: 1440, where: 'between the Portside Cranes' },
];

export const PACKAGE_TOTAL = 30;
export const MILESTONES = [
  { at: 10, cash: 1000 },
  { at: 20, cash: 2500 },
  { at: 30, cash: 6000 },
];

export function createPackages(seed) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const list = ANCHORS.map((a, i) => ({ id: i, x: a.x, y: a.y, where: a.where, found: false }));
  // Seeded alley spots: tucked against building lines on the avenue grid.
  let guard = 0;
  while (list.length < PACKAGE_TOTAL && guard++ < 400) {
    const x = 140 + rng() * (WORLD_W - 280);
    const y = 140 + rng() * (COAST_Y - 280);
    if (list.some((p) => dist(p.x, p.y, x, y) < 190)) continue;
    list.push({ id: list.length, x: Math.round(x), y: Math.round(y), where: 'a quiet alley', found: false });
  }
  return list;
}

/** Nearest un-found package to a point (for the milestone hint pulse). */
export function nearestPackage(G, x, y) {
  let best = null, bd = Infinity;
  for (const p of G.packages) {
    if (p.found) continue;
    const d = dist(p.x, p.y, x, y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/**
 * Per-frame pickup check for the player's current position (foot, car or boat —
 * the buoy and Turtle Rock packages are deliberately boat-only spots).
 */
export function updatePackages(G, dt) {
  const px = G.player.x, py = G.player.y;
  for (const p of G.packages) {
    if (p.found) continue;
    if (dist(p.x, p.y, px, py) < 30) {
      p.found = true;
      G.packagesFound++;
      G.cash += 150;
      G.toast(`Hidden package ${G.packagesFound}/30 — +$150 (${p.where})`);
      if (G.audio) G.audio.sfx('pickup');
      G.effects.push({ kind: 'sparkle', x: p.x, y: p.y, t: 0, life: 0.7, color: '#ffe14f' });
      const ms = MILESTONES.find((m) => m.at === G.packagesFound);
      if (ms) {
        G.cash += ms.cash;
        G.banner('PACKAGE MILESTONE', `${ms.at} packages — bonus $${ms.cash.toLocaleString('en-US')} paid. A hint pulse marks the next one.`);
        if (G.audio) G.audio.sting('milestone');
        const next = nearestPackage(G, px, py);
        if (next) G.hintPulse = { x: next.x, y: next.y, t: 6 };
      }
      if (G.packagesFound === PACKAGE_TOTAL) {
        G.banner('ALL 30 PACKAGES', 'Every hidden package in Palmera City is yours. Completionist money: paid in full.');
      }
    }
  }
  if (G.hintPulse) {
    G.hintPulse.t -= dt;
    if (G.hintPulse.t <= 0) G.hintPulse = null;
  }
}

/** Draw the packages in world space: a pulsing parcel with a soft glow ring. */
export function drawPackages(ctx, G, cam) {
  const t = G.time;
  for (const p of G.packages) {
    if (p.found) continue;
    const sx = p.x - cam.x, sy = p.y - cam.y;
    if (sx < -60 || sy < -60 || sx > cam.w + 60 || sy > cam.h + 60) continue;
    const pulse = 1 + Math.sin(t * 4 + p.id) * 0.15;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.strokeStyle = 'rgba(255,225,79,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 17 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = '#ffe14f';
    ctx.fillRect(-8, -1.5, 16, 3);
    ctx.fillRect(-1.5, -6, 3, 12);
    ctx.restore();
  }
  // Milestone hint pulse: an expanding ring on the world at the hinted package.
  if (G.hintPulse) {
    const sx = G.hintPulse.x - cam.x, sy = G.hintPulse.y - cam.y;
    const ph = (G.time * 0.8) % 1;
    ctx.save();
    ctx.strokeStyle = `rgba(255,225,79,${0.8 * (1 - ph)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy, 14 + ph * 90, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
