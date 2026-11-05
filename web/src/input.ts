import type { Input } from "./controller.js";

const SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.01;

/** Keyboard and mouse look, with the pointer locked to the canvas once clicked. */
export class Controls {
  yaw = 0;
  pitch = 0;
  private readonly held = new Set<string>();
  /** Keys pressed since the last `take`, for toggles. */
  private readonly pressed = new Set<string>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("click", () => this.lock());
    addEventListener("keydown", (e) => {
      if (!this.locked) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.held.delete(e.code));
    addEventListener("blur", () => this.held.clear());
    document.addEventListener("pointerlockchange", () => {
      if (!this.locked) this.held.clear();
    });
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * SENSITIVITY;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - e.movementY * SENSITIVITY));
    });
  }

  /** Capture the mouse. Must run inside a click; the browser refuses for about a second after Esc. */
  lock(): void {
    if (this.locked) return;
    Promise.resolve(this.canvas.requestPointerLock()).catch((e: unknown) => console.warn("pointer lock refused:", e));
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Whether `code` was pressed since the last call for it. */
  take(code: string): boolean {
    return this.pressed.delete(code);
  }

  input(): Input {
    const h = (...codes: string[]) => codes.some((c) => this.held.has(c));
    return {
      forward: h("KeyW", "ArrowUp"),
      back: h("KeyS", "ArrowDown"),
      left: h("KeyA", "ArrowLeft"),
      right: h("KeyD", "ArrowRight"),
      jump: h("Space"),
      sneak: h("ShiftLeft", "ShiftRight"),
      sprint: h("ControlLeft", "ControlRight", "KeyR"),
      yaw: this.yaw,
    };
  }
}
