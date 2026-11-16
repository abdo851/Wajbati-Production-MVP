// Generates public/icon-192.png and public/icon-512.png — luxury gold bowl icon.
// Pure Node: procedural rasterization (4x supersample) + minimal PNG encoder.
import { deflateSync } from "zlib";
import { writeFileSync } from "fs";

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
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Draw at `size`, returns RGBA buffer.
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const goldLight = [0xdd, 0xb9, 0x64];
  const goldDeep = [0xa9, 0x7f, 0x2c];
  const white = [255, 255, 255];
  const radius = size * 0.235; // squircle corner radius
  const cx = size / 2;
  const cy = size * 0.56;
  const bowlR = size * 0.265; // outer bowl radius
  const bowlRim = size * 0.2; // inner bowl radius
  const rimHalf = size * 0.023; // rim stroke half-height

  const roundedDist = (x, y) => {
    const qx = Math.abs(x - size / 2) - (size / 2 - radius);
    const qy = Math.abs(y - size / 2) - (size / 2 - radius);
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const d = roundedDist(x + 0.5, y + 0.5);
      const coverage = Math.min(1, Math.max(0, 0.5 - d)); // 1px AA edge
      if (coverage <= 0) continue;

      // diagonal gold gradient + soft top-left highlight
      const t = Math.min(1, Math.max(0, (x + (size - y)) / (2 * size)));
      let rgb = mix(goldLight, goldDeep, t);
      const hx = (x - size * 0.3) / size;
      const hy = (y - size * 0.24) / size;
      const glow = Math.max(0, 1 - Math.hypot(hx, hy) * 1.9) * 0.16;
      rgb = [rgb[0] + (255 - rgb[0]) * glow, rgb[1] + (255 - rgb[1]) * glow, rgb[2] + (255 - rgb[2]) * glow];

      // write the gold base first (opaque inside the squircle)
      buf[i] = Math.round(rgb[0]);
      buf[i + 1] = Math.round(rgb[1]);
      buf[i + 2] = Math.round(rgb[2]);
      buf[i + 3] = Math.round(255 * coverage);

      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      const dist = Math.hypot(px, py);
      const draw = (shapeCoverage, color, opacity = 1) => {
        const a = Math.min(1, shapeCoverage * opacity);
        if (a <= 0) return;
        const dstA = buf[i + 3] / 255;
        const outA = a + dstA * (1 - a);
        if (outA <= 0) return;
        buf[i] = Math.round((color[0] * a + buf[i] * dstA * (1 - a)) / outA);
        buf[i + 1] = Math.round((color[1] * a + buf[i + 1] * dstA * (1 - a)) / outA);
        buf[i + 2] = Math.round((color[2] * a + buf[i + 2] * dstA * (1 - a)) / outA);
        buf[i + 3] = Math.round(outA * 255);
      };

      // bowl: lower-half ring
      if (py >= -rimHalf) {
        if (dist <= bowlR && dist >= bowlRim) {
          draw(1, white);
        } else if (dist < bowlRim) {
          // inner bowl shading (slightly translucent white bottom)
          const inner = Math.min(1, (py + bowlRim) / (2 * bowlRim));
          draw(inner * 0.22, white);
        }
      }
      // rim bar
      if (Math.abs(py) <= rimHalf && Math.abs(px) <= bowlR + size * 0.012) {
        draw(1, white);
      }
      // steam: two wavy strokes above the rim
      for (const offset of [-size * 0.062, size * 0.062]) {
        const top = cy - rimHalf - size * 0.19;
        const hgt = size * 0.145;
        const u = y + 0.5 - top;
        if (u >= 0 && u <= hgt) {
          const wave = Math.sin((u / hgt) * Math.PI * 2) * size * 0.016;
          const sx = cx + offset + wave;
          if (Math.abs(x + 0.5 - sx) <= size * 0.0115) {
            draw(0.92, white);
          }
        }
      }
    }
  }
  return buf;
}

function downsample(src, srcSize, dstSize) {
  const factor = srcSize / dstSize;
  const out = Buffer.alloc(dstSize * dstSize * 4);
  for (let y = 0; y < dstSize; y += 1) {
    for (let x = 0; x < dstSize; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      const n = Math.round(factor);
      for (let sy = 0; sy < n; sy += 1) {
        for (let sx = 0; sx < n; sx += 1) {
          const si = (((y * n + sy) * srcSize) + (x * n + sx)) * 4;
          r += src[si]; g += src[si + 1]; b += src[si + 2]; a += src[si + 3];
        }
      }
      const count = n * n;
      const di = (y * dstSize + x) * 4;
      out[di] = Math.round(r / count);
      out[di + 1] = Math.round(g / count);
      out[di + 2] = Math.round(b / count);
      out[di + 3] = Math.round(a / count);
    }
  }
  return out;
}

for (const target of [512, 192]) {
  const ss = target * 4;
  const big = renderIcon(ss);
  const small = downsample(big, ss, target);
  writeFileSync(`public/icon-${target}.png`, encodePng(target, target, small));
  console.log(`icon-${target}.png written`);
}
