/**
 * The sealed test as a real glass vault (three.js): a refracting box with a
 * glowing core, the messages orbiting inside, and two seal rings. Loaded only
 * on pages that show it; returns a cleanup function.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const GREEN = new Color("#12917a");
const DEEP = new Color("#0c6a50");
const GLOW = new Color("#3fe0b5");

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(120,255,210,0.95)");
  grad.addColorStop(0.35, "rgba(40,200,150,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function mountVault(host: HTMLElement): () => void {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.35, 7.2);
  camera.lookAt(0, 0, 0);

  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 4, 5);
  scene.add(key);

  const vault = new Group();
  scene.add(vault);

  // Glass box
  const glassGeo = new RoundedBoxGeometry(2, 2, 2, 6, 0.24);
  // Clear, reflective glass. (Refraction would sample the transparent page
  // behind the canvas and wash out to white.)
  const glassMat = new MeshPhysicalMaterial({
    color: new Color("#8fdcc4"),
    metalness: 0.05,
    roughness: 0.04,
    transparent: true,
    opacity: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.6,
    side: DoubleSide,
    depthWrite: false,
  });
  const glass = new Mesh(glassGeo, glassMat);
  glass.renderOrder = 2;
  // Crisp light edges, like the bevel of a glass block.
  const edgeGeo = new EdgesGeometry(new BoxGeometry(1.94, 1.94, 1.94));
  const edgeMat = new LineBasicMaterial({ color: new Color("#effff9"), transparent: true, opacity: 0.55 });
  const edges = new LineSegments(edgeGeo, edgeMat);
  vault.add(edges);
  vault.add(glass);

  // Glowing core: the sealed test
  const coreGeo = new IcosahedronGeometry(0.42, 4);
  const coreMat = new MeshStandardMaterial({ color: DEEP, emissive: new Color("#18b386"), emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.1 });
  const core = new Mesh(coreGeo, coreMat);
  vault.add(core);
  const light = new PointLight(GLOW, 8, 6, 1.6);
  vault.add(light);
  const tex = glowTexture();
  const haloMat = new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 });
  const halo = new Sprite(haloMat);
  halo.scale.setScalar(1.7);
  vault.add(halo);

  // Messages orbiting inside
  const beadGeo = new SphereGeometry(0.075, 20, 20);
  const beadMat = new MeshPhysicalMaterial({ color: GREEN, roughness: 0.2, clearcoat: 1, emissive: GLOW, emissiveIntensity: 0.6 });
  const beads = Array.from({ length: 16 }, (_, i) => {
    const m = new Mesh(beadGeo, beadMat);
    vault.add(m);
    return { m, r: 0.62 + (i % 3) * 0.1, speed: 0.35 + (i % 5) * 0.08, phase: (i / 16) * Math.PI * 2, tilt: (i % 4) * 0.7 };
  });

  // Seal rings around the box
  const ringGeo = new TorusGeometry(1.75, 0.009, 8, 160);
  const ringMat = new MeshStandardMaterial({ color: GREEN, emissive: GLOW, emissiveIntensity: 0.9, transparent: true, opacity: 0.75 });
  const ring1 = new Mesh(ringGeo, ringMat);
  const ring2 = new Mesh(ringGeo, ringMat);
  ring1.rotation.x = Math.PI / 2.3;
  ring2.rotation.set(Math.PI / 3, Math.PI / 4, 0);
  scene.add(ring1, ring2);

  // Size
  const resize = () => {
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 280;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // Pointer turns the vault a little
  let px = 0;
  let py = 0;
  const onMove = (e: PointerEvent) => {
    px = (e.clientX / window.innerWidth - 0.5) * 2;
    py = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);

  let raf = 0;
  let last = performance.now();
  let t = 0;
  let spin = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;
    t += dt;
    spin += dt * 0.35;
    vault.rotation.y += (spin + px * 0.5 - vault.rotation.y) * 0.06;
    vault.rotation.x += (-0.32 + py * 0.25 - vault.rotation.x) * 0.06;
    vault.position.y = Math.sin(t * 1.1) * 0.08;
    const pulse = 1 + Math.sin(t * 2.2) * 0.07;
    core.scale.setScalar(pulse);
    halo.scale.setScalar(1.6 * pulse);
    light.intensity = 7 + Math.sin(t * 2.2) * 2;
    for (const b of beads) {
      const a = b.phase + t * b.speed;
      b.m.position.set(Math.cos(a) * b.r, Math.sin(a * 1.3 + b.tilt) * 0.45, Math.sin(a) * b.r);
    }
    ring1.rotation.z += dt * 0.25;
    ring2.rotation.z -= dt * 0.18;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onMove);
    for (const d of [glassGeo, glassMat, edgeGeo, edgeMat, coreGeo, coreMat, beadGeo, beadMat, ringGeo, ringMat, haloMat, tex, env]) d.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
