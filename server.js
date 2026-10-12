/**
 * Game Tracker "Nota 11" - Node.js Localhost Server & IGDB Proxy
 * Servidor leve sem dependências externas (usa apenas módulos nativos http, https, fs, path).
 * Execução: node server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Client-ID, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 0. ROTA DE STATUS / SAÚDE DO SERVIDOR LOCAL
  if (pathname === '/api/status' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', server: 'Node.js Localhost', port: PORT, time: new Date().toISOString() }));
    return;
  }

  // 1. ROTA DE PROXY: Twitch OAuth Token (/api/twitch/token)
  if (pathname === '/api/twitch/token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { clientId, clientSecret } = JSON.parse(body || '{}');
        const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
        
        https.request(tokenUrl, { method: 'POST' }, (twitchRes) => {
          let tData = '';
          twitchRes.on('data', c => { tData += c; });
          twitchRes.on('end', () => {
            res.writeHead(twitchRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(tData);
          });
        }).on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }).end();
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Corpo JSON inválido' }));
      }
    });
    return;
  }

  // 2. ROTA DE PROXY: IGDB Games API (/api/igdb/games)
  if (pathname === '/api/igdb/games' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { clientId, accessToken, query } = JSON.parse(body || '{}');
        
        const options = {
          hostname: 'api.igdb.com',
          path: '/v4/games',
          method: 'POST',
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'text/plain',
            'Content-Length': Buffer.byteLength(query || '')
          }
        };

        const igdbReq = https.request(options, (igdbRes) => {
          let gData = '';
          igdbRes.on('data', c => { gData += c; });
          igdbRes.on('end', () => {
            res.writeHead(igdbRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(gData);
          });
        });

        igdbReq.on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });

        igdbReq.write(query || '');
        igdbReq.end();
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Corpo JSON inválido' }));
      }
    });
    return;
  }

  // 3. ROTA DE PROXY: HowLongToBeat Search API (/api/hltb/search)
  if (pathname === '/api/hltb/search') {
    let tokenCache = global.__hltbTokenCache || null;

    const fetchInitToken = () => {
      return new Promise((resolve, reject) => {
        const hltbHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Referer': 'https://howlongtobeat.com/',
          'Origin': 'https://howlongtobeat.com'
        };
        const initUrl = `https://howlongtobeat.com/api/search/site/init?t=${Date.now()}`;
        https.get(initUrl, { headers: hltbHeaders }, (iRes) => {
          let iData = '';
          iRes.on('data', c => { iData += c; });
          iRes.on('end', () => {
            try {
              const parsed = JSON.parse(iData);
              const data = {
                token: parsed.token,
                hpKey: parsed.hpKey,
                hpVal: parsed.hpVal,
                expiresAt: Date.now() + 20 * 60 * 1000
              };
              global.__hltbTokenCache = data;
              resolve(data);
            } catch(e) { reject(e); }
          });
        }).on('error', reject);
      });
    };

    const queryHltb = (terms, tokenData) => {
      return new Promise((resolve, reject) => {
        const hltbHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Referer': 'https://howlongtobeat.com/',
          'Origin': 'https://howlongtobeat.com'
        };

        const bodyObj = {
          searchType: 'games',
          searchTerms: terms,
          searchPage: 1,
          size: 10,
          searchOptions: {
            games: {
              userId: 0,
              platform: '',
              sortCategory: 'popular',
              rangeCategory: 'main',
              rangeTime: { min: null, max: null },
              gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
              rangeYear: { min: '', max: '' },
              modifier: ''
            },
            users: { sortCategory: 'postcount' },
            lists: { sortCategory: 'follows' },
            filter: '',
            sort: 0,
            randomizer: 0
          },
          useCache: true
        };
        if (tokenData && tokenData.hpKey) {
          bodyObj[tokenData.hpKey] = tokenData.hpVal;
        }

        const payloadStr = JSON.stringify(bodyObj);
        const reqOpts = {
          hostname: 'howlongtobeat.com',
          path: '/api/search/site',
          method: 'POST',
          headers: {
            ...hltbHeaders,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadStr),
            'x-auth-token': tokenData.token,
            'x-hp-key': tokenData.hpKey,
            'x-hp-val': tokenData.hpVal
          }
        };

        const searchReq = https.request(reqOpts, (sRes) => {
          let sData = '';
          sRes.on('data', c => { sData += c; });
          sRes.on('end', () => {
            if (sRes.statusCode >= 200 && sRes.statusCode < 300) {
              resolve({ statusCode: sRes.statusCode, data: sData });
            } else {
              reject(new Error(`HTTP ${sRes.statusCode}: ${sData}`));
            }
          });
        });
        searchReq.on('error', reject);
        searchReq.write(payloadStr);
        searchReq.end();
      });
    };

    const handleHltb = async (searchTitle) => {
      try {
        if (!searchTitle || !searchTitle.trim()) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Parâmetro de busca não informado', data: [] }));
          return;
        }

        // Sanitiza título
        let cleanTitle = String(searchTitle)
          .replace(/[+:\-_/\\&'"!~#@$%^*=|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const searchTerms = cleanTitle.split(/\s+/).filter(Boolean);
        if (searchTerms.length === 0) {
          searchTerms.push(searchTitle.trim());
        }

        if (!tokenCache || Date.now() >= (tokenCache.expiresAt || 0)) {
          tokenCache = await fetchInitToken();
        }

        let result = null;
        try {
          result = await queryHltb(searchTerms, tokenCache);
        } catch (queryErr) {
          // Retry with fresh token
          tokenCache = await fetchInitToken();
          result = await queryHltb(searchTerms, tokenCache);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(result.data);
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message, data: [] }));
      }
    };

    if (req.method === 'GET') {
      const q = parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('title') || '';
      handleHltb(q);
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          handleHltb(json.title || json.q || '');
        } catch(e) {
          handleHltb('');
        }
      });
      return;
    }
  }

  // 3.5. ROTA DE PROXY: Image Proxy (/api/proxy-image?url=...)
  if (pathname === '/api/proxy-image' && req.method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'URL de imagem inválida ou ausente' }));
      return;
    }

    const client = targetUrl.startsWith('https') ? https : http;
    const imgHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Referer': targetUrl,
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    };

    const fetchImg = (urlToFetch, redirectCount = 0) => {
      if (redirectCount > 4) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Muitos redirecionamentos' }));
        return;
      }

      const clientToUse = urlToFetch.startsWith('https') ? https : http;
      clientToUse.get(urlToFetch, { headers: imgHeaders, timeout: 12000 }, (imgRes) => {
        if (imgRes.statusCode >= 300 && imgRes.statusCode < 400 && imgRes.headers.location) {
          let nextUrl = imgRes.headers.location;
          if (!/^https?:\/\//i.test(nextUrl)) {
            nextUrl = new URL(nextUrl, urlToFetch).href;
          }
          fetchImg(nextUrl, redirectCount + 1);
          return;
        }

        if (imgRes.statusCode >= 400) {
          res.writeHead(imgRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: `Servidor remoto retornou HTTP ${imgRes.statusCode}` }));
          return;
        }

        const contentType = imgRes.headers['content-type'] || 'image/jpeg';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400, immutable'
        });
        imgRes.pipe(res);
      }).on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Erro ao baixar imagem: ' + err.message }));
      });
    };

    fetchImg(targetUrl);
    return;
  }

  // 4. ARQUIVOS ESTÁTICOS LOCAIS
  let cleanPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\//, ''));
  let filePath = path.join(BASE_DIR, cleanPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 - Arquivo Não Encontrado</h1><p>${cleanPath}</p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

let currentPort = Number(PORT) || 3000;
const MAX_ATTEMPTS = 50;

function startServer(portToTry, attemptsLeft = MAX_ATTEMPTS) {
  server.removeAllListeners('error');
  server.removeAllListeners('listening');

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[AVISO] A porta ${portToTry} já está em uso por outro processo.`);
      if (attemptsLeft > 0) {
        const nextPort = portToTry + 1;
        console.log(`[INFO] Tentando iniciar automaticamente na porta ${nextPort}...`);
        setTimeout(() => {
          startServer(nextPort, attemptsLeft - 1);
        }, 100);
      } else {
        console.error('\n[ERRO CRÍTICO] Não foi possível encontrar uma porta livre para iniciar o servidor local.');
        console.log('Dica: Você pode abrir a aplicação diretamente dando duplo clique em "index.html".\n');
      }
    } else {
      console.error('[ERRO] Falha inesperada no servidor HTTP:', err.message);
    }
  });

  server.once('listening', () => {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : portToTry;

    console.log('==========================================================');
    console.log(`       NOTA 11 - SERVIDOR LOCAL (LOCALHOST:${activePort})       `);
    console.log('==========================================================');
    console.log(` > URL Principal  : http://localhost:${activePort}/`);
    console.log(` > URL Alternativa: http://127.0.0.1:${activePort}/`);
    console.log(` > Proxy IGDB/Twitch ativo (/api/twitch/token, /api/igdb/games)`);
    console.log('----------------------------------------------------------');
    console.log(' Pressione Ctrl+C para encerrar.');
    console.log('==========================================================\n');

    // Abre navegador automaticamente
    const startCmd = process.platform === 'win32' ? `start http://localhost:${activePort}/` :
                     process.platform === 'darwin' ? `open http://localhost:${activePort}/` :
                     `xdg-open http://localhost:${activePort}/`;
    exec(startCmd, () => {});
  });

  try {
    server.listen(portToTry);
  } catch (err) {
    if (attemptsLeft > 0) {
      startServer(portToTry + 1, attemptsLeft - 1);
    }
  }
}

startServer(currentPort);

