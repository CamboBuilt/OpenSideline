import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'apps/web'), resolve(dist, 'apps/web'), { recursive: true });
await cp(resolve(root, 'packages/scoring-engine/src'), resolve(dist, 'packages/scoring-engine/src'), { recursive: true });
const html = await readFile(resolve(root, 'apps/web/index.html'), 'utf8');
// The same app is available at / and /apps/web/; shared engine modules stay /packages/...
const index = html
  .replace('href="./src/styles.css"', 'href="/apps/web/src/styles.css"')
  .replace('src="./src/main.mjs"', 'src="/apps/web/src/main.mjs"');
await writeFile(resolve(dist, 'index.html'), index);
console.log('OpenSideline static demo built into dist/');
