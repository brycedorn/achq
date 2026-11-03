import { chunkOrder, type ChunkMesh, meshChunk } from "./mesher.js";
import { looksOf } from "./world.js";

export type MeshRequest = { size: [number, number, number]; palette: string[]; cells: Uint16Array; from: [number, number, number] };
export type MeshReply = { chunk: [number, number, number]; mesh: ChunkMesh; done: number; total: number } | { finished: true };

const buffers = (m: ChunkMesh) =>
  [m.opaque, m.transparent].flatMap((d) => (d ? [d.positions.buffer, d.colors.buffer, d.indices.buffer] : []));

self.onmessage = (e: MessageEvent<MeshRequest>) => {
  const { size, palette, cells, from } = e.data;
  const world = { size, cells, looks: looksOf(palette) };
  const order = chunkOrder(size, from);
  order.forEach((chunk, i) => {
    const mesh = meshChunk(world, ...chunk);
    if (!mesh.opaque && !mesh.transparent) return;
    const reply: MeshReply = { chunk, mesh, done: i + 1, total: order.length };
    self.postMessage(reply, { transfer: buffers(mesh) });
  });
  const end: MeshReply = { finished: true };
  self.postMessage(end);
};
