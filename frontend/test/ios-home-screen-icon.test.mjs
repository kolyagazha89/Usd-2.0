import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const publicUrl = new URL('../public/', import.meta.url);
const pngSize = (buffer) => {
 assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Valid PNG signature');
 assert.equal(buffer.toString('ascii', 12, 16), 'IHDR', 'PNG IHDR must be first');
 return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
};

test('iPhone home-screen icon is the actual USD artwork with an Apple-compatible fallback', async () => {
 const [html,rootIcon,sourceIcon] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('apple-touch-icon.png', publicUrl)),
  readFile(new URL('usd/pwa-180.png', publicUrl)),
 ]);
 assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png\?v=\d+"\s*\/>/);
 assert.match(html, /<meta name="apple-mobile-web-app-title" content="USD"\s*\/>/);
 assert.deepEqual(pngSize(rootIcon), [180, 180]);
 assert.ok(rootIcon.length > 20000, 'A real detailed USD logo, not a 1-letter fallback or blank placeholder');
 assert.deepEqual(rootIcon, sourceIcon, 'Root Apple icon must remain identical to reviewed USD branding artwork');
});

test('PWA manifest and browser icon point at accessible, correctly sized brand PNG files', async () => {
 const [html,manifestText] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('manifest.webmanifest', publicUrl), 'utf8'),
 ]);
 const manifest = JSON.parse(manifestText);
 assert.equal(manifest.short_name, 'USD');
 assert.equal(manifest.display, 'standalone');
 assert.match(html, /<link rel="icon" type="image\/png" sizes="192x192" href="\/usd\/pwa-192\.png\?v=\d+"\s*\/>/);
 for(const icon of manifest.icons) {
  assert.equal(icon.type, 'image/png');
  const file = await readFile(new URL(icon.src.slice(1), publicUrl));
  const px = Number.parseInt(icon.sizes, 10);
  assert.deepEqual(pngSize(file), [px,px], 'PWA icon size must match its manifest declaration');
  assert.ok(file.length > 20000, 'A fallback initial cannot replace the USD brand logo');
 }
});
