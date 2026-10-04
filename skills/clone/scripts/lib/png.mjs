// @ts-check
import zlib from 'node:zlib';

/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Image  RGBA, 4 bytes a pixel */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decode a PNG to RGBA. Covers what browsers and screenshot tools write:
 * 8 and 16 bit, gray, RGB, palette, with or without alpha. Interlaced files are
 * refused with a message, since no screenshot tool writes them.
 * @param {Buffer} buf
 * @returns {Image}
 */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  /** @type {Buffer | null} */
  let palette = null;
  /** @type {Buffer | null} */
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
  }
  if (interlace) throw new Error('Interlaced PNG: save the screenshot again without interlacing');
  if (depth !== 8 && depth !== 16 && !(type === 3 && depth <= 8) && !(type === 0 && depth < 8))
    throw new Error(`Unsupported PNG bit depth ${depth}`);
  const samples = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!samples) throw new Error(`Unsupported PNG color type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPixel = samples * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const pixels = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
    prev = out;
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      /** @param {number} i sample index within the row */
      const sample = (i) => {
        if (depth === 16) return row[i * 2];
        if (depth === 8) return row[i];
        const bit = i * depth;
        const v = (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
      };
      if (type === 0) {
        const g = sample(x);
        data.set([g, g, g, 255], o);
      } else if (type === 2) {
        data.set([sample(x * 3), sample(x * 3 + 1), sample(x * 3 + 2), 255], o);
      } else if (type === 3) {
        const i = sample(x);
        const p = palette ?? Buffer.alloc(768);
        data.set([p[i * 3], p[i * 3 + 1], p[i * 3 + 2], trns && i < trns.length ? trns[i] : 255], o);
      } else if (type === 4) {
        const g = sample(x * 2);
        data.set([g, g, g, sample(x * 2 + 1)], o);
      } else {
        data.set([sample(x * 4), sample(x * 4 + 1), sample(x * 4 + 2), sample(x * 4 + 3)], o);
      }
    }
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} kind @param {Buffer} body */
function chunk(kind, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const head = Buffer.from(kind, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head, body])));
  return Buffer.concat([len, head, body, crc]);
}

/**
 * Encode RGBA as a PNG. Used for the diff heatmaps, so plain filter 0 rows are
 * enough.
 * @param {Image} img
 */
export function encodePng(img) {
  const { width, height, data } = img;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Scale to a width with box averaging, so a retina and a non-retina capture of
 * the same page compare cleanly.
 * @param {Image} img @param {number} width
 * @returns {Image}
 */
export function resizeToWidth(img, width) {
  if (img.width === width) return img;
  const scale = img.width / width;
  const height = Math.max(1, Math.round(img.height / scale));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) * scale)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) * scale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          a += img.data[i + 3];
          n++;
        }
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { width, height, data: out };
}

/** Luma per pixel, 0..255. @param {Image} img */
export function luma(img) {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2];
  }
  return out;
}

/**
 * Edge strength per pixel (Sobel). Edges say where things are without caring
 * what color they are, which is the point: a rebrand changes every color.
 * @param {Float32Array} l @param {number} w @param {number} h
 */
export function edges(l, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -l[i - w - 1] - 2 * l[i - 1] - l[i + w - 1] + l[i - w + 1] + 2 * l[i + 1] + l[i + w + 1];
      const gy = -l[i - w - 1] - 2 * l[i - w] - l[i - w + 1] + l[i + w - 1] + 2 * l[i + w] + l[i + w + 1];
      out[i] = Math.hypot(gx, gy);
    }
  return out;
}
