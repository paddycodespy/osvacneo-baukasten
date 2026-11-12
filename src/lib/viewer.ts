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
  /** Schnitt je Körper (Freiform: Ebene durch die Mittellinie des Bausteins), sonst die gemeinsame Ebene */
  private planes: ((name: string) => { p: [number, number, number]; n: [number, number, number] } | null) | null = null;
  section = false;
  showHelpers = true;
  /** Plaketten A/B/C an den Enden (HTML über der Vorschau, folgen Drehen und Zoomen) */
  private markers: { el: HTMLElement; p: THREE.Vector3; t: THREE.Vector3; r: number }[] = [];
  private markerLayer: HTMLElement;
  private ray = new THREE.Raycaster();
  /** Bereiche über der Vorschau (Kopfzeile, Werkzeuge, Fußzeile): dort keine Plaketten */
  markerAvoid: HTMLElement[] = [];

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);
    this.markerLayer = document.createElement('div');
    this.markerLayer.className = 'end-markers';
    host.appendChild(this.markerLayer);

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(170, -210, 150);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.96;
    this.controls.addEventListener('change', () => {
      this.needsRender = true;
      // Sichtbereich an den Abstand anpassen: beim Heranzoomen sonst zu wenig Tiefengenauigkeit (Flackern) bzw. abgeschnittene Teile
      const d = this.camera.position.distanceTo(this.controls.target);
      const near = d / 50, far = d * 20;
      if (Math.abs(near - this.camera.near) > near * 0.05) {
        this.camera.near = near;
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
      }
      // Schnitt je Körper: abgeschnittene Seite folgt der Kamera
      if (this.section && this.planes) for (const c of this.model.children) this.clipFor(c as THREE.Mesh);
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
      // etwas nach hinten versetzt: die Unterseite des Modells liegt genau auf dem Bett (z = 0); ohne Versatz
      // flackern beide Flächen gegeneinander (im Schnitt als schwarze Striche an der Unterkante sichtbar)
      new THREE.MeshStandardMaterial({ map: peiTexture(), roughness: 0.85, metalness: 0.2, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 64 }),
    );
    // Plattenkante
    const edge = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedPlate(BED, 12), { depth: 3, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.6, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 128 }),
    );
    edge.position.z = -3.05;
    this.bed.add(edge);
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
        this.placeMarkers();
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
        clippingPlanes: [],
        // Stoßflächen zwischen zwei Körpern liegen genau aufeinander und flackern im Schnitt: je Körper ein winziger,
        // fester Tiefenversatz, damit immer dieselbe Fläche vorne liegt
        polygonOffset: true,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: Math.min(this.model.children.length, 48),
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = b.name;
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
    if (this.section) this.setSection(true);
    this.needsRender = true;
    return { height: size.z, diameter: 2 * rMax, width: Math.max(size.x, size.y) };
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
    this.needsRender = true;
  }

  /** Freiform: Schnittebene je Körper (Modellkoordinaten); null = eine gemeinsame Ebene durch die Mitte */
  setSectionPlanes(fn: ((name: string) => { p: [number, number, number]; n: [number, number, number] } | null) | null) {
    this.planes = fn;
    if (this.section) this.setSection(true);
  }

  /** Schnittebene eines Körpers in Weltkoordinaten; abgeschnitten wird die Seite zur Kamera (wie bei der gemeinsamen Ebene) */
  private clipFor(m: THREE.Mesh): THREE.Plane {
    const d = this.planes?.(m.name);
    if (!d) return this.clip;
    const plane = (m.userData.clip as THREE.Plane | undefined) ?? new THREE.Plane();
    m.userData.clip = plane;
    const p = new THREE.Vector3(...d.p).add(this.model.position);
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(...d.n).normalize(), p);
    const want = Math.sign(this.clip.distanceToPoint(this.camera.position)) || 1;
    if (Math.sign(plane.distanceToPoint(this.camera.position)) !== want) plane.negate();
    return plane;
  }

  setSection(on: boolean) {
    this.section = on;
    for (const c of this.model.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.clippingPlanes = on ? [this.clipFor(c as THREE.Mesh)] : [];
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

  /**
   * Plaketten an den Enden setzen. p: Mitte der Endfläche, t: Richtung aus dem Adapter heraus, r: Außenradius des Endes
   * (Koordinaten wie die Körper). Die Plakette sitzt seitlich neben der Öffnung (zur Bildschirmseite hin), beim Ende
   * auf dem Bett knapp darüber. active: hervorgehobenes Ende (gerade bearbeitet).
   */
  setMarkers(list: { id: string; p: [number, number, number]; t: [number, number, number]; r: number }[], active: string | null) {
    for (const m of this.markers) m.el.remove();
    this.markers = list.map((x) => {
      const el = document.createElement('span');
      el.className = 'end-marker' + (x.id === active ? ' active' : '');
      el.textContent = x.id;
      el.setAttribute('aria-hidden', 'true');
      this.markerLayer.appendChild(el);
      return { el, p: new THREE.Vector3(...x.p), t: new THREE.Vector3(...x.t).normalize(), r: x.r };
    });
    this.needsRender = true;
  }

  /** Plaketten auf den Bildschirm projizieren; vom Modell verdeckte werden blasser */
  private placeMarkers() {
    if (!this.markers.length) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const meshes = this.model.children;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    for (const m of this.markers) {
      // seitlich: Bildschirm-rechts, senkrecht zur Achse des Endes (blickt man genau in die Öffnung, nach oben)
      let side = right.clone().addScaledVector(m.t, -right.dot(m.t));
      if (side.lengthSq() < 0.05) side = up.clone().addScaledVector(m.t, -up.dot(m.t));
      side.normalize();
      const onBed = m.t.z < -0.9;
      const wp = m.p.clone().addScaledVector(m.t, onBed ? -4 : 2).addScaledVector(side, m.r + 8).add(this.model.position);
      const q = wp.clone().project(this.camera);
      const off = q.z > 1 || q.x < -1.1 || q.x > 1.1 || q.y < -1.1 || q.y > 1.1;
      m.el.style.display = off ? 'none' : '';
      if (off) continue;
      const sx = ((q.x + 1) / 2) * w, sy = ((1 - q.y) / 2) * h;
      const host = this.host.getBoundingClientRect();
      const under = this.markerAvoid.some((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && sx + 12 > r.left - host.left && sx - 12 < r.right - host.left && sy + 12 > r.top - host.top && sy - 12 < r.bottom - host.top;
      });
      m.el.style.display = under ? 'none' : '';
      if (under) continue;
      m.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      const dir = wp.clone().sub(this.camera.position);
      const dist = dir.length();
      this.ray.set(this.camera.position, dir.normalize());
      this.ray.far = dist - 1;
      m.el.classList.toggle('behind', this.ray.intersectObjects(meshes, false).length > 0);
    }
  }

  dispose() {
    this.disposed = true;
    for (const m of this.markers) m.el.remove();
    this.markerLayer.remove();
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
