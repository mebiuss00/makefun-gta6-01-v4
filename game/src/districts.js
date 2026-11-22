// districts.js — District Standing, the empire layer. Each district tracks
// standing 0-100 from jobs, errands and races inside it; every full 25 points
// adds +10% to payouts there. The six-district average is CITY CONTROL, which
// unlocks Marco at 40% and gates the finale. The Tab panel draws all six bars
// and multipliers; the minimap tints districts by standing. Persists in the save.

import { DISTRICTS, clamp } from './world.js';

/** Fresh standing table: every district starts at a small earned-by-arrival value. */
export function createStanding() {
  const s = {};
  for (const d of DISTRICTS) s[d.id] = d.id === 'neonbay' ? 8 : 0;
  return s;
}

/** City control: mean standing of the six mainland districts (the island is yours). */
export function cityControl(G) {
  let sum = 0, n = 0;
  for (const d of DISTRICTS) {
    if (d.id === 'isla') continue;
    sum += G.standing[d.id] || 0; n++;
  }
  return n ? sum / n : 0;
}

/** Payout multiplier for work done in a district: +10% per full 25 standing. */
export function payoutMultiplier(G, districtId) {
  const s = G.standing[districtId] || 0;
  return 1 + Math.floor(s / 25) * 0.10;
}

/** Apply the district multiplier to a base payout and round to whole dollars. */
export function paid(G, districtId, base) {
  return Math.round(base * payoutMultiplier(G, districtId));
}

/**
 * Raise a district's standing. Returns true when a 25-point tier was crossed, so the
 * caller can celebrate it (banner + sound) and the player learns the tiers matter.
 */
export function addStanding(G, districtId, amount, why) {
  const before = G.standing[districtId] || 0;
  const after = clamp(before + amount, 0, 100);
  G.standing[districtId] = after;
  const tierBefore = Math.floor(before / 25), tierAfter = Math.floor(after / 25);
  if (after > before) {
    G.log.push({ t: G.time, text: `+${Math.round(after - before)}% standing in ${nameOf(districtId)} (${why})` });
    if (G.log.length > 40) G.log.shift();
  }
  if (tierAfter > tierBefore) {
    G.banner(`${nameOf(districtId)} TIER ${tierAfter}`, `Payouts here now pay +${tierAfter * 10}% — standing ${Math.round(after)}%`);
    if (G.audio) G.audio.sting('tier');
  }
  // Marco unlock check lives in crew.js but is driven from here: control crossing
  // 40% is a standing event, and the crew module polls this flag each frame.
  const control = cityControl(G);
  if (control >= 40 && !G.flags.marcoUnlocked) {
    G.flags.marcoUnlocked = true;
    G.banner('CREW UNLOCKED', 'Marco "Wrench" Ruiz is waiting at Sunset Auto Works — drive there to recruit him.');
    if (G.audio) G.audio.sting('unlock');
  }
  return tierAfter > tierBefore;
}

export function nameOf(districtId) {
  const d = DISTRICTS.find((x) => x.id === districtId);
  return d ? d.name : districtId;
}

/** District the player is currently earning in (island counts as its own). */
export function currentDistrictId(G) {
  return G.player.districtId || 'downtown';
}

// ------------------------------------------------------------------ Tab panel
// Every district's bar and multiplier, the city-control bar, status lines.
export function drawStandingPanel(ctx, G, W, H) {
  const pw = 540, ph = 424;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(5,6,16,0.88)';
  ctx.strokeStyle = '#37e0ff'; ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, ph, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DISTRICT STANDING', px + 24, py + 40);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#9fd8ff';
  ctx.fillText('Jobs, errands and races raise standing. Each 25% tier adds +10% to payouts there.', px + 24, py + 62);
  let y = py + 92;
  for (const d of DISTRICTS) {
    const s = Math.round(G.standing[d.id] || 0);
    ctx.fillStyle = d.color;
    ctx.fillRect(px + 24, y - 11, 10, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(d.name, px + 44, y + 2);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(`${s}%`, px + 196, y + 2);
    ctx.fillStyle = '#8fa3bf';
    ctx.fillText(`x${payoutMultiplier(G, d.id).toFixed(1)} pay`, px + 244, y + 2);
    // bar
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, px + 320, y - 10, 170, 12, 6); ctx.fill();
    ctx.fillStyle = d.color;
    if (s > 0) { roundRect(ctx, px + 320, y - 10, 170 * s / 100, 12, 6); ctx.fill(); }
    // tier ticks at 25/50/75
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (const t of [0.25, 0.5, 0.75]) ctx.fillRect(px + 320 + 170 * t - 1, y - 10, 2, 12);
    y += 30;
  }
  const control = cityControl(G);
  y += 6;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(`CITY CONTROL  ${control.toFixed(1)}%`, px + 24, y);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, px + 24, y + 10, pw - 48, 16, 8); ctx.fill();
  const grad = ctx.createLinearGradient(px + 24, 0, px + pw - 24, 0);
  grad.addColorStop(0, '#ff4fd8'); grad.addColorStop(1, '#37e0c8');
  ctx.fillStyle = grad;
  if (control > 0) { roundRect(ctx, px + 24, y + 10, (pw - 48) * control / 100, 16, 8); ctx.fill(); }
  ctx.fillStyle = '#0b0e1a';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillRect(px + 24 + (pw - 48) * 0.4 - 1, y + 10, 2, 16);
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('40% = MARCO', px + 24 + (pw - 48) * 0.4 - 26, y + 40);
  y += 58;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#cfe6ff';
  const house = G.flags.safehouseOwned ? 'Safehouse: OWNED (Isla Verde) — sleep, heal, garage' : 'Safehouse: for sale — $5,000 on Isla Verde';
  const stored = G.garageCar ? `Garage: ${G.garageCar.label} stored` : 'Garage: empty';
  ctx.fillText(house, px + 24, y);
  ctx.fillText(stored, px + 24, y + 19);
  ctx.fillText(`Hidden packages: ${G.packagesFound}/30 — milestones pay at 10 / 20 / 30`, px + 24, y + 38);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
