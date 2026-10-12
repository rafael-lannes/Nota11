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

  /**
   * Helper para chamar endpoints locais no backend C# EmbeddedServer
   * Testa URLs relativas e portas comuns locais para compatibilidade total em WebView2 e navegadores.
   */
  async function callLocalProxy(endpoint, postData) {
    const candidateBases = [
      '' // 1. URL Relativa (funciona automaticamente em WebView2 e quando servido pelo EmbeddedServer)
    ];

    if (typeof window !== 'undefined' && window.location) {
      if (window.location.origin && window.location.origin !== 'null') {
        candidateBases.push(window.location.origin);
      }
      if (window.location.port) {
        candidateBases.push(`http://127.0.0.1:${window.location.port}`);
        candidateBases.push(`http://localhost:${window.location.port}`);
      }
    }

    // Portas padrão candidatas do servidor local
    candidateBases.push(
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3001',
      'http://localhost:3001',
      'http://127.0.0.1:3002',
      'http://localhost:3002',
      'http://127.0.0.1:8080',
      'http://localhost:8080',
      'http://127.0.0.1:8000',
      'http://localhost:8000',
      'http://127.0.0.1:5500',
      'http://localhost:5500'
    );

    const uniqueBases = Array.from(new Set(candidateBases));

    for (const base of uniqueBases) {
      try {
        const cleanBase = base ? base.replace(/\/+$/, '') : '';
        const url = `${cleanBase}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

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
            // Verifica se a resposta não é um erro
            if (parsed && !parsed.error) {
              return parsed;
            }
          } catch (e) {}
        }
      } catch (err) {
        // Tenta próxima base local
      }
    }

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
          const timeoutId = setTimeout(() => controller.abort(), 10000);

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
          const timeoutId = setTimeout(() => controller.abort(), 12000);

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
     * Pesquisa jogos no IGDB pelo título e plataforma com estratégia multi-query e fallbacks inteligentes
     * @param {string} title - Título do jogo
     * @param {string} [platformName] - Nome da plataforma
     * @param {Object} credentials - { clientId, clientSecret, accessToken, tokenExpiry, proxyUrl }
     * @returns {Promise<Array<{ id: string, title: string, platform: string, genre: string, releaseYear: number|null, coverUrl: string, candidateCovers: Array<{ type: string, url: string, label: string, priority: number }> }>>}
     */
    static async searchGames(title, platformName = '', credentials = {}) {
      if (!title || !String(title).trim()) return [];

      const rawTitle = String(title).trim();
      const candidates = this.generateSearchCandidates(rawTitle);

      const clientId = (credentials.clientId || credentials.ssid || '').trim();
      const clientSecret = (credentials.clientSecret || credentials.sspassword || '').trim();
      let accessToken = (credentials.accessToken || '').trim();
      let tokenExpiry = credentials.tokenExpiry || 0;

      const resultsMap = new Map();

      // 1. Tenta IGDB se credenciais foram fornecidas
      if (clientId && (clientSecret || accessToken)) {
        try {
          const auth = await this.getAccessToken(clientId, clientSecret, accessToken, tokenExpiry);
          accessToken = auth.accessToken;
          tokenExpiry = Date.now() + (auth.expiresIn * 1000);

          const fields = 'fields id, name, summary, cover.url, cover.image_id, genres.name, platforms.name, first_release_date, artworks.url, artworks.image_id, screenshots.url, screenshots.image_id;';

          // Executa buscas ordenadas por precisão
          for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            const escaped = cand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            
            // Estratégia A: Full Text Search indexado do IGDB
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

            // Se já encontramos correspondências diretas no primeiro termo exato, paramos para maior velocidade
            if (resultsMap.size >= 5) break;
          }

          // Se nenhuma correspondência foi encontrada com search "...", tenta busca por substring (where name ~ *...*)
          if (resultsMap.size === 0 && candidates.length > 0) {
            const bestCandidate = candidates[0];
            const cleanCand = this.cleanSearchTitle(bestCandidate).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            if (cleanCand && cleanCand.length >= 3) {
              const queryPattern = `${fields} where name ~ *"${cleanCand}"*; limit 15;`;
              try {
                const rawPattern = await this.fetchIgdbGames(queryPattern, clientId, accessToken, credentials.proxyUrl);
                if (rawPattern && Array.isArray(rawPattern) && rawPattern.length > 0) {
                  for (const g of rawPattern) {
                    const parsed = this.parseIgdbGameItem(g, platformName);
                    if (parsed && !resultsMap.has(parsed.id)) {
                      resultsMap.set(parsed.id, parsed);
                    }
                  }
                }
              } catch (pErr) {
                if (pErr.isAuthError) throw pErr;
              }
            }
          }
        } catch (igdbErr) {
          console.warn('[IGDB] Falha na consulta direta ao IGDB, acionando fallback inteligente:', igdbErr);
          if (igdbErr.isAuthError) {
            // Repassa erro de autenticação para o app exibir o toast adequado
            throw igdbErr;
          }
        }
      }

      if (resultsMap.size > 0) {
        const results = Array.from(resultsMap.values());
        
        // Ordena colocando correspondências exatas de título em primeiro lugar
        const normalizedTarget = this.normalizeDiacritics(rawTitle.toLowerCase());
        results.sort((a, b) => {
          const normA = this.normalizeDiacritics((a.title || '').toLowerCase());
          const normB = this.normalizeDiacritics((b.title || '').toLowerCase());
          const exactA = normA === normalizedTarget ? 1 : 0;
          const exactB = normB === normalizedTarget ? 1 : 0;
          if (exactA !== exactB) return exactB - exactA;

          const startsA = normA.startsWith(normalizedTarget) ? 1 : 0;
          const startsB = normB.startsWith(normalizedTarget) ? 1 : 0;
          return startsB - startsA;
        });

        return results;
      }

      // 2. Fallback Inteligente: ScreenScraper API (sem necessidade de OAuth / Twitch key)
      try {
        if (typeof window !== 'undefined' && window.ScreenScraperService && typeof window.ScreenScraperService.searchGames === 'function') {
          const ssResults = await window.ScreenScraperService.searchGames(rawTitle, platformName, credentials);
          if (ssResults && ssResults.length > 0) {
            return ssResults.map(item => ({
              ...item,
              source: 'ScreenScraper',
              genres: typeof window.StorageService !== 'undefined' ? window.StorageService.parseGenres(item.genre) : (item.genre ? [item.genre] : [])
            }));
          }
        }
      } catch (ssErr) {
        console.warn('[ScreenScraper Fallback] Falhou:', ssErr);
      }

      // 3. Fallback: Steam Store Search API
      try {
        const steamTitle = this.cleanSearchTitle(rawTitle);
        const steamUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(steamTitle)}&l=portuguese&cc=BR`;
        const proxies = ['', ...IGDB_CONFIG.DEFAULT_PROXIES];
        for (const proxy of proxies) {
          try {
            const finalUrl = proxy ? `${proxy}${encodeURIComponent(steamUrl)}` : steamUrl;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const resp = await fetch(finalUrl, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
            clearTimeout(timeoutId);
            if (resp.ok) {
              const sData = await resp.json();
              if (sData && sData.items && sData.items.length > 0) {
                const steamResults = [];
                for (const item of sData.items.slice(0, 5)) {
                  const appId = item.id;
                  const itemTitle = item.name;
                  const headerImg = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
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
                    source: 'Steam',
                    candidateCovers: [
                      { type: 'cover-vertical-hd', url: libraryHero, label: 'Capa Vertical HD (Steam)', priority: 1 },
                      { type: 'cover-vertical', url: libraryCover, label: 'Capa Vertical (Steam)', priority: 2 },
                      { type: 'cover-header', url: headerImg, label: 'Banner Horizontal (Steam)', priority: 3 }
                    ]
                  });
                }
                if (steamResults.length > 0) return steamResults;
              }
            }
          } catch (e) {}
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
     * Busca um jogo específico no IGDB pelo seu ID numérico oficial, slug ou URL completa
     * (Ex: 1942, 'the-witcher-3-wild-hunt' ou 'https://www.igdb.com/games/the-witcher-3-wild-hunt')
     * Puxa automaticamente a capa oficial em alta definição, gêneros, título e metadados.
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
      // Ex: "https://www.igdb.com/games/the-witcher-3-wild-hunt" -> "the-witcher-3-wild-hunt"
      // Ex: "https://www.igdb.com/games/1942" -> "1942"
      if (raw.includes('/games/')) {
        const parts = raw.split('/games/');
        raw = parts[1].split('/')[0].split('?')[0].split('#')[0].trim();
      }

      // Remove prefixos como "id:" ou "#" se o usuário colar algo como "ID: 1942" ou "#1942"
      raw = raw.replace(/^(id\s*[:=]?\s*|#)/i, '').trim();

      const isNumeric = /^\d+$/.test(raw);
      const cleanId = raw;

      const clientId = (credentials.clientId || credentials.ssid || '').trim();
      const clientSecret = (credentials.clientSecret || credentials.sspassword || '').trim();
      let accessToken = (credentials.accessToken || '').trim();
      let tokenExpiry = credentials.tokenExpiry || 0;

      if (!clientId || (!clientSecret && !accessToken)) {
        const authErr = new Error('IGDB: Para buscar dados pelo ID do IGDB, configure seu Client ID e Client Secret nas configurações.');
        authErr.isAuthError = true;
        throw authErr;
      }

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

      // Se não encontrou por slug e não é numérico, tenta uma busca pelo nome
      if (!isNumeric) {
        const fallbackResults = await this.searchGames(cleanId, platformName, credentials);
        if (fallbackResults && fallbackResults.length > 0) {
          return fallbackResults[0];
        }
      }

      return null;
    }
  }

  window.IgdbService = IgdbService;
  window.IGDBService = IgdbService; // Alias

})(typeof window !== 'undefined' ? window : this);

