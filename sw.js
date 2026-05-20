/**
 * sw.js  ―  Cookie Clicker Service Worker
 * =========================================
 * 戦略:
 *  - HTML / CSS / JS は stale-while-revalidate (即返却 + 裏で更新)
 *  - 画像・音声は cache-first (容量が大きいので積極キャッシュ)
 *  - その他は network-first
 *  - manifest 更新時は CACHE_VERSION を上げる
 */

var CACHE_VERSION = 'cc-mod-v3';
var CORE_CACHE    = CACHE_VERSION + '-core';
var ASSET_CACHE   = CACHE_VERSION + '-assets';

/* 最小限のコアアセット (起動に必須なもの) */
var CORE_URLS = [
  './',
  './index.html',
  './style.css?v=10c',
  './style-mobile.css?v=1',
  './main.js?v=13g',
  './base64.js',
  './mod-loader.js',
  './pwa.js',
  './mods/mod-manifest.json',
  './mods/time-factory.js',
  './mods/dungeon-explorer.js',
  './mods/smart-helper.js',
  './mods/achievements/time-factory.json',
  './mods/achievements/dungeon-explorer.json',
  './manifest.json'
];

/* ============================================================
   install: コアアセットを事前キャッシュ
============================================================ */
self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CORE_CACHE).then(function (cache) {
      return Promise.all(
        CORE_URLS.map(function (url) {
          return cache.add(url).catch(function (e) {
            // 個別のフェッチ失敗は無視（ネットワーク状況で起こりうる）
            console.warn('[SW] cache.add 失敗:', url, e);
          });
        })
      );
    })
  );
});

/* ============================================================
   activate: 古いキャッシュ削除
============================================================ */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k.indexOf(CACHE_VERSION) !== 0) return caches.delete(k);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

/* ============================================================
   fetch
============================================================ */
function isAssetRequest(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico|mp3|ogg|wav|woff2?|ttf|otf|eot)(\?|$)/i.test(url);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // GET以外はそのまま素通し
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // クロスオリジン (Google Fonts等) はそのまま素通し
  if (url.origin !== self.location.origin) return;

  // 画像・音声: cache-first
  if (isAssetRequest(url.pathname)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          if (cached) return cached;
          return fetch(req).then(function (resp) {
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
          }).catch(function () { return cached; });
        });
      })
    );
    return;
  }

  // HTML/JS/CSS/JSON: stale-while-revalidate
  event.respondWith(
    caches.open(CORE_CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (resp) {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        }).catch(function () {
          return cached;  // オフライン
        });
        // 即返却 (キャッシュ済みなら) して裏で更新
        return cached || network;
      });
    })
  );
});

/* ============================================================
   skipWaiting メッセージ
============================================================ */
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
