// Generates every app icon from app/icon.svg (the single source of truth):
//   app/favicon.ico (16/32/48), app/apple-icon.png (180, solid navy),
//   public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png
// Run from frontend/:  node scripts/generate-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "app/icon.svg"), "utf8");
const NAVY = svg.match(/<rect[^>]*fill="(#[0-9a-f]{6})"/i)[1];
const star = svg.match(/<path[^>]*\/>/)[0];

const png = (source, size) => sharp(Buffer.from(source), { density: 72 * Math.ceil(size / 64) * 4 }).resize(size, size).png().toBuffer();

// Full-bleed navy square (no rounded corners / transparency), star scaled into
// the centre. `scale` < 1 shrinks the star, e.g. to keep it inside the maskable safe zone.
function fullBleed(scale) {
  const offset = 32 - 32 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${NAVY}"/><g transform="translate(${offset} ${offset}) scale(${scale})">${star}</g></svg>`;
}

// ICO container holding PNG-encoded images (supported by every current browser).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const favicon = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(svg, size) })));
writeFileSync(join(root, "app/favicon.ico"), ico(favicon));
writeFileSync(join(root, "app/apple-icon.png"), await png(fullBleed(0.8), 180)); // iOS rounds the corners itself
writeFileSync(join(root, "public/icon-192.png"), await png(svg, 192));
writeFileSync(join(root, "public/icon-512.png"), await png(svg, 512));
// Maskable: launchers crop to a circle/squircle; keep the star inside the 80% safe zone.
writeFileSync(join(root, "public/icon-maskable-512.png"), await png(fullBleed(0.66), 512));
console.log("icons written");
