import { gzipSync } from "node:zlib";
import { type Compound, type NBT, type String as NbtString, writeUncompressed } from "prismarine-nbt";

const str = (value: string): NbtString => ({ type: "string", value });
const intList = (value: number[]): Compound["value"][string] => ({ type: "list", value: { type: "int", value } });

/** Conservative default: WorldEdit upgrades older data versions, but rejects newer ones. */
export const DEFAULT_DATA_VERSION = 4325;

const AIR = "minecraft:air";

/** Volumes up to this many cells keep their air in the structure file. */
const SMALL_VOLUME = 250_000;

/** A dense block grid in local coordinates, x east, y up, z south. */
export class Volume {
  private readonly palette = new Map<string, number>([[AIR, 0]]);
  /** States by palette id, so lookups by id are direct. */
  private readonly states: string[] = [AIR];
  private readonly cells: Uint16Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly length: number,
  ) {
    this.cells = new Uint16Array(width * height * length);
  }

  private index(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.length) {
      throw new RangeError(`(${x}, ${y}, ${z}) is outside ${this.width}x${this.height}x${this.length}`);
    }
    return x + z * this.width + y * this.width * this.length;
  }

  set(x: number, y: number, z: number, state: string): void {
    let id = this.palette.get(state);
    if (id === undefined) {
      id = this.palette.size;
      this.palette.set(state, id);
      this.states.push(state);
    }
    this.cells[this.index(x, y, z)] = id;
  }

  get(x: number, y: number, z: number): string {
    return this.states[this.cells[this.index(x, y, z)]!] ?? AIR;
  }

  /** Palette id of the block at (x, y, z); 0 is air. Out-of-volume cells read as air. */
  idAt(x: number, y: number, z: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.length) return 0;
    return this.cells[x + z * this.width + y * this.width * this.length]!;
  }

  /** The block state for a palette id. */
  stateOf(id: number): string {
    return this.states[id] ?? AIR;
  }

  /** Number of distinct block states placed so far, air included. */
  get paletteSize(): number {
    return this.states.length;
  }

  /** Every non-air block as `[x, y, z, state]`, in index order. */
  *blocks(): Generator<[number, number, number, string]> {
    const states = Array.from(this.palette.keys());
    for (let i = 0; i < this.cells.length; i++) {
      const id = this.cells[i]!;
      if (id === 0) continue;
      const x = i % this.width;
      const z = Math.floor(i / this.width) % this.length;
      const y = Math.floor(i / (this.width * this.length));
      yield [x, y, z, states[id]!];
    }
  }

  /** Fill an inclusive box. Corners may be given in any order. */
  fill(a: Vec3, b: Vec3, state: string): void {
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++)
        for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) this.set(x, y, z, state);
  }

  toSchem(dataVersion = DEFAULT_DATA_VERSION): Buffer {
    const palette: Record<string, { type: "int"; value: number }> = {};
    for (const [state, id] of this.palette) palette[state] = { type: "int", value: id };

    const data = Array.from(varints(this.cells), (b) => (b > 127 ? b - 256 : b));

    const root: NBT = {
      type: "compound",
      name: "",
      value: {
        Schematic: {
          type: "compound",
          value: {
            Version: { type: "int", value: 3 },
            DataVersion: { type: "int", value: dataVersion },
            Width: { type: "short", value: this.width },
            Height: { type: "short", value: this.height },
            Length: { type: "short", value: this.length },
            Offset: { type: "intArray", value: [0, 0, 0] },
            Blocks: {
              type: "compound",
              value: {
                Palette: { type: "compound", value: palette },
                Data: { type: "byteArray", value: data },
              },
            },
          },
        },
      },
    };
    return gzipSync(writeUncompressed(root, "big"));
  }

  /**
   * Vanilla structure template (`.nbt`), loadable with a structure block or `/place template`. Air is
   * written for small volumes, so a load clears the area; for large volumes it is left out, which
   * keeps the file and the load small but means the area must already be clear.
   *
   * Written by hand into one buffer: a landscape has millions of blocks, and an object per block
   * would not fit in memory. The layout is the one `prismarine-nbt` produces for the same tree, which
   * the tests check, so small files are byte-for-byte what they were.
   */
  toStructure(dataVersion = DEFAULT_DATA_VERSION, includeAir = this.cells.length <= SMALL_VOLUME): Buffer {
    const head: Buffer[] = [];
    const u16 = (n: number) => Buffer.from([(n >> 8) & 255, n & 255]);
    const i32 = (n: number) => {
      const b = Buffer.alloc(4);
      b.writeInt32BE(n);
      return b;
    };
    /** A tag header: its type byte, then its name. */
    const tag = (type: number, name: string) => Buffer.concat([Buffer.from([type]), u16(Buffer.byteLength(name)), Buffer.from(name)]);
    const string = (name: string, value: string) => Buffer.concat([tag(8, name), u16(Buffer.byteLength(value)), Buffer.from(value)]);
    const intList = (name: string, values: number[]) => Buffer.concat([tag(9, name), Buffer.from([3]), i32(values.length), ...values.map(i32)]);

    head.push(Buffer.from([10, 0, 0])); // the unnamed root compound
    head.push(tag(3, "DataVersion"), i32(dataVersion));
    head.push(intList("size", [this.width, this.height, this.length]));
    head.push(tag(9, "palette"), Buffer.from([10]), i32(this.states.length));
    for (const state of this.states) {
      const { name, properties } = parseState(state);
      head.push(string("Name", name));
      const props = Object.entries(properties);
      if (props.length > 0) {
        head.push(tag(10, "Properties"));
        for (const [k, v] of props) head.push(string(k, v));
        head.push(Buffer.from([0]));
      }
      head.push(Buffer.from([0]));
    }

    let count = 0;
    if (includeAir) count = this.cells.length;
    else for (let i = 0; i < this.cells.length; i++) if (this.cells[i] !== 0) count++;
    head.push(tag(9, "blocks"), Buffer.from([10]), i32(count));

    // Each block: a `pos` list of three ints, a `state` int, and the end of the compound (36 bytes).
    const POS = Buffer.concat([tag(9, "pos"), Buffer.from([3]), i32(3)]);
    const STATE = tag(3, "state");
    const body = Buffer.allocUnsafe(count * (POS.length + 12 + STATE.length + 4 + 1));
    let at = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const id = this.cells[i]!;
      if (id === 0 && !includeAir) continue;
      POS.copy(body, at);
      at += POS.length;
      body.writeInt32BE(i % this.width, at);
      body.writeInt32BE(Math.floor(i / (this.width * this.length)), at + 4);
      body.writeInt32BE(Math.floor(i / this.width) % this.length, at + 8);
      at += 12;
      STATE.copy(body, at);
      at += STATE.length;
      body.writeInt32BE(id, at);
      at += 4;
      body[at++] = 0;
    }
    return gzipSync(Buffer.concat([...head, body.subarray(0, at), Buffer.from([0])]));
  }
}


/** Split `minecraft:oak_stairs[facing=north,half=bottom]` into a name and its properties. */
export function parseState(state: string): { name: string; properties: Record<string, string> } {
  const open = state.indexOf("[");
  if (open === -1) return { name: state, properties: {} };
  const props = state.slice(open + 1, state.endsWith("]") ? -1 : undefined);
  const properties: Record<string, string> = {};
  for (const pair of props.split(",")) {
    const [key, value] = pair.split("=");
    if (key && value !== undefined) properties[key.trim()] = value.trim();
  }
  return { name: state.slice(0, open), properties };
}

export type Vec3 = readonly [number, number, number];

/** Unsigned LEB128, as the Sponge schematic `Data` array requires. */
export function varints(values: Iterable<number>): number[] {
  const out: number[] = [];
  for (let v of values) {
    while (v > 127) {
      out.push((v & 127) | 128);
      v >>>= 7;
    }
    out.push(v);
  }
  return out;
}
