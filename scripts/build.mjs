// Builds dist/liquid-glass.min.js from src/liquid-glass.js. The version comes from package.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { minify } from 'terser';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const src = (await readFile(new URL('../src/liquid-glass.js', import.meta.url), 'utf8'))
  .replaceAll('__VERSION__', pkg.version);

const result = await minify(src, {
  compress: { passes: 2 },
  mangle: true,
  format: { comments: /^!/ } // keep the /*! banner */
});

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/liquid-glass.min.js', import.meta.url), result.code + '\n');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`liquid-glass v${pkg.version}`);
console.log(`  src/liquid-glass.js       ${kb(Buffer.byteLength(src))}`);
console.log(`  dist/liquid-glass.min.js  ${kb(Buffer.byteLength(result.code))}`);
