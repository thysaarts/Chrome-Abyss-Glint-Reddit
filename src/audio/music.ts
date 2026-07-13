/**
 * MUSIC — Chrome Abyss: Glint
 * ===========================
 * Generative, looping ambient tracks — one per theme — all SYNTHESISED live with
 * the Web Audio API (no files, works offline, inherently royalty-free). They sit
 * quietly UNDER the SFX: subtle, but present.
 *
 * Each theme keeps the sci-fi register (synth timbres, a shared plate reverb,
 * mostly minor/modal harmony) but leans a flavour:
 *   generic  — spacey ambient pads + sparse bells
 *   Machina Forge     — rhythmic, industrial (metallic clank, driving saw pulse)
 *   Shadow Sector     — espionage / suspense (noir bass, tense sparse plucks)
 *   Corporate Spire   — clean, serious synth pads + bell arp
 *   Digital Nexus     — techy, digital (fast 16th arps, blips)
 *   Fringe Market     — street, subtle R&B (warm keys, laid-back swung groove)
 *   Divinity Enclave  — calm, spiritual, soothing (airy pads, chimes, long verb)
 *   Military Bastion  — harsh, rhythmic, powerful (hard kicks, brass stabs)
 *
 * Implementation: a lookahead scheduler (the standard Web Audio pattern) walks a
 * step grid and each theme schedules its voices per step, so loops are seamless.
 * Switching themes crossfades via the music master gain.
 */
import { peekAudioContext } from "./sfx";

export type MusicTheme =
  | "generic"
  | "Interstellar"
  | "Machina Forge"
  | "Shadow Sector"
  | "Corporate Spire"
  | "Digital Nexus"
  | "Fringe Market"
  | "Divinity Enclave"
  | "Military Bastion"
  // the SHOP wave — sci-fi with a twist
  | "Candy Nova"
  | "Verdant Overgrowth"
  | "Crimson Requiem"
  | "Velvet Lounge"
  | "Isla Neon"
  | "Frost Palace"
  | "Retro Arcade"
  | "Solar Flare"
  | "Void Rose"
  // the PREMIUM wave — melody-forward flagship tracks
  | "Prism Vault"
  | "Storm Front"
  | "Dune Mirage"
  | "Regalia"
  | "Skyward"
  | "Obsidian Mirror"
  // internal: the GLINT RUSH anthem — plays for every rush, on every theme;
  // never listed in any catalogue or equip menu
  | "Glint Rush";

// ---- shared audio graph (built lazily once the ctx is live) ----
let musicMaster: GainNode | null = null;
let reverbSend: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

const CEILING = 0.5; // music master gain when volume = 1 (kept low — it's a track)
let volume = 0.5; // 0..1 from Settings
let muted = false; // a hard mute independent of volume (the Sticker Book's bottom toggle)
let activeTheme: MusicTheme | null = null;
let swapTo: MusicTheme | null = null;
let swapAt = 0;
let step = 0;
let nextNoteTime = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const LOOKAHEAD = 0.12; // schedule this far ahead (s)
const TICK_MS = 25;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// the master gain a live, unmuted theme should sit at
const targetGain = () => (activeTheme && !muted ? CEILING * volume : 0);

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function setup(ctx: AudioContext) {
  if (musicMaster) return;
  const master = ctx.createGain();
  master.gain.value = 0; // ramps up when a theme starts
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  master.connect(comp);
  comp.connect(ctx.destination);

  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.4, 2.6);
  const send = ctx.createGain();
  send.gain.value = 1;
  send.connect(conv);
  conv.connect(master);

  // a cached 1s noise buffer, reused for every percussion hit
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  musicMaster = master;
  reverbSend = send;
  noiseBuf = nb;
}

/* ------------------------------- voices ------------------------------- */

interface NoteOpts {
  freq: number;
  when: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  detune?: number;
  filter?: number; // lowpass cutoff at note start
  filterTo?: number; // cutoff sweeps to this by end (filter envelope)
  q?: number;
  pan?: number;
  reverb?: number; // 0..1 send amount
}

function note(ctx: AudioContext, o: NoteOpts) {
  if (!musicMaster) return;
  const { freq, when, type = "sine", gain = 0.05, attack = 0.02, release = 0.3, detune = 0, filter, filterTo, q = 0.7, pan = 0, reverb = 0.25 } = o;
  const dur = Math.max(o.dur, attack + 0.03);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  if (detune) osc.detune.value = detune;

  let src: AudioNode = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = q;
    f.frequency.setValueAtTime(filter, when);
    if (filterTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo), when + dur);
    osc.connect(f);
    src = f;
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + attack);
  g.gain.setValueAtTime(gain, when + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);
  src.connect(g);

  let out: AudioNode = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    out = p;
  }
  out.connect(musicMaster);
  if (reverb > 0 && reverbSend) {
    const rs = ctx.createGain();
    rs.gain.value = reverb;
    out.connect(rs);
    rs.connect(reverbSend);
  }
  osc.start(when);
  osc.stop(when + dur + release + 0.05);
}

function chord(ctx: AudioContext, notes: number[], o: Omit<NoteOpts, "freq">) {
  notes.forEach((m, i) => note(ctx, { ...o, freq: hz(m), pan: (o.pan ?? 0) + (i - (notes.length - 1) / 2) * 0.08 }));
}

interface HitOpts {
  when: number;
  dur?: number;
  gain?: number;
  filter?: number;
  filterTo?: number;
  q?: number;
  type?: BiquadFilterType;
  pan?: number;
  reverb?: number;
}

function noiseHit(ctx: AudioContext, o: HitOpts) {
  if (!musicMaster || !noiseBuf) return;
  const { when, dur = 0.09, gain = 0.05, filter = 3200, filterTo, q = 0.8, type = "bandpass", pan = 0, reverb = 0.14 } = o;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(filter, when);
  if (filterTo) f.frequency.exponentialRampToValueAtTime(Math.max(80, filterTo), when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f);
  f.connect(g);
  let out: AudioNode = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    out = p;
  }
  out.connect(musicMaster);
  if (reverb > 0 && reverbSend) {
    const rs = ctx.createGain();
    rs.gain.value = reverb;
    out.connect(rs);
    rs.connect(reverbSend);
  }
  src.start(when);
  src.stop(when + dur + 0.05);
}

function kick(ctx: AudioContext, when: number, gain = 0.14, drop = 42) {
  if (!musicMaster) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(135, when);
  osc.frequency.exponentialRampToValueAtTime(drop, when + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
  osc.connect(g);
  g.connect(musicMaster);
  osc.start(when);
  osc.stop(when + 0.22);
}

/* ------------------------------ themes ------------------------------ */
// Each theme: { bpm, spb (steps per beat), bars, swing?, play(step, when, ctx) }.
// stepsPerBar = spb*4; loopSteps = stepsPerBar*bars. `play` runs once per step.

interface ThemeDef {
  bpm: number;
  spb: number;
  bars: number;
  swing?: number; // 0..1, delays odd 8th-steps for a laid-back groove
  play: (step: number, when: number, ctx: AudioContext) => void;
}

const barOf = (step: number, stepsPerBar: number, bars: number) => Math.floor(step / stepsPerBar) % bars;

const THEMES: Record<MusicTheme, ThemeDef> = {
  // ---- spacey ambient sci-fi: slow evolving pads + a sub drone + sparse bells ----
  generic: {
    // Nebula Drift — the standard. Warmed up from the old minor drone: a brighter loop
    // that leads on the MAJOR, a slightly livelier tempo, a softer pad swell (less
    // held-organ drag), and a gentle flowing lead melody. An 8-bar loop with an A/B
    // feel — the second half re-voices the progression and the melody climbs higher —
    // so it breathes longer before repeating.
    bpm: 72,
    spb: 2,
    bars: 8,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 8);
      const pos = step % spBar;
      // C – G – Am – F | Am – F – C – G : opens on the major I, the B-half lifts through
      // the vi and closes on a V turnaround — uplifting, never dragging into the minor.
      const C = [48, 55, 59, 64], G = [55, 59, 62, 67], Am = [57, 64, 67, 71], F = [53, 60, 64, 69];
      const chords = [C, G, Am, F, Am, F, C, G];
      const roots = [48, 43, 45, 41, 45, 41, 48, 43]; // C G A F A F C G
      if (pos === 0) {
        chord(ctx, chords[bar], { when, dur: 3.3, type: "triangle", gain: 0.019, attack: 0.65, release: 1.8, detune: 5, reverb: 0.52 });
        note(ctx, { freq: hz(roots[bar] - 12), when, dur: 3.4, type: "sine", gain: 0.032, attack: 0.5, release: 1.5, reverb: 0.26 });
      }
      // a gentle, uplifting lead line — one flowing phrase per bar. The B-half (4–7) is a
      // fresh contour that peaks a fourth higher, so the loop never feels like one bar x8.
      const melodies: [number, number][][] = [
        [[0, 72], [3, 76], [6, 79]], // C:  C5 E5 G5  (rise through the triad)
        [[0, 79], [3, 74], [6, 71]], // G:  G5 D5 B4  (settle)
        [[0, 72], [3, 76], [6, 81]], // Am: C5 E5 A5  (lift to the peak)
        [[0, 79], [4, 77]],          // F:  G5 F5     (breathe)
        [[0, 81], [3, 79], [6, 76]], // Am: A5 G5 E5  (B-half: step down from high)
        [[0, 77], [3, 81], [6, 84]], // F:  F5 A5 C6  (the lift — reaches C6)
        [[0, 83], [3, 79], [6, 76]], // C:  B5 G5 E5  (fall from the peak)
        [[0, 74], [4, 79]],          // G:  D5 G5     (turnaround back to C)
      ];
      // kept soft so it sits WITH the pads (ambient), not on top of them (foreground)
      for (const [p, n] of melodies[bar]) {
        if (pos === p) note(ctx, { freq: hz(n), when, dur: 0.8, type: "triangle", gain: 0.021, attack: 0.05, release: 0.9, reverb: 0.56, pan: 0.12 });
      }
      // the occasional high 'ting' on the offbeat — a light accent, panned opposite the lead
      if (pos === 5) {
        note(ctx, { freq: hz(chords[bar][3] + 12), when, dur: 0.5, type: "sine", gain: 0.018, attack: 0.01, release: 1.1, reverb: 0.6, pan: -0.35 });
      }
    },
  },

  // ---- Interstellar: an ADVENTUROUS deep-space voyage (the Sticker Book track) ----
  // Not a static drone: a lifting I–V–vi–IV cycle, a flowing 16th arpeggio that
  // carries you forward, a warm moving bass, a soaring lead call and a gentle
  // engine-pulse for momentum — awe with a sense of travel. 32-bar-feel loop.
  Interstellar: {
    bpm: 60,
    spb: 4, // 16ths
    bars: 8,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 8);
      const pos = step % spBar; // 0..15
      const idx = Math.floor(bar / 2) % 4; // each chord held two bars
      const chords = [
        [60, 64, 67, 71], // Cmaj7
        [59, 62, 67, 74], // G
        [57, 60, 64, 69], // Am
        [57, 60, 65, 69], // F
      ];
      const roots = [36, 31, 33, 29];
      const arp = [
        [60, 64, 67, 72, 76],
        [62, 67, 71, 74, 79],
        [57, 60, 64, 69, 72],
        [60, 65, 69, 72, 77],
      ][idx];
      // a wide pad swells in as each chord arrives
      if (bar % 2 === 0 && pos === 0) chord(ctx, chords[idx], { when, dur: 7.4, type: "triangle", gain: 0.024, attack: 1.6, release: 3, detune: 5, filter: 2600, reverb: 0.6 });
      // warm bass that MOVES — root on the downbeat, up to the fifth mid-bar
      if (pos === 0) note(ctx, { freq: hz(roots[idx]), when, dur: 1.7, type: "sine", gain: 0.055, attack: 0.08, release: 0.9, filter: 520, reverb: 0.15 });
      if (pos === 8) note(ctx, { freq: hz(roots[idx] + 7), when, dur: 1.3, type: "sine", gain: 0.038, attack: 0.06, release: 0.7, filter: 520, reverb: 0.15 });
      // flowing arpeggio — the forward motion of the journey, wandering across the field
      if (pos % 2 === 0) {
        const an = arp[(step >> 1) % arp.length] + (pos % 8 < 4 ? 0 : 12);
        note(ctx, { freq: hz(an), when, dur: 0.22, type: "triangle", gain: 0.02, attack: 0.004, release: 0.34, filter: 3200, filterTo: 1400, pan: Math.sin(step * 0.5) * 0.55, reverb: 0.4 });
      }
      // soaring lead call — a rising three-note motif in the second bar of each chord
      if (bar % 2 === 1 && (pos === 4 || pos === 8 || pos === 12)) {
        const motif = [arp[2] + 12, arp[3] + 12, arp[4] + 12];
        note(ctx, { freq: hz(motif[(pos - 4) / 4]), when, dur: 0.75, type: "sine", gain: 0.03, attack: 0.02, release: 1.4, reverb: 0.72, pan: 0.1 });
      }
      // gentle engine pulse — a soft low swell on beats 1 & 3 for momentum
      if (pos === 0 || pos === 8) noiseHit(ctx, { when, dur: 0.5, gain: 0.02, filter: 300, filterTo: 900, q: 0.7, type: "lowpass", reverb: 0.25 });
      // distant sparkle, high and wide
      if (pos === 6 || pos === 14) note(ctx, { freq: hz(arp[step % arp.length] + 24), when, dur: 0.3, type: "sine", gain: 0.015, attack: 0.005, release: 1.2, reverb: 0.75, pan: pos === 6 ? -0.5 : 0.5 });
    },
  },

  // ---- Machina Forge: rhythmic, industrial ----
  "Machina Forge": {
    bpm: 104,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const root = [38, 38, 41, 36][bar]; // D D F C
      // low industrial drone
      if (pos === 0) note(ctx, { freq: hz(root - 12), when, dur: 2.3, type: "sawtooth", gain: 0.03, attack: 0.05, release: 0.4, filter: 240, reverb: 0.12 });
      // driving saw bass pulse on every 8th
      note(ctx, { freq: hz(root), when, dur: 0.24, type: "sawtooth", gain: 0.045, attack: 0.005, release: 0.06, filter: 900, filterTo: 220, reverb: 0.06 });
      // metallic clank on the beats
      if (pos % 2 === 0) {
        noiseHit(ctx, { when, dur: 0.07, gain: pos === 0 ? 0.05 : 0.032, filter: pos === 0 ? 2600 : 3400, filterTo: 1200, q: 2.4, pan: pos === 4 ? 0.3 : -0.3, reverb: 0.16 });
        note(ctx, { freq: hz(root + 24 + (pos === 0 ? 0 : 3)), when, dur: 0.05, type: "square", gain: 0.02, attack: 0.002, release: 0.12, reverb: 0.2 });
      }
      // detuned minor stab every other bar
      if (pos === 4 && bar % 2 === 0) chord(ctx, [root, root + 3, root + 7], { when, dur: 0.35, type: "sawtooth", gain: 0.03, attack: 0.01, release: 0.2, detune: 10, filter: 1400, filterTo: 500, reverb: 0.1 });
    },
  },

  // ---- Shadow Sector: espionage, suspense, sparse ----
  "Shadow Sector": {
    bpm: 92,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const root = [40, 40, 43, 38][bar]; // E E G D — noir minor
      // tense sustained high cluster (minor 2nd), very soft
      if (pos === 0) chord(ctx, [76, 77], { when, dur: 3.3, type: "sine", gain: 0.016, attack: 1.2, release: 1.5, detune: 6, reverb: 0.5 });
      // noir bass: sparse, syncopated
      if (pos === 0 || pos === 5) note(ctx, { freq: hz(root - 12), when, dur: 0.6, type: "triangle", gain: 0.05, attack: 0.01, release: 0.5, filter: 500, reverb: 0.14 });
      // a muted 3-note tension phrase in the back half of odd bars
      if (bar % 2 === 1) {
        const phrase = [root + 12, root + 15, root + 14];
        if (pos >= 4 && pos <= 6) note(ctx, { freq: hz(phrase[pos - 4]), when, dur: 0.35, type: "triangle", gain: 0.03, attack: 0.01, release: 0.4, filter: 1600, pan: (pos - 5) * 0.35, reverb: 0.3 });
      }
      // soft rim tick
      if (pos === 6 && bar % 2 === 0) noiseHit(ctx, { when, dur: 0.05, gain: 0.02, filter: 5000, q: 1.5, type: "highpass", reverb: 0.2, pan: 0.3 });
    },
  },

  // ---- Corporate Spire: clean, serious synths ----
  "Corporate Spire": {
    bpm: 82,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const chords = [
        [58, 65, 68, 72],
        [56, 63, 68, 70],
        [58, 65, 70, 73],
        [53, 60, 63, 68],
      ]; // cool, polished minor voicings
      const root = [34, 32, 34, 29][bar];
      if (pos === 0) {
        chord(ctx, chords[bar], { when, dur: 2.9, type: "triangle", gain: 0.03, attack: 0.5, release: 1.2, detune: 4, filter: 3000, reverb: 0.35 });
        note(ctx, { freq: hz(root), when, dur: 2.9, type: "sine", gain: 0.045, attack: 0.1, release: 0.8, reverb: 0.1 });
      }
      // clean descending bell arp
      if (pos === 2 || pos === 4 || pos === 6) {
        const idx = { 2: 3, 4: 2, 6: 1 }[pos as 2 | 4 | 6];
        note(ctx, { freq: hz(chords[bar][idx] + 12), when, dur: 0.4, type: "sine", gain: 0.03, attack: 0.005, release: 0.7, reverb: 0.4, pan: (pos - 4) * 0.25 });
      }
      // soft precise tick
      if (pos === 0 || pos === 4) noiseHit(ctx, { when, dur: 0.04, gain: 0.014, filter: 7000, type: "highpass", reverb: 0.1 });
    },
  },

  // ---- Digital Nexus: techy, digital, electronic ----
  "Digital Nexus": {
    bpm: 122,
    spb: 4, // 16ths
    bars: 2,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 2);
      const pos = step % spBar;
      const scale = [57, 60, 64, 67, 72, 76]; // A minor pentatonic-ish, wide
      const root = bar === 0 ? 45 : 43;
      // pad underneath (once per bar)
      if (pos === 0) chord(ctx, [root + 12, root + 15, root + 19], { when, dur: 1.9, type: "triangle", gain: 0.02, attack: 0.2, release: 0.8, detune: 6, filter: 2200, reverb: 0.3 });
      // 16th arp, bright square with a filter blip, wandering pan
      const an = scale[(step * 3) % scale.length] + (pos % 8 < 4 ? 0 : 12);
      note(ctx, { freq: hz(an), when, dur: 0.11, type: "square", gain: 0.026, attack: 0.003, release: 0.09, filter: 2600, filterTo: 700, pan: Math.sin(step * 0.7) * 0.5, reverb: 0.18 });
      // bouncy bass on the beats
      if (pos % 4 === 0) note(ctx, { freq: hz(root), when, dur: 0.18, type: "sawtooth", gain: 0.045, attack: 0.004, release: 0.08, filter: 800, filterTo: 200, reverb: 0.05 });
      // blip perc on offbeats
      if (pos % 4 === 2) noiseHit(ctx, { when, dur: 0.05, gain: 0.02, filter: 6000, filterTo: 3000, q: 1.6, type: "bandpass", pan: -0.3, reverb: 0.1 });
    },
  },

  // ---- Fringe Market: street, subtle R&B ----
  "Fringe Market": {
    bpm: 86,
    spb: 2,
    bars: 4,
    swing: 0.32,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const chords = [
        [53, 60, 64, 69],
        [50, 57, 60, 65],
        [52, 59, 64, 69],
        [48, 55, 59, 64],
      ]; // warm 7/9 voicings
      const root = [41, 38, 40, 36][bar];
      // warm electric-piano chords on a syncopated pattern
      if (pos === 0 || pos === 3 || pos === 6) chord(ctx, chords[bar], { when, dur: pos === 0 ? 1.1 : 0.7, type: "triangle", gain: 0.032, attack: 0.02, release: 0.5, detune: 7, filter: 2400, reverb: 0.28 });
      // mellow bass, laid-back
      if (pos === 0 || pos === 6) note(ctx, { freq: hz(root - 12), when, dur: 0.7, type: "sine", gain: 0.055, attack: 0.02, release: 0.4, filter: 600, reverb: 0.1 });
      // soft swung hats
      if (pos % 1 === 0 && pos % 2 === 1) noiseHit(ctx, { when, dur: 0.045, gain: 0.014, filter: 8000, type: "highpass", reverb: 0.08, pan: 0.25 });
    },
  },

  // ---- Divinity Enclave: calm, spiritual, soothing ----
  "Divinity Enclave": {
    bpm: 60,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const chords = [
        [62, 66, 69, 73],
        [64, 68, 71, 76],
        [59, 66, 69, 74],
        [57, 64, 69, 73],
      ]; // airy, serene, lydian-tinted
      if (pos === 0) {
        chord(ctx, chords[bar], { when, dur: 3.8, type: "sine", gain: 0.03, attack: 1.4, release: 2.2, detune: 4, reverb: 0.6 });
        note(ctx, { freq: hz(chords[bar][0] - 24), when, dur: 3.9, type: "sine", gain: 0.03, attack: 1, release: 1.8, reverb: 0.3 });
      }
      // sparse chime tones, big reverb
      if (pos === 3 || pos === 5) {
        const n = chords[bar][(pos + bar) % chords[bar].length] + 12;
        note(ctx, { freq: hz(n), when, dur: 0.6, type: "sine", gain: 0.026, attack: 0.008, release: 1.8, reverb: 0.65, pan: pos === 3 ? -0.35 : 0.35 });
      }
    },
  },

  // ---- Military Bastion: harsh, rhythmic, powerful ----
  "Military Bastion": {
    bpm: 116,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const root = [40, 40, 38, 43][bar]; // E E D G — powerful minor
      // hard kick on the beats (1 & 3)
      if (pos === 0 || pos === 4) kick(ctx, when, 0.15, 40);
      // snare-ish noise backbeat (2 & 4)
      if (pos === 2 || pos === 6) noiseHit(ctx, { when, dur: 0.14, gain: 0.05, filter: 2000, filterTo: 900, q: 0.9, type: "bandpass", reverb: 0.16 });
      // marching hats on 8ths
      if (pos % 1 === 0) noiseHit(ctx, { when, dur: 0.03, gain: pos % 2 === 0 ? 0.014 : 0.02, filter: 9000, type: "highpass", reverb: 0.05 });
      // powerful low brass-like saw stab
      if (pos === 0 || pos === 6) chord(ctx, [root - 12, root - 5, root], { when, dur: pos === 0 ? 0.5 : 0.3, type: "sawtooth", gain: 0.04, attack: 0.008, release: 0.18, detune: 8, filter: 1300, filterTo: 500, reverb: 0.12 });
    },
  },

  /* ---- the SHOP wave: nine twists on the sci-fi songbook ---- */

  // ---- Candy Nova: bubblegum warp-pop — bouncy, sweet, a little silly ----
  "Candy Nova": {
    bpm: 104,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const roots = [48, 45, 41, 43]; // C A F G — pure pop
      const penta = [0, 2, 4, 7, 9];
      if (pos === 0 || pos === 4) kick(ctx, when, 0.11, 46);
      if (pos === 2 || pos === 6) noiseHit(ctx, { when, dur: 0.08, gain: 0.03, filter: 3200, filterTo: 1600, q: 1.1, reverb: 0.2 });
      if (pos % 2 === 1) noiseHit(ctx, { when, dur: 0.03, gain: 0.012, filter: 10000, type: "highpass", reverb: 0.08 });
      // bouncy bubble bass
      note(ctx, { freq: hz(roots[bar] - 12 + (pos % 4 === 2 ? 12 : 0)), when, dur: 0.16, type: "sine", gain: 0.06, attack: 0.005, release: 0.1, reverb: 0.05 });
      // sherbet plucks skipping up the pentatonic
      const m = roots[bar] + 24 + penta[(step * 3 + bar) % penta.length];
      if (pos === 1 || pos === 3 || pos === 6) {
        note(ctx, { freq: hz(m), when, dur: 0.12, type: "square", gain: 0.02, attack: 0.004, release: 0.16, filter: 2600, filterTo: 1200, reverb: 0.3, pan: pos === 3 ? 0.35 : -0.25 });
      }
      // a giggly octave pop at the bar turn
      if (pos === 7 && bar % 2 === 1) note(ctx, { freq: hz(roots[bar] + 36), when, dur: 0.1, type: "triangle", gain: 0.024, attack: 0.003, release: 0.3, reverb: 0.4, pan: 0.2 });
    },
  },

  // ---- Verdant Overgrowth: bioluminescent jungle — tribal toms + wooden plucks ----
  "Verdant Overgrowth": {
    bpm: 88,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const root = [45, 45, 43, 41][bar]; // A A G F — dorian drift
      // tom pattern: deep skins on 1, 3&, 4
      if (pos === 0) kick(ctx, when, 0.12, 52);
      if (pos === 5 || pos === 7) kick(ctx, when, 0.07, 62);
      // shaker canopy
      if (pos % 2 === 1) noiseHit(ctx, { when, dur: 0.05, gain: 0.016, filter: 6500, q: 0.7, reverb: 0.18, pan: pos === 3 ? 0.3 : -0.3 });
      // woody marimba phrase (dorian)
      const dor = [0, 2, 3, 5, 7, 9];
      if (pos === 0 || pos === 2 || pos === 4 || pos === 6) {
        const m = root + 12 + dor[(step + bar * 2) % dor.length];
        note(ctx, { freq: hz(m), when, dur: 0.14, type: "triangle", gain: 0.032, attack: 0.004, release: 0.22, filter: 1800, reverb: 0.3, pan: (pos / 7) * 0.5 - 0.25 });
      }
      // the swamp breathes: a low pad every two bars
      if (pos === 0 && bar % 2 === 0) chord(ctx, [root - 12, root - 5, root + 3], { when, dur: 3.2, type: "sine", gain: 0.02, attack: 1.1, release: 1.4, reverb: 0.45 });
    },
  },

  // ---- Crimson Requiem: the gothic organ rite — slow, vaulted, solemn ----
  "Crimson Requiem": {
    bpm: 56,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const chords = [
        [45, 52, 57, 60], // Am
        [41, 48, 53, 57], // F
        [43, 50, 55, 59], // G
        [40, 47, 52, 56], // E — the picardy pull
      ];
      // the organ: two slow saw ranks an octave apart, heavily filtered
      if (pos === 0) {
        chord(ctx, chords[bar], { when, dur: 3.6, type: "sawtooth", gain: 0.016, attack: 0.5, release: 1.2, detune: 4, filter: 900, reverb: 0.55 });
        chord(ctx, chords[bar].map((n) => n - 12), { when, dur: 3.6, type: "sawtooth", gain: 0.014, attack: 0.7, release: 1.4, detune: 3, filter: 500, reverb: 0.5 });
      }
      // the bell tolls on the half-bar of every other bar
      if (pos === 4 && bar % 2 === 0) note(ctx, { freq: hz(69), when, dur: 1.6, type: "sine", gain: 0.03, attack: 0.005, release: 2.4, reverb: 0.7, pan: 0.15 });
      // a low breath of the void
      if (pos === 6) noiseHit(ctx, { when, dur: 0.9, gain: 0.008, filter: 300, q: 0.5, type: "lowpass", reverb: 0.5 });
    },
  },

  // ---- Velvet Lounge: zero-g cocktail hour — swung brushes + seventh chords ----
  "Velvet Lounge": {
    bpm: 76,
    spb: 2,
    bars: 4,
    swing: 0.34,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const sevenths = [
        [48, 55, 59, 64], // Cmaj7
        [45, 52, 57, 60], // Am7-ish
        [50, 57, 60, 65], // Dm7
        [43, 53, 59, 62], // G7
      ];
      const walk = [36, 43, 45, 47, 38, 45, 43, 41];
      // brushed ride on the 8ths, laid back by the swing
      noiseHit(ctx, { when, dur: 0.06, gain: pos % 2 === 0 ? 0.018 : 0.011, filter: 8000, type: "highpass", reverb: 0.22, pan: 0.25 });
      // upright-ish walking bass on the beats
      if (pos % 2 === 0) note(ctx, { freq: hz(walk[(bar * 4 + pos / 2) % walk.length]), when, dur: 0.4, type: "sine", gain: 0.055, attack: 0.008, release: 0.22, reverb: 0.08 });
      // the comp: a lazy seventh on the and-of-2
      if (pos === 3) chord(ctx, sevenths[bar], { when, dur: 0.7, type: "triangle", gain: 0.022, attack: 0.02, release: 0.5, reverb: 0.4, pan: -0.15 });
      // a smoky little bell line at the turnaround
      if (pos === 6 && bar === 3) note(ctx, { freq: hz(72), when, dur: 0.5, type: "sine", gain: 0.02, attack: 0.01, release: 0.9, reverb: 0.55, pan: 0.35 });
    },
  },

  // ---- Isla Neon: the orbital beach club — four-on-floor sunset house ----
  "Isla Neon": {
    bpm: 118,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const roots = [45, 41, 48, 43]; // A F C G — sunset major-lean
      // four on the floor + open hat on the offbeats
      if (pos % 2 === 0) kick(ctx, when, 0.12, 44);
      if (pos % 2 === 1) noiseHit(ctx, { when, dur: 0.12, gain: 0.02, filter: 9000, type: "highpass", reverb: 0.14, pan: 0.1 });
      // rolling bass: root on the beat, fifth off it
      note(ctx, { freq: hz(roots[bar] - 12 + (pos % 2 === 1 ? 7 : 0)), when, dur: 0.15, type: "sawtooth", gain: 0.035, attack: 0.005, release: 0.08, filter: 500, reverb: 0.04 });
      // breathing pad (the side-chain feel: swells between kicks)
      if (pos === 1 && bar % 2 === 0) chord(ctx, [roots[bar] + 12, roots[bar] + 16, roots[bar] + 19], { when, dur: 1.6, type: "sawtooth", gain: 0.014, attack: 0.4, release: 0.7, detune: 7, filter: 1400, reverb: 0.4 });
      // plucky house stab on the and-of-3
      if (pos === 5) chord(ctx, [roots[bar] + 24, roots[bar] + 28, roots[bar] + 31], { when, dur: 0.09, type: "square", gain: 0.014, attack: 0.003, release: 0.12, filter: 2400, filterTo: 900, reverb: 0.3, pan: -0.2 });
    },
  },

  // ---- Frost Palace: the glacial court — glassy bells in a huge cold hall ----
  "Frost Palace": {
    bpm: 70,
    spb: 2,
    bars: 8,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 8);
      const pos = step % spBar;
      const lyd = [0, 2, 4, 6, 7, 11]; // lydian sparkle
      const root = [48, 48, 50, 50, 45, 45, 47, 47][bar];
      // deep ice: a sub swell each bar
      if (pos === 0) note(ctx, { freq: hz(root - 24), when, dur: 3.0, type: "sine", gain: 0.04, attack: 0.9, release: 1.4, reverb: 0.25 });
      // glass bells, sparse and very wet
      if (pos === 0 || pos === 3 || pos === 5) {
        const m = root + 24 + lyd[(step * 2 + bar) % lyd.length];
        note(ctx, { freq: hz(m), when, dur: 0.5, type: "sine", gain: 0.024, attack: 0.006, release: 1.8, reverb: 0.7, pan: ((step % 5) - 2) * 0.2 });
      }
      // a crystalline shiver at the phrase turn
      if (pos === 7 && bar % 4 === 3) noiseHit(ctx, { when, dur: 0.5, gain: 0.008, filter: 9500, type: "highpass", reverb: 0.6 });
    },
  },

  // ---- Retro Arcade: cabinet classic — pure chiptune, catchy and cheeky ----
  "Retro Arcade": {
    bpm: 132,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const roots = [45, 43, 41, 40]; // A G F E — the classic descent
      // square bass pumping straight 8ths
      note(ctx, { freq: hz(roots[bar] - 12), when, dur: 0.1, type: "square", gain: 0.026, attack: 0.003, release: 0.05, filter: 900, reverb: 0.02 });
      // the lead: an insistent little earworm, one note per 8th
      const lick = [12, 16, 19, 24, 19, 16, 14, 12];
      note(ctx, { freq: hz(roots[bar] + 12 + lick[pos]), when, dur: 0.11, type: "square", gain: 0.017, attack: 0.002, release: 0.06, filter: 3200, reverb: 0.12, pan: 0.15 });
      // noise percussion: kick-ish thud + snare hiss
      if (pos === 0 || pos === 4) kick(ctx, when, 0.08, 60);
      if (pos === 2 || pos === 6) noiseHit(ctx, { when, dur: 0.05, gain: 0.022, filter: 4200, q: 0.6, reverb: 0.08 });
    },
  },

  // ---- Solar Flare: the corona anthem — bright, driving, heroic ----
  "Solar Flare": {
    bpm: 96,
    spb: 2,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 8;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const roots = [43, 41, 48, 43]; // G F C G — mixolydian blaze
      if (pos === 0 || pos === 3 || pos === 4) kick(ctx, when, 0.11, 48);
      if (pos === 2 || pos === 6) noiseHit(ctx, { when, dur: 0.1, gain: 0.032, filter: 2600, filterTo: 1200, q: 0.9, reverb: 0.2 });
      // blazing brass: stacked saws on the bar
      if (pos === 0) chord(ctx, [roots[bar], roots[bar] + 7, roots[bar] + 12, roots[bar] + 16], { when, dur: 1.1, type: "sawtooth", gain: 0.02, attack: 0.03, release: 0.5, detune: 9, filter: 2200, filterTo: 1000, reverb: 0.3 });
      // the rising call: root → fifth → octave across the bar
      const call = [0, 7, 12];
      if (pos === 2 || pos === 5 || pos === 7) {
        note(ctx, { freq: hz(roots[bar] + 24 + call[[2, 5, 7].indexOf(pos)]), when, dur: 0.3, type: "sawtooth", gain: 0.016, attack: 0.01, release: 0.3, detune: 6, filter: 2800, reverb: 0.35, pan: 0.2 });
      }
      // solar wind underneath
      if (pos === 0 && bar % 2 === 1) noiseHit(ctx, { when, dur: 1.6, gain: 0.006, filter: 700, q: 0.4, type: "lowpass", reverb: 0.4 });
    },
  },

  // ---- Void Rose: a dark waltz — music-box melody over a 6/8 sway ----
  "Void Rose": {
    bpm: 84,
    spb: 3, // 12 steps/bar → the 6/8 lilt
    bars: 4,
    play(step, when, ctx) {
      const spBar = 12;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const chords = [
        [45, 52, 57], // Am
        [41, 48, 53], // F
        [43, 50, 55], // G
        [44, 52, 56], // E/G# — the dark cadence
      ];
      // the sway: bass on 1, chord taps on 2 and 3 of each half-bar
      if (pos === 0 || pos === 6) note(ctx, { freq: hz(chords[bar][0] - 12), when, dur: 0.5, type: "sine", gain: 0.05, attack: 0.01, release: 0.3, reverb: 0.15 });
      if (pos === 2 || pos === 4 || pos === 8 || pos === 10) {
        chord(ctx, chords[bar].map((n) => n + 12), { when, dur: 0.16, type: "triangle", gain: 0.013, attack: 0.008, release: 0.24, reverb: 0.4, pan: pos % 4 === 0 ? 0.2 : -0.2 });
      }
      // the music box: a wistful minor line drifting above
      const line = [0, 3, 7, 12, 7, 3];
      if (pos % 2 === 0 && (bar + pos / 2) % 3 !== 2) {
        note(ctx, { freq: hz(chords[bar][0] + 24 + line[(pos / 2 + bar) % line.length]), when, dur: 0.3, type: "sine", gain: 0.02, attack: 0.004, release: 1.2, reverb: 0.6, pan: 0.1 });
      }
      // a petal falls: a faint high shimmer at the phrase end
      if (pos === 11 && bar === 3) note(ctx, { freq: hz(88), when, dur: 0.4, type: "sine", gain: 0.012, attack: 0.01, release: 1.6, reverb: 0.75, pan: -0.3 });
    },
  },

  // ---- Prism Vault: crystalline glass — a bright cascading bell melody over
  // shifting glassy pads, a soft pulse and wide sparkle. Lydian brightness. ----
  "Prism Vault": {
    bpm: 96,
    spb: 4, // 16ths
    bars: 4,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      // Cmaj9 → Amaj(add) → Fmaj7#11 → Gsus — luminous, floating
      const chords = [
        [60, 64, 67, 74],
        [57, 61, 64, 71],
        [53, 57, 60, 67],
        [55, 62, 67, 69],
      ];
      const roots = [36, 33, 29, 31];
      if (pos === 0) {
        chord(ctx, chords[bar], { when, dur: 4.2, type: "triangle", gain: 0.02, attack: 1.1, release: 2, detune: 4, filter: 3200, reverb: 0.6 });
        note(ctx, { freq: hz(roots[bar]), when, dur: 2, type: "sine", gain: 0.045, attack: 0.1, release: 1, filter: 500, reverb: 0.15 });
      }
      // the cascade — a glassy bell arpeggio tumbling down the chord, wandering pan
      const casc = [24, 19, 16, 12, 16, 19];
      if (pos % 2 === 0) {
        const n = chords[bar][0] + casc[(step >> 1) % casc.length];
        note(ctx, { freq: hz(n), when, dur: 0.24, type: "sine", gain: 0.024, attack: 0.004, release: 0.9, filter: 5200, reverb: 0.55, pan: Math.sin(step * 0.7) * 0.5 });
      }
      // a rising three-note prism motif in the second half of each bar
      if (pos === 8 || pos === 11 || pos === 14) {
        const motif = { 8: 0, 11: 4, 14: 7 }[pos as 8 | 11 | 14];
        note(ctx, { freq: hz(chords[bar][1] + 12 + motif), when, dur: 0.5, type: "triangle", gain: 0.02, attack: 0.01, release: 0.8, reverb: 0.5, pan: 0.15 });
      }
      // soft glass pulse on the beat
      if (pos % 4 === 0) noiseHit(ctx, { when, dur: 0.05, gain: 0.012, filter: 8000, type: "highpass", reverb: 0.2 });
      // a high wide shimmer at the loop turn
      if (bar === 3 && pos === 12) note(ctx, { freq: hz(88), when, dur: 0.4, type: "sine", gain: 0.014, attack: 0.006, release: 1.6, reverb: 0.75, pan: -0.4 });
    },
  },

  // ---- Storm Front: cinematic tension — a bold minor melody, timpani-ish pulse,
  // electric stabs and a swell that breaks on the downbeat. ----
  "Storm Front": {
    bpm: 76,
    spb: 4,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      // Dm → Bb → F → C — a driving, cinematic cycle
      const roots = [38, 34, 41, 36];
      const root = roots[bar];
      const chords = [
        [50, 53, 57],
        [46, 50, 53],
        [53, 57, 60],
        [48, 52, 55],
      ];
      // low storm drone + a swelling pad each bar
      if (pos === 0) {
        note(ctx, { freq: hz(root - 12), when, dur: 3.6, type: "sawtooth", gain: 0.03, attack: 0.06, release: 0.6, filter: 260, reverb: 0.2 });
        chord(ctx, chords[bar], { when, dur: 3.4, type: "triangle", gain: 0.022, attack: 0.9, release: 1.6, detune: 7, filter: 1800, reverb: 0.5 });
      }
      // timpani-ish pulse on 1 and 3
      if (pos === 0 || pos === 8) kick(ctx, when, pos === 0 ? 0.12 : 0.08, 50);
      // the melody — a bold, questioning minor line up top
      const mel = [12, 15, 14, 12, 10, 12, 17, 15];
      if (pos % 2 === 0) {
        const n = root + mel[(step >> 1) % mel.length];
        note(ctx, { freq: hz(n), when, dur: 0.4, type: "triangle", gain: 0.026, attack: 0.01, release: 0.4, filter: 2400, filterTo: 1200, reverb: 0.35, pan: Math.sin(step * 0.4) * 0.4 });
      }
      // electric stab — a bright detuned chord on the offbeat of odd bars
      if (bar % 2 === 1 && pos === 6) chord(ctx, chords[bar].map((n) => n + 12), { when, dur: 0.3, type: "sawtooth", gain: 0.022, attack: 0.008, release: 0.3, detune: 12, filter: 3000, filterTo: 900, reverb: 0.3 });
      // rolling hats build into the turnover
      if (bar === 3 && pos >= 8 && pos % 2 === 0) noiseHit(ctx, { when, dur: 0.04, gain: 0.02 + (pos - 8) * 0.003, filter: 6500, type: "highpass", reverb: 0.1 });
      // a low riser sweeping up at the loop turn (the coming thunder)
      if (bar === 3 && pos === 12) noiseHit(ctx, { when, dur: 0.7, gain: 0.03, filter: 400, filterTo: 5000, q: 1.1, type: "bandpass", reverb: 0.25 });
    },
  },

  // ---- Dune Mirage: desert exotic — a sinuous phrygian-dominant lead over a
  // hand-drum groove and a droning tanpura-like fifth. ----
  "Dune Mirage": {
    bpm: 92,
    spb: 4,
    bars: 4,
    swing: 0,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      const root = 45; // A — a fixed drone home for the mode
      // the drone: root + fifth, always humming underneath
      if (pos === 0 && bar === 0) note(ctx, { freq: hz(root - 12), when, dur: 15, type: "sawtooth", gain: 0.02, attack: 1.5, release: 2, filter: 360, reverb: 0.3 });
      if (pos === 0) note(ctx, { freq: hz(root - 5), when, dur: 3.6, type: "triangle", gain: 0.018, attack: 0.5, release: 1.2, filter: 900, reverb: 0.35 });
      // hand-drum groove — dumbek pattern (dum on 1, tek accents)
      if (pos === 0 || pos === 6 || pos === 10) kick(ctx, when, pos === 0 ? 0.1 : 0.06, 60);
      if (pos === 4 || pos === 12 || pos === 14) noiseHit(ctx, { when, dur: 0.06, gain: 0.026, filter: 3200, filterTo: 1400, q: 2.2, pan: pos === 4 ? -0.25 : 0.25, reverb: 0.16 });
      // the lead — phrygian dominant (1 b2 3 4 5 b6 b7), snaking and ornamented
      const scale = [0, 1, 4, 5, 7, 8, 10, 12];
      const phrase = [0, 1, 4, 5, 4, 1, 0, 7, 5, 4, 5, 1, 0, 4, 1, 0];
      if (pos % 2 === 0 || pos === 7 || pos === 13) {
        const deg = phrase[step % phrase.length];
        const n = root + 12 + (scale.includes(deg) ? deg : 0);
        note(ctx, { freq: hz(n), when, dur: 0.26, type: "sine", gain: 0.026, attack: 0.008, release: 0.5, filter: 2600, reverb: 0.4, pan: 0.1 });
      }
      // a grace-note ornament (quick slide) at phrase ends
      if (pos === 15) note(ctx, { freq: hz(root + 13), when, dur: 0.12, type: "sine", gain: 0.02, attack: 0.004, release: 0.3, filter: 3000, reverb: 0.45, pan: -0.2 });
    },
  },

  // ---- Regalia: a stately baroque waltz — an ornamented harpsichord-ish melody
  // over gilded chords, in 3/4. ----
  "Regalia": {
    bpm: 138,
    spb: 3, // 9? no — 3 steps per beat, ×4 = 12 steps/bar for a 3/4 lilt
    bars: 4,
    play(step, when, ctx) {
      const spBar = 12;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      // I – V – vi – IV in a regal D major, but voiced dark/rich
      const chords = [
        [50, 57, 62, 66], // D
        [45, 57, 61, 64], // A/E
        [47, 59, 62, 66], // Bm
        [43, 55, 59, 62], // G
      ];
      const bass = [38, 33, 35, 31];
      // waltz bass on 1, plush chord on 2 and 3
      if (pos === 0) note(ctx, { freq: hz(bass[bar]), when, dur: 0.6, type: "triangle", gain: 0.05, attack: 0.01, release: 0.4, filter: 700, reverb: 0.2 });
      if (pos === 4 || pos === 8) chord(ctx, chords[bar], { when, dur: 0.34, type: "triangle", gain: 0.02, attack: 0.01, release: 0.4, detune: 5, filter: 2600, reverb: 0.4, pan: pos === 4 ? -0.12 : 0.12 });
      // the harpsichord melody — a bright ornamented line with trills
      const mel = [74, 76, 74, 72, 74, 78, 76, 74, 72, 71, 72, 74];
      if (pos % 2 === 0) {
        note(ctx, { freq: hz(mel[(step) % mel.length]), when, dur: 0.2, type: "square", gain: 0.016, attack: 0.003, release: 0.22, filter: 3400, filterTo: 2000, reverb: 0.35, pan: 0.12 });
      }
      // a quick mordent (trill) decorating the phrase turn
      if (bar % 2 === 1 && (pos === 9 || pos === 10)) {
        note(ctx, { freq: hz(pos === 9 ? 79 : 78), when, dur: 0.1, type: "square", gain: 0.014, attack: 0.002, release: 0.16, filter: 3600, reverb: 0.3, pan: 0.2 });
      }
      // gilt shimmer at the top of the loop
      if (bar === 0 && pos === 0) note(ctx, { freq: hz(86), when, dur: 0.4, type: "sine", gain: 0.014, attack: 0.01, release: 1.4, reverb: 0.7, pan: -0.3 });
    },
  },

  // ---- Skyward: uplifting and airy — a soaring major melody over open,
  // hopeful chords with a gentle forward pulse. ----
  "Skyward": {
    bpm: 84,
    spb: 4,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      // I – V – vi – IV in bright G major — the classic 'lift'
      const chords = [
        [55, 62, 67, 71], // G
        [50, 62, 66, 69], // D
        [52, 59, 64, 67], // Em
        [48, 60, 64, 67], // C
      ];
      const roots = [31, 38, 40, 36];
      if (pos === 0) {
        chord(ctx, chords[bar], { when, dur: 4, type: "triangle", gain: 0.024, attack: 0.8, release: 1.8, detune: 4, filter: 3000, reverb: 0.55 });
        note(ctx, { freq: hz(roots[bar]), when, dur: 3.6, type: "sine", gain: 0.05, attack: 0.1, release: 1, filter: 520, reverb: 0.15 });
      }
      // gentle forward pulse — a soft plucked eighth on the offbeats
      if (pos % 4 === 2) note(ctx, { freq: hz(roots[bar] + 12), when, dur: 0.2, type: "triangle", gain: 0.022, attack: 0.006, release: 0.3, filter: 1800, reverb: 0.2 });
      // the soaring melody — a hopeful rising line, held notes that open up
      const mel = [67, 69, 71, 74, 71, 69, 67, 69, 71, 74, 76, 74, 71, 69, 67, 71];
      if (pos % 2 === 0) {
        note(ctx, { freq: hz(mel[(step >> 1) % 8 + (bar % 2) * 8]), when, dur: 0.5, type: "sine", gain: 0.028, attack: 0.02, release: 0.9, filter: 3200, reverb: 0.5, pan: Math.sin(step * 0.3) * 0.35 });
      }
      // a warm counter-sparkle high and wide
      if (pos === 6 || pos === 14) note(ctx, { freq: hz(chords[bar][3] + 12), when, dur: 0.3, type: "sine", gain: 0.016, attack: 0.006, release: 1.1, reverb: 0.7, pan: pos === 6 ? -0.5 : 0.5 });
      // soft airy pulse
      if (pos % 4 === 0) noiseHit(ctx, { when, dur: 0.4, gain: 0.014, filter: 320, filterTo: 800, q: 0.7, type: "lowpass", reverb: 0.25 });
    },
  },

  // ---- Obsidian Mirror: sleek minimal house — a cool glassy pluck riff over a
  // deep four-on-floor and a filtered chrome pad. ----
  "Obsidian Mirror": {
    bpm: 122,
    spb: 4,
    bars: 4,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      // cool minor deep-house changes: Cm – Ab – Eb – Bb
      const roots = [36, 32, 39, 34];
      const root = roots[bar];
      const chords = [
        [51, 55, 58],
        [56, 60, 63],
        [51, 55, 58],
        [53, 57, 60],
      ];
      // deep four-on-floor + offbeat open hat
      if (pos % 4 === 0) kick(ctx, when, 0.12, 44);
      if (pos % 4 === 2) noiseHit(ctx, { when, dur: 0.06, gain: 0.02, filter: 7500, type: "highpass", reverb: 0.1 });
      // sub bass — root on the beat, tight
      if (pos % 4 === 0) note(ctx, { freq: hz(root - 12), when, dur: 0.22, type: "sine", gain: 0.055, attack: 0.006, release: 0.1, filter: 600, reverb: 0.06 });
      // the chrome pad — a filtered chord swelling each bar
      if (pos === 0) chord(ctx, chords[bar], { when, dur: 2, type: "sawtooth", gain: 0.014, attack: 0.5, release: 0.9, detune: 8, filter: 1400, filterTo: 700, reverb: 0.4 });
      // the glassy pluck riff — a cool syncopated 16th melody
      const riff = [0, 7, 10, 7, 12, 10, 7, 3, 0, 7, 10, 15, 12, 10, 7, 5];
      if (pos % 2 === 0 || pos === 7 || pos === 11) {
        const n = root + 12 + riff[step % riff.length];
        note(ctx, { freq: hz(n), when, dur: 0.14, type: "triangle", gain: 0.02, attack: 0.004, release: 0.18, filter: 3000, filterTo: 1600, reverb: 0.3, pan: pos % 4 < 2 ? -0.2 : 0.2 });
      }
      // a filtered noise sweep breathing across two bars
      if (pos === 0 && bar % 2 === 0) noiseHit(ctx, { when, dur: 1.4, gain: 0.008, filter: 800, filterTo: 4000, q: 0.6, type: "bandpass", reverb: 0.3 });
    },
  },

  "Glint Rush": {
    // ---- GLINT RUSH: the final-round anthem — driving sci-fi with an arcade
    // heart. Relentless four-on-floor, an octave-pumping square bass, a rising
    // 16th arcade arp that lifts every bar, offbeat hats, and a klaxon-ish
    // two-note alarm call once a cycle. Same tune on every theme: when you hear
    // it, you KNOW. ----
    bpm: 150,
    spb: 4, // 16ths
    bars: 4,
    play(step, when, ctx) {
      const spBar = 16;
      const bar = barOf(step, spBar, 4);
      const pos = step % spBar;
      // Am → Am → F → G drive
      const roots = [45, 45, 41, 43];
      const root = roots[bar];

      // pumping square bass on every 8th, octave up on the offs
      if (pos % 2 === 0) {
        const up = pos % 4 === 2;
        note(ctx, { freq: hz(root - 12 + (up ? 12 : 0)), when, dur: 0.11, type: "square", gain: 0.05, attack: 0.004, release: 0.05, filter: 1100, reverb: 0.06 });
      }
      // four-on-floor kick; tight offbeat hats
      if (pos % 4 === 0) kick(ctx, when, 0.12, 46);
      if (pos % 4 === 2) noiseHit(ctx, { when, dur: 0.045, gain: 0.028, filter: 7000, q: 1.2, type: "highpass", reverb: 0.08 });
      // snare-ish crack on the 2 and 4
      if (pos === 4 || pos === 12) noiseHit(ctx, { when, dur: 0.09, gain: 0.035, filter: 2200, filterTo: 900, q: 1.6, reverb: 0.14 });

      // the arcade arp: rising 16ths through the bar, a tone brighter each bar
      const arp = [0, 3, 7, 12, 15, 12, 7, 3];
      const lift = bar === 3 ? 2 : 0;
      note(ctx, {
        freq: hz(69 + lift + arp[step % arp.length]),
        when,
        dur: 0.09,
        type: "square",
        gain: 0.024,
        attack: 0.004,
        release: 0.07,
        pan: pos % 4 < 2 ? -0.25 : 0.25,
        reverb: 0.18,
      });
      // klaxon call — a two-note alarm at the top of the cycle (arcade urgency)
      if (bar === 0 && (pos === 0 || pos === 2)) {
        note(ctx, { freq: hz(pos === 0 ? 81 : 79), when, dur: 0.16, type: "sawtooth", gain: 0.03, attack: 0.01, release: 0.12, filter: 2600, filterTo: 1200, reverb: 0.2 });
      }
      // a low riser into the loop turnover
      if (bar === 3 && pos === 8) {
        noiseHit(ctx, { when, dur: 0.5, gain: 0.03, filter: 500, filterTo: 5200, q: 1.1, type: "bandpass", reverb: 0.2 });
      }
    },
  },
};

/* ----------------------------- scheduler ----------------------------- */

function scheduleStep(theme: ThemeDef, s: number, when: number, ctx: AudioContext) {
  // swing: nudge the odd 8th-note steps later for a laid-back groove
  let t = when;
  if (theme.swing && theme.spb === 2 && s % 2 === 1) {
    t += (60 / theme.bpm / theme.spb) * theme.swing;
  }
  try {
    theme.play(s, t, ctx);
  } catch {
    /* a bad note must never crash the loop */
  }
}

function tick() {
  const ctx = peekAudioContext();
  if (!ctx || ctx.state !== "running") return; // idle until audio is unlocked
  if (!musicMaster) setup(ctx);

  // handle a queued crossfade swap
  if (swapTo && ctx.currentTime >= swapAt) {
    activeTheme = swapTo;
    swapTo = null;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.06;
    musicMaster!.gain.cancelScheduledValues(ctx.currentTime);
    musicMaster!.gain.setValueAtTime(Math.max(0.0001, musicMaster!.gain.value), ctx.currentTime);
    musicMaster!.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 0.9);
  }

  if (!activeTheme) return;
  const theme = THEMES[activeTheme];
  const loopSteps = theme.spb * 4 * theme.bars;
  const secPerStep = 60 / theme.bpm / theme.spb;

  if (nextNoteTime === 0) {
    nextNoteTime = ctx.currentTime + 0.1;
    // first time audio goes live for this theme — ramp the track in
    musicMaster!.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicMaster!.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 1.4);
  }
  // if we've fallen far behind (tab was backgrounded), resync without a burst
  if (nextNoteTime < ctx.currentTime - 0.5) nextNoteTime = ctx.currentTime + 0.05;

  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(theme, step, nextNoteTime, ctx);
    nextNoteTime += secPerStep;
    step = (step + 1) % loopSteps;
  }
}

/* ------------------------------- public ------------------------------- */

/** Play (or crossfade to) a theme's ambient track. Safe to call before the first
 *  user gesture — it stays silent until audio is unlocked, then fades in. */
export function playMusic(theme: MusicTheme) {
  if (!timer) timer = setInterval(tick, TICK_MS);
  if (activeTheme === theme && !swapTo) return;
  if (!activeTheme) {
    // nothing playing yet — set it directly (fades in on first live tick / here)
    activeTheme = theme;
    step = 0;
    nextNoteTime = 0;
    const ctx = peekAudioContext();
    if (ctx && ctx.state === "running" && musicMaster) {
      musicMaster.gain.cancelScheduledValues(ctx.currentTime);
      musicMaster.gain.setValueAtTime(Math.max(0.0001, musicMaster.gain.value), ctx.currentTime);
      musicMaster.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 1.2);
    }
    return;
  }
  if (theme === activeTheme) {
    swapTo = null;
    return;
  }
  // crossfade: fade the current track out, then swap in the new one (handled in tick)
  const ctx = peekAudioContext();
  swapTo = theme;
  if (ctx && ctx.state === "running" && musicMaster) {
    swapAt = ctx.currentTime + 0.7;
    musicMaster.gain.cancelScheduledValues(ctx.currentTime);
    musicMaster.gain.setValueAtTime(Math.max(0.0001, musicMaster.gain.value), ctx.currentTime);
    musicMaster.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.68);
  } else {
    swapAt = 0; // no live ctx yet — the swap applies on the next live tick
  }
}

/** Music master level, 0..1 (Settings → Audio). */
export function setMusicVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  const ctx = peekAudioContext();
  if (ctx && musicMaster) {
    musicMaster.gain.cancelScheduledValues(ctx.currentTime);
    musicMaster.gain.setValueAtTime(Math.max(0.0001, musicMaster.gain.value), ctx.currentTime);
    musicMaster.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 0.3);
  }
}

/** Hard-mute the track without touching the Settings volume (the Sticker Book's
 *  subtle bottom toggle). Restores to the current volume when unmuted. */
export function setMusicMuted(m: boolean) {
  muted = m;
  const ctx = peekAudioContext();
  if (ctx && musicMaster) {
    musicMaster.gain.cancelScheduledValues(ctx.currentTime);
    musicMaster.gain.setValueAtTime(Math.max(0.0001, musicMaster.gain.value), ctx.currentTime);
    musicMaster.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 0.3);
  }
}

/** The theme currently playing (or queued to play) — so a preview can restore it. */
export function currentMusic(): MusicTheme | null {
  return swapTo ?? activeTheme;
}

/** Fully stop the track (fade to silence). Used by the shop preview to fall back
 *  to silence when nothing was playing before the preview began. */
export function stopMusic() {
  swapTo = null;
  const ctx = peekAudioContext();
  if (ctx && ctx.state === "running" && musicMaster) {
    musicMaster.gain.cancelScheduledValues(ctx.currentTime);
    musicMaster.gain.setValueAtTime(Math.max(0.0001, musicMaster.gain.value), ctx.currentTime);
    musicMaster.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  }
  activeTheme = null;
  step = 0;
  nextNoteTime = 0;
}

/** Every theme name, in declared order — the source for Collection / Settings pickers. */

// every theme EXCEPT the internal rush anthem — nothing should be able to
// equip or validate-to "Glint Rush"
export const MUSIC_THEMES = Object.keys(THEMES).filter((t) => t !== "Glint Rush") as MusicTheme[];

export const music = { play: playMusic, setVolume: setMusicVolume, setMuted: setMusicMuted, stop: stopMusic, current: currentMusic };
