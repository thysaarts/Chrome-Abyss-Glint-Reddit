/**
 * SFX — Chrome Abyss: Glint
 * =========================
 * All sound effects are SYNTHESISED at runtime with the Web Audio API — no audio
 * files, no licensing, works offline. The palette is sci-fi / electronic with a
 * retro-chiptune streak (square/triangle/saw voices, filtered-noise textures).
 *
 * Browsers block audio until a user gesture, so nothing sounds before the first
 * click (the START button). Every call is a no-op until then, and safe to call
 * anywhere (guards on a missing/created context; respects the mute flag).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.9; // 0..1 master level — driven by the Settings audio slider

/** The shared AudioContext, CREATING it if needed (call from a user gesture). */
export function getAudioContext(): AudioContext | null {
  return getCtx();
}
/** The shared AudioContext if it already exists — never creates one (so the
 *  music scheduler can idle silently until the first gesture unlocks audio,
 *  avoiding a pre-gesture autoplay warning). */
export function peekAudioContext(): AudioContext | null {
  return ctx;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const g = ctx.createGain();
      g.gain.value = volume;
      const comp = ctx.createDynamicsCompressor(); // tame peaks when sounds stack
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      g.connect(comp);
      comp.connect(ctx.destination);
      master = g;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// major pentatonic — pleasant ascending arpeggios for the sequential glows
const PENT = [0, 2, 4, 7, 9];
const pentFreq = (i: number, baseMidi = 72) => {
  const octave = Math.floor(i / PENT.length);
  return midi(baseMidi + PENT[i % PENT.length] + octave * 12);
};

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  attack?: number;
  slideTo?: number;
  delay?: number;
}
function tone(o: ToneOpts) {
  const c = getCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const dur = o.dur ?? 0.12;
  const osc = c.createOscillator();
  osc.type = o.type ?? "square";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

interface NoiseOpts {
  dur?: number;
  gain?: number;
  delay?: number;
  filter?: number;
  filterSlide?: number;
  q?: number;
  type?: BiquadFilterType;
}
function noise(o: NoiseOpts) {
  const c = getCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const dur = o.dur ?? 0.2;
  const buf = c.createBuffer(1, Math.max(1, Math.ceil(c.sampleRate * dur)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = o.type ?? "bandpass";
  filt.frequency.setValueAtTime(o.filter ?? 1000, t0);
  if (o.filterSlide) filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.filterSlide), t0 + dur);
  filt.Q.value = o.q ?? 1;
  const g = c.createGain();
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

/* ------------------------------ the sounds ------------------------------ */

const click = () => {
  // deliberately subtle — feedback, not fanfare (was a loud square double-tick)
  tone({ freq: 820, type: "triangle", dur: 0.035, gain: 0.05 });
  tone({ freq: 1240, type: "sine", dur: 0.03, gain: 0.025, delay: 0.015 });
};

const openingTune = () => {
  [72, 76, 79, 84].forEach((m, i) => {
    tone({ freq: midi(m), type: "triangle", dur: 0.22, gain: 0.16, delay: i * 0.1, attack: 0.01 });
    tone({ freq: midi(m + 12), type: "square", dur: 0.12, gain: 0.05, delay: i * 0.1 });
  });
  [72, 76, 79, 84, 88].forEach((m) => tone({ freq: midi(m), type: "triangle", dur: 0.5, gain: 0.055, delay: 0.42 }));
  noise({ dur: 0.3, gain: 0.03, filter: 3000, filterSlide: 8000, delay: 0.4, type: "highpass" });
};

const activateTile = (i: number) => {
  const f = pentFreq(Math.min(i, 14), 72);
  tone({ freq: f, type: "triangle", dur: 0.09, gain: 0.13, attack: 0.004 });
  tone({ freq: f * 2, type: "square", dur: 0.05, gain: 0.035 });
};

const bankTile = (i: number) => {
  const f = pentFreq(Math.min(i, 14), 74);
  tone({ freq: f, type: "triangle", dur: 0.11, gain: 0.15, attack: 0.004 });
  tone({ freq: f * 1.5, type: "sine", dur: 0.08, gain: 0.05 });
};

const bankScore = () => {
  tone({ freq: 400, slideTo: 900, type: "sawtooth", dur: 0.28, gain: 0.09 });
  [72, 76, 79].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.34, gain: 0.1, delay: 0.04 + i * 0.02 }));
  tone({ freq: midi(84), type: "square", dur: 0.2, gain: 0.05, delay: 0.1 });
};

const scoreTick = () => tone({ freq: 1500, type: "square", dur: 0.03, gain: 0.05 });

// a very short, subtle blip fired repeatedly as the on-screen score counts up
const scoreRoll = () => tone({ freq: 1350 + Math.random() * 260, type: "square", dur: 0.022, gain: 0.038 });

// a very subtle tick for the BANK NOW 3-2-1 countdown (rises slightly per step)
const countdownTick = (n: number) => tone({ freq: 700 + (3 - n) * 90, type: "sine", dur: 0.045, gain: 0.045 });

// the score TICKING DOWN as an end-of-run penalty eats into it — a low, short
// descending blip: the darker mirror of scoreTick's bright rising up-tick.
const scoreTickDown = () => tone({ freq: 500, slideTo: 320, type: "square", dur: 0.045, gain: 0.05 });

// the opening GO! — a real kick-off: deep sub DROP + impact crash, a rising
// sizzle, and a bright triumphant stab that rings out over the fresh board
const goBang = () => {
  tone({ freq: 160, slideTo: 40, type: "sine", dur: 0.55, gain: 0.3 });
  tone({ freq: 320, slideTo: 80, type: "square", dur: 0.16, gain: 0.08 });
  noise({ dur: 0.4, gain: 0.14, filter: 2600, filterSlide: 140, q: 0.8 });
  noise({ dur: 0.55, gain: 0.06, filter: 500, filterSlide: 7500, q: 1.1, type: "bandpass", delay: 0.05 });
  [72, 79, 84].forEach((m, i) => tone({ freq: midi(m), type: "sawtooth", dur: 0.28, gain: 0.08, delay: 0.06 + i * 0.05 }));
  tone({ freq: midi(91), type: "triangle", dur: 0.5, gain: 0.09, delay: 0.24 });
};

// the hand-reveal EYE — a blink: two soft air-swishes (lid down, lid up)
const blink = () => {
  noise({ dur: 0.07, gain: 0.05, filter: 5200, filterSlide: 900, q: 0.9 });
  noise({ dur: 0.08, gain: 0.045, filter: 900, filterSlide: 5600, q: 0.9, delay: 0.16 });
  tone({ freq: 660, type: "sine", dur: 0.05, gain: 0.02, delay: 0.24 });
};

// the final-bust FAILURE sting: a sad two-step descent over a deep thud
const failure = () => {
  tone({ freq: 392, slideTo: 196, type: "sawtooth", dur: 0.55, gain: 0.08 });
  tone({ freq: 311, slideTo: 156, type: "triangle", dur: 0.6, gain: 0.07, delay: 0.12 });
  tone({ freq: 90, slideTo: 38, type: "sine", dur: 0.7, gain: 0.22, delay: 0.05 });
  noise({ dur: 0.4, gain: 0.06, filter: 900, filterSlide: 200, q: 0.8, delay: 0.05 });
};

// a Nebulite lands in the wallet — a bright little two-note chime
const walletGain = () => {
  tone({ freq: midi(88), type: "triangle", dur: 0.12, gain: 0.07 });
  tone({ freq: midi(95), type: "sine", dur: 0.22, gain: 0.06, delay: 0.07 });
  noise({ dur: 0.12, gain: 0.02, filter: 7000, filterSlide: 9000, type: "highpass" });
};

// in-run Nebulite forfeited on a lost run — the wallet value slipping away and
// sinking into a low, hollow loss (played once as the counter drains to zero).
// Pitched a register lower than the wallet chime so it reads clearly as a LOSS.
const nebForfeit = () => {
  tone({ freq: midi(83), slideTo: midi(69), type: "sine", dur: 0.4, gain: 0.06 });
  tone({ freq: midi(76), slideTo: midi(59), type: "triangle", dur: 0.5, gain: 0.07, delay: 0.1 });
  tone({ freq: midi(47), slideTo: midi(35), type: "sine", dur: 0.62, gain: 0.11, delay: 0.14 });
  noise({ dur: 0.3, gain: 0.02, filter: 2400, filterSlide: 300, q: 0.7, type: "bandpass", delay: 0.05 });
};

// RESURRECT revealed — a warm, hopeful rising chime (a heart-beat lift)
const resurrectReveal = () => {
  tone({ freq: midi(64), type: "sine", dur: 0.14, gain: 0.09 });
  tone({ freq: midi(71), type: "triangle", dur: 0.22, gain: 0.08, delay: 0.11 });
  tone({ freq: midi(76), type: "sine", dur: 0.5, gain: 0.09, delay: 0.22 });
  tone({ freq: midi(83), type: "sine", dur: 0.4, gain: 0.05, delay: 0.3 });
  noise({ dur: 0.16, gain: 0.02, filter: 5000, filterSlide: 9000, type: "highpass", delay: 0.22 });
};

// QUADRIANT revealed — a ruby, weighty ×4 impact stab
const quadriantReveal = () => {
  tone({ freq: 180, slideTo: 90, type: "sine", dur: 0.34, gain: 0.2 });
  [midi(60), midi(64), midi(67), midi(72)].forEach((f, i) => tone({ freq: f, type: "sawtooth", dur: 0.34, gain: 0.08, delay: 0.02 + i * 0.03 }));
  tone({ freq: midi(79), type: "square", dur: 0.24, gain: 0.05, delay: 0.14 });
  noise({ dur: 0.3, gain: 0.06, filter: 2400, filterSlide: 200, q: 0.8 });
};

// ZENITH revealed / dealt — a bright, fluorescent superluminal sparkle
const zenithReveal = () => {
  tone({ freq: midi(88), slideTo: midi(100), type: "triangle", dur: 0.18, gain: 0.06 });
  [midi(84), midi(91), midi(96)].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.3, gain: 0.06, delay: 0.05 + i * 0.05 }));
  noise({ dur: 0.35, gain: 0.03, filter: 6000, filterSlide: 12000, q: 1.1, type: "bandpass" });
  tone({ freq: midi(103), type: "sine", dur: 0.22, gain: 0.035, delay: 0.2 });
};

const bankNowClick = () => {
  tone({ freq: 680, type: "square", dur: 0.06, gain: 0.14 });
  tone({ freq: 1020, type: "square", dur: 0.06, gain: 0.1, delay: 0.05 });
};

const bust = () => {
  tone({ freq: 320, slideTo: 70, type: "sawtooth", dur: 0.45, gain: 0.17 });
  tone({ freq: 160, slideTo: 50, type: "square", dur: 0.4, gain: 0.09, delay: 0.02 });
  noise({ dur: 0.35, gain: 0.13, filter: 1800, filterSlide: 200, q: 0.7 });
};

const reshuffle = () => {
  noise({ dur: 0.5, gain: 0.08, filter: 400, filterSlide: 4200, q: 1.2 });
  tone({ freq: 300, slideTo: 720, type: "triangle", dur: 0.4, gain: 0.06 });
  [84, 88, 91].forEach((m, i) => tone({ freq: midi(m), type: "sine", dur: 0.12, gain: 0.05, delay: 0.34 + i * 0.05 }));
};

const collapse = () => {
  // A big, POSITIVE transformation — rising (opposite of the bust's fall), bright,
  // and chordal, so it reads as a good moment, not a threat.
  tone({ freq: 130, slideTo: 520, type: "sawtooth", dur: 0.7, gain: 0.13 });
  tone({ freq: 260, slideTo: 1040, type: "triangle", dur: 0.7, gain: 0.09 });
  // a bright major chord blooms in as it resolves
  [76, 80, 83, 88].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.6, gain: 0.1, delay: 0.32 + i * 0.03, attack: 0.02 }));
  // rising shimmer sweep + sparkle top
  noise({ dur: 0.85, gain: 0.06, filter: 600, filterSlide: 9000, q: 1.0, type: "bandpass" });
  [88, 91, 95].forEach((m, i) => tone({ freq: midi(m), type: "sine", dur: 0.26, gain: 0.05, delay: 0.5 + i * 0.06 }));
};

const clearCore = () => {
  [79, 84, 88].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.3, gain: 0.12, delay: i * 0.06 }));
  tone({ freq: midi(91), type: "sine", dur: 0.4, gain: 0.06, delay: 0.14 });
};

// clearing a Dross is a WIN (you dodged the trap) — a bright, gold COIN "ching":
// a quick two-note pop up with a metallic ring and a touch of sparkle.
const clearGlint = () => {
  tone({ freq: midi(83), type: "square", dur: 0.06, gain: 0.11 });
  tone({ freq: midi(90), type: "square", dur: 0.13, gain: 0.12, delay: 0.05 });
  tone({ freq: midi(95), type: "triangle", dur: 0.2, gain: 0.05, delay: 0.06, attack: 0.004 });
  noise({ dur: 0.12, gain: 0.02, filter: 7000, filterSlide: 11000, type: "highpass", delay: 0.04 });
};

const gainDross = () => {
  tone({ freq: midi(65), type: "square", dur: 0.14, gain: 0.13 });
  tone({ freq: midi(61), type: "square", dur: 0.22, gain: 0.13, delay: 0.12 });
};

const tileToHand = () => {
  const jitter = 0.9 + Math.random() * 0.2;
  tone({ freq: 620 * jitter, type: "triangle", dur: 0.06, gain: 0.085, attack: 0.003 });
};

const place = () => {
  tone({ freq: 300, slideTo: 180, type: "square", dur: 0.08, gain: 0.1 });
  noise({ dur: 0.05, gain: 0.04, filter: 1200 });
};

const boardCleared = () => {
  [72, 76, 79, 84, 88].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.3, gain: 0.16, delay: i * 0.1 }));
  [72, 76, 79, 84].forEach((m) => tone({ freq: midi(m), type: "square", dur: 0.7, gain: 0.06, delay: 0.5 }));
  noise({ dur: 0.5, gain: 0.04, filter: 4000, filterSlide: 9000, delay: 0.5, type: "highpass" });
};

const gameOver = () => {
  [69, 65, 62, 57].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.35, gain: 0.14, delay: i * 0.18 }));
  tone({ freq: midi(50), type: "square", dur: 0.6, gain: 0.08, delay: 0.5 });
};

// MOTHER LODE — refining a big overflow into a Nebulite: a rising shimmer that
// "gathers", then a bright purple crystallisation chime as the Nebulite forms.
const motherLode = () => {
  // gather: a rising filtered sweep pulling the tiles inward
  noise({ dur: 0.55, gain: 0.05, filter: 500, filterSlide: 7000, q: 1.0, type: "bandpass" });
  tone({ freq: 200, slideTo: 760, type: "sawtooth", dur: 0.55, gain: 0.07 });
  // crystallise: a bright add9 shimmer blooms as the Nebulite snaps into being
  [79, 83, 86, 90, 93].forEach((m, i) =>
    tone({ freq: midi(m), type: "triangle", dur: 0.5, gain: 0.09, delay: 0.62 + i * 0.05, attack: 0.01 })
  );
  tone({ freq: midi(98), type: "sine", dur: 0.5, gain: 0.05, delay: 0.78 });
  noise({ dur: 0.4, gain: 0.045, filter: 6000, filterSlide: 11000, delay: 0.66, type: "highpass" });
};

// GLINT RUSH title slide-in — a whoosh that sweeps the words in from the side, then
// a short triumphant stinger.
const rushRise = () => {
  noise({ dur: 0.5, gain: 0.09, filter: 300, filterSlide: 5200, q: 0.9, type: "bandpass" });
  tone({ freq: 170, slideTo: 920, type: "sawtooth", dur: 0.42, gain: 0.1 });
  [72, 79, 84, 88].forEach((m, i) => tone({ freq: midi(m), type: "square", dur: 0.32, gain: 0.06, delay: 0.2 + i * 0.045 }));
};

/** clearing the special tiles (Dross value 0 / Nebulite value 7). */
const clearSpecial = (value: number) => (value === 7 ? clearCore() : clearGlint());

// Level select — the completion tick pops onto the finished level's tile.
const levelTick = () => {
  [79, 84, 88].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.2, gain: 0.09, delay: i * 0.07 }));
  noise({ dur: 0.25, gain: 0.03, filter: 5000, filterSlide: 9000, type: "highpass" });
};

// Level select — the next level shakes off its grey and unlocks: a rising sweep
// into a short bright stinger.
const levelUnlock = () => {
  tone({ freq: 250, slideTo: 720, type: "triangle", dur: 0.35, gain: 0.08 });
  noise({ dur: 0.3, gain: 0.04, filter: 800, filterSlide: 6000, q: 0.8, type: "bandpass" });
  [76, 83, 88, 95].forEach((m, i) => tone({ freq: midi(m), type: "square", dur: 0.24, gain: 0.05, delay: 0.2 + i * 0.055 }));
};

// Cash-out cancelled — a soft "poof": a falling filtered-noise puff.
const poof = () => {
  noise({ dur: 0.22, gain: 0.09, filter: 2400, filterSlide: 300, q: 0.9, type: "bandpass" });
  tone({ freq: 300, slideTo: 120, type: "triangle", dur: 0.16, gain: 0.05 });
};

// THE THIRD BUST — the run ends here: a heavy doom drop as the final heart
// tears loose, then the crack of it bursting at screen centre (delay 0.75s,
// timed to the heart's flight).
const finalBust = () => {
  tone({ freq: 90, slideTo: 28, type: "sine", dur: 1.4, gain: 0.22 });
  noise({ dur: 0.5, gain: 0.12, filter: 900, filterSlide: 120, q: 0.7, type: "lowpass" });
  tone({ freq: 220, slideTo: 110, type: "sawtooth", dur: 0.7, gain: 0.07 });
  noise({ dur: 0.3, gain: 0.16, filter: 3200, filterSlide: 600, q: 0.8, type: "bandpass", delay: 0.75 });
  tone({ freq: 400, slideTo: 60, type: "square", dur: 0.35, gain: 0.09, delay: 0.75 });
};

// PUZZLE COMPLETE — the picture is finished and lifts off the board: a big,
// bright triumphant fanfare (rising sweep → full major bloom with octave stack →
// sparkle shimmer). The biggest positive sting in the set.
const puzzleComplete = () => {
  // rising lift-off sweep
  noise({ dur: 0.45, gain: 0.06, filter: 500, filterSlide: 8000, q: 0.9, type: "bandpass" });
  tone({ freq: 220, slideTo: 880, type: "sawtooth", dur: 0.4, gain: 0.09 });
  // the bloom — a wide major chord (C E G C E) climbing in, with an octave layer
  [72, 76, 79, 84, 88].forEach((m, i) => {
    tone({ freq: midi(m), type: "triangle", dur: 0.6, gain: 0.16, delay: 0.18 + i * 0.08, attack: 0.01 });
    tone({ freq: midi(m + 12), type: "sine", dur: 0.5, gain: 0.05, delay: 0.18 + i * 0.08 });
  });
  // sustained golden pad underneath
  [60, 64, 67, 72].forEach((m) => tone({ freq: midi(m), type: "square", dur: 1.1, gain: 0.05, delay: 0.6 }));
  // sparkle shimmer on top
  noise({ dur: 0.6, gain: 0.05, filter: 6000, filterSlide: 12000, delay: 0.6, type: "highpass" });
  tone({ freq: midi(100), type: "sine", dur: 0.5, gain: 0.04, delay: 0.72 });
};

// SINGULARITY — the shape breaks up and its tiles are SWEPT away one by one into
// the abyss. A run of short airy swishes (each a tile flicking off) over a soft
// low bed that settles quietly. Progression, not a penalty — no doom drop.
const abyssFall = () => {
  const flicks = [0, 0.08, 0.17, 0.27, 0.38, 0.5];
  flicks.forEach((d, i) => {
    // each tile is whisked off: a quick filtered-noise swish + a soft descending tick
    noise({ dur: 0.15, gain: 0.055, filter: 3800 - i * 380, filterSlide: 600, q: 0.9, type: "bandpass", delay: d });
    tone({ freq: midi(74 - i * 2), slideTo: midi(62 - i * 2), type: "triangle", dur: 0.11, gain: 0.04, delay: d });
  });
  // the soft low bed the tiles drift down into — present but calm, no plummet
  tone({ freq: 160, slideTo: 62, type: "sine", dur: 1.0, gain: 0.09, delay: 0.05 });
  // and it settles, quietly, at the bottom
  tone({ freq: midi(43), type: "sine", dur: 0.55, gain: 0.05, delay: 0.62, attack: 0.03 });
};

// The Start → Ascent dive: a thematic, bombastic transition — a deep rising swell
// and whoosh that plunges into the abyss, then an impact and a triumphant chord
// bloom as the Ascent map arrives.
const startWarp = () => {
  // the dive: deep riser + a whoosh sweeping up
  tone({ freq: 70, slideTo: 300, type: "sawtooth", dur: 0.9, gain: 0.16 });
  tone({ freq: 140, slideTo: 620, type: "triangle", dur: 0.9, gain: 0.1 });
  noise({ dur: 0.9, gain: 0.13, filter: 260, filterSlide: 9000, q: 0.8, type: "bandpass" });
  // arrival: a boom + impact noise
  tone({ freq: 120, slideTo: 46, type: "sine", dur: 0.6, gain: 0.24, delay: 0.42 });
  noise({ dur: 0.5, gain: 0.12, filter: 3200, filterSlide: 120, q: 0.7, delay: 0.42 });
  // a triumphant major chord blooms in, with a shimmer on top
  [60, 67, 72, 76, 79].forEach((m, i) => tone({ freq: midi(m), type: "sawtooth", dur: 0.7, gain: 0.085, delay: 0.46 + i * 0.03, attack: 0.02 }));
  [84, 88, 91].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.5, gain: 0.055, delay: 0.6 + i * 0.05 }));
};

// The board-clear ×2 Nebulite boost on the run summary: a bright rising two-note
// with a sparkle tail — a satisfying "doubled!" sting.
const nebDouble = () => {
  tone({ freq: midi(72), type: "triangle", dur: 0.14, gain: 0.14 });
  tone({ freq: midi(76), type: "triangle", dur: 0.16, gain: 0.14, delay: 0.1 });
  tone({ freq: midi(84), type: "sine", dur: 0.4, gain: 0.11, delay: 0.2, attack: 0.01 });
  [88, 91, 96].forEach((m, i) => tone({ freq: midi(m), type: "sine", dur: 0.24, gain: 0.05, delay: 0.28 + i * 0.05, attack: 0.004 }));
  noise({ dur: 0.5, gain: 0.05, filter: 900, filterSlide: 9000, q: 1.0, type: "bandpass", delay: 0.2 });
};

// REWARD UNLOCKED — a collectible (sticker / theme / music) is revealed after a
// run. A bright, treasure-got flourish: a rising three-note lift into a warm
// gold major bloom, with a sparkle on top. Distinct from the board fanfares.
const rewardReveal = () => {
  noise({ dur: 0.4, gain: 0.05, filter: 800, filterSlide: 9000, q: 0.9, type: "bandpass" });
  tone({ freq: midi(67), type: "triangle", dur: 0.12, gain: 0.1 });
  tone({ freq: midi(72), type: "triangle", dur: 0.12, gain: 0.11, delay: 0.09 });
  tone({ freq: midi(76), type: "triangle", dur: 0.14, gain: 0.12, delay: 0.18 });
  [79, 84, 88].forEach((m, i) => tone({ freq: midi(m), type: "triangle", dur: 0.55, gain: 0.12, delay: 0.3 + i * 0.02, attack: 0.01 }));
  tone({ freq: midi(72), type: "sine", dur: 0.7, gain: 0.06, delay: 0.32 });
  [91, 96, 100].forEach((m, i) => tone({ freq: midi(m), type: "sine", dur: 0.3, gain: 0.045, delay: 0.44 + i * 0.05, attack: 0.004 }));
  noise({ dur: 0.5, gain: 0.035, filter: 6000, filterSlide: 12000, delay: 0.42, type: "highpass" });
};

// PURCHASE — a shop "ka-ching": a short low click, then a bright bell chime with a
// coin sparkle. Plays when a slide-to-buy completes and the item is granted.
const purchase = () => {
  tone({ freq: 300, type: "square", dur: 0.04, gain: 0.08 });
  tone({ freq: midi(96), type: "triangle", dur: 0.18, gain: 0.12, delay: 0.06, attack: 0.004 });
  tone({ freq: midi(100), type: "sine", dur: 0.5, gain: 0.09, delay: 0.08, attack: 0.004 });
  tone({ freq: midi(103), type: "sine", dur: 0.45, gain: 0.06, delay: 0.1, attack: 0.004 });
  noise({ dur: 0.4, gain: 0.03, filter: 7000, filterSlide: 12000, type: "highpass", delay: 0.08 });
};

export const sfx = {
  unlock: () => void getCtx(),
  setMuted: (m: boolean) => {
    muted = m;
  },
  isMuted: () => muted,
  /** Master SFX level, 0..1 (Settings → Audio). 0 = silent. */
  setVolume: (v: number) => {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  },
  getVolume: () => volume,
  click,
  openingTune,
  activateTile,
  bankTile,
  bankScore,
  scoreTick,
  scoreTickDown,
  scoreRoll,
  countdownTick,
  goBang,
  blink,
  failure,
  walletGain,
  nebForfeit,
  resurrectReveal,
  quadriantReveal,
  zenithReveal,
  bankNowClick,
  bust,
  finalBust,
  reshuffle,
  collapse,
  clearCore,
  clearGlint,
  clearSpecial,
  gainDross,
  tileToHand,
  place,
  boardCleared,
  puzzleComplete,
  gameOver,
  motherLode,
  rushRise,
  abyssFall,
  levelTick,
  levelUnlock,
  poof,
  startWarp,
  nebDouble,
  rewardReveal,
  purchase,
};
