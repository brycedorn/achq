/**
 * A small NBT encoder for writing Minecraft save data. Values carry their tag type explicitly, so the
 * output matches what the game writes (for example `byte` booleans, `int` lists). Long arrays are given
 * as pairs of unsigned 32-bit halves, high first, which is how packed block data is computed.
 */
export type Nbt =
  | { t: "byte"; v: number }
  | { t: "short"; v: number }
  | { t: "int"; v: number }
  | { t: "long"; v: bigint }
  | { t: "float"; v: number }
  | { t: "double"; v: number }
  | { t: "string"; v: string }
  | { t: "intArray"; v: readonly number[] }
  | { t: "longArray"; v: Uint32Array }
  | { t: "list"; of: TagName; v: readonly Nbt[] }
  | { t: "compound"; v: Readonly<Record<string, Nbt>> };

type TagName = Nbt["t"] | "end";

const ID: Record<TagName, number> = {
  end: 0, byte: 1, short: 2, int: 3, long: 4, float: 5, double: 6, string: 8, list: 9, compound: 10, intArray: 11, longArray: 12,
};

// Shorthands for building trees.
export const byte = (v: number | boolean): Nbt => ({ t: "byte", v: typeof v === "boolean" ? Number(v) : v });
export const int = (v: number): Nbt => ({ t: "int", v });
export const long = (v: number | bigint): Nbt => ({ t: "long", v: BigInt(v) });
export const float = (v: number): Nbt => ({ t: "float", v });
export const str = (v: string): Nbt => ({ t: "string", v });
export const intArray = (v: readonly number[]): Nbt => ({ t: "intArray", v });
export const list = (of: TagName, v: readonly Nbt[]): Nbt => ({ t: "list", of, v });
export const compound = (v: Record<string, Nbt>): Nbt => ({ t: "compound", v });

/** Encode a root compound (named `name`, usually empty) to uncompressed big-endian NBT. */
export function encodeNbt(root: Nbt, name = ""): Buffer {
  const parts: Buffer[] = [];
  const push = (b: Buffer): void => {
    parts.push(b);
  };
  const u8 = (n: number) => push(Buffer.from([n & 255]));
  const u16 = (n: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    push(b);
  };
  const text = (s: string) => {
    const b = Buffer.from(s, "utf8");
    u16(b.length);
    push(b);
  };
  const payload = (n: Nbt): void => {
    switch (n.t) {
      case "byte":
        return u8(n.v);
      case "short": {
        const b = Buffer.alloc(2);
        b.writeInt16BE(n.v);
        return push(b);
      }
      case "int": {
        const b = Buffer.alloc(4);
        b.writeInt32BE(n.v);
        return push(b);
      }
      case "long": {
        const b = Buffer.alloc(8);
        b.writeBigInt64BE(n.v);
        return push(b);
      }
      case "float": {
        const b = Buffer.alloc(4);
        b.writeFloatBE(n.v);
        return push(b);
      }
      case "double": {
        const b = Buffer.alloc(8);
        b.writeDoubleBE(n.v);
        return push(b);
      }
      case "string":
        return text(n.v);
      case "intArray": {
        const b = Buffer.alloc(4 + 4 * n.v.length);
        b.writeInt32BE(n.v.length);
        n.v.forEach((x, i) => b.writeInt32BE(x, 4 + 4 * i));
        return push(b);
      }
      case "longArray": {
        const b = Buffer.alloc(4 + 4 * n.v.length);
        b.writeInt32BE(n.v.length / 2);
        n.v.forEach((x, i) => b.writeUInt32BE(x >>> 0, 4 + 4 * i));
        return push(b);
      }
      case "list": {
        u8(n.v.length === 0 ? ID.end : ID[n.of]);
        const b = Buffer.alloc(4);
        b.writeInt32BE(n.v.length);
        push(b);
        for (const e of n.v) payload(e);
        return;
      }
      case "compound": {
        for (const [k, e] of Object.entries(n.v)) {
          u8(ID[e.t]);
          text(k);
          payload(e);
        }
        return u8(ID.end);
      }
    }
  };
  u8(ID[root.t]);
  text(name);
  payload(root);
  return Buffer.concat(parts);
}

/**
 * Pack palette indices into the long array Minecraft uses for block states and biomes: `bits` per entry,
 * as many whole entries per long as fit (entries never span two longs), lowest bits first. Returned as
 * high/low 32-bit halves per long.
 */
export function packIndices(indices: ArrayLike<number>, bits: number): Uint32Array {
  const perLong = Math.floor(64 / bits);
  const longs = Math.ceil(indices.length / perLong);
  const out = new Uint32Array(longs * 2);
  for (let i = 0; i < indices.length; i++) {
    const l = Math.floor(i / perLong);
    const pos = (i % perLong) * bits;
    const v = indices[i]!;
    if (pos + bits <= 32) out[l * 2 + 1]! |= v << pos;
    else if (pos >= 32) out[l * 2]! |= v << (pos - 32);
    else {
      out[l * 2 + 1]! |= v << pos;
      out[l * 2]! |= v >>> (32 - pos);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! >>> 0;
  return out;
}
