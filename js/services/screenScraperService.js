/**
 * Game Tracker "Nota 11" - ScreenScraper.fr API Integration Service
 * Permite buscar capas (Box 2D, Box 3D, etc.) e gêneros na base do ScreenScraper.fr.
 * Compatível com execução direta no navegador (CORS nativo do ScreenScraper) e proxies de fallback.
 */

(function (window) {
  'use strict';

  // Configuração padrão da API ScreenScraper
  const SS_CONFIG = {
    BASE_URL: 'https://api.screenscraper.fr/api2',
    DEFAULT_SOFTNAME: 'Nota11GameTracker',
    DEFAULT_DEVID: '',
    DEFAULT_DEVPASSWORD: '',
    DEFAULT_PROXIES: [
      'https://corsproxy.io/?url=',
      'https://api.allorigins.win/raw?url='
    ]
  };

  // Mapeamento completo de plataformas do Nota 11 para System IDs do ScreenScraper (systemeid)
  const PLATFORM_TO_SYSTEM_ID = {
    // PC & Portáteis Modernos
    'PC - Computador': 135,
    'PC - Steam Deck': 135,
    'PC - Rog Ally': 135,
    'PC - Recomp/Decomp': 135,
    'PC (Windows / Steam)': 135,
    'PC': 135,
    'Steam Deck / PC Portátil': 135,
    'Steam Deck': 135,
    'Rog Ally': 135,
    'Mac / Apple Silicon': 135,
    'Linux': 135,

    // 9ª Geração
    'PlayStation 5': 230,
    'Xbox Series X/S': 231,
    'Nintendo Switch': 225,
    'Nintendo Switch 2': 225,

    // 8ª Geração
    'PlayStation 4': 60,
    'Xbox One': 34,
    'Nintendo Wii U': 18,
    'Nintendo 3DS / 2DS': 17,
    'Nintendo 3DS': 17,
    'Nintendo 2DS': 17,
    'PlayStation Vita': 62,

    // 7ª Geração
    'PlayStation 3': 59,
    'Xbox 360': 33,
    'Nintendo Wii': 16,
    'Nintendo DS': 13,
    'PlayStation Portable (PSP)': 61,
    'PSP': 61,

    // 6ª Geração
    'PlayStation 2 (PS2)': 58,
    'PlayStation 2': 58,
    'Xbox (Clássico)': 32,
    'Xbox': 32,
    'Nintendo GameCube': 15,
    'Sega Dreamcast': 23,
    'Game Boy Advance (GBA)': 12,

    // 5ª Geração (32/64 Bits)
    'PlayStation 1 (PS1)': 57,
    'PlayStation (PS1)': 57,
    'PlayStation 1': 57,
    'PS1': 57,
    'Nintendo 64 (N64)': 14,
    'Nintendo 64': 14,
    'Sega Saturn': 22,
    'Game Boy Color (GBC)': 10,

    // 4ª Geração (16 Bits)
    'Super Nintendo (SNES)': 4,
    'Super Nintendo': 4,
    'SNES': 4,
    'Sega Mega Drive / Genesis': 1,
    'Sega Genesis / Mega Drive': 1,
    'Mega Drive': 1,
    'Sega Genesis': 1,
    'Neo Geo AES/CD': 142,
    'Neo Geo': 142,
    'Game Boy (Clássico)': 9,
    'Game Boy': 9,
    'Sega Game Gear': 21,

    // 3ª Geração (8 Bits)
    'Nintendo Entertainment System (NES / Famicom)': 3,
    'Nintendo Entertainment System (NES)': 3,
    'NES': 3,
    'Famicom': 3,
    'Sega Master System': 2,
    'Master System': 2,
    'Atari 7800': 43,

    // 1ª e 2ª Gerações
    'Atari 5200': 41,
    'Atari 2600': 40,
    'ColecoVision': 48,
    'Intellivision': 115,
    'Magnavox Odyssey': 105,

    // Smartphones & Outros
    'Android': 240,
    'iOS (iPhone / iPad)': 241,
    'Arcade / MAME': 75
  };

  class ScreenScraperService {
    /**
     * Mapeia o nome da plataforma para o System ID do ScreenScraper
     * @param {string} platformName
     * @returns {number|null}
     */
    static getSystemId(platformName) {
      if (!platformName) return null;
      if (PLATFORM_TO_SYSTEM_ID[platformName]) {
        return PLATFORM_TO_SYSTEM_ID[platformName];
      }

      const lower = platformName.toLowerCase();
      const clean = lower.replace(/[^a-z0-9]/g, '');

      for (const [key, id] of Object.entries(PLATFORM_TO_SYSTEM_ID)) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (clean === cleanKey || clean.includes(cleanKey) || cleanKey.includes(clean)) {
          return id;
        }
      }

      // Atalhos comuns
      if (clean.includes('ps5')) return 230;
      if (clean.includes('ps4')) return 60;
      if (clean.includes('ps3')) return 59;
      if (clean.includes('ps2')) return 58;
      if (clean.includes('ps1') || clean.includes('psx')) return 57;
      if (clean.includes('psp')) return 61;
      if (clean.includes('vita')) return 62;
      if (clean.includes('snes') || clean.includes('supernintendo')) return 4;
      if (clean.includes('nes') || clean.includes('famicom')) return 3;
      if (clean.includes('n64') || clean.includes('nintendo64')) return 14;
      if (clean.includes('gamecube')) return 15;
      if (clean.includes('megadrive') || clean.includes('genesis')) return 1;
      if (clean.includes('mastersystem')) return 2;
      if (clean.includes('dreamcast')) return 23;
      if (clean.includes('saturn')) return 22;
      if (clean.includes('gba') || clean.includes('gameboyadvance')) return 12;
      if (clean.includes('gbc') || clean.includes('gameboycolor')) return 10;
      if (clean.includes('gameboy')) return 9;
      if (clean.includes('3ds')) return 17;
      if (clean.includes('ds')) return 13;
      if (clean.includes('switch')) return 225;
      if (clean.includes('steamdeck') || clean.includes('windows') || clean.includes('steam') || clean.includes('pc')) return 135;

      return null;
    }

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
     * Limpa o título do jogo removendo subtítulos ou termos ruidosos para melhorar a busca
     * @param {string} title
     * @returns {string}
     */
    static cleanSearchTitle(title) {
      if (!title) return '';
      return title
        .replace(/\s*\([^)]*\)/g, '')   // Remove (USA), (Europe), (Remastered) etc.
        .replace(/\s*\[[^\]]*\]/g, '')  // Remove [v1.0] etc.
        .trim();
    }

    /**
     * Executa a requisição HTTP com suporte direto e fallbacks de proxies CORS
     * @param {string} targetUrl
     * @param {string} [customProxy]
     * @returns {Promise<any>}
     */
    static async fetchWithCorsProxy(targetUrl, customProxy = '') {
      const proxies = [];
      if (customProxy && customProxy.trim()) {
        proxies.push(customProxy.trim());
      }
      // Tentativa direta primeiro (ScreenScraper API v2 possui Access-Control-Allow-Origin: * nativo)
      proxies.push('');
      proxies.push(...SS_CONFIG.DEFAULT_PROXIES);

      let lastError = null;

      for (const proxy of proxies) {
        try {
          const finalUrl = proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

          const response = await fetch(finalUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json, text/plain, */*'
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              const err = new Error('ScreenScraper: Usuário ou senha incorretos.');
              err.isScreenScraperError = true;
              throw err;
            }
            if (response.status === 404) {
              return null;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const rawText = await response.text();
          const trimmedText = (rawText || '').trim();
          if (!trimmedText) return null;

          // Detecta mensagens de erro em texto retornadas pelo ScreenScraper (HTTP 200 com corpo de texto)
          if (
            trimmedText.startsWith('Erreur') || 
            trimmedText.startsWith('Error') || 
            trimmedText.includes('Vérifier vos identifiants') || 
            trimmedText.includes('Erreur de login')
          ) {
            let msg = trimmedText;
            if (trimmedText.includes('développeur') || trimmedText.includes('developer') || trimmedText.includes('identifiants développeur')) {
              msg = 'ScreenScraper: Verifique seu Usuário e Senha. A conta deve estar ativa no screenscraper.fr.';
            } else if (trimmedText.includes('Utilisateur') || trimmedText.includes('mot de passe') || trimmedText.includes('password')) {
              msg = 'ScreenScraper: Usuário ou senha incorretos.';
            } else if (trimmedText.includes('threads') || trimmedText.includes('Quota') || trimmedText.includes('limite')) {
              msg = 'ScreenScraper: Limite diário de requisições atingido ou muitas conexões simultâneas.';
            }
            const authErr = new Error(msg);
            authErr.isScreenScraperError = true;
            throw authErr;
          }

          try {
            const data = JSON.parse(trimmedText);
            return data;
          } catch (jsonErr) {
            throw new Error(`Resposta inválida da API: ${trimmedText.substring(0, 100)}`);
          }
        } catch (err) {
          lastError = err;
          // Se for erro de autenticação ou quota confirmado do ScreenScraper, interrompe imediatamente
          if (err.isScreenScraperError || (err.message && err.message.startsWith('ScreenScraper:'))) {
            throw err;
          }
          console.warn(`[ScreenScraper] Tentativa com "${proxy || 'Direto'}" falhou:`, err.message);
        }
      }

      throw lastError || new Error('Não foi possível conectar aos servidores do ScreenScraper.');
    }

    /**
     * Pesquisa jogos no ScreenScraper pelo título e plataforma
     * @param {string} title - Nome do jogo
     * @param {string} [platformName] - Nome da plataforma
     * @param {Object} credentials - { ssid, sspassword, devid, devpassword, proxyUrl }
     * @returns {Promise<Array<{ id: string, title: string, platform: string, genre: string, coverUrl: string, candidateCovers: Array<{ type: string, region: string, url: string, label: string }> }>>}
     */
    static async searchGames(title, platformName = '', credentials = {}) {
      const cleanTitle = this.cleanSearchTitle(title);
      if (!cleanTitle) return [];

      const ssid = (credentials.ssid || '').trim();
      const sspassword = (credentials.sspassword || '').trim();
      let devid = (credentials.devid || '').trim();
      let devpassword = (credentials.devpassword || '').trim();
      const softname = (credentials.softname || SS_CONFIG.DEFAULT_SOFTNAME).trim();
      const proxyUrl = (credentials.proxyUrl || '').trim();

      // Se devid não foi fornecido ou é genérico, utiliza a conta do próprio usuário como devid/devpassword
      if (!devid || devid === 'screenscraper') {
        devid = ssid;
      }
      if (!devpassword || devpassword === 'screenscraper') {
        devpassword = sspassword;
      }

      const systemId = this.getSystemId(platformName);

      // Monta os parâmetros de consulta
      const params = new URLSearchParams();
      if (devid) params.append('devid', devid);
      if (devpassword) params.append('devpassword', devpassword);
      params.append('softname', softname);
      params.append('output', 'json');
      params.append('recherche', cleanTitle);

      if (ssid) params.append('ssid', ssid);
      if (sspassword) params.append('sspassword', sspassword);
      if (systemId) params.append('systemeid', String(systemId));

      const requestUrl = `${SS_CONFIG.BASE_URL}/jeuRecherche.php?${params.toString()}`;

      const data = await this.fetchWithCorsProxy(requestUrl, proxyUrl);
      if (!data) return [];

      // Tratamento de erros reportados no header do ScreenScraper
      if (data.header && data.header.status && data.header.status !== 'OK') {
        const msg = data.header.message || data.header.error || data.header.status;
        if (msg.toLowerCase().includes('user') || msg.toLowerCase().includes('password') || msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('login')) {
          const authErr = new Error(`ScreenScraper: Usuário ou senha incorretos (${msg}).`);
          authErr.isScreenScraperError = true;
          throw authErr;
        }
        if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('thread') || msg.toLowerCase().includes('limit')) {
          const quotaErr = new Error(`ScreenScraper: Limite de requisições atingido (${msg}).`);
          quotaErr.isScreenScraperError = true;
          throw quotaErr;
        }
      }

      // Extrai lista de jogos
      let rawGames = [];
      if (data.response && Array.isArray(data.response.jeux)) {
        rawGames = data.response.jeux;
      } else if (data.response && data.response.jeu) {
        rawGames = Array.isArray(data.response.jeu) ? data.response.jeu : [data.response.jeu];
      }

      const results = [];

      for (const game of rawGames) {
        if (!game) continue;

        // 1. Obter Título Principal
        let gameTitle = cleanTitle;
        if (game.noms && Array.isArray(game.noms) && game.noms.length > 0) {
          const preferred = game.noms.find(n => n && (n.region === 'us' || n.region === 'wor' || n.region === 'ss' || n.region === 'eu')) || game.noms[0];
          if (preferred) {
            gameTitle = preferred.text || preferred.nom || preferred._text || (typeof preferred === 'string' ? preferred : cleanTitle);
          }
        } else if (game.nom) {
          gameTitle = typeof game.nom === 'string' ? game.nom : (game.nom.text || game.nom.nom || cleanTitle);
        }

        // 2. Obter Gênero Principal
        let gameGenre = '';
        if (game.genres && Array.isArray(game.genres) && game.genres.length > 0) {
          const g = game.genres[0];
          if (g) {
            gameGenre = typeof g === 'string' ? g : (g.text || g.nom || g.noms?.[0]?.text || g.noms?.[0]?.nom || '');
          }
        } else if (game.genre) {
          gameGenre = typeof game.genre === 'string' ? game.genre : (game.genre.text || game.genre.nom || '');
        }

        // 3. Extrair Mídias e Capas
        let mediaList = [];
        if (Array.isArray(game.medias)) {
          mediaList = game.medias;
        } else if (game.medias && Array.isArray(game.medias.media)) {
          mediaList = game.medias.media;
        } else if (game.medias && typeof game.medias.media === 'object') {
          mediaList = [game.medias.media];
        } else if (game.medias && typeof game.medias === 'object') {
          mediaList = Object.values(game.medias);
        } else if (Array.isArray(game.media)) {
          mediaList = game.media;
        } else if (game.media && typeof game.media === 'object') {
          mediaList = [game.media];
        }

        const candidateCovers = [];
        let bestCoverUrl = '';

        for (const media of mediaList) {
          if (!media || !media.url) continue;
          let mediaUrl = String(media.url).trim();
          if (!mediaUrl) continue;
          // Converte http para https para evitar bloqueio de mixed content no navegador
          mediaUrl = mediaUrl.replace(/^http:\/\//i, 'https://');

          const type = String(media.type || '').toLowerCase();
          const region = String(media.region || '').toUpperCase() || 'GLOBAL';

          let label = 'Capa';
          let priority = 10;

          if (type === 'box-2d' || type.includes('box-2d') || type.includes('2d')) {
            label = `Box 2D (${region})`;
            priority = (region === 'WOR' || region === 'SS' || region === 'GLOBAL') ? 1 : region === 'US' ? 2 : region === 'EU' ? 3 : region === 'BR' ? 4 : 5;
          } else if (type === 'box-3d' || type.includes('box-3d') || type.includes('3d')) {
            label = `Box 3D (${region})`;
            priority = 6;
          } else if (type.includes('mix')) {
            label = `Mix 2D/3D (${region})`;
            priority = 7;
          } else if (type === 'fanart' || type === 'screen' || type.includes('screen') || type.includes('screenshot')) {
            label = `Screenshot / Arte (${region})`;
            priority = 9;
          } else if (type.includes('wheel') || type.includes('logo') || type.includes('marquee') || type.includes('bezel')) {
            continue; // Ignora logos/wheels para capa de card
          }

          candidateCovers.push({
            type: media.type || 'cover',
            region,
            url: mediaUrl,
            label,
            priority
          });
        }

        // Ordena as capas pela melhor prioridade visual (Box 2D > Box 3D > Mix > Screenshots)
        candidateCovers.sort((a, b) => a.priority - b.priority);

        if (candidateCovers.length > 0) {
          bestCoverUrl = candidateCovers[0].url;
        }

        if (bestCoverUrl || candidateCovers.length > 0) {
          results.push({
            id: String(game.id || ''),
            title: gameTitle,
            platform: platformName || game.systemename || 'Console',
            genre: gameGenre,
            coverUrl: bestCoverUrl,
            candidateCovers
          });
        }
      }

      return results;
    }

    /**
     * Busca a melhor capa para um único jogo de forma direta
     * @param {string} title
     * @param {string} platformName
     * @param {Object} credentials
     * @returns {Promise<{ coverUrl: string, genre: string, title: string, candidateCovers: Array }|null>}
     */
    static async getBestCoverForGame(title, platformName = '', credentials = {}) {
      const results = await this.searchGames(title, platformName, credentials);
      if (results && results.length > 0) {
        return results[0];
      }
      return null;
    }
  }

  // Exportar para o escopo global
  window.ScreenScraperService = ScreenScraperService;

})(typeof window !== 'undefined' ? window : this);
