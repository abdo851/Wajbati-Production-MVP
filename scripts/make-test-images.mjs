// Generates 6 test food photos (PNG >= 100KB each) for the multi-upload E2E test.
import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const palettes = [
  [[164, 78, 50], [224, 179, 100]],
  [[92, 114, 80], [201, 162, 75]],
  [[169, 127, 44], [244, 231, 213]],
  [[140, 55, 34], [216, 155, 61]],
  [[60, 48, 36], [196, 154, 90]],
  [[178, 96, 54], [240, 220, 180]],
];

function makePhoto(index) {
  const size = 420;
  const [a, b] = palettes[index % palettes.length];
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (2 * size);
      // pseudo-random noise ensures the file stays well above 100KB after deflate
      const noise = (Math.sin(x * 12.9898 + y * 78.233 + index * 37.7) * 43758.5453) % 1;
      buf[i] = a[0] + (b[0] - a[0]) * t + noise * 24;
      buf[i + 1] = a[1] + (b[1] - a[1]) * t + noise * 24;
      buf[i + 2] = a[2] + (b[2] - a[2]) * t + noise * 24;
      buf[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    buf.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("tmp-e2e", { recursive: true });
for (let i = 0; i < 6; i += 1) {
  const png = makePhoto(i);
  writeFileSync(`tmp-e2e/img${i + 1}.png`, png);
  console.log(`img${i + 1}.png ${(png.length / 1024).toFixed(0)}KB`);
}
