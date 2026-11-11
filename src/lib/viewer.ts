/**
 * three.js-Ansicht: Bauteil auf einem PEI-Druckbett, Z nach oben (wie gedruckt).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MeshBody } from './worker/protocol';

// Farben nach osvacneo.de
export const COLORS = {
  part: 0xef453b,
  helper: 0xf2f4f5,
  bed: 0x333333,
};

function peiTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#333333';
  g.fillRect(0, 0, s, s);
  // strukturierte Druckplatte: feine helle Sprenkel auf Graphit
  for (let i = 0; i < 22000; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const l = Math.random();
    g.fillStyle = l > 0.5 ? `rgba(255,255,255,${0.03 + l * 0.07})` : `rgba(0,0,0,${0.10 + l * 0.2})`;
    g.fillRect(x, y, 1.2, 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundedPlate(w: number, r: number): THREE.Shape {
  const h = w / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-h + r, -h);
  sh.lineTo(h - r, -h);
  sh.quadraticCurveTo(h, -h, h, -h + r);
  sh.lineTo(h, h - r);
  sh.quadraticCurveTo(h, h, h - r, h);
  sh.lineTo(-h + r, h);
  sh.quadraticCurveTo(-h, h, -h, h - r);
  sh.lineTo(-h, -h + r);
  sh.quadraticCurveTo(-h, -h, -h + r, -h);
  return sh;
}

/** Kantenlänge des Druckbetts in mm */
const BED = 170;

export interface Dimensions {
  height: number;
  diameter: number;
  /** größte Ausdehnung in x oder y (für Adapter, die nicht rund sind) */
  width: number;
}

/**
 * Wortmarke „osVAC neo“ vorne links auf dem Druckbett (wie das Logo auf einer Druckplatte),
 * in den Farben der Kopfzeile: „os“ und „neo“ rot, „VAC“ himmelblau.
 */
/** Breite der Wortmarke auf dem Bett in mm (Text füllt etwa die linken 70 %) */
const LOGO_W = 62;
/**
 * Mögliche Lagen der Wortmarke (Mitte, Bettkoordinaten), in dieser Reihenfolge versucht:
 * vorne rechts, vorne links, vorne Mitte, hinten links, hinten rechts, hinten Mitte. Leserichtung bleibt gleich.
 */
const LOGO_SPOTS: [number, number][] = (() => {
  const xr = BED / 2 - 10 - LOGO_W / 2, yf = -BED / 2 + 11;
  return [[xr, yf], [-xr, yf], [0, yf], [-xr, -yf], [xr, -yf], [0, -yf]];
})();

function bedLogo(onReady: () => void): THREE.Mesh {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.font = '700 150px Poppins, sans-serif';
    g.textBaseline = 'middle';
    const parts: [string, string][] = [['os', '#ef453b'], ['VAC', '#28a3e5'], [' neo', '#ef453b']];
    let x = 8;
    for (const [t, col] of parts) {
      g.fillStyle = col;
      g.fillText(t, x, H / 2);
      x += g.measureText(t).width;
    }
    tex.needsUpdate = true;
    onReady();
  };
  draw();
  // Poppins wird erst bei Bedarf geladen: danach neu zeichnen
  document.fonts?.load('700 150px Poppins').then(draw, () => {});
  const w = LOGO_W;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, (w * H) / W),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, metalness: 0.1, depthWrite: false }),
  );
  // vordere Kante (y = −BED/2), rechts zur vorderen Ecke hin, Leserichtung zur Kamera
  m.position.set(...LOGO_SPOTS[0], 0.05);
  return m;
}

export class PartViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private model = new THREE.Group();
  private bed: THREE.Mesh;
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  /** Druckbett vergrößert, wenn der Adapter nicht auf 170 mm passt */
  private bedScale = 1;
  private ro: ResizeObserver;
  private disposed = false;
  private framed = false;
  private needsRender = true;
  private logo!: THREE.Mesh;
  private logoTimer: ReturnType<typeof setTimeout> | undefined;
  private ray = new THREE.Raycaster();
  section = false;
  showHelpers = true;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(170, -210, 150);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.96;
    this.controls.addEventListener('change', () => {
      this.needsRender = true;
      this.placeLogoSoon();
    });

    this.scene.add(new THREE.HemisphereLight(0xf4f7fb, 0x5b4a33, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(120, -160, 260);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
    rim.position.set(-200, 180, 90);
    this.scene.add(rim);

    const plate = new THREE.ShapeGeometry(roundedPlate(BED, 12), 8);
    this.bed = new THREE.Mesh(
      plate,
      new THREE.MeshStandardMaterial({ map: peiTexture(), roughness: 0.85, metalness: 0.2, color: 0xffffff }),
    );
    // Plattenkante
    const edge = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedPlate(BED, 12), { depth: 3, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.6, metalness: 0.4 }),
    );
    edge.position.z = -3.05;
    this.bed.add(edge);
    this.logo = bedLogo(() => (this.needsRender = true));
    this.bed.add(this.logo);
    this.scene.add(this.bed);
    this.scene.add(this.model);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    const loop = () => {
      if (this.disposed) return;
      requestAnimationFrame(loop);
      const moved = this.controls.update();
      if (moved || this.needsRender) {
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
      }
    };
    loop();
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  setBodies(bodies: MeshBody[]): Dimensions {
    for (const c of [...this.model.children]) {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.model.remove(m);
    }
    const box = new THREE.Box3();
    const partBox = new THREE.Box3();
    let rMax = 0;
    for (const b of bodies) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.normals, 3));
      g.setIndex(new THREE.BufferAttribute(b.indices, 1));
      g.computeBoundingBox();
      const mat = new THREE.MeshStandardMaterial({
        color: b.helper ? COLORS.helper : COLORS.part,
        roughness: b.helper ? 0.9 : 0.5,
        metalness: 0.0,
        side: THREE.DoubleSide,
        transparent: b.helper,
        opacity: b.helper ? 0.85 : 1,
        clippingPlanes: this.section ? [this.clip] : [],
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.helper = b.helper;
      mesh.visible = !b.helper || this.showHelpers;
      this.model.add(mesh);
      box.union(g.boundingBox!);
      if (!b.helper) {
        partBox.union(g.boundingBox!);
        // größter Abstand zur Achse (Bounding-Box würde z. B. Bajonettnasen bei 30° übersehen)
        const pos = b.positions;
        for (let i = 0; i < pos.length; i += 3) rMax = Math.max(rMax, Math.hypot(pos[i], pos[i + 1]));
      }
    }
    // auf das Druckbett stellen und in x/y mittig darauf (große Freiform-Adapter ragten sonst über den Rand)
    const c = box.getCenter(new THREE.Vector3());
    const snap = (v: number) => (Math.abs(v) < 0.01 ? 0 : -v);
    this.model.position.set(snap(c.x), snap(c.y), -box.min.z);
    // Druckbett mitwachsen lassen, wenn der Adapter größer ist (12 mm Rand)
    const size = partBox.getSize(new THREE.Vector3());
    const all = box.getSize(new THREE.Vector3());
    this.bedScale = Math.max(1, (Math.max(all.x, all.y) + 24) / BED);
    this.bed.scale.set(this.bedScale, this.bedScale, 1);
    if (!this.framed) this.frame(box);
    this.placeLogoSoon();
    this.needsRender = true;
    return { height: size.z, diameter: 2 * rMax, width: Math.max(size.x, size.y) };
  }

  /** Wortmarke neu setzen, sobald die Ansicht zur Ruhe gekommen ist */
  private placeLogoSoon() {
    clearTimeout(this.logoTimer);
    this.logoTimer = setTimeout(() => this.placeLogo(), 250);
  }

  /**
   * Wortmarke dorthin legen, wo das Modell sie aus der aktuellen Blickrichtung nicht verdeckt:
   * je Lage ein paar Punkte auf dem Schriftzug, Strahl von der Kamera dorthin, trifft er vorher das Modell, ist sie verdeckt.
   */
  private placeLogo() {
    if (this.disposed) return;
    const meshes = this.model.children.filter((c) => c.visible) as THREE.Mesh[];
    if (!meshes.length) return;
    this.scene.updateMatrixWorld();
    const cam = this.camera.position;
    const h = (LOGO_W * 256) / 1024;
    const visible = (spot: [number, number]) => {
      for (const fx of [-0.45, -0.15, 0.15]) {
        for (const fy of [-0.3, 0.3]) {
          // Punkt auf dem Bett (Bettkoordinaten → Welt, das Bett ist evtl. vergrößert)
          const p = this.bed.localToWorld(new THREE.Vector3(spot[0] + fx * LOGO_W, spot[1] + fy * h, 0.05));
          const dir = p.clone().sub(cam);
          const dist = dir.length();
          this.ray.set(cam, dir.normalize());
          this.ray.far = dist - 0.5;
          if (this.ray.intersectObjects(meshes, false).length) return false;
        }
      }
      return true;
    };
    const cur = LOGO_SPOTS.findIndex(([x, y]) => x === this.logo.position.x && y === this.logo.position.y);
    // aktuelle Lage behalten, solange sie frei ist (sonst springt der Schriftzug beim Drehen hin und her)
    if (cur >= 0 && visible(LOGO_SPOTS[cur])) return;
    const spot = LOGO_SPOTS.find(visible) ?? LOGO_SPOTS[0];
    this.logo.position.set(spot[0], spot[1], 0.05);
    this.needsRender = true;
  }

  /** Kamera so setzen, dass Bauteil und Druckbett vollständig und mittig im Bild sind. */
  private frame(box: THREE.Box3) {
    const all = box.clone();
    all.translate(this.model.position); // Modell steht mittig auf dem Bett
    const half = (BED * this.bedScale) / 2;
    all.union(new THREE.Box3(new THREE.Vector3(-half, -half, -3), new THREE.Vector3(half, half, 0)));
    const sphere = all.getBoundingSphere(new THREE.Sphere());
    const target = sphere.center.clone();
    const dir = new THREE.Vector3(0.52, -0.66, 0.62).normalize();
    let dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    // Ecken der Szene im Bild mittig ausrichten und auf ~78 % der Fläche skalieren
    const corners: THREE.Vector3[] = [];
    for (const x of [all.min.x, all.max.x]) for (const y of [all.min.y, all.max.y]) for (const z of [all.min.z, all.max.z]) corners.push(new THREE.Vector3(x, y, z));
    for (let it = 0; it < 4; it++) {
      this.camera.position.copy(target.clone().add(dir.clone().multiplyScalar(dist)));
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of corners) {
        const v = c.clone().project(this.camera);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      // Verschiebung der Bildmitte in Weltkoordinaten (Ebene durch das Ziel)
      const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * dist;
      const halfW = halfH * this.camera.aspect;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      target.add(right.multiplyScalar(((x0 + x1) / 2) * halfW)).add(up.multiplyScalar(((y0 + y1) / 2) * halfH));
      const extent = Math.max((x1 - x0) / 2, (y1 - y0) / 2);
      dist *= extent / 0.78;
    }
    this.camera.position.copy(target.clone().add(dir.clone().multiplyScalar(dist)));
    this.controls.target.copy(target);
    this.camera.near = dist / 50;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.framed = true;
  }

  resetView() {
    this.framed = false;
    const box = new THREE.Box3().setFromObject(this.model);
    box.translate(this.model.position.clone().negate()); // zurück in Modellkoordinaten, frame() verschiebt wieder
    this.frame(box);
    this.placeLogoSoon();
    this.needsRender = true;
  }

  setSection(on: boolean) {
    this.section = on;
    for (const c of this.model.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.clippingPlanes = on ? [this.clip] : [];
      m.needsUpdate = true;
    }
    this.needsRender = true;
  }

  /**
   * Bisheriges Modell abgeblendet zeigen, solange ein anderer Adaptertyp berechnet wird
   * (sonst steht z. B. noch der Stecker mit Druckhilfe da, obwohl schon ein Schlauchadapter gewählt ist).
   * Neue Körper aus setBodies sind wieder normal.
   */
  setDimmed(on: boolean) {
    for (const c of this.model.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (on) {
        m.userData.base ??= { transparent: m.transparent, opacity: m.opacity };
        m.transparent = true;
        m.opacity = 0.18;
        m.depthWrite = false;
      } else if (m.userData.base) {
        m.transparent = m.userData.base.transparent;
        m.opacity = m.userData.base.opacity;
        m.depthWrite = true;
      }
      m.needsUpdate = true;
    }
    this.needsRender = true;
  }

  setHelpers(on: boolean) {
    this.showHelpers = on;
    for (const c of this.model.children) c.visible = !c.userData.helper || on;
    this.needsRender = true;
  }

  dispose() {
    clearTimeout(this.logoTimer);
    this.disposed = true;
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
