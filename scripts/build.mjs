import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {build} from 'esbuild';
import {compileConfigText} from './config-compiler.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/extension/', root);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

function createIcon(size) {
  const scanlines = [];
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      const cutout = Math.hypot(x - center * 1.32, y - center * 0.68);
      const moon = distance < size * 0.34 && cutout > size * 0.3;
      const star = Math.hypot(x - size * 0.7, y - size * 0.31) < Math.max(1, size * 0.045);
      const color = star ? [242, 201, 76, 255] : moon ? [232, 230, 227, 255] : [24, 26, 27, 255];
      row.set(color, 1 + x * 4);
    }
    scanlines.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(scanlines), {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await rm(output, {recursive: true, force: true});
await mkdir(new URL('popup/', output), {recursive: true});
await mkdir(new URL('onboarding/', output), {recursive: true});
await mkdir(new URL('icons/', output), {recursive: true});

await build({
  absWorkingDir: root.pathname,
  entryPoints: {
    background: 'src/background/index.ts',
    content: 'src/content/index.ts',
    'popup/popup': 'src/popup/index.ts',
  },
  bundle: true,
  format: 'esm',
  target: ['safari26'],
  outdir: output.pathname,
  minify: true,
  legalComments: 'none',
  plugins: [
    {
      name: 'compile-darkreader-configs',
      setup(buildContext) {
        buildContext.onLoad({filter: /\.config$/}, async (args) => {
          const text = await readFile(args.path, 'utf8');
          return {
            contents: JSON.stringify(compileConfigText(text)),
            loader: 'json',
          };
        });
      },
    },
  ],
});

for (const [source, destination] of [
  ['src/static/manifest.json', 'manifest.json'],
  ['src/popup/index.html', 'popup/index.html'],
  ['src/popup/popup.css', 'popup/popup.css'],
  ['src/onboarding/index.html', 'onboarding/index.html'],
  ['src/onboarding/onboarding.css', 'onboarding/onboarding.css'],
]) {
  await cp(new URL(source, root), new URL(destination, output));
}
for (const size of [16, 32, 48, 128]) {
  await writeFile(new URL(`icons/icon-${size}.png`, output), createIcon(size));
}

const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
if (manifest.version !== '0.1.0') {
  throw new Error('Built manifest version is unexpected.');
}
