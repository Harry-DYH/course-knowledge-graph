const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2' };

function createServer({courseDir, shellDir, getBackend, getStatus}) {
  let origin;
  const server = http.createServer((req,res)=> {
    if (req.headers.host !== new URL(origin).host) { res.writeHead(403); return res.end('Invalid host'); }
    const source = req.headers.origin;
    if (source && source !== origin) { res.writeHead(403); return res.end('Invalid origin'); }
    const raw = req.url.split('?')[0];
    let pathname;
    try { pathname = decodeURIComponent(raw); } catch { res.writeHead(400); return res.end(); }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) { res.writeHead(403); return res.end(); }
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    if (pathname === '/desktop/status') { res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify(getStatus())); }
    if (pathname.startsWith('/api/course_workspace/')) {
      const target = getBackend();
      if (!target) { res.writeHead(503,{'Content-Type':'application/json'}); return res.end(JSON.stringify({detail:'请先启动课程服务'})); }
      const headers = {...req.headers,host:`127.0.0.1:${target}`,origin:'http://127.0.0.1:3015'};
      delete headers.cookie;
      const proxy = http.request({hostname:'127.0.0.1',port:target,path:req.url.slice(4),method:req.method,headers,timeout:330000},upstream=> {
        const out = {...upstream.headers}; delete out['access-control-allow-origin']; delete out['set-cookie'];
        res.writeHead(upstream.statusCode,out); upstream.pipe(res);
      });
      proxy.on('timeout',()=>proxy.destroy());
      proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({detail:'本地服务暂不可用，请检查启动状态'}));});
      req.on('aborted',()=>proxy.destroy()); req.pipe(proxy); return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const isShell=pathname==='/desktop'||pathname.startsWith('/desktop/');
    const root=isShell?shellDir:courseDir;
    const relative=isShell?(pathname.slice('/desktop/'.length)||'index.html'):pathname.slice(1);
    let filename=path.resolve(root,pathname==='/desktop'?'index.html':relative||'index.html');
    if (!filename.startsWith(path.resolve(root)+path.sep)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(filename)||!fs.statSync(filename).isFile()) {
      if (path.extname(pathname)) {res.writeHead(404);return res.end();}
      filename=path.join(root,'index.html');
    }
    if (!fs.existsSync(filename)) {res.writeHead(503);return res.end('Application assets are missing');}
    res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(filename).pipe(res);
  });
  return {server,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;resolve(origin);});})};
}
module.exports={createServer};
