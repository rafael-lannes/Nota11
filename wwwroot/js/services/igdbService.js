/**
 * Game Tracker "Nota 11" - IGDB.com (Twitch) API Integration Service
 * Permite buscar capas oficiais em alta definição (t_cover_big, t_720p, t_1080p),
 * gêneros e metadados direto da base oficial do IGDB (Internet Game Database).
 * Suporte para execução via servidor local (C# EmbeddedServer), localhost ou direto no navegador via proxies CORS.
 */

(function (window) {
  'use strict';

  const IGDB_CONFIG = {
    TWITCH_TOKEN_URL: 'https://id.twitch.tv/oauth2/token',
    IGDB_BASE_URL: 'https://api.igdb.com/v4',
    DEFAULT_PROXIES: [
      'https://corsproxy.io/?url=',
      'https://api.allorigins.win/raw?url='
    ]
  };

  let _isLocalProxyChecked = false;
  let _workingLocalProxyBase = null;
  const _searchCache = new Map();

  /**
   * Helper para chamar endpoints locais no backend C# EmbeddedServer
   * Executado apenas em ambiente desktop local / WebView2, evitando timeouts na web.
   */
  async function callLocalProxy(endpoint, postData) {
    if (typeof window !== 'undefined' && window.location) {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isWebView2 = Boolean(window.chrome && window.chrome.webview);
      // Se estiver rodando na web HTTPS (GitHub Pages), não existe servidor local
      if (!isLocalHost && !isWebView2 && window.location.protocol === 'https:') {
        return null;
      }
    }

    if (_isLocalProxyChecked && !_workingLocalProxyBase) {
      return null;
    }

    const candidateBases = [];
    if (_workingLocalProxyBase) {
      candidateBases.push(_workingLocalProxyBase);
    } else {
      candidateBases.push('');
      if (typeof window !== 'undefined' && window.location) {
        if (window.location.origin && window.location.origin !== 'null') {
          candidateBases.push(window.location.origin);
        }
      }
      candidateBases.push('http://127.0.0.1:3000', 'http://localhost:3000');
    }

    for (const base of candidateBases) {
      try {
        const cleanBase = base ? base.replace(/\/+$/, '') : '';
        const url = `${cleanBase}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(postData),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const rawText = await resp.text();
          if (!rawText || rawText.trim() === '') continue;
          try {
            const parsed = JSON.parse(rawText);
            if (parsed && !parsed.error) {
              _workingLocalProxyBase = base;
              _isLocalProxyChecked = true;
              return parsed;
            }
          } catch (e) {}
        }
      } catch (err) {
        // Tenta próxima base local
      }
    }

    _isLocalProxyChecked = true;
    return null;
  }

  class IgdbService {
    /**
     * Verifica se uma URL de capa é um SVG gerado/placeholder ou vazia
     * @param {string} url
     * @returns {boolean}
     */
    static isPlaceholderCover(url) {
      if (!url) return true;
      const str = String(url).trim();
      if (str === '') return true;
      if (str.startsWith('data:image/svg+xml')) return true;
      if (str.includes('placeholder')) return true;
      return false;
    }

    /**
     * Limpa o título do jogo removendo termos de versão e normalizando espaços
     * @param {string} title
     * @returns {string}
     */
    static cleanSearchTitle(title) {
      if (!title) return '';
      return String(title)
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/[:\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    /**
     * Remove acentos e diacríticos de um texto (ex: Pokémon -> Pokemon, Ragnarök -> Ragnarok)
     * @param {string} str
     * @returns {string}
     */
    static normalizeDiacritics(str) {
      if (!str) return '';
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    /**
     * Gera lista de variações de títulos para busca resiliente no IGDB
     * @param {string} rawTitle
     * @returns {string[]}
     */
    static generateSearchCandidates(rawTitle) {
      if (!rawTitle) return [];
      const trimmed = String(rawTitle).trim();
      if (!trimmed) return [];

      const candidates = new Set();
      candidates.add(trimmed);

      // 1. Título sem diacríticos
      const asciiTitle = this.normalizeDiacritics(trimmed);
      if (asciiTitle) candidates.add(asciiTitle);

      // 2. Título limpo de tags entre parênteses/colchetes (ex: "Resident Evil 4 (2023)" -> "Resident Evil 4")
      const noTags = trimmed.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      if (noTags) {
        candidates.add(noTags);
        candidates.add(this.normalizeDiacritics(noTags));
      }

      // 3. Título sem pontuações especiais (: - . ' ! ?)
      const noPunct = trimmed.replace(/[:\-_/\\#@!?,.'"]/g, ' ').replace(/\s+/g, ' ').trim();
      if (noPunct) {
        candidates.add(noPunct);
        candidates.add(this.normalizeDiacritics(noPunct));
      }

      // 4. Se tiver subtítulo (separado por : ou -), adiciona o título principal
      if (trimmed.includes(':') || trimmed.includes(' - ')) {
        const parts = trimmed.split(/[:\-]/);
        const prefix = parts[0].trim();
        if (prefix && prefix.length >= 3) {
          candidates.add(prefix);
          candidates.add(this.normalizeDiacritics(prefix));
        }
      }

      // 5. Conversão de Algarismos Romanos <-> Números Arábicos (ex: "Final Fantasy VII" <-> "Final Fantasy 7")
      const romanToNum = [
        [/\bX\b/gi, '10'],
        [/\bIX\b/gi, '9'],
        [/\bVIII\b/gi, '8'],
        [/\bVII\b/gi, '7'],
        [/\bVI\b/gi, '6'],
        [/\bIV\b/gi, '4'],
        [/\bV\b/gi, '5'],
        [/\bIII\b/gi, '3'],
        [/\bII\b/gi, '2']
      ];

      for (const [romanRegex, numStr] of romanToNum) {
        if (romanRegex.test(trimmed)) {
          const converted = trimmed.replace(romanRegex, numStr).trim();
          candidates.add(converted);
          candidates.add(this.normalizeDiacritics(converted));
        }
      }

      const numToRoman = [
        [/\b10\b/g, 'X'],
        [/\b9\b/g, 'IX'],
        [/\b8\b/g, 'VIII'],
        [/\b7\b/g, 'VII'],
        [/\b6\b/g, 'VI'],
        [/\b5\b/g, 'V'],
        [/\b4\b/g, 'IV'],
        [/\b3\b/g, 'III'],
        [/\b2\b/g, 'II']
      ];

      for (const [numRegex, romanStr] of numToRoman) {
        if (numRegex.test(trimmed)) {
          const converted = trimmed.replace(numRegex, romanStr).trim();
          candidates.add(converted);
          candidates.add(this.normalizeDiacritics(converted));
        }
      }

      return Array.from(candidates).filter(c => c && c.length > 0);
    }

    /**
     * Formata URLs de imagem do IGDB com resolução personalizada
     * @param {string} imageId - ID da imagem no IGDB (ex: co1r7f)
     * @param {string} [size='t_cover_big'] - Tamanho: 't_cover_big', 't_720p', 't_1080p', 't_thumb'
     * @returns {string}
     */
    static formatImageUrl(imageId, size = 't_cover_big') {
      if (!imageId) return '';
      return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
    }

    /**
     * Obtém ou renova automaticamente o token de acesso OAuth2 do Twitch/IGDB
     * @param {string} clientId
     * @param {string} clientSecret
     * @param {string} [storedToken]
     * @param {number} [storedExpiry]
     * @returns {Promise<{ accessToken: string, expiresIn: number }>}
     */
    static async getAccessToken(clientId, clientSecret, storedToken = '', storedExpiry = 0) {
      const cleanClientId = (clientId || '').trim();
      const cleanClientSecret = (clientSecret || '').trim();

      if (!cleanClientId) {
        throw new Error('IGDB: Informe o Client ID do Twitch/IGDB.');
      }

      // Se já temos um token válido e não expirado (com margem de segurança de 5 minutos)
      const now = Date.now();
      if (storedToken && storedExpiry && now < (storedExpiry - 300000)) {
        return { accessToken: storedToken, expiresIn: Math.round((storedExpiry - now) / 1000) };
      }

      if (!cleanClientSecret) {
        if (storedToken) {
          return { accessToken: storedToken, expiresIn: 3600 };
        }
        throw new Error('IGDB: Informe o Client Secret do Twitch para gerar o token de acesso.');
      }

      // 1. Tenta obter o token via endpoint local no backend C# EmbeddedServer
      const localResult = await callLocalProxy('/api/twitch/token', {
        clientId: cleanClientId,
        clientSecret: cleanClientSecret
      });

      if (localResult && localResult.access_token) {
        return {
          accessToken: localResult.access_token,
          expiresIn: localResult.expires_in || 3600
        };
      }

      // 2. Requisição direta ou com proxies CORS ao endpoint da Twitch
      const targetUrl = `${IGDB_CONFIG.TWITCH_TOKEN_URL}?client_id=${encodeURIComponent(cleanClientId)}&client_secret=${encodeURIComponent(cleanClientSecret)}&grant_type=client_credentials`;
      const proxies = ['', ...IGDB_CONFIG.DEFAULT_PROXIES];
      let lastError = null;

      for (const proxy of proxies) {
        try {
          const finalUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const resp = await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!resp.ok) {
            if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
              throw new Error('IGDB/Twitch: Client ID ou Client Secret incorretos. Verifique suas credenciais no Twitch Developer Console.');
            }
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
          }

          const rawText = await resp.text();
          const data = JSON.parse(rawText);

          if (data && data.access_token) {
            return {
              accessToken: data.access_token,
              expiresIn: data.expires_in || 3600
            };
          } else if (data && data.message) {
            throw new Error(`Twitch OAuth: ${data.message}`);
          }
        } catch (err) {
          lastError = err;
          if (err.message && err.message.includes('Client ID ou Client Secret incorretos')) {
            throw err;
          }
        }
      }

      throw lastError || new Error('Não foi possível conectar ao serviço de autenticação do Twitch/IGDB.');
    }

    /**
     * Executa uma consulta APICalypse no endpoint /games do IGDB
     * @param {string} query - Query em sintaxe APICalypse
     * @param {string} clientId
     * @param {string} accessToken
     * @param {string} [customProxy]
     * @returns {Promise<any[]>}
     */
    static async fetchIgdbGames(query, clientId, accessToken, customProxy = '') {
      const cleanClientId = (clientId || '').trim();
      const cleanToken = (accessToken || '').trim();

      if (!cleanClientId || !cleanToken) {
        throw new Error('IGDB: Client ID e Access Token são obrigatórios.');
      }

      // 1. Tenta endpoint local no backend C# EmbeddedServer
      const localResult = await callLocalProxy('/api/igdb/games', {
        clientId: cleanClientId,
        accessToken: cleanToken,
        query: query
      });

      if (localResult) {
        if (Array.isArray(localResult)) {
          // Verifica se o array não contém mensagem de erro de autenticação do IGDB
          if (localResult.length > 0 && localResult[0] && localResult[0].status && localResult[0].status >= 400) {
            const err = new Error(localResult[0].title || 'IGDB: Erro na consulta');
            if (localResult[0].status === 401 || localResult[0].status === 403) err.isAuthError = true;
            throw err;
          }
          return localResult;
        } else if (localResult.message || localResult.error) {
          if (String(localResult.message || localResult.error).includes('401') || String(localResult.message || localResult.error).includes('403')) {
            const err = new Error('IGDB: Token de acesso ou Client ID expirado/inválido.');
            err.isAuthError = true;
            throw err;
          }
        }
      }

      // 2. Requisição direta e via proxies CORS
      const targetUrl = `${IGDB_CONFIG.IGDB_BASE_URL}/games`;
      const proxies = [];
      if (customProxy && customProxy.trim()) {
        proxies.push(customProxy.trim());
      }
      proxies.push(''); // Tentativa direta
      proxies.push(...IGDB_CONFIG.DEFAULT_PROXIES);

      let lastError = null;

      for (const proxy of proxies) {
        try {
          const finalUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const headers = {
            'Client-ID': cleanClientId,
            'Authorization': `Bearer ${cleanToken}`,
            'Accept': 'application/json'
          };

          const fetchOptions = {
            method: 'POST',
            headers: headers,
            body: query,
            signal: controller.signal
          };

          const resp = await fetch(finalUrl, fetchOptions);
          clearTimeout(timeoutId);

          if (!resp.ok) {
            if (resp.status === 401 || resp.status === 403) {
              const err = new Error('IGDB: Token de acesso ou Client ID expirado/inválido.');
              err.isAuthError = true;
              throw err;
            }
            if (resp.status === 404) return [];
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
          }

          const rawText = await resp.text();
          if (!rawText || rawText.trim() === '') return [];

          const data = JSON.parse(rawText);
          if (Array.isArray(data)) {
            if (data.length > 0 && data[0] && data[0].status && data[0].status >= 400) {
              const err = new Error(data[0].title || 'IGDB: Erro na consulta');
              if (data[0].status === 401 || data[0].status === 403) err.isAuthError = true;
              throw err;
            }
            return data;
          } else if (data && data.message) {
            throw new Error(`IGDB: ${data.message}`);
          }
          return [];
        } catch (err) {
          lastError = err;
          if (err.isAuthError) throw err;
          console.warn(`[IGDB] Tentativa com "${proxy || 'Direto'}" falhou:`, err.message);
        }
      }

      throw lastError || new Error('Não foi possível conectar à API do IGDB.');
    }

    /**
     * Transforma um objeto bruto do IGDB no formato padronizado do Nota 11
     * @param {Object} game
     * @param {string} platformName
     * @returns {Object|null}
     */
    static parseIgdbGameItem(game, platformName = '') {
      if (!game || !game.name) return null;

      const gameTitle = game.name;
      let gameGenreList = [];
      let gameGenre = '';
      if (game.genres && Array.isArray(game.genres) && game.genres.length > 0) {
        gameGenreList = game.genres.map(g => g.name).filter(Boolean);
        if (typeof window !== 'undefined' && window.StorageService && typeof window.StorageService.formatGenres === 'function') {
          gameGenre = window.StorageService.formatGenres(gameGenreList);
        } else {
          gameGenre = gameGenreList.join(' • ');
        }
      }

      let releaseYear = null;
      if (game.first_release_date) {
        try {
          releaseYear = new Date(game.first_release_date * 1000).getFullYear();
        } catch (e) {
          releaseYear = null;
        }
      }

      let gamePlatform = platformName;
      if (game.platforms && Array.isArray(game.platforms) && game.platforms.length > 0) {
        const platNames = game.platforms.map(p => p.name);
        if (!gamePlatform || gamePlatform === 'Outra Plataforma') {
          gamePlatform = platNames[0] || 'Console / PC';
        }
      }

      const candidateCovers = [];
      let bestCoverUrl = '';

      if (game.cover && game.cover.image_id) {
        const imgId = game.cover.image_id;
        candidateCovers.push({
          type: 'cover-1080p',
          url: this.formatImageUrl(imgId, 't_1080p'),
          label: 'Capa HD 1080p (IGDB)',
          priority: 1
        });
        candidateCovers.push({
          type: 'cover-big',
          url: this.formatImageUrl(imgId, 't_cover_big'),
          label: 'Capa Oficial (IGDB)',
          priority: 2
        });
        candidateCovers.push({
          type: 'cover-720p',
          url: this.formatImageUrl(imgId, 't_720p'),
          label: 'Capa 720p (IGDB)',
          priority: 3
        });
        bestCoverUrl = this.formatImageUrl(imgId, 't_cover_big');
      } else if (game.cover && game.cover.url) {
        const formatted = game.cover.url.replace('t_thumb', 't_cover_big').replace(/^\/\//, 'https://');
        candidateCovers.push({
          type: 'cover-url',
          url: formatted,
          label: 'Capa Oficial (IGDB)',
          priority: 2
        });
        bestCoverUrl = formatted;
      }

      if (game.artworks && Array.isArray(game.artworks)) {
        game.artworks.slice(0, 3).forEach((art, idx) => {
          if (art.image_id) {
            candidateCovers.push({
              type: 'artwork',
              url: this.formatImageUrl(art.image_id, 't_720p'),
              label: `Arte Oficial #${idx + 1}`,
              priority: 5 + idx
            });
          }
        });
      }

      if (game.screenshots && Array.isArray(game.screenshots)) {
        game.screenshots.slice(0, 2).forEach((scr, idx) => {
          if (scr.image_id) {
            candidateCovers.push({
              type: 'screenshot',
              url: this.formatImageUrl(scr.image_id, 't_720p'),
              label: `Screenshot #${idx + 1}`,
              priority: 8 + idx
            });
          }
        });
      }

      return {
        id: String(game.id || ''),
        title: gameTitle,
        platform: gamePlatform,
        genre: gameGenre,
        genres: gameGenreList,
        releaseYear,
        coverUrl: bestCoverUrl,
        candidateCovers,
        source: 'IGDB'
      };
    }

    /**
     * Ordena resultados de busca priorizando títulos exatos, correspondência de plataforma e capas válidas
     * @param {Array} results
     * @param {string} rawTitle
     * @param {string} [platformName]
     * @returns {Array}
     */
    static sortResults(results, rawTitle, platformName = '') {
      if (!results || results.length === 0) return [];

      const cleanTarget = this.cleanSearchTitle(rawTitle).toLowerCase();
      const normTarget = this.normalizeDiacritics((rawTitle || '').toLowerCase());

      const isPlatformMatch = (gamePlat, targetPlat) => {
        if (!targetPlat) return false;
        const p1 = (gamePlat || '').toLowerCase();
        const p2 = targetPlat.toLowerCase();
        if (p1.includes(p2)) return true;
        if ((p2.includes('pc') || p2.includes('computador') || p2.includes('windows')) && 
            (p1.includes('pc') || p1.includes('windows') || p1.includes('computador') || p1.includes('microsoft windows'))) return true;
        if (p2.includes('ps5') || p2.includes('playstation 5')) return p1.includes('ps5') || p1.includes('playstation 5');
        if (p2.includes('ps4') || p2.includes('playstation 4')) return p1.includes('ps4') || p1.includes('playstation 4');
        if (p2.includes('ps3') || p2.includes('playstation 3')) return p1.includes('ps3') || p1.includes('playstation 3');
        if (p2.includes('xbox')) {
          if (p2.includes('series') && p1.includes('series')) return true;
          if (p2.includes('one') && p1.includes('one')) return true;
          if (p2.includes('360') && p1.includes('360')) return true;
        }
        if (p2.includes('switch') && p1.includes('switch')) return true;
        return false;
      };

      return results.slice().sort((a, b) => {
        const cleanA = this.cleanSearchTitle(a.title).toLowerCase();
        const cleanB = this.cleanSearchTitle(b.title).toLowerCase();
        const normA = this.normalizeDiacritics((a.title || '').toLowerCase());
        const normB = this.normalizeDiacritics((b.title || '').toLowerCase());

        // 1. Título limpo idêntico (ex: "Call of duty Modern Warfare 4" == "Call of Duty: Modern Warfare 4")
        const exactCleanA = cleanA === cleanTarget ? 1 : 0;
        const exactCleanB = cleanB === cleanTarget ? 1 : 0;
        if (exactCleanA !== exactCleanB) return exactCleanB - exactCleanA;

        // 2. Título exato original
        const exactA = normA === normTarget ? 1 : 0;
        const exactB = normB === normTarget ? 1 : 0;
        if (exactA !== exactB) return exactB - exactA;

        // 3. Inicia com o título pesquisado
        const startsA = normA.startsWith(normTarget) || cleanA.startsWith(cleanTarget) ? 1 : 0;
        const startsB = normB.startsWith(normTarget) || cleanB.startsWith(cleanTarget) ? 1 : 0;
        if (startsA !== startsB) return startsB - startsA;

        // 4. Possui capa oficial válida (não é placeholder ou sem capa)
        const hasCoverA = a.coverUrl && !a.coverUrl.includes('nocover') ? 1 : 0;
        const hasCoverB = b.coverUrl && !b.coverUrl.includes('nocover') ? 1 : 0;
        if (hasCoverA !== hasCoverB) return hasCoverB - hasCoverA;

        // 5. Correspondência com a plataforma selecionada no formulário
        if (platformName) {
          const platStrA = a.platform || (Array.isArray(a.platforms) ? a.platforms.join(' ') : '');
          const platStrB = b.platform || (Array.isArray(b.platforms) ? b.platforms.join(' ') : '');
          const matchA = isPlatformMatch(platStrA, platformName) ? 1 : 0;
          const matchB = isPlatformMatch(platStrB, platformName) ? 1 : 0;
          if (matchA !== matchB) return matchB - matchA;
        }

        // 6. Preferência por jogos principais (com ano de lançamento definido)
        const yearA = a.releaseYear ? 1 : 0;
        const yearB = b.releaseYear ? 1 : 0;
        if (yearA !== yearB) return yearB - yearA;

        // 7. Relevância por número de plataformas (jogos comerciais de maior escala)
        const platCountA = Array.isArray(a.platforms) ? a.platforms.length : (a.platform ? a.platform.split('•').length : 0);
        const platCountB = Array.isArray(b.platforms) ? b.platforms.length : (b.platform ? b.platform.split('•').length : 0);
        if (platCountA !== platCountB) return platCountB - platCountA;

        return 0;
      });
    }

    /**
     * Pesquisa jogos diretamente na base web do IGDB via Web Reader (r.jina.ai)
     * Não requer credenciais nem OAuth da Twitch e funciona 100% no navegador (GitHub Pages).
     * @param {string} title
     * @param {string} [platformName]
     * @returns {Promise<Array>}
     */
    static async searchIgdbWeb(title, platformName = '') {
      if (!title || !String(title).trim()) return [];

      const cleanTitle = String(title)
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/[^\w\s\-\:]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanTitle) return [];

      const targetUrl = `https://www.igdb.com/search?type=1&q=${encodeURIComponent(cleanTitle)}`;
      const jinaUrl = `https://r.jina.ai/${targetUrl}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const resp = await fetch(jinaUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/plain, text/markdown, */*',
            'x-engine': 'direct',
            'x-timeout': '5'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!resp.ok) return [];

        const body = await resp.text();
        if (!body || body.trim() === '' || body.includes('404 Not Found') || body.includes('Page Not Found')) {
          return [];
        }

        const blocks = body.split(/(?=\[!\[Image \d+: Cover of )/);
        const results = [];
        const seenSlugs = new Set();

        for (const block of blocks) {
          const imgMatch = block.match(/https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_([a-z0-9_]+)\/([a-z0-9_]+)\.(jpg|png|webp)/i);
          const gameLinkMatch = block.match(/\[([^\]]+)\]\(https:\/\/www\.igdb\.com\/games\/([a-z0-9_\-]+)\)/);
          if (!imgMatch || !gameLinkMatch) continue;

          const imgId = imgMatch[2];
          const slug = gameLinkMatch[2];
          if (seenSlugs.has(slug)) continue;
          seenSlugs.add(slug);

          const titleFull = gameLinkMatch[1].trim();
          const yearMatch = titleFull.match(/\((\d{4})\)$/);
          const gameTitle = yearMatch ? titleFull.replace(/\s*\(\d{4}\)$/, '').trim() : titleFull;
          const releaseYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

          const platforms = [...block.matchAll(/\[([^\]]+)\]\(https:\/\/www\.igdb\.com\/top-100\/games\/platform\/[^)]+\)/g)].map(m => m[1]);
          const platformDisplay = platforms.length > 0 ? platforms.slice(0, 3).join(' • ') : 'Multiplataforma';

          const hasCover = imgId && imgId !== 'nocover';
          const coverUrl = hasCover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imgId}.jpg` : '';

          const candidateCovers = [];
          if (hasCover) {
            candidateCovers.push({
              type: 'cover-big',
              url: `https://images.igdb.com/igdb/image/upload/t_cover_big/${imgId}.jpg`,
              label: 'Capa Oficial',
              priority: 1
            });
            candidateCovers.push({
              type: 'cover-1080p',
              url: `https://images.igdb.com/igdb/image/upload/t_1080p/${imgId}.jpg`,
              label: 'HD 1080p',
              priority: 2
            });
            candidateCovers.push({
              type: 'cover-720p',
              url: `https://images.igdb.com/igdb/image/upload/t_720p/${imgId}.jpg`,
              label: '720p',
              priority: 3
            });
          }

          results.push({
            id: slug,
            slug: slug,
            title: gameTitle,
            releaseYear: releaseYear,
            platform: platformDisplay,
            platforms: platforms,
            genre: '',
            genres: [],
            coverUrl: coverUrl,
            candidateCovers: candidateCovers,
            source: 'IGDB'
          });
        }

        return results;
      } catch (err) {
        console.warn('[searchIgdbWeb] Falhou:', err);
        return [];
      }
    }

    /**
     * Fallback via Steam Store Search com URLs seguras e resiliência de capas
     * @param {string} title
     * @param {string} [platformName]
     * @returns {Promise<Array>}
     */
    static async searchSteam(title, platformName = '') {
      try {
        const steamTitle = this.cleanSearchTitle(title);
        if (!steamTitle) return [];

        const steamUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(steamTitle)}&l=portuguese&cc=BR`;
        const proxies = [
          'https://corsproxy.io/?url=',
          'https://api.allorigins.win/raw?url='
        ];

        if (typeof window !== 'undefined' && (window.chrome?.webview || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          proxies.unshift('');
        }

        for (const proxy of proxies) {
          try {
            const finalUrl = proxy ? `${proxy}${encodeURIComponent(steamUrl)}` : steamUrl;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const resp = await fetch(finalUrl, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
            clearTimeout(timeoutId);

            if (resp.ok) {
              const sData = await resp.json();
              if (sData && sData.items && sData.items.length > 0) {
                const steamResults = [];
                for (const item of sData.items.slice(0, 10)) {
                  const appId = item.id;
                  const itemTitle = item.name;
                  if (!appId) continue;

                  // header.jpg e capsule_616x353.jpg são garantidos para qualquer app da Steam Store
                  const headerImg = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
                  const capsuleImg = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`;
                  const libraryHero = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`;
                  const libraryCover = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;

                  steamResults.push({
                    id: `steam_${appId}`,
                    title: itemTitle,
                    platform: platformName || 'PC',
                    genre: '',
                    genres: [],
                    releaseYear: null,
                    coverUrl: libraryCover,
                    fallbackCoverUrl: headerImg,
                    source: 'Steam',
                    candidateCovers: [
                      { type: 'cover-vertical-hd', url: libraryHero, label: 'Capa Vertical HD (Steam)', priority: 1, fallbackUrl: headerImg },
                      { type: 'cover-vertical', url: libraryCover, label: 'Capa Vertical (Steam)', priority: 2, fallbackUrl: headerImg },
                      { type: 'cover-header', url: headerImg, label: 'Banner Horizontal (Steam)', priority: 3 },
                      { type: 'cover-capsule', url: capsuleImg, label: 'Cápsula Store (Steam)', priority: 4 }
                    ]
                  });
                }
                if (steamResults.length > 0) return steamResults;
              }
            }
          } catch (e) {}
        }
      } catch (steamErr) {
        console.warn('[Steam Search] Falhou:', steamErr);
      }
      return [];
    }

    /**
     * Pesquisa jogos no IGDB pelo título e plataforma com estratégia multi-query e fallbacks inteligentes
     * @param {string} title - Título do jogo
     * @param {string} [platformName] - Nome da plataforma
     * @param {Object} credentials - { clientId, clientSecret, accessToken, tokenExpiry, proxyUrl }
     * @returns {Promise<Array<{ id: string, title: string, platform: string, genre: string, releaseYear: number|null, coverUrl: string, candidateCovers: Array<{ type: string, url: string, label: string, priority: number }> }>>}
     */
    static async searchGames(title, platformName = '', credentials = {}) {
      if (!title || !String(title).trim()) return [];

      const rawTitle = String(title).trim();
      const cacheKey = `${rawTitle.toLowerCase()}:::${(platformName || '').toLowerCase().trim()}`;
      if (_searchCache.has(cacheKey)) {
        return _searchCache.get(cacheKey);
      }

      const saveCacheAndReturn = (results) => {
        if (results && results.length > 0) {
          if (_searchCache.size >= 60) {
            const oldestKey = _searchCache.keys().next().value;
            _searchCache.delete(oldestKey);
          }
          _searchCache.set(cacheKey, results);
        }
        return results;
      };

      const candidates = this.generateSearchCandidates(rawTitle);

      const clientId = (credentials.clientId || credentials.ssid || '').trim();
      const clientSecret = (credentials.clientSecret || credentials.sspassword || '').trim();
      let accessToken = (credentials.accessToken || '').trim();
      let tokenExpiry = credentials.tokenExpiry || 0;

      const resultsMap = new Map();

      // 1. Tenta API Oficial do IGDB se credenciais foram fornecidas
      if (clientId && (clientSecret || accessToken)) {
        try {
          const auth = await this.getAccessToken(clientId, clientSecret, accessToken, tokenExpiry);
          accessToken = auth.accessToken;
          tokenExpiry = Date.now() + (auth.expiresIn * 1000);

          const fields = 'fields id, name, summary, cover.url, cover.image_id, genres.name, platforms.name, first_release_date, artworks.url, artworks.image_id, screenshots.url, screenshots.image_id;';

          for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            const escaped = cand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const querySearch = `${fields} search "${escaped}"; limit 15;`;
            try {
              const rawGames = await this.fetchIgdbGames(querySearch, clientId, accessToken, credentials.proxyUrl);
              if (rawGames && Array.isArray(rawGames) && rawGames.length > 0) {
                for (const g of rawGames) {
                  const parsed = this.parseIgdbGameItem(g, platformName);
                  if (parsed && !resultsMap.has(parsed.id)) {
                    resultsMap.set(parsed.id, parsed);
                  }
                }
              }
            } catch (qErr) {
              if (qErr.isAuthError) throw qErr;
            }

            if (resultsMap.size >= 5) break;
          }
        } catch (igdbErr) {
          console.warn('[IGDB] API oficial falhou ou sem resposta, acionando busca web IGDB:', igdbErr);
          if (igdbErr.isAuthError) {
            // Continua para o leitor web do IGDB para garantir busca com sucesso!
          }
        }
      }

      // Se encontrou via API oficial, retorna ordenado
      if (resultsMap.size > 0) {
        return saveCacheAndReturn(this.sortResults(Array.from(resultsMap.values()), rawTitle, platformName));
      }

      // 2. Busca direta no IGDB via Web Reader (alta velocidade, sem OAuth, capas oficiais IGDB)
      try {
        const webResults = await this.searchIgdbWeb(rawTitle, platformName);
        if (webResults && webResults.length > 0) {
          return saveCacheAndReturn(this.sortResults(webResults, rawTitle, platformName));
        }
      } catch (webErr) {
        console.warn('[IGDB Web Search] Falhou:', webErr);
      }

      // 3. Fallback: ScreenScraper API (somente se credenciais foram configuradas)
      const ssid = (credentials.ssid || '').trim();
      const devid = (credentials.devid || '').trim();
      if (ssid || devid) {
        try {
          if (typeof window !== 'undefined' && window.ScreenScraperService && typeof window.ScreenScraperService.searchGames === 'function') {
            const ssResults = await window.ScreenScraperService.searchGames(rawTitle, platformName, credentials);
            if (ssResults && ssResults.length > 0) {
              return saveCacheAndReturn(ssResults.map(item => ({
                ...item,
                source: 'ScreenScraper',
                genres: typeof window.StorageService !== 'undefined' ? window.StorageService.parseGenres(item.genre) : (item.genre ? [item.genre] : [])
              })));
            }
          }
        } catch (ssErr) {
          console.warn('[ScreenScraper Fallback] Falhou:', ssErr);
        }
      }

      // 4. Fallback final: Steam Store Search API
      try {
        const steamResults = await this.searchSteam(rawTitle, platformName);
        if (steamResults && steamResults.length > 0) {
          return saveCacheAndReturn(steamResults);
        }
      } catch (steamErr) {
        console.warn('[Steam Fallback] Falhou:', steamErr);
      }

      return [];
    }

    /**
     * Busca a melhor capa para um único jogo de forma direta
     * @param {string} title
     * @param {string} platformName
     * @param {Object} credentials
     * @returns {Promise<{ coverUrl: string, genre: string, genres: string[], title: string, releaseYear: number|null, candidateCovers: Array }|null>}
     */
    static async getBestCoverForGame(title, platformName = '', credentials = {}) {
      const results = await this.searchGames(title, platformName, credentials);
      if (results && results.length > 0) {
        return results[0];
      }
      return null;
    }

    /**
     * Busca os gêneros oficiais de um jogo no IGDB
     * @param {string} title
     * @param {string} [platformName]
     * @param {Object} [credentials]
     * @returns {Promise<{ title: string, genre: string, genres: string[] }|null>}
     */
    static async fetchGameGenres(title, platformName = '', credentials = {}) {
      const results = await this.searchGames(title, platformName, credentials);
      if (results && results.length > 0) {
        const best = results[0];
        if (best.genre || (best.genres && best.genres.length > 0)) {
          return {
            title: best.title,
            genre: best.genre,
            genres: best.genres || []
          };
        }
      }
      return null;
    }

    /**
     * Busca dados oficiais diretamente da página web do IGDB via leitor proxy CORS (r.jina.ai).
     * Não requer credenciais do Twitch nem sofre com bloqueios de CORS em navegadores.
     * @param {string} slugOrUrl - Slug ou URL completa do jogo no IGDB
     * @param {string} [platformName] - Nome da plataforma
     * @returns {Promise<{ id: string, title: string, platform: string, genre: string, genres: string[], coverUrl: string, candidateCovers: Array, source: string }|null>}
     */
    static async fetchGameViaWebReader(slugOrUrl, platformName = '') {
      if (!slugOrUrl) return null;
      let cleanSlug = String(slugOrUrl).trim();
      if (!cleanSlug) return null;

      if (cleanSlug.includes('/games/')) {
        const parts = cleanSlug.split('/games/');
        cleanSlug = parts[1].split('/')[0].split('?')[0].split('#')[0].trim();
      }
      cleanSlug = cleanSlug.replace(/^(id\s*[:=]?\s*|#)/i, '').trim();
      if (!cleanSlug) return null;

      const targetUrl = `https://www.igdb.com/games/${encodeURIComponent(cleanSlug)}`;
      const jinaUrl = `https://r.jina.ai/${targetUrl}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(jinaUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/plain, text/markdown, */*',
            'x-engine': 'direct',
            'x-timeout': '5'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const body = await response.text();
        if (!body || body.trim() === '' || body.includes('404 Not Found') || body.includes('Page Not Found')) {
          return null;
        }

        // 1. Extrai Título Oficial
        let title = '';
        const titleMatch = body.match(/Title:\s*(.+)/i);
        if (titleMatch) {
          title = titleMatch[1]
            .replace(/\s*\|\s*IGDB\.com/i, '')
            .replace(/\s*\(\d{4}\)\s*$/, '')
            .trim();
        }

        // 2. Extrai Capa e Imagens (todas as capas e artes do IGDB presentes no texto)
        const candidateCovers = [];
        let bestCoverUrl = '';

        const imageMatches = [...body.matchAll(/https:\/\/images\.igdb\.com\/igdb\/image\/upload\/(t_[a-z0-9_]+|[^/]+)\/([a-z0-9_]+)\.(jpg|jpeg|png|webp)/gi)];
        const seenImageIds = new Set();

        for (const match of imageMatches) {
          const imgId = match[2];
          if (!seenImageIds.has(imgId)) {
            seenImageIds.add(imgId);
            const coverBig = `https://images.igdb.com/igdb/image/upload/t_cover_big/${imgId}.jpg`;
            if (!bestCoverUrl) {
              bestCoverUrl = coverBig;
            }
            candidateCovers.push({
              type: candidateCovers.length === 0 ? 'cover-main' : 'artwork',
              url: coverBig,
              label: candidateCovers.length === 0 ? 'Capa Oficial (IGDB)' : `Arte IGDB #${candidateCovers.length}`,
              priority: candidateCovers.length + 1
            });
          }
        }

        // 3. Extrai Gêneros
        let genreList = [];
        const genreSectionMatch = body.match(/\*\*Genre(?:s)?:\*\*\s*([^\n\r]+)/i);
        if (genreSectionMatch) {
          const genreText = genreSectionMatch[1];
          const genres = [...genreText.matchAll(/\[([^\]]+)\]\(https:\/\/www\.igdb\.com\/genres\/[^)]+\)/g)].map(m => m[1].trim());
          if (genres.length > 0) {
            genreList = genres;
          }
        }

        if (genreList.length === 0) {
          const fallbackGenres = [...body.matchAll(/https:\/\/www\.igdb\.com\/genres\/([a-z0-9\-]+)/gi)].map(m => {
            return m[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          });
          genreList = [...new Set(fallbackGenres)];
        }

        let formattedGenre = '';
        if (typeof window !== 'undefined' && window.StorageService && typeof window.StorageService.formatGenres === 'function') {
          formattedGenre = window.StorageService.formatGenres(genreList);
        } else {
          formattedGenre = genreList.join(' • ');
        }

        if (!bestCoverUrl && !title) return null;

        return {
          id: cleanSlug,
          title: title || cleanSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          platform: platformName,
          coverUrl: bestCoverUrl,
          genre: formattedGenre,
          genres: genreList,
          candidateCovers: candidateCovers,
          source: 'IGDB'
        };
      } catch (err) {
        console.warn('[IGDB Web Reader] Falhou:', err);
        return null;
      }
    }

    /**
     * Busca um jogo específico no IGDB pelo seu ID numérico oficial, slug ou URL completa
     * (Ex: 1942, 'the-witcher-3-wild-hunt' ou 'https://www.igdb.com/games/the-witcher-3-wild-hunt')
     * Puxa automaticamente a capa oficial em alta definição, gêneros, título e metadados.
     * Suporta tanto chamadas da API oficial quanto leitura web sem CORS no GitHub Pages.
     * @param {string|number} idOrUrl - ID numérico, slug ou URL da página do jogo no IGDB
     * @param {string} [platformName] - Nome da plataforma
     * @param {Object} [credentials] - Credenciais do Twitch/IGDB
     * @returns {Promise<{ id: string, title: string, platform: string, genre: string, genres: string[], releaseYear: number|null, coverUrl: string, candidateCovers: Array, source: string }|null>}
     */
    static async getGameById(idOrUrl, platformName = '', credentials = {}) {
      if (!idOrUrl) return null;
      let raw = String(idOrUrl).trim();
      if (!raw) return null;

      // 1. Extração inteligente do identificador se for link ou texto formatado
      if (raw.includes('/games/')) {
        const parts = raw.split('/games/');
        raw = parts[1].split('/')[0].split('?')[0].split('#')[0].trim();
      }
      raw = raw.replace(/^(id\s*[:=]?\s*|#)/i, '').trim();

      const isNumeric = /^\d+$/.test(raw);
      const cleanId = raw;

      // 2. Se for link ou slug (não numérico), tenta primeiro o Web Reader direto
      // Isso garante funcionamento 100% imediato em qualquer navegador no GitHub Pages sem erros de CORS!
      if (!isNumeric) {
        const webResult = await this.fetchGameViaWebReader(cleanId, platformName);
        if (webResult && (webResult.coverUrl || webResult.genre)) {
          return webResult;
        }
      }

      // 3. Se for numérico ou o Web Reader falhar, tenta a API oficial do IGDB se houver credenciais
      const clientId = (credentials.clientId || credentials.ssid || '').trim();
      const clientSecret = (credentials.clientSecret || credentials.sspassword || '').trim();
      let accessToken = (credentials.accessToken || '').trim();
      let tokenExpiry = credentials.tokenExpiry || 0;

      if (clientId && (clientSecret || accessToken)) {
        try {
          const auth = await this.getAccessToken(clientId, clientSecret, accessToken, tokenExpiry);
          accessToken = auth.accessToken;

          const fields = 'fields id, name, summary, cover.url, cover.image_id, genres.name, platforms.name, first_release_date, artworks.url, artworks.image_id, screenshots.url, screenshots.image_id;';
          let query = '';
          if (isNumeric) {
            query = `${fields} where id = ${cleanId}; limit 1;`;
          } else {
            const escapedSlug = cleanId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            query = `${fields} where slug = "${escapedSlug}"; limit 1;`;
          }

          const rawGames = await this.fetchIgdbGames(query, clientId, accessToken, credentials.proxyUrl);
          if (rawGames && Array.isArray(rawGames) && rawGames.length > 0) {
            return this.parseIgdbGameItem(rawGames[0], platformName);
          }
        } catch (apiErr) {
          console.warn('[IGDB API by ID] Falhou na API oficial:', apiErr.message);
          if (!isNumeric) {
            const fallbackWeb = await this.fetchGameViaWebReader(cleanId, platformName);
            if (fallbackWeb) return fallbackWeb;
          }
        }
      }

      // 4. Se for numérico mas não temos credenciais ou a API falhou:
      if (isNumeric) {
        throw new Error('IGDB: Para buscar por ID numérico puro, configure suas credenciais do IGDB/Twitch, ou cole o link do jogo (ex: https://www.igdb.com/games/...).');
      }

      // 5. Se não encontrou por slug e não é numérico, tenta uma busca geral pelo nome
      const fallbackResults = await this.searchGames(cleanId, platformName, credentials);
      if (fallbackResults && fallbackResults.length > 0) {
        return fallbackResults[0];
      }

      return null;
    }
  }

  window.IgdbService = IgdbService;
  window.IGDBService = IgdbService; // Alias

})(typeof window !== 'undefined' ? window : this);

