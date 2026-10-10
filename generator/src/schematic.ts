import { gzipSync } from "node:zlib";
import { type Compound, type NBT, type String as NbtString, writeUncompressed } from "prismarine-nbt";

const str = (value: string): NbtString => ({ type: "string", value });
const intList = (value: number[]): Compound["value"][string] => ({ type: "list", value: { type: "int", value } });

/** Conservative default: WorldEdit upgrades older data versions, but rejects newer ones. */
export const DEFAULT_DATA_VERSION = 4325;

const AIR = "minecraft:air";

/** A dense block grid in local coordinates, x east, y up, z south. */
export class Volume {
  private readonly palette = new Map<string, number>([[AIR, 0]]);
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
    }
    this.cells[this.index(x, y, z)] = id;
  }

  get(x: number, y: number, z: number): string {
    const id = this.cells[this.index(x, y, z)];
    for (const [state, i] of this.palette) if (i === id) return state;
    return AIR;
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

  /** Vanilla structure template (`.nbt`), loadable with a structure block. Air is written so a load clears the area. */
  toStructure(dataVersion = DEFAULT_DATA_VERSION): Buffer {
    const palette = Array.from(this.palette.keys(), (state): Compound["value"] => {
      const { name, properties } = parseState(state);
      const entry: Compound["value"] = { Name: str(name) };
      if (Object.keys(properties).length > 0) {
        entry["Properties"] = {
          type: "compound",
          value: Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, str(v)])),
        };
      }
      return entry;
    });

    const blocks = Array.from(this.cells, (id, i): Compound["value"] => {
      const x = i % this.width;
      const z = Math.floor(i / this.width) % this.length;
      const y = Math.floor(i / (this.width * this.length));
      return { pos: intList([x, y, z]), state: { type: "int", value: id } };
    });

    const root: NBT = {
      type: "compound",
      name: "",
      value: {
        DataVersion: { type: "int", value: dataVersion },
        size: intList([this.width, this.height, this.length]),
        palette: { type: "list", value: { type: "compound", value: palette } },
        blocks: { type: "list", value: { type: "compound", value: blocks } },
      },
    };
    return gzipSync(writeUncompressed(root, "big"));
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
