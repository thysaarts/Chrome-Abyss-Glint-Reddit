/**
 * PROCEDURAL 3D PROPS — simple, symmetric space objects three.js builds far
 * better than a mesh generator: planets (banded), ringed planets, cratered
 * moons, lumpy asteroids and a little low-poly ship. The admin picks a TYPE and
 * a MAIN COLOUR (the palette derives its tones from it), hits generate, gets a
 * preview, and commits the result through the same .glb pipeline as uploads.
 *
 * three loads lazily — this module adds no weight until generate is pressed.
 * Textures are drawn on canvases with flipY=false (the GLTFExporter contract);
 * bands / craters / speckle are flip-agnostic so previews match the export.
 */

export type PropType = "planet" | "ringed" | "moon" | "asteroid" | "ship" | "satellite";
export const PROP_TYPES: { key: PropType; label: string }[] = [
  { key: "planet", label: "planet" },
  { key: "ringed", label: "planet + rings" },
  { key: "moon", label: "moon" },
  { key: "asteroid", label: "asteroid" },
  { key: "ship", label: "spaceship" },
  { key: "satellite", label: "satellite" },
];

// deterministic PRNG so a seed can be re-rolled per generate press
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// smooth 1D value noise (sum of sines — enough for bands and wobble)
function fbm(x: number, r1: number, r2: number, r3: number): number {
  return (
    0.55 * Math.sin(x * 1.7 + r1 * 9) +
    0.3 * Math.sin(x * 4.3 + r2 * 17) +
    0.15 * Math.sin(x * 9.1 + r3 * 29)
  ) * 0.5 + 0.5; // → 0..1
}

interface Tones { h: number; s: number; l: number }
function tonesOf(hex: string): Tones {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x9d7bff;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s, l };
}
function hslCss(h: number, s: number, l: number, a = 1): string {
  return `hsla(${Math.round(h * 360)},${Math.round(Math.max(0, Math.min(1, s)) * 100)}%,${Math.round(Math.max(0.04, Math.min(0.96, l)) * 100)}%,${a})`;
}

/* ------------------------------ texture painters ------------------------------ */

function planetTexture(t: Tones, rnd: () => number): HTMLCanvasElement {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
  const bandFreq = 5 + rnd() * 5;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    const lat = y / H;
    const polar = Math.pow(Math.abs(lat - 0.5) * 2, 3) * 0.16; // darkened caps
    for (let x = 0; x < W; x++) {
      // banded flow: latitude bands + a horizontal wobble so bands aren't rulers
      const wob = 0.12 * fbm(x / W * 6 + lat * 2, r3, r4, r1);
      const v = fbm(lat * bandFreq + wob, r1, r2, r3);
      const speck = (rnd() - 0.5) * 0.02;
      const l = t.l + (v - 0.5) * 0.34 - polar + speck;
      const s = t.s * (0.75 + v * 0.4);
      // HSL → RGB inline (hot loop)
      const hh = t.h + (v - 0.5) * 0.04;
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const f = (tt: number) => {
        let u = tt; if (u < 0) u += 1; if (u > 1) u -= 1;
        if (u < 1 / 6) return p + (q - p) * 6 * u;
        if (u < 1 / 2) return q;
        if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
        return p;
      };
      const i = (y * W + x) * 4;
      px[i] = f(hh + 1 / 3) * 255; px[i + 1] = f(hh) * 255; px[i + 2] = f(hh - 1 / 3) * 255; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function moonTexture(t: Tones, rnd: () => number): HTMLCanvasElement {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  // a dusty, mostly-desaturated ground in the main colour's family
  const s0 = t.s * 0.22, l0 = 0.42 + t.l * 0.3;
  ctx.fillStyle = hslCss(t.h, s0, l0);
  ctx.fillRect(0, 0, W, H);
  // large soft maria patches
  for (let i = 0; i < 7; i++) {
    const x = rnd() * W, y = H * (0.2 + rnd() * 0.6), r = 60 + rnd() * 150;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hslCss(t.h, s0 * 1.3, l0 - 0.08, 0.5));
    g.addColorStop(1, hslCss(t.h, s0, l0, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // craters: darker bowl + a bright rim arc on the light side
  const n = 46 + Math.floor(rnd() * 22);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = H * (0.08 + rnd() * 0.84), r = 3 + Math.pow(rnd(), 2) * 34;
    const bowl = ctx.createRadialGradient(x, y, 0, x, y, r);
    bowl.addColorStop(0, hslCss(t.h, s0, l0 - 0.13, 0.85));
    bowl.addColorStop(0.75, hslCss(t.h, s0, l0 - 0.07, 0.5));
    bowl.addColorStop(1, hslCss(t.h, s0, l0, 0));
    ctx.fillStyle = bowl;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hslCss(t.h, s0, l0 + 0.14, 0.7);
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.arc(x, y, r * 0.82, -2.4, -0.2); ctx.stroke();
  }
  // fine speckle
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (rnd() - 0.5) * 12;
    img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function asteroidTexture(t: Tones, rnd: () => number): HTMLCanvasElement {
  const W = 512, H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const s0 = t.s * 0.3, l0 = 0.3 + t.l * 0.25;
  ctx.fillStyle = hslCss(t.h, s0, l0);
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    const l = l0 + (rnd() - 0.5) * 0.16;
    ctx.fillStyle = hslCss(t.h, s0, l, 0.5);
    const r = 1 + rnd() * 5;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

function ringTexture(t: Tones, rnd: () => number): HTMLCanvasElement {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d")!;
  const r1 = rnd(), r2 = rnd(), r3 = rnd();
  // concentric translucent bands from the inner edge out (planar UVs on RingGeometry)
  for (let r = S * 0.30; r < S * 0.5; r += 1.5) {
    const u = (r - S * 0.30) / (S * 0.2);
    const band = fbm(u * 7, r1, r2, r3);
    const gap = fbm(u * 23 + 5, r2, r3, r1);
    const alpha = Math.max(0, Math.min(1, band * 0.9)) * (gap > 0.28 ? 1 : 0.12) * (1 - Math.pow(u, 3) * 0.6);
    ctx.strokeStyle = hslCss(t.h, t.s * 0.55, t.l + (band - 0.5) * 0.3, alpha);
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2); ctx.stroke();
  }
  return c;
}

/* --------------------------------- builders --------------------------------- */

/** Build the object + render a preview + export a GLB. One call does it all so
 *  three is imported once and every canvas is disposed on the way out. */
export async function generatePropGlb(
  type: PropType,
  colorHex: string,
  seed = Math.floor(Math.random() * 1e9)
): Promise<{ glb: ArrayBuffer; preview: string }> {
  const three = await import("three");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const rnd = mulberry32(seed);
  const t = tonesOf(colorHex);

  const tex = (cv: HTMLCanvasElement, color = true) => {
    const x = new three.CanvasTexture(cv);
    x.flipY = false; // the GLTFExporter contract
    if (color) x.colorSpace = three.SRGBColorSpace;
    return x;
  };

  const root = new three.Group();
  root.name = `glint-${type}`;

  if (type === "planet" || type === "ringed") {
    const ball = new three.Mesh(
      new three.SphereGeometry(1, 48, 32),
      new three.MeshStandardMaterial({ map: tex(planetTexture(t, rnd)), roughness: 0.85, metalness: 0 })
    );
    root.add(ball);
    if (type === "ringed") {
      const ring = new three.Mesh(
        new three.RingGeometry(1.45, 2.35, 96),
        new three.MeshStandardMaterial({ map: tex(ringTexture(t, rnd)), transparent: true, side: three.DoubleSide, roughness: 0.9, metalness: 0, depthWrite: false })
      );
      ring.rotation.x = Math.PI / 2 - 0.42; // the classic tilt
      root.add(ring);
      root.rotation.z = 0.16;
    }
  } else if (type === "moon") {
    root.add(new three.Mesh(
      new three.SphereGeometry(1, 48, 32),
      new three.MeshStandardMaterial({ map: tex(moonTexture(t, rnd)), roughness: 0.95, metalness: 0 })
    ));
  } else if (type === "asteroid") {
    const geo = new three.IcosahedronGeometry(1, 3);
    const pos = geo.attributes.position;
    const v = new three.Vector3();
    const f0 = 0.8 + rnd() * 0.4, f1 = 1.6 + rnd() * 0.8, f2 = 3.2 + rnd() * 1.4, o1 = rnd() * 10, o2 = rnd() * 10, o3 = rnd() * 10;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // one big lump + medium knuckles + fine grit — a rock, not a pebble
      const n =
        0.42 * Math.sin(v.x * f0 + o1) * Math.cos(v.y * f0 * 1.4 + o2) +
        0.2 * Math.sin(v.y * f1 + o2) * Math.sin(v.z * f1 + o3) +
        0.09 * Math.sin(v.z * f2 + o1) * Math.sin(v.x * f2 + o2);
      v.multiplyScalar(1 + n * 0.9);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const rock = new three.Mesh(geo, new three.MeshStandardMaterial({ map: tex(asteroidTexture(t, rnd)), roughness: 1, metalness: 0.05 }));
    rock.scale.set(1.2, 0.82, 1); // never a sphere
    root.add(rock);
  } else if (type === "ship") {
    // spaceship in the Abyss house style (learned from the uploaded models):
    // near-black gunmetal hull, luminous accent strips in the item colour,
    // glowing canopy, swept dark wings, hot engine cores. NOSE = +X.
    const accent = new three.Color().setHSL(t.h, Math.max(0.55, t.s), 0.62);
    const hullMat = new three.MeshStandardMaterial({ color: new three.Color().setHSL(t.h, t.s * 0.25, 0.13), roughness: 0.32, metalness: 0.75 });
    const panelMat = new three.MeshStandardMaterial({ color: new three.Color().setHSL(t.h, t.s * 0.3, 0.09), roughness: 0.45, metalness: 0.6 });
    const stripMat = new three.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.7, roughness: 0.4 });
    const canopyMat = new three.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.2 });
    const hotMat = new three.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.4, roughness: 0.3 });
    // fuselage: a lathed teardrop lying along X (radius profile nose → tail)
    const prof: [number, number][] = [[0.001, 1.15], [0.1, 0.95], [0.2, 0.55], [0.27, 0.05], [0.3, -0.45], [0.24, -0.85], [0.14, -1.0], [0.001, -1.05]];
    const fus = new three.Mesh(new three.LatheGeometry(prof.map(([r, y]) => new three.Vector2(r, y)), 22), hullMat);
    fus.rotation.z = -Math.PI / 2; // +Y profile axis → +X nose
    root.add(fus);
    // glowing accent strips down both flanks
    for (const sgn of [1, -1]) {
      const strip = new three.Mesh(new three.BoxGeometry(1.5, 0.03, 0.04), stripMat);
      strip.position.set(-0.05, 0.05, sgn * 0.27);
      root.add(strip);
    }
    // canopy: a glowing teardrop set into the spine
    const canopy = new three.Mesh(new three.SphereGeometry(0.17, 18, 12), canopyMat);
    canopy.position.set(0.42, 0.2, 0);
    canopy.scale.set(1.9, 0.75, 0.8);
    root.add(canopy);
    // swept delta wings (flat extruded triangles) with a glowing trailing edge
    const wingShape = new three.Shape([new three.Vector2(0.25, 0), new three.Vector2(-0.85, 0.62), new three.Vector2(-1.0, 0.56), new three.Vector2(-0.45, 0)].map((v) => v));
    const wingGeo = new three.ExtrudeGeometry(wingShape, { depth: 0.045, bevelEnabled: false });
    for (const sgn of [1, -1]) {
      const wing = new three.Mesh(wingGeo, panelMat);
      wing.rotation.x = sgn === 1 ? Math.PI / 2 : -Math.PI / 2; // lay flat, one each side
      wing.position.set(-0.05, -0.03, sgn * 0.2);
      wing.rotation.y = sgn * 0.12;
      root.add(wing);
      const edge = new three.Mesh(new three.BoxGeometry(0.5, 0.025, 0.035), stripMat);
      edge.position.set(-0.82, -0.03, sgn * 0.72);
      edge.rotation.y = sgn * -0.5;
      root.add(edge);
      // engine pods under the wing roots, hot cores at the back
      const pod = new three.Mesh(new three.CylinderGeometry(0.11, 0.14, 0.62, 14), hullMat);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(-0.72, -0.08, sgn * 0.34);
      root.add(pod);
      const core = new three.Mesh(new three.CylinderGeometry(0.085, 0.085, 0.05, 14), hotMat);
      core.rotation.z = Math.PI / 2;
      core.position.set(-1.05, -0.08, sgn * 0.34);
      root.add(core);
    }
    // dorsal fin with a glow tip
    const fin = new three.Mesh(new three.ExtrudeGeometry(
      new three.Shape([new three.Vector2(0.15, 0), new three.Vector2(-0.4, 0.42), new three.Vector2(-0.55, 0.38), new three.Vector2(-0.3, 0)].map((v) => v)),
      { depth: 0.04, bevelEnabled: false }
    ), panelMat);
    fin.position.set(-0.5, 0.12, -0.02);
    root.add(fin);
    const finTip = new three.Mesh(new three.BoxGeometry(0.16, 0.025, 0.05), stripMat);
    finTip.position.set(-0.97, 0.51, 0);
    finTip.rotation.z = -0.65;
    root.add(finTip);
  } else {
    // satellite: dark bus + glowing solar arrays + a dish. DISH (front) = +X.
    const accent = new three.Color().setHSL(t.h, Math.max(0.5, t.s), 0.6);
    const busMat = new three.MeshStandardMaterial({ color: new three.Color().setHSL(t.h, t.s * 0.25, 0.14), roughness: 0.4, metalness: 0.7 });
    const foilMat = new three.MeshStandardMaterial({ color: new three.Color().setHSL(0.09, 0.55, 0.4), roughness: 0.55, metalness: 0.8 });
    const glowMat = new three.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.5, roughness: 0.4 });
    // solar cells: a glowing grid in the item colour on a near-black panel
    const cellCv = document.createElement("canvas");
    cellCv.width = 256; cellCv.height = 128;
    const cc = cellCv.getContext("2d")!;
    cc.fillStyle = hslCss(t.h, t.s * 0.5, 0.1);
    cc.fillRect(0, 0, 256, 128);
    cc.strokeStyle = hslCss(t.h, Math.max(0.5, t.s), 0.55, 0.9);
    cc.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32) { cc.beginPath(); cc.moveTo(x, 0); cc.lineTo(x, 128); cc.stroke(); }
    for (let y = 0; y <= 128; y += 32) { cc.beginPath(); cc.moveTo(0, y); cc.lineTo(256, y); cc.stroke(); }
    const cellTex = tex(cellCv);
    const cellMat = new three.MeshStandardMaterial({ map: cellTex, emissiveMap: cellTex, emissive: accent, emissiveIntensity: 1.6, roughness: 0.5, side: three.DoubleSide });
    // the bus (body) with a foil band
    const bus = new three.Mesh(new three.BoxGeometry(0.62, 0.52, 0.52), busMat);
    root.add(bus);
    const band = new three.Mesh(new three.BoxGeometry(0.24, 0.54, 0.54), foilMat);
    root.add(band);
    // solar wings on booms, port and starboard
    for (const sgn of [1, -1]) {
      const boom = new three.Mesh(new three.CylinderGeometry(0.025, 0.025, 0.34, 8), busMat);
      boom.rotation.x = Math.PI / 2;
      boom.position.set(0, 0, sgn * 0.42);
      root.add(boom);
      const panel = new three.Mesh(new three.BoxGeometry(0.5, 0.02, 1.15), cellMat);
      panel.position.set(0, 0, sgn * 1.15);
      root.add(panel);
    }
    // the dish, facing +X: a shallow lathe bowl on a short mast, glow feed at its focus
    const dishProf = [new three.Vector2(0.001, 0), new three.Vector2(0.16, 0.02), new three.Vector2(0.3, 0.09), new three.Vector2(0.36, 0.16)];
    const dish = new three.Mesh(new three.LatheGeometry(dishProf, 20), new three.MeshStandardMaterial({ color: 0xd8dbe6, roughness: 0.5, metalness: 0.4, side: three.DoubleSide }));
    dish.rotation.z = -Math.PI / 2;
    dish.position.set(0.5, 0, 0);
    root.add(dish);
    const feed = new three.Mesh(new three.SphereGeometry(0.045, 10, 8), glowMat);
    feed.position.set(0.72, 0, 0);
    root.add(feed);
    // antennae with glow tips
    for (const [dx, dy] of [[-0.2, 0.42], [0.12, 0.4]] as [number, number][]) {
      const rod = new three.Mesh(new three.CylinderGeometry(0.014, 0.014, 0.5, 6), busMat);
      rod.position.set(dx, dy, 0);
      root.add(rod);
      const tip = new three.Mesh(new three.SphereGeometry(0.03, 8, 6), glowMat);
      tip.position.set(dx, dy + 0.27, 0);
      root.add(tip);
    }
  }

  // --- preview: one lit frame at the map's angle ---
  const P = 192;
  const renderer = new three.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(P, P);
  const scene = new three.Scene();
  const cam = new three.PerspectiveCamera(32, 1, 0.01, 100);
  cam.position.set(0, 0.55, 3.1); cam.lookAt(0, 0, 0);
  scene.add(new three.AmbientLight(0xffffff, 1.15));
  const key = new three.DirectionalLight(0xffffff, 1.7); key.position.set(2.2, 3, 2.4); scene.add(key);
  const rim = new three.DirectionalLight(0x9d7bff, 0.8); rim.position.set(-2.5, 1, -2); scene.add(rim);
  const frame = new three.Group();
  frame.add(root);
  const bb = new three.Box3().setFromObject(root);
  const span = bb.getSize(new three.Vector3()).length() || 1;
  const centre = bb.getCenter(new three.Vector3());
  root.position.sub(centre);
  frame.scale.multiplyScalar(2.1 / span);
  frame.rotation.y = 0.6;
  scene.add(frame);
  renderer.render(scene, cam);
  const preview = renderer.domElement.toDataURL("image/png");
  renderer.dispose();

  // --- export (undo the preview framing so the GLB is the raw object) ---
  root.position.set(0, 0, 0);
  const glb = await new Promise<ArrayBuffer>((resolve, reject) =>
    new GLTFExporter().parse(root, (out) => resolve(out as ArrayBuffer), reject, { binary: true, maxTextureSize: 1024 })
  );
  return { glb, preview };
}
