import type { Anchor } from "../../generator/src/anchors.js";
import { blockLook, type BlockLook, isCube, type Shape, shapes } from "../../generator/src/blocks.js";

export type WorldMeta = {
  name: string;
  size: [number, number, number];
  /** Block states by palette id; 0 is air. */
  palette: string[];
  anchors: Record<string, Anchor>;
};

/** What the mesher needs about each palette entry. */
export type Look = BlockLook & { cube: boolean };

export function looksOf(palette: readonly string[]): Look[] {
  return palette.map((state, id) => {
    const look = blockLook(state);
    return id === 0 ? { ...look, boxes: [], occludes: false, cube: false } : { ...look, cube: isCube(look.boxes) };
  });
}

/** A design's blocks in local coordinates, x east, y up, z south. Cells index `x + z * width + y * width * length`. */
export class World {
  readonly width: number;
  readonly height: number;
  readonly length: number;
  readonly looks: Look[];
  private readonly shapeCache: (Shape[] | undefined)[] = [];
  private readonly climbable: boolean[];

  constructor(readonly meta: WorldMeta, readonly cells: Uint16Array) {
    [this.width, this.height, this.length] = meta.size;
    if (cells.length !== this.width * this.height * this.length) throw new Error(`expected ${this.width * this.height * this.length} cells, got ${cells.length}`);
    this.looks = looksOf(meta.palette);
    this.climbable = meta.palette.map((s) => /^minecraft:(ladder|vine)(\[|$)/.test(s));
  }

  idAt(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.width || y >= this.height || z >= this.length) return 0;
    return this.cells[x + z * this.width + y * this.width * this.length]!;
  }

  stateAt(x: number, y: number, z: number): string {
    return this.meta.palette[this.idAt(x, y, z)] ?? "minecraft:air";
  }

  /** The solid boxes of the block at (x, y, z), in its own coordinates. */
  shapesAt(x: number, y: number, z: number): Shape[] {
    const id = this.idAt(x, y, z);
    if (id === 0) return [];
    let s = this.shapeCache[id];
    if (!s) this.shapeCache[id] = s = shapes(this.meta.palette[id]!);
    return s;
  }

  isClimbable(x: number, y: number, z: number): boolean {
    return this.climbable[this.idAt(x, y, z)] ?? false;
  }
}

/** Fetch a design from the dev server. */
export async function fetchWorld(name: string): Promise<World> {
  const base = `/api/world/${encodeURIComponent(name)}`;
  const [metaRes, volRes] = await Promise.all([fetch(`${base}/meta.json`), fetch(`${base}/volume.bin`)]);
  if (!metaRes.ok) throw new Error(await metaRes.text());
  if (!volRes.ok) throw new Error(await volRes.text());
  const meta: WorldMeta = await metaRes.json();
  return new World(meta, new Uint16Array(await volRes.arrayBuffer()));
}
