/* 极简静态文件服务器：服务统一学习平台目录，供 jsdom/浏览器验证 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/学习/体系文件/统一学习平台';
const PORT = process.env.PORT || 8765;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(ROOT, '.' + urlPath);
  const rootResolved = path.resolve(ROOT);
  if (!file.toLowerCase().startsWith(rootResolved.toLowerCase())) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(PORT, () => console.log('serving on http://127.0.0.1:' + PORT));
