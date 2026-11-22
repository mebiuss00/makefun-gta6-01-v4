// properties.js — Pay 'N Spray (3 garages): stop inside with $100 + $25/star for
// a full repair, a fresh repaint and a completely cleared wanted level — the
// heat tutorial of story job 3. And the Isla Verde SAFEHOUSE ($5,000): E at the
// door buys it, E again sleeps (heal, save, morning, heat gone). Beside it the
// personal GARAGE stores one car — model, colour and health persist in the
// save — and retrieves it with E, swapping with whatever you arrived in.

import { GARAGES, ISLAND, dist } from './world.js';
import { makeCar, typeById } from './traffic.js';

export const SAFEHOUSE_PRICE = 5000;
export const SAFEHOUSE_DOOR = { x: ISLAND.x + 185, y: ISLAND.y + 178 };
export const GARAGE_DOOR = { x: ISLAND.x + 330, y: ISLAND.y + 178 };

export function sprayCost(G) {
  return 100 + 25 * Math.ceil(G.wanted);
}

/** Per-frame property interactions; prompts are surfaced through G.prompt. */
export function updateProperties(G, dt) {
  // ---- Pay 'N Spray ---------------------------------------------------------
  G.sprayPrompt = null;
  if (G.player.inCar && G.playerCar.hp > 0) {
    for (const g of GARAGES) {
      if (dist(G.player.x, G.player.y, g.x, g.y) < 56) {
        const cost = sprayCost(G);
        if (Math.abs(G.playerCarSpeed) < 14) {
          if (G.cash >= cost) {
            G.sprayPrompt = { garage: g, cost };
            G.prompt = `Press E — Pay 'N Spray: repair + repaint + lose the heat, $${cost}`;
          } else G.prompt = `Pay 'N Spray needs $${cost} — you have $${Math.floor(G.cash)}`;
        } else G.prompt = 'Pay \'N Spray — stop the car inside the garage';
        break;
      }
    }
  }
  // ---- Safehouse door ---------------------------------------------------------
  const dHouse = dist(G.player.x, G.player.y, SAFEHOUSE_DOOR.x, SAFEHOUSE_DOOR.y);
  if (!G.player.inCar && !G.player.inBoat && dHouse < 52) {
    if (!G.flags.safehouseOwned) G.prompt = `Press E — buy the Isla Verde Safehouse for $${SAFEHOUSE_PRICE.toLocaleString('en-US')}`;
    else G.prompt = 'Press E — sleep at the safehouse (heal, save, morning, heat gone)';
    G.housePrompt = true;
  } else G.housePrompt = false;
  // ---- Personal garage ---------------------------------------------------------
  const dGar = dist(G.player.x, G.player.y, GARAGE_DOOR.x, GARAGE_DOOR.y);
  G.garagePrompt = false;
  if (dGar < 56 && G.flags.safehouseOwned) {
    if (G.player.inCar) { G.prompt = 'Press E — store this car in your garage'; G.garagePrompt = true; }
    else if (G.garageCar) { G.prompt = `Press E — take out your stored ${G.garageCar.label}`; G.garagePrompt = true; }
  }
}

/** The E-key action for properties; returns true when it consumed the press. */
export function propertyAction(G) {
  if (G.sprayPrompt) {
    const { garage, cost } = G.sprayPrompt;
    G.cash -= cost;
    const car = G.playerCar;
    car.hp = car.maxHp;
    const t = typeById(car.type);
    car.color = t.colors[Math.floor(G.rng() * t.colors.length)];
    G.clearWanted();
    if (G.audio) { G.audio.sfx('spray'); G.audio.sfx('cash'); }
    G.banner('PAY \'N SPRAY', `Fresh paint, fixed panels, no heat. -$${cost}. (${garage.name})`);
    G.sprayPrompt = null;
    if (G.missionEvent) G.missionEvent('spray', {});
    G.saveGame();
    return true;
  }
  if (G.housePrompt) {
    if (!G.flags.safehouseOwned) {
      if (G.cash < SAFEHOUSE_PRICE) { G.toast(`The safehouse costs $${SAFEHOUSE_PRICE.toLocaleString('en-US')} — you have $${Math.floor(G.cash)}.`); return true; }
      G.cash -= SAFEHOUSE_PRICE;
      G.flags.safehouseOwned = true;
      G.banner('SAFEHOUSE BOUGHT', 'Isla Verde is home now. Sleep here to heal and save; the garage next door stores one car.');
      if (G.audio) G.audio.sting('unlock');
      if (G.missionEvent) G.missionEvent('safehouse', {});
      G.saveGame();
      return true;
    }
    // Sleep: heal, save, morning, heat gone.
    G.player.hp = G.player.maxHp;
    G.dayT = 0.30;
    G.clearWanted();
    G.toast('You slept till morning. Healed, saved, and the city forgot last night.');
    if (G.audio) G.audio.sfx('cash');
    G.saveGame();
    return true;
  }
  if (G.garagePrompt) {
    if (G.player.inCar) {
      const car = G.playerCar;
      G.garageCar = { type: car.type, color: car.color, hp: car.hp, label: car.label };
      G.exitVehicle(true); // silent exit; the car stays "in" the garage
      G.cars = G.cars.filter((c) => c !== car);
      G.toast(`${car.label} stored in your garage.`);
      if (G.audio) G.audio.sfx('door');
      G.saveGame();
      return true;
    }
    if (G.garageCar) {
      const stored = G.garageCar;
      G.garageCar = null;
      const car = makeCar(stored.type, GARAGE_DOOR.x, GARAGE_DOOR.y + 44, Math.PI / 2);
      car.color = stored.color; car.hp = Math.max(20, stored.hp);
      G.cars.push(car);
      G.enterCar(car);
      G.toast(`Your ${stored.label} rolls out of the garage.`);
      if (G.audio) G.audio.sfx('door');
      G.saveGame();
      return true;
    }
  }
  return false;
}

/** Serialize the stored garage car for the save file (and back). */
export function garageSaveData(G) { return G.garageCar; }
