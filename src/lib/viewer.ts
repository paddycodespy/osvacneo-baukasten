/**
 * three.js-Ansicht: Bauteil auf einem PEI-Druckbett, Z nach oben (wie gedruckt).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { MeshBody } from './worker/protocol';

export const COLORS = {
  part: 0x3566c4,
  helper: 0x9aa7ae,
  bed: 0xb88a3b,
};

function peiTexture(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b88a3b';
  g.fillRect(0, 0, s, s);
  // Pulverbeschichtung: feine helle und dunkle Sprenkel
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const l = Math.random();
    g.fillStyle = l > 0.5 ? `rgba(255,230,170,${0.10 + l * 0.18})` : `rgba(90,60,20,${0.08 + l * 0.2})`;
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

export interface Dimensions {
  height: number;
  diameter: number;
}

export class PartViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private model = new THREE.Group();
  private bed: THREE.Mesh;
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private ro: ResizeObserver;
  private disposed = false;
  private framed = false;
  private needsRender = true;
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
    this.controls.addEventListener('change', () => (this.needsRender = true));

    this.scene.add(new THREE.HemisphereLight(0xf4f7fb, 0x5b4a33, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(120, -160, 260);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
    rim.position.set(-200, 180, 90);
    this.scene.add(rim);

    const plate = new THREE.ShapeGeometry(roundedPlate(170, 12), 8);
    this.bed = new THREE.Mesh(
      plate,
      new THREE.MeshStandardMaterial({ map: peiTexture(), roughness: 0.82, metalness: 0.35, color: 0xffffff }),
    );
    // Plattenkante
    const edge = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedPlate(170, 12), { depth: 3, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0x6f5426, roughness: 0.6, metalness: 0.4 }),
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
    for (const b of bodies) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.normals, 3));
      g.setIndex(new THREE.BufferAttribute(b.indices, 1));
      g.computeBoundingBox();
      const mat = new THREE.MeshStandardMaterial({
        color: b.helper ? COLORS.helper : COLORS.part,
        roughness: b.helper ? 0.9 : 0.55,
        metalness: 0.0,
        side: THREE.DoubleSide,
        transparent: b.helper,
        opacity: b.helper ? 0.75 : 1,
        clippingPlanes: this.section ? [this.clip] : [],
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.helper = b.helper;
      mesh.visible = !b.helper || this.showHelpers;
      this.model.add(mesh);
      box.union(g.boundingBox!);
      if (!b.helper) partBox.union(g.boundingBox!);
    }
    // auf das Druckbett stellen
    this.model.position.z = -box.min.z;
    const size = partBox.getSize(new THREE.Vector3());
    if (!this.framed) this.frame(box);
    this.needsRender = true;
    return { height: size.z, diameter: Math.max(size.x, size.y) };
  }

  private frame(box: THREE.Box3) {
    const s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z);
    const target = new THREE.Vector3(0, 0, s.z * 0.45);
    const dir = new THREE.Vector3(0.52, -0.66, 0.62).normalize();
    this.camera.position.copy(target.clone().add(dir.multiplyScalar(r * 3.6 + 120)));
    this.controls.target.copy(target);
    this.framed = true;
  }

  resetView() {
    this.framed = false;
    const box = new THREE.Box3().setFromObject(this.model);
    box.translate(new THREE.Vector3(0, 0, 0));
    this.frame(box);
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

  setHelpers(on: boolean) {
    this.showHelpers = on;
    for (const c of this.model.children) c.visible = !c.userData.helper || on;
    this.needsRender = true;
  }

  dispose() {
    this.disposed = true;
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
