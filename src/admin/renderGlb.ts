/**
 * Render a decor .glb to a thumbnail data-URI — one lit frame at the map's
 * angle, with the same RoomEnvironment IBL + ACES tone mapping the props get
 * in-game, so the thumbnail matches how the prop actually looks. Browser-only
 * (WebGL). three loads lazily. Used by the CMS "auto-generate" for 3D props and
 * by the one-time batch (run headless via Playwright).
 */
export async function renderGlbThumb(modelUrl: string, px = 200): Promise<string> {
  const [three, loaderMod, envMod] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
  ]);
  const renderer = new three.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
  renderer.setSize(px, px);
  renderer.toneMapping = three.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08; // a touch hotter → punchier highlights

  const scene = new three.Scene();
  // a dark radial backdrop for depth/contrast (near-black edges, faintly lifted
  // centre) so the prop reads vivid against darkness instead of floating flat
  const bg = document.createElement("canvas");
  bg.width = bg.height = 64;
  const bctx = bg.getContext("2d")!;
  const grad = bctx.createRadialGradient(32, 30, 4, 32, 32, 40);
  grad.addColorStop(0, "#15101f");
  grad.addColorStop(1, "#050409");
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, 64, 64);
  const bgTex = new three.CanvasTexture(bg);
  bgTex.colorSpace = three.SRGBColorSpace;
  scene.background = bgTex;

  const pmrem = new three.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new envMod.RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.42; // less flat fill → deeper contrast
  pmrem.dispose();

  const cam = new three.PerspectiveCamera(32, 1, 0.01, 100);
  cam.position.set(0, 0.55, 3.1);
  cam.lookAt(0, 0, 0);
  scene.add(new three.AmbientLight(0xffffff, 0.26)); // low ambient → darker shadows
  const key = new three.DirectionalLight(0xffffff, 2.2); // strong key → high contrast
  key.position.set(2.2, 3, 2.4);
  scene.add(key);
  const rim = new three.DirectionalLight(0x9d7bff, 1.0); // violet rim for vibrancy
  rim.position.set(-2.5, 1, -2);
  scene.add(rim);

  const gltf = await new loaderMod.GLTFLoader().loadAsync(modelUrl);
  const obj = gltf.scene;
  const box = new three.Box3().setFromObject(obj);
  const span = box.getSize(new three.Vector3()).length() || 1;
  const centre = box.getCenter(new three.Vector3());
  obj.position.sub(centre);
  const frame = new three.Group();
  frame.add(obj);
  frame.scale.multiplyScalar(2.1 / span);
  frame.rotation.y = 0.6;
  scene.add(frame);

  renderer.render(scene, cam);
  const uri = renderer.domElement.toDataURL("image/webp", 0.82);
  envRT.dispose();
  renderer.dispose();
  return uri;
}
