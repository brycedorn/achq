import * as THREE from "three";
import { type Body, type Input, newBody, step } from "./controller.js";
import { Controls } from "./input.js";
import type { MeshReply, MeshRequest } from "./mesh.worker.js";
import { raycast } from "./pick.js";
import { WorldScene } from "./scene.js";
import { fetchWorld, type World } from "./world.js";

const EYE = 1.62;
const TICK = 1 / 60;
const REACH = 6;

const $ = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};
function canvasOf(id: string): HTMLCanvasElement {
  const el = $(id);
  if (!(el instanceof HTMLCanvasElement)) throw new Error(`#${id} is not a canvas`);
  return el;
}
const canvas = canvasOf("view");
const overlay = $("overlay");
const card = $("card");
const hud = $("hud");

const KEYS = "WASD move · space jump · shift down · ctrl sprint · F fly · esc release mouse";

async function pickDesign(): Promise<void> {
  const names: string[] = await (await fetch("/api/designs")).json();
  card.innerHTML = `<h1>Pick a design</h1>${names.map((n) => `<a href="#design=${encodeURIComponent(n)}">${n}</a>`).join("")}`;
}

/** Feet position and three.js yaw for a spawn anchor. Anchor yaw: 0 faces +z, 90 faces -x. */
function spawnOf(world: World): { pos: [number, number, number]; yaw: number } {
  const a = world.meta.anchors["spawn"] ?? world.meta.anchors["entrance"];
  if (!a) return { pos: [world.width / 2, world.height, world.length / 2], yaw: 0 };
  return { pos: [a.x, a.y, a.z], yaw: Math.PI - (a.yaw * Math.PI) / 180 };
}

function startMeshing(world: World, view: WorldScene, from: [number, number, number], onProgress: (done: number, total: number) => void): void {
  const worker = new Worker(new URL("./mesh.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<MeshReply>) => {
    const r = e.data;
    if ("finished" in r) {
      worker.terminate();
      onProgress(1, 1);
      return;
    }
    view.add(r.mesh);
    onProgress(r.done, r.total);
  };
  const cells = world.cells.slice();
  const req: MeshRequest = { size: world.meta.size, palette: world.meta.palette, cells, from };
  worker.postMessage(req, [cells.buffer]);
}

async function walk(name: string): Promise<void> {
  card.textContent = `Loading ${name}...`;
  const world = await fetchWorld(name);
  const view = new WorldScene(canvas);
  const controls = new Controls(view.renderer.domElement);
  const spawn = spawnOf(world);
  const body: Body = newBody(spawn.pos);
  controls.yaw = spawn.yaw;
  let prev: [number, number, number] = [...body.pos];

  let meshed = 0;
  let scripted: Partial<Input> | undefined;
  startMeshing(world, view, spawn.pos, (done, total) => (meshed = done / total));

  const showOverlay = () => {
    overlay.hidden = controls.locked || scripted !== undefined;
    card.innerHTML = `<h1>${name}</h1>${meshed < 1 ? `<progress value="${meshed}"></progress>` : ""}<div>Click to walk</div><div class="keys">${KEYS}</div>`;
  };
  document.addEventListener("pointerlockchange", showOverlay);
  // The overlay covers the canvas, so it takes the click that starts walking.
  overlay.addEventListener("click", () => controls.lock());
  overlay.style.cursor = "pointer";
  showOverlay();

  let last = performance.now();
  let acc = 0;
  let frames = 0, fps = 0, fpsAt = last;
  let lookingAt = "";
  const dir = new THREE.Vector3();

  const frame = (now: number) => {
    acc = Math.min(acc + (now - last) / 1000, 0.25);
    last = now;
    if (controls.take("KeyF")) {
      body.flying = !body.flying;
      body.vel[1] = 0;
    }
    const input = controls.locked ? controls.input() : { ...controls.input(), forward: false, back: false, left: false, right: false, jump: false, sneak: false, ...scripted };
    while (acc >= TICK) {
      prev = [...body.pos];
      step(body, input, world, TICK);
      acc -= TICK;
    }
    // Draw between the last two physics steps, so motion is smooth at any frame rate.
    const t = acc / TICK;
    const [x, y, z] = [0, 1, 2].map((i) => prev[i]! + (body.pos[i]! - prev[i]!) * t);
    view.camera.position.set(x!, y! + EYE, z!);
    view.camera.rotation.set(controls.pitch, controls.yaw, 0);

    view.camera.getWorldDirection(dir);
    const hit = raycast([x!, y! + EYE, z!], [dir.x, dir.y, dir.z], REACH, (bx, by, bz) => world.looks[world.idAt(bx, by, bz)]!.boxes);
    if (hit) {
      const boxes = world.looks[world.idAt(...hit.block)]!.boxes;
      const [bx, by, bz] = hit.block;
      view.outline({
        min: [bx + Math.min(...boxes.map((b) => b[0])), by + Math.min(...boxes.map((b) => b[1])), bz + Math.min(...boxes.map((b) => b[2]))],
        max: [bx + Math.max(...boxes.map((b) => b[3])), by + Math.max(...boxes.map((b) => b[4])), bz + Math.max(...boxes.map((b) => b[5]))],
      });
      lookingAt = `${world.stateAt(...hit.block)} at ${hit.block.join(", ")}`;
    } else {
      view.outline(undefined);
      lookingAt = "";
    }

    view.render();
    frames++;
    if (now - fpsAt >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
      const deg = ((((Math.PI - controls.yaw) * 180) / Math.PI) % 360 + 540) % 360 - 180;
      hud.textContent = [
        `${fps} fps · ${view.chunks} chunks${meshed < 1 ? ` (${Math.round(meshed * 100)}%)` : ""}`,
        `feet ${body.pos.map((v) => v.toFixed(2)).join(", ")} · yaw ${deg.toFixed(0)}${body.flying ? " · flying" : ""}`,
        lookingAt,
      ].join("\n");
      if (!controls.locked) showOverlay();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // For scripted checks: read state, place the camera, hold keys without pointer lock.
  Object.assign(window, {
    __walk: {
      stats: () => ({ fps, chunks: view.chunks, meshed, triangles: view.renderer.info.render.triangles, calls: view.renderer.info.render.calls, pos: body.pos, onGround: body.onGround, lookingAt }),
      place: (x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) => {
        body.pos = [x, y, z];
        body.vel = [0, 0, 0];
        prev = [x, y, z];
        controls.yaw = Math.PI - (yawDeg * Math.PI) / 180;
        // Minecraft pitch is positive looking down; three.js turns up for positive x rotation.
        controls.pitch = (-pitchDeg * Math.PI) / 180;
      },
      fly: (on: boolean) => (body.flying = on),
      hold: (keys: Partial<Input>) => (scripted = keys),
    },
  });
}

const design = new URLSearchParams(location.hash.slice(1)).get("design");
addEventListener("hashchange", () => location.reload());
(design ? walk(design) : pickDesign()).catch((e: unknown) => {
  overlay.hidden = false;
  card.textContent = `Cannot load: ${e instanceof Error ? e.message : String(e)}`;
});
