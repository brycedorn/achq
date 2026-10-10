import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------- block appearance ----------

const DYES = {
  white: "#e9ecec", orange: "#f07613", magenta: "#bd44b3", light_blue: "#3aafd9", yellow: "#f8c527", lime: "#70b919",
  pink: "#ed8dac", gray: "#3e4447", light_gray: "#8e8e86", cyan: "#158991", purple: "#792aac", blue: "#35399d",
  brown: "#724728", green: "#546d1b", red: "#a12722", black: "#080a0f",
};
const COLORS = {
  oak_planks: "#b8945f", spruce_planks: "#7a5a34", birch_planks: "#d7c98c", dark_oak_planks: "#42301a",
  crimson_planks: "#7b2f47", warped_planks: "#2b6e6a", jungle_planks: "#a97d55", acacia_planks: "#a8582f",
  cherry_planks: "#e4b6bd", mangrove_planks: "#7a3a3d", bamboo_planks: "#c4b04a", pale_oak_planks: "#e3d9cf",
  oak_log: "#6d5530", spruce_log: "#3b2a17", birch_log: "#d5cdb5", dark_oak_log: "#2c2013",
  stone: "#7f7f7f", stone_bricks: "#7a7a7a", smooth_stone: "#9e9e9e", cobblestone: "#808080", deepslate: "#4f4f52",
  andesite: "#888888", granite: "#956a56", diorite: "#c8c8c8", bricks: "#96534a", sandstone: "#dccf96",
  snow_block: "#f4f8f8", snow: "#f4f8f8", powder_snow: "#f0f5f5", ice: "#8fb2f0", packed_ice: "#7da5e8",
  spruce_leaves: "#2f5a2a", oak_leaves: "#4a7a2e", grass_block: "#6a9a40", dirt: "#7a5535", gravel: "#857f7c", sand: "#dbcf9b",
  water: "#3a6fd8", lava: "#e8641a", bookshelf: "#7a5a34", lectern: "#a77f4c", crafting_table: "#8d6b3d",
  glowstone: "#f5d98a", sea_lantern: "#cfe7e3", lantern: "#f6c244", soul_lantern: "#58c7d1", campfire: "#c9742a",
  glass: "#bfe3ee", tinted_glass: "#3a3340", barrel: "#7a5a34", copper_block: "#c06a4e", cut_copper: "#c06a4e",
  iron_block: "#d8d8d8", gold_block: "#f6d03e", obsidian: "#15101f", netherrack: "#6b3030",
};
const GLASSY = /(^|_)(glass|glass_pane|ice)$|stained_glass/;
const GLOWING = /^(lantern|soul_lantern|glowstone|sea_lantern|shroomlight|jack_o_lantern|torch|campfire)$/;

function hashColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.35, 0.5).getHex();
}

function colorOf(name) {
  if (COLORS[name]) return new THREE.Color(COLORS[name]).getHex();
  const base = name.replace(/_(stairs|slab|wall|fence|fence_gate|button|pressure_plate|trapdoor|door|pane)$/, "");
  for (const k of [base, `${base}_planks`, `${base}s`, `${base}_block`]) if (COLORS[k]) return new THREE.Color(COLORS[k]).getHex();
  for (const dye of Object.keys(DYES).sort((a, b) => b.length - a.length)) if (name.startsWith(`${dye}_`)) return new THREE.Color(DYES[dye]).getHex();
  return hashColor(name);
}

function parseState(state) {
  const open = state.indexOf("[");
  const name = (open === -1 ? state : state.slice(0, open)).replace(/^minecraft:/, "");
  const props = {};
  if (open !== -1) for (const pair of state.slice(open + 1, -1).split(",")) { const [k, v] = pair.split("="); props[k] = v; }
  return { name, props };
}

/** Boxes `[x0, y0, z0, x1, y1, z1]` in 0..1 for the shapes the generator places; anything else is a full cube. */
function boxesFor(name, props) {
  if (name.endsWith("_slab")) {
    if (props.type === "double") return [[0, 0, 0, 1, 1, 1]];
    return props.type === "top" ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
  }
  if (name.endsWith("_stairs")) {
    // `facing` is the side the tall part is on.
    const top = props.half === "top";
    const base = top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
    const [y0, y1] = top ? [0, 0.5] : [0.5, 1];
    const step = { north: [0, y0, 0, 1, y1, 0.5], south: [0, y0, 0.5, 1, y1, 1], west: [0, y0, 0, 0.5, y1, 1], east: [0.5, y0, 0, 1, y1, 1] }[props.facing] ?? [0, y0, 0, 1, y1, 1];
    return [base, step];
  }
  if (name.endsWith("_carpet")) return [[0, 0, 0, 1, 0.0625, 1]];
  if (name === "lantern" || name === "soul_lantern") return props.hanging === "true" ? [[0.31, 0.45, 0.31, 0.69, 0.95, 0.69]] : [[0.31, 0, 0.31, 0.69, 0.56, 0.69]];
  if (name === "lectern") return [[0, 0, 0, 1, 0.125, 1], [0.25, 0.125, 0.25, 0.75, 0.8, 0.75], [0, 0.8, 0, 1, 1, 1]];
  if (name === "glass_pane" || name.endsWith("_stained_glass_pane")) return [[0.44, 0, 0, 0.56, 1, 1]];
  return [[0, 0, 0, 1, 1, 1]];
}

// ---------- view state (kept in the URL hash so any view can be linked or re-opened) ----------

const params = new URLSearchParams(location.hash.slice(1));
const state = {
  view: params.get("view") ?? "iso",
  cut: params.has("cut") ? Number(params.get("cut")) : null, // null = default cutaway
  anchors: params.get("anchors") !== "0",
  labels: params.get("labels") === "1",
  walk: params.get("walk") === "1",
};
function saveState() {
  const p = new URLSearchParams();
  p.set("view", state.view);
  if (state.cut !== null) p.set("cut", String(state.cut));
  if (!state.anchors) p.set("anchors", "0");
  if (state.labels) p.set("labels", "1");
  if (state.walk) p.set("walk", "1");
  history.replaceState(null, "", `#${p}`);
}

// ---------- three.js setup ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const scene3 = new THREE.Scene();
scene3.background = new THREE.Color(0x14161a);
scene3.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-0.5, 1, 0.7);
scene3.add(sun);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
let controls = null;
let world = new THREE.Group();
scene3.add(world);
let data = null;
let lastJson = "";

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---------- building the scene ----------

const dummy = new THREE.Object3D();

function rebuild() {
  scene3.remove(world);
  world.traverse((o) => { o.geometry?.dispose?.(); });
  world = new THREE.Group();
  scene3.add(world);
  const [w, h, l] = data.size;

  // Blocks, grouped by material into instanced boxes.
  const groups = new Map();
  const parsed = data.palette.map(parseState);
  for (let i = 0; i < data.cells.length; i += 4) {
    const x = data.cells[i], y = data.cells[i + 1], z = data.cells[i + 2];
    if (y > cutLayer()) continue;
    const { name, props } = parsed[data.cells[i + 3]];
    const glass = GLASSY.test(name);
    const key = `${name}|${glass}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { color: colorOf(name), glass, glow: GLOWING.test(name), boxes: [] }));
    for (const b of boxesFor(name, props)) g.boxes.push([x, y, z, b]);
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  for (const g of groups.values()) {
    const material = g.glow
      ? new THREE.MeshBasicMaterial({ color: g.color })
      : new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: g.glass, opacity: g.glass ? 0.3 : 1, depthWrite: !g.glass });
    const mesh = new THREE.InstancedMesh(unit, material, g.boxes.length);
    const base = new THREE.Color(g.color);
    const tint = new THREE.Color();
    g.boxes.forEach(([x, y, z, b], n) => {
      dummy.position.set(x + (b[0] + b[3]) / 2, y + (b[1] + b[4]) / 2, z + (b[2] + b[5]) / 2);
      dummy.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      // A few percent of per-block variation so the block grid stays readable.
      const v = 1 + (((x * 7 + y * 13 + z * 3) % 5) - 2) * 0.025;
      mesh.setColorAt(n, tint.copy(base).multiplyScalar(v));
    });
    world.add(mesh);
  }

  if (state.anchors) addAnchors();
  if (state.walk) addWalkable();
}

function cutLayer() {
  if (state.cut !== null) return state.cut;
  return defaultCut();
}

/** The highest layer that still shows the interior: one below the roof (the topmost layer covering most of the footprint). */
function defaultCut() {
  const [w, h, l] = data.size;
  const counts = new Array(h).fill(0);
  for (let i = 0; i < data.cells.length; i += 4) counts[data.cells[i + 1]]++;
  for (let y = h - 1; y >= 1; y--) if (counts[y] >= 0.8 * w * l) return y - 1;
  return h - 1;
}

const STANDING = /^(desk_|lounge|meeting|library|terminal|testbench|mergestation|user|entrance|spawn|goal_atrium)/;
function kindColor(name) {
  if (name.startsWith("cam_")) return 0xc792ea;
  return STANDING.test(name) ? 0x4da3ff : 0xffb454;
}

function label(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 48;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 6; ctx.strokeStyle = "#101216"; ctx.strokeText(text, 128, 32);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`; ctx.fillText(text, 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
  sprite.scale.set(3, 0.56, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function addAnchors() {
  for (const [name, a] of Object.entries(data.anchors)) {
    const color = kindColor(name);
    const group = new THREE.Group();
    group.position.set(a.x, a.y, a.z);
    const standing = STANDING.test(name);
    if (standing) {
      // A figure-sized post from the feet up, so it is clear where the agent stands and how tall it is.
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      post.position.y = 0.9;
      group.add(post);
    } else {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color })));
    }
    // Facing: yaw 0 = +Z (south), 90 = -X (west). Cameras also pitch downward for positive pitch.
    const yaw = (a.yaw * Math.PI) / 180, pitch = ((a.pitch ?? 0) * Math.PI) / 180;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    group.add(new THREE.ArrowHelper(dir, new THREE.Vector3(0, standing ? 1.5 : 0, 0), name.startsWith("cam_") ? 2.5 : 1.1, color, 0.35, 0.22));
    if (state.labels) {
      const text = label(name, color);
      text.position.y = standing ? 2.3 : 0.7;
      group.add(text);
    }
    world.add(group);
  }
}

function addWalkable() {
  // Only cells in the visible layers: with the roof on, the roof top is "walkable" too and would drown the plan in red.
  const cells = [];
  for (let i = 0; i < data.walkable.length; i += 5) if (data.walkable[i + 1] <= cutLayer()) cells.push(data.walkable.slice(i, i + 5));
  const geo = new THREE.BoxGeometry(0.9, 0.02, 0.9);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }), cells.length);
  const c = new THREE.Color();
  cells.forEach(([x, , z, feet, reachable], i) => {
    dummy.position.set(x + 0.5, feet + 0.03, z + 0.5);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, c.set(reachable ? 0x3fb950 : 0xf85149));
  });
  mesh.renderOrder = 5;
  world.add(mesh);
}

// ---------- camera presets ----------

const VIEWS = { iso: "Iso", top: "Plan", south: "S", north: "N", east: "E", west: "W" };

function setView(name, keepControls = false) {
  state.view = name;
  const [w, h, l] = data.size;
  const c = new THREE.Vector3(w / 2, h / 3, l / 2);
  const span = Math.max(w, l);
  camera.up.set(0, 1, 0);
  // A narrow field of view for plan and elevations makes them nearly orthographic.
  const narrow = name !== "iso";
  camera.fov = narrow ? 18 : 45;
  const dist = narrow ? ((Math.max(narrow && name === "top" ? span : Math.max(span, h * 1.6), 1) / 2) / Math.tan((camera.fov * Math.PI) / 360)) * 1.15 : span * 1.45;
  const at = {
    iso: [0.55, 0.7, 0.9],
    top: [0, 1, 0.0001],
    south: [0, 0, 1], north: [0, 0, -1], east: [1, 0, 0], west: [-1, 0, 0],
  }[name];
  const v = new THREE.Vector3(...at).normalize().multiplyScalar(dist);
  camera.position.copy(c).add(v);
  if (name === "top") camera.up.set(0, 0, -1); // north at the top of the screen
  camera.updateProjectionMatrix();
  controls?.dispose();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(c);
  controls.enableDamping = false;
  controls.update();
  syncUi();
  saveState();
}

// ---------- UI ----------

const $ = (id) => document.getElementById(id);

function buildUi() {
  const views = $("views");
  for (const [key, text] of Object.entries(VIEWS)) {
    const b = document.createElement("button");
    b.textContent = text; b.dataset.view = key;
    b.onclick = () => setView(key);
    views.append(b);
  }
  for (const key of ["anchors", "labels", "walk"]) {
    $(key).checked = state[key];
    $(key).onchange = () => { state[key] = $(key).checked; rebuild(); saveState(); };
  }
  $("cut").oninput = () => { state.cut = Number($("cut").value); rebuild(); syncUi(); saveState(); };
  $("cutaway").onclick = () => { state.cut = defaultCut(); rebuild(); syncUi(); saveState(); };
  $("cutall").onclick = () => { state.cut = data.size[1] - 1; rebuild(); syncUi(); saveState(); };
}

function syncUi() {
  for (const b of $("views").children) b.classList.toggle("on", b.dataset.view === state.view);
  $("cut").max = String(data.size[1] - 1);
  $("cut").value = String(cutLayer());
  $("cutValue").textContent = `y = ${cutLayer()}`;
}

function showMeta() {
  $("title").textContent = `${data.name} v${data.version}`;
  const [w, h, l] = data.size;
  $("sub").textContent = `${w} x ${h} x ${l} blocks, ${data.cells.length / 4} placed, ${Object.keys(data.anchors).length} anchors`;
  const list = $("problems");
  list.replaceChildren();
  list.classList.toggle("ok", data.problems.length === 0);
  if (data.problems.length === 0) {
    const li = document.createElement("li");
    li.textContent = "All checks pass";
    list.append(li);
  }
  for (const p of data.problems) {
    const li = document.createElement("li");
    li.textContent = `${p.where}: ${p.message}`;
    list.append(li);
  }
}

// ---------- loading and live reload ----------

async function load(first) {
  let text;
  try {
    const res = await fetch("/scene.json", { cache: "no-store" });
    text = await res.text();
    if (!res.ok) throw new Error(text);
  } catch (e) {
    $("title").textContent = "Cannot load the design";
    $("sub").textContent = String(e.message ?? e);
    return;
  }
  if (text === lastJson) return;
  lastJson = text;
  data = JSON.parse(text);
  showMeta();
  if (first) {
    buildUi();
    rebuild();
    setView(state.view);
  } else {
    rebuild(); // keeps the camera where the user left it
    syncUi();
  }
}

await load(true);
setInterval(() => load(false), 1000);

function frame() {
  controls?.update();
  renderer.render(scene3, camera);
  requestAnimationFrame(frame);
}
frame();
window.__achq = { get data() { return data; }, setView, state }; // for scripted checks
