import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const text=async path=>readFile(resolve(root,path),'utf8');

test('PWA manifest identifies standalone local-first app and valid SVG icon',async()=>{
  const manifest=JSON.parse(await text('site.webmanifest'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.ok(manifest.icons.some(i=>i.type==='image/svg+xml'));
  const icon=await text('icons/opensideline.svg');
  assert.match(icon,/^<svg/);
  assert.match(icon,/<\/svg>/);
});
test('scorer document registers manifest and icon explicitly',async()=>{
  const html=await text('apps/web/index.html');
  assert.match(html,/href="\/site\.webmanifest"/);
  assert.match(html,/href="\/icons\/opensideline\.svg"/);
});
test('service worker only caches first-party static files and supports offline shell fallback',async()=>{
  const service=await text('service-worker.js');
  assert.match(service,/target\.origin!==self\.location\.origin/);
  assert.match(service,/cache\.addAll\(SHELL\)/);
  assert.match(service,/request\.mode==='navigate'/);
  assert.match(service,/cache\.match\('\/'\)/);
  assert.ok(!service.includes("'/auth/v1"));
  assert.ok(!service.includes("'/rest/v1"));
  assert.ok(!service.includes('skipWaiting()'));
});
