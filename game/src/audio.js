// audio.js — All sound is synthesized with WebAudio; there are no audio files.
// Four layers: MUSIC (a bar-scheduled synthwave loop: square-wave bass, pads,
// hats, arp), ENGINE (oscillator + noise following throttle/speed, churnier for
// boats), SIREN (two-tone, volume by nearest unit's distance) and SFX (one-shot
// gunshots, punches, pickups, cash, crashes, splashes, chimes, countdown beeps
// and sting jingles). The context starts lazily on the first user gesture, and
// every entry point is guarded so silent environments simply stay silent.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineNoise = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.barTimer = 0;
    this.bar = 0;
    this.started = false;
    this.muted = false;
  }

  /** Create the context and start the continuous layers. Safe to call repeatedly. */
  ensure() {
    if (this.started) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.master);
      this._engineNodes();
      this._sirenNodes();
      this.started = true;
    } catch (e) { /* silent environment: stay silent */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  _engineNodes() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    // A looped noise buffer adds tyre/water texture under the tone.
    const len = ctx.sampleRate * 1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.engineNoise = ctx.createBufferSource();
    this.engineNoise.buffer = buf; this.engineNoise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 300;
    const ng = ctx.createGain(); ng.gain.value = 0;
    this.engineNoise.connect(nf); nf.connect(ng); ng.connect(this.master);
    this.engineNoise.start();
    this.engineNoiseGain = ng;
  }

  _sirenNodes() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  /**
   * Per-frame continuous update. speed01 is 0..1 of the vehicle's top speed,
   * throttle 0..1, siren01 0..1 by nearest-unit proximity, onWater swaps the
   * engine character to a lower, churnier note.
   */
  update(dt, speed01, throttle, siren01, onWater) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const base = onWater ? 55 : 70;
    const freq = base + speed01 * (onWater ? 90 : 190) + throttle * 22;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    const eg = throttle > 0.02 || speed01 > 0.03 ? 0.05 + speed01 * 0.075 : 0.0;
    this.engineGain.gain.setTargetAtTime(eg, t, 0.09);
    if (this.engineNoiseGain) this.engineNoiseGain.gain.setTargetAtTime(speed01 * (onWater ? 0.11 : 0.03), t, 0.1);
    // Two-tone siren: alternate 660/880 Hz twice a second, volume by proximity.
    const tone = (Math.floor(t * 2.4) % 2 === 0) ? 660 : 880;
    this.sirenOsc.frequency.setTargetAtTime(tone, t, 0.03);
    this.sirenGain.gain.setTargetAtTime(siren01 * 0.055, t, 0.12);
    // Music scheduler: one bar every 1.6s of the loop below.
    this.barTimer -= dt;
    if (this.barTimer <= 0) { this.barTimer = 1.6; this._playBar(this.bar++); }
  }

  // The loop: Am — F — C — G. Bass eighths, pad swells, arp on bars 3-4.
  _playBar(bar) {
    if (!this.ctx || !this.musicGain) return;
    const roots = [110.0, 87.31, 130.81, 98.0];       // A2 F2 C3 G2
    const pads = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
    const root = roots[bar % 4];
    const t0 = this.ctx.currentTime + 0.03;
    for (let i = 0; i < 8; i++) {
      const f = i % 2 === 0 ? root : root * 1.5;
      this._tone(f, t0 + i * 0.2, 0.17, 'square', 0.05, this.musicGain, 900);
    }
    if (bar % 2 === 0) for (const f of pads[bar % 4]) this._tone(f, t0, 1.5, 'sine', 0.028, this.musicGain, 1400);
    if (bar % 4 >= 2) {
      const scale = [440, 523.25, 659.25, 783.99];
      for (let i = 0; i < 4; i++) this._tone(scale[(bar + i) % 4], t0 + i * 0.4 + 0.1, 0.22, 'triangle', 0.03, this.musicGain, 2400);
    }
    this._hat(t0); this._hat(t0 + 0.8);
  }

  _hat(t) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate * 0.05;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(hp); hp.connect(g); g.connect(this.musicGain);
    src.start(t);
  }

  _tone(freq, at, dur, type, vol, dest, cutoff) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 2000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f); f.connect(g); g.connect(dest || this.master);
    o.start(at); o.stop(at + dur + 0.05);
  }

  _noise(at, dur, vol, freq, type) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(at);
  }

  /** One-shot effects by name. Unknown names are ignored, never thrown. */
  sfx(name) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'shot': this._noise(t, 0.11, 0.30, 1600, 'lowpass'); this._tone(150, t, 0.08, 'square', 0.12); break;
      case 'shotEnemy': this._noise(t, 0.09, 0.16, 1200, 'lowpass'); break;
      case 'punch': this._noise(t, 0.07, 0.22, 500, 'lowpass'); break;
      case 'hurt': this._tone(180, t, 0.14, 'sawtooth', 0.12); break;
      case 'pickup': this._tone(880, t, 0.09, 'sine', 0.14); this._tone(1318, t + 0.07, 0.14, 'sine', 0.14); break;
      case 'cash': this._tone(1046, t, 0.08, 'square', 0.08); this._tone(1568, t + 0.06, 0.16, 'square', 0.08); break;
      case 'crash': this._noise(t, 0.28, 0.34, 300, 'lowpass'); this._tone(70, t, 0.25, 'sine', 0.2); break;
      case 'splash': this._noise(t, 0.4, 0.16, 900, 'bandpass'); break;
      case 'checkpoint': this._tone(784, t, 0.1, 'sine', 0.13); this._tone(1175, t + 0.08, 0.16, 'sine', 0.13); break;
      case 'beep': this._tone(660, t, 0.1, 'square', 0.1); break;
      case 'go': this._tone(990, t, 0.3, 'square', 0.12); break;
      case 'door': this._tone(240, t, 0.07, 'square', 0.07); this._tone(180, t + 0.08, 0.09, 'square', 0.07); break;
      case 'spray': this._noise(t, 0.7, 0.1, 3000, 'highpass'); break;
      case 'busted': this._tone(392, t, 0.2, 'triangle', 0.14); this._tone(311, t + 0.18, 0.2, 'triangle', 0.14); this._tone(233, t + 0.36, 0.42, 'triangle', 0.14); break;
      case 'wasted': this._tone(220, t, 0.3, 'sawtooth', 0.12); this._tone(110, t + 0.25, 0.6, 'sawtooth', 0.12); break;
      case 'empty': this._tone(1200, t, 0.03, 'square', 0.05); break;
    }
  }

  /** Short jingles for big moments: unlocks, standing tiers, milestones, wins. */
  sting(name) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const seqs = {
      unlock: [523.25, 659.25, 783.99, 1046.5],
      tier: [659.25, 783.99, 1046.5],
      milestone: [783.99, 987.77, 1174.66, 1567.98],
      win: [523.25, 659.25, 783.99, 1046.5, 1318.5],
      job: [440, 554.37, 659.25, 880],
    };
    const seq = seqs[name] || seqs.job;
    seq.forEach((f, i) => this._tone(f, t + i * 0.09, 0.22, 'triangle', 0.12, this.master, 2600));
  }
}
