// Draws media/icon.png: three linked nodes, the "triple" of subject, predicate and object.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 128;
const SAMPLES = 4;
const background = [30, 41, 59];
const nodes = [
  { x: 34, y: 38, r: 17, color: [96, 165, 250] },
  { x: 94, y: 38, r: 17, color: [192, 132, 252] },
  { x: 64, y: 94, r: 17, color: [74, 222, 128] },
];
const lineColor = [226, 232, 240];
const links = [
  [0, 1],
  [1, 2],
  [2, 0],
];

function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function colorAt(x, y) {
  const corner = 24;
  const cx = Math.min(Math.max(x, corner), SIZE - corner);
  const cy = Math.min(Math.max(y, corner), SIZE - corner);
  if (Math.hypot(x - cx, y - cy) > corner) return null;
  for (const node of nodes) {
    const d = Math.hypot(x - node.x, y - node.y);
    if (d <= node.r - 4) return node.color;
    if (d <= node.r) return lineColor;
  }
  if (links.some(([a, b]) => distanceToSegment(x, y, nodes[a], nodes[b]) <= 3)) return lineColor;
  return background;
}

const rows = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 4);
  for (let x = 0; x < SIZE; x++) {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const color = colorAt(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES);
        if (!color) continue;
        sum[0] += color[0];
        sum[1] += color[1];
        sum[2] += color[2];
        sum[3] += 1;
      }
    }
    const covered = sum[3];
    row.set(
      covered
        ? [sum[0] / covered, sum[1] / covered, sum[2] / covered, (255 * covered) / SAMPLES ** 2]
        : [0, 0, 0, 0],
      1 + x * 4,
    );
  }
  rows.push(row);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header.set([8, 6, 0, 0, 0], 8);

writeFileSync(
  new URL('../media/icon.png', import.meta.url),
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
