const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const target = parsed.query.url;

  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Faltou o parametro ?url=');
    return;
  }

  const targetUrl = url.parse(target);
  const lib = targetUrl.protocol === 'https:' ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.path,
    method: 'GET',
    headers: {
      ...BROWSER_HEADERS,
      'Host': targetUrl.hostname,
      'Referer': targetUrl.protocol + '//' + targetUrl.hostname + '/',
    },
    timeout: 15000,
  };

  function doRequest(opts, redirectCount) {
    if (redirectCount > 5) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Muitos redirecionamentos');
      return;
    }

    const reqLib = opts.protocol === 'https:' ? https : http;

    const proxyReq = reqLib.request(opts, (proxyRes) => {
      // Segue redirecionamentos
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        const redirectUrl = url.parse(proxyRes.headers.location);
        const newOpts = {
          ...opts,
          hostname: redirectUrl.hostname || opts.hostname,
          port: redirectUrl.port || (redirectUrl.protocol === 'https:' ? 443 : 80),
          path: redirectUrl.path,
          protocol: redirectUrl.protocol || opts.protocol,
        };
        return doRequest(newOpts, redirectCount + 1);
      }

      const headers = {
        'Access-Control-Allow-Origin': '*',
      };
      if (proxyRes.headers['content-type']) headers['Content-Type'] = proxyRes.headers['content-type'];
      if (proxyRes.headers['content-length']) headers['Content-Length'] = proxyRes.headers['content-length'];

      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Timeout ao conectar no servidor');
    });

    proxyReq.on('error', (e) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Erro no proxy: ' + e.message);
      }
    });

    proxyReq.end();
  }

  doRequest({ ...options, protocol: targetUrl.protocol }, 0);
});

server.listen(PORT, () => {
  console.log('Proxy rodando na porta ' + PORT);
});
