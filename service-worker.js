/* OpenSideline v0.3 alpha — cache only first-party static app files.
 * Game journals, sessions and cloud API traffic are never cached here.
 */
const CACHE='opensideline-app-v03-alpha-1';
const SHELL=[
  '/', '/site.webmanifest','/icons/opensideline.svg',
  '/apps/web/index.html','/apps/web/cloud-config.mjs',
  '/apps/web/src/styles.css','/apps/web/src/main.mjs',
  '/apps/web/src/quick-play.mjs','/apps/web/src/roster-import.mjs',
  '/apps/web/src/season-summary.mjs','/apps/web/src/cloud-sync.mjs',
  '/apps/web/src/cloud-runtime.mjs','/apps/web/src/cloud-panel.mjs',
  '/packages/scoring-engine/src/index.mjs',
  '/packages/scoring-engine/src/advancement.mjs',
  '/packages/scoring-engine/src/fielding.mjs',
  '/packages/scoring-engine/src/defensive-lineup.mjs',
  '/packages/scoring-engine/src/game-day-rules.mjs',
];
const shellPaths=new Set(SHELL);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Individual failures do not prevent installation; inspect offline test
    // results before treating a deployment as a reliable offline release.
    await Promise.allSettled(SHELL.map(url=>cache.add(url)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('opensideline-app-')&&key!==CACHE)
      .map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const target=new URL(request.url);
  if(target.origin!==self.location.origin)return; // never cache auth or Supabase calls
  const navigation=request.mode==='navigate';
  if(!navigation && (!shellPaths.has(target.pathname)||target.search))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(request);
      if(response.ok && !navigation && !target.search)await cache.put(request,response.clone());
      return response;
    }catch(error){
      const saved=await cache.match(request);
      if(saved)return saved;
      if(navigation){
        const fallback=await cache.match('/');
        if(fallback)return fallback;
        const alternate=await cache.match('/apps/web/index.html');
        if(alternate)return alternate;
      }
      throw error;
    }
  })());
});
