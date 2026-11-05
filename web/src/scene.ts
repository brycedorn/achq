import * as THREE from "three";
import type { ChunkMesh, MeshData } from "./mesher.js";

/** Sky and fog color, sRGB. */
const SKY: [number, number, number] = [0.62, 0.78, 0.92];
export const FOG_NEAR = 80;
export const FOG_FAR = 220;

const vertexShader = /* glsl */ `
  attribute vec3 tint;
  varying vec3 vTint;
  varying float vDepth;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

// Colors stay in sRGB end to end: the vertex colors are sRGB and nothing converts them.
const fragmentShader = /* glsl */ `
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float opacity;
  varying vec3 vTint;
  varying float vDepth;
  void main() {
    float f = smoothstep(fogNear, fogFar, vDepth);
    gl_FragColor = vec4(mix(vTint, fogColor, f), opacity);
  }
`;

function material(opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      fogColor: { value: new THREE.Vector3(...SKY) },
      fogNear: { value: FOG_NEAR },
      fogFar: { value: FOG_FAR },
      opacity: { value: opacity },
    },
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export class WorldScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, FOG_FAR + 32);
  readonly renderer: THREE.WebGLRenderer;
  private readonly opaque = material(1);
  private readonly glass = material(0.55);
  private readonly highlight: THREE.LineSegments;
  chunks = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // The background is a THREE.Color, which three.js treats as sRGB like the shader's output.
    this.scene.background = new THREE.Color().setRGB(...SKY, THREE.SRGBColorSpace);
    this.camera.rotation.order = "YXZ";
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x111111 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  add(mesh: ChunkMesh): void {
    if (mesh.opaque) this.scene.add(new THREE.Mesh(geometry(mesh.opaque), this.opaque));
    if (mesh.transparent) {
      const m = new THREE.Mesh(geometry(mesh.transparent), this.glass);
      m.renderOrder = 1;
      this.scene.add(m);
    }
    this.chunks++;
  }

  /** Outline the box from `min` to `max`, or hide the outline. */
  outline(box: { min: [number, number, number]; max: [number, number, number] } | undefined): void {
    this.highlight.visible = box !== undefined;
    if (!box) return;
    const pad = 0.002;
    this.highlight.scale.set(box.max[0] - box.min[0] + pad * 2, box.max[1] - box.min[1] + pad * 2, box.max[2] - box.min[2] + pad * 2);
    this.highlight.position.set((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2);
  }

  resize(): void {
    const w = innerWidth, h = innerHeight;
    if (this.renderer.domElement.width === Math.floor(w * this.renderer.getPixelRatio()) && this.camera.aspect === w / h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.resize();
    this.renderer.render(this.scene, this.camera);
  }
}

function geometry(d: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute("tint", new THREE.BufferAttribute(d.colors, 3, true));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
}
