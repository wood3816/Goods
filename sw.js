/* 川昇叫貨系統 v1.0.6。禁止強制更新與無限重整：更新僅在使用者點選套用時跳過等待。 */
const CACHE_NAME = 'chuansheng-orders-shell-v1.0.6';
const APP_FILES = [
 './','./index.html','./css/app.css','./js/db.js','./js/app.js','./js/image.js',
 './manifest.webmanifest','./version.json','./assets/icon-192.png','./assets/icon-512.png','./assets/company-logo.png','./assets/company-logo-export.png'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_FILES)));});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('chuansheng-orders-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));})());
});
self.addEventListener('message',event=>{if(event.data?.type==='APPLY_UPDATE') self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const u=new URL(req.url);
 if(u.pathname.endsWith('/version.json'))return; // 手動查版本時要求最新資訊
 if(req.mode==='navigate'){
  event.respondWith(caches.match('./index.html').then(cached=>cached||fetch(req))); // 版本由使用者手動套用，避免線上頁面與舊程式混用
  return;
 }
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});
