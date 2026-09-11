/* 风电标准学习平台 · Service Worker（PWA 离线缓存） */
const CACHE_VERSION = 'unified-v2';
const CACHE_NAME = 'wind-learning-' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './data/meta.js',
  './data/gbt46154/ch01.js',
  './data/gbt46154/ch02.js',
  './data/gbt46154/ch03.js',
  './data/gbt46154/ch04.js',
  './data/gbt46154/ch05.js',
  './data/gbt46154/ch06.js',
  './data/gbt46154/ch07.js',
  './data/gbt46154/ch08.js',
  './data/gbt46154/ch09.js',
  './data/gbt46154/ch10.js',
  './data/gbt46154/ch11.js',
  './data/gbt46154/ch12.js',
  './data/gbt46154/ch13.js',
  './data/gbt46154/ch14.js',
  './data/gbt46154/fill.js',
  './data/gbt46154/kb.js',
  './data/nbt11773/ch01.js',
  './data/nbt11773/ch02.js',
  './data/nbt11773/ch03.js',
  './data/nbt11773/ch04.js',
  './data/nbt11773/ch05.js',
  './data/nbt11773/ch06.js',
  './data/nbt11773/ch07.js',
  './data/nbt11773/ch08.js',
  './data/nbt11773/ch09.js',
  './data/nbt11773/fill.js',
  './data/nbt11773/kb.js',
  './data/nbt10991/ch01.js',
  './data/nbt10991/ch02.js',
  './data/nbt10991/ch03.js',
  './data/nbt10991/ch04.js',
  './data/nbt10991/ch05.js',
  './data/nbt10991/ch06.js',
  './data/nbt10991/ch07.js',
  './data/nbt10991/ch08.js',
  './data/nbt10991/ch09.js',
  './data/nbt10991/ch10.js',
  './data/nbt10991/ch11.js',
  './data/nbt10991/ch12.js',
  './data/nbt10991/ch13.js',
  './data/nbt10991/ch14.js',
  './data/nbt10991/fill.js',
  './data/nbt10991/kb.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k.indexOf('wind-learning-') === 0 && k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(event.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
