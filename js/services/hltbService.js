/**
 * Game Tracker "Nota 11" - HowLongToBeat (HLTB) Service
 * Consulta tempos médios estimados de conclusão de jogos na comunidade HowLongToBeat
 * e preenche automaticamente jogos zerados que estejam com tempo não calculado ou 00:00:00.
 */

(function (window) {
  'use strict';

  class HltbService {
    static _workingApiBaseUrl = null;
    static _isCheckingConnection = false;
    static _lastConnectionStatus = null;

    /**
     * Limpa o título do jogo para otimizar a busca no HLTB
     * Remove sufixos como (SOLO), (1999), [v1.0], edições especiais e pontuações conflitantes (+, &, :, etc.)
     * @param {string} title
     * @returns {string}
     */
    static cleanSearchTitle(title) {
      if (!title) return '';
      return String(title)
        .replace(/\s*\([^)]*\)/g, ' ')       // remove (SOLO), (1999), (PS1), (PVE ZONE), etc.
        .replace(/\s*\[[^\]]*\]/g, ' ')      // remove [v1.0], [HD], etc.
        .replace(/\s*-\s*(Definitive|Special|Anniversary|Collector|GOTY|Game of the Year|Standard|Deluxe|Remastered|Update)\s*(Edition)?/gi, ' ')
        .replace(/[+:\-_/\\&'"!~#@$%^*=|]/g, ' ') // converte pontuações e símbolos em espaços para busca exata de palavras
        .replace(/\s+/g, ' ')
        .trim();
    }

    /**
     * Gera variantes inteligentes do título para buscas de contingência caso a busca principal não retorne dados
     * @param {string} rawTitle
     * @returns {string[]}
     */
    static getSearchCandidates(rawTitle) {
      if (!rawTitle) return [];
      const primary = this.cleanSearchTitle(rawTitle);
      const candidates = [primary];

      // 1. Variante substituindo Algarismos Romanos por Arábicos (ex: Alan Wake II -> Alan Wake 2, Final Fantasy VII -> Final Fantasy 7)
      const romanReplaced = primary
        .replace(/\bVIII\b/gi, '8')
        .replace(/\bVII\b/gi, '7')
        .replace(/\bVI\b/gi, '6')
        .replace(/\bIV\b/gi, '4')
        .replace(/\bIII\b/gi, '3')
        .replace(/\bII\b/gi, '2')
        .replace(/\bIX\b/gi, '9')
        .replace(/\bV\b/gi, '5')
        .replace(/\s+/g, ' ')
        .trim();

      if (romanReplaced !== primary && !candidates.includes(romanReplaced)) {
        candidates.push(romanReplaced);
      }

      // 2. Variante antes de subtítulo ou dois-pontos (ex: "Dave the Diver: In the Jungle" -> "Dave the Diver", "Resident Evil 4: Separate Ways" -> "Resident Evil 4")
      if (rawTitle.includes(':') || rawTitle.includes(' - ')) {
        const basePart = rawTitle.split(/[:\-]/)[0];
        const cleanBase = this.cleanSearchTitle(basePart);
        if (cleanBase && cleanBase.length >= 3 && !candidates.includes(cleanBase)) {
          candidates.push(cleanBase);
        }
      }

      // 3. Variante removendo prefixos de franquia/autor (ex: "Tom Clancy's Ghost Recon Wildlands" -> "Ghost Recon Wildlands")
      const noPublisher = primary.replace(/^(Tom Clancy s|Sid Meier s|American McGee s)\s+/i, '').trim();
      if (noPublisher !== primary && !candidates.includes(noPublisher)) {
        candidates.push(noPublisher);
      }

      return candidates.filter(Boolean);
    }

    /**
     * Localiza o endpoint de API ativo (suporte automático a localhost:3000, 3001, 127.0.0.1 ou fallback CORS)
     * @returns {Promise<string>}
     */
    static async getApiBaseUrl() {
      if (this._workingApiBaseUrl) {
        return this._workingApiBaseUrl;
      }

      const isHttp = window.location.protocol.startsWith('http');
      const testOrigin = isHttp ? window.location.origin : 'http://localhost:3000';

      const candidateUrls = [
        testOrigin,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://localhost:8080'
      ].filter((val, idx, arr) => arr.indexOf(val) === idx);

      for (const base of candidateUrls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1200);
          const resp = await fetch(`${base}/api/status`, {
            method: 'GET',
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (resp.ok) {
            this._workingApiBaseUrl = base;
            console.log(`[HLTB] Servidor local conectado com sucesso em: ${base}`);
            return base;
          }
        } catch (e) {
          // Continua testando próxima porta candidata
        }
      }

      // Se nenhum servidor local respondeu e a página está rodando via HTTP, tenta rota relativa
      if (isHttp) {
        this._workingApiBaseUrl = '';
        return '';
      }

      // Fallback: assume localhost padrão
      this._workingApiBaseUrl = 'http://localhost:3000';
      return 'http://localhost:3000';
    }

    /**
     * Verifica e retorna o estado de conexão do servidor proxy HLTB
     * @returns {Promise<{ ok: boolean, mode: string, serverUrl: string, message: string }>}
     */
    static async checkConnection() {
      try {
        const baseUrl = await this.getApiBaseUrl();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const resp = await fetch(`${baseUrl}/api/status`, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const info = await resp.json().catch(() => ({}));
          this._lastConnectionStatus = {
            ok: true,
            mode: 'local_server',
            serverUrl: baseUrl,
            serverName: info.server || 'Servidor Localhost',
            message: `Servidor local ativo (${baseUrl})`
          };
          return this._lastConnectionStatus;
        }
      } catch (err) {
        // Servidor local não respondeu
      }

      this._lastConnectionStatus = {
        ok: false,
        mode: 'offline',
        serverUrl: '',
        message: 'Servidor local não detectado. Inicie o arquivo "iniciar_servidor.bat".'
      };
      return this._lastConnectionStatus;
    }

    /**
     * Busca jogos no HLTB através da rota de proxy local ou fallback
     * @param {string} title - Nome do jogo
     * @returns {Promise<Array>} Lista de jogos encontrados no HLTB
     */
    static async searchGame(title) {
      const candidates = this.getSearchCandidates(title);
      if (candidates.length === 0) return [];

      const baseUrl = await this.getApiBaseUrl();

      for (let i = 0; i < candidates.length; i++) {
        const queryTerm = candidates[i];
        try {
          const url = `${baseUrl}/api/hltb/search?q=${encodeURIComponent(queryTerm)}`;
          const resp = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });

          if (resp.ok) {
            const json = await resp.json();
            const data = Array.isArray(json.data) ? json.data : [];
            if (data.length > 0) {
              return data;
            }
          }
        } catch (err) {
          console.warn(`[HLTB] Erro ao consultar "${queryTerm}" via ${baseUrl}:`, err);
        }
      }

      return [];
    }

    /**
     * Obtém a estimativa de tempo ideal no HLTB para um jogo de acordo com sua condição de zerar
     * @param {string} title - Nome do jogo
     * @param {string} [condition='Condição Padrão'] - Condição de Zerar ('Platinado/Perfeitos', 'Condição Padrão', etc.)
     * @returns {Promise<{ found: boolean, gameName?: string, gameId?: number, seconds?: number, hours?: number, playtime?: string, timeType?: string, reason?: string }>}
     */
    static async getEstimatedPlaytime(title, condition = 'Condição Padrão') {
      const results = await this.searchGame(title);
      if (!results || results.length === 0) {
        return {
          found: false,
          seconds: 0,
          hours: 0,
          playtime: '00:00:00',
          reason: 'Jogo não encontrado no HLTB'
        };
      }

      // Encontra a correspondência mais relevante (primeiro resultado)
      const best = results[0];
      const isPlatinum = String(condition).toLowerCase().includes('platina') || String(condition).toLowerCase().includes('perfeito');

      let targetSeconds = 0;
      let timeType = 'Campanha Principal';

      if (isPlatinum) {
        // Para platinados, prioriza tempo de 100% / Completionist
        if (best.comp_100 && best.comp_100 > 0) {
          targetSeconds = best.comp_100;
          timeType = '100% / Platina';
        } else if (best.comp_all && best.comp_all > 0) {
          targetSeconds = best.comp_all;
          timeType = 'Média Geral';
        } else if (best.comp_main && best.comp_main > 0) {
          targetSeconds = best.comp_main;
          timeType = 'Campanha Principal';
        }
      } else {
        // Para condição padrão, reduzida ou jogo sem fim, prioriza Campanha Principal (Main Story)
        if (best.comp_main && best.comp_main > 0) {
          targetSeconds = best.comp_main;
          timeType = 'Campanha Principal';
        } else if (best.comp_all && best.comp_all > 0) {
          targetSeconds = best.comp_all;
          timeType = 'Média Geral';
        } else if (best.comp_plus && best.comp_plus > 0) {
          targetSeconds = best.comp_plus;
          timeType = 'História + Extras';
        }
      }

      // Se nenhum tempo válido (> 0) foi retornado (ex: jogo 100% multiplayer ou sem registros)
      if (!targetSeconds || targetSeconds <= 0) {
        return {
          found: false,
          gameName: best.game_name,
          gameId: best.game_id,
          seconds: 0,
          hours: 0,
          playtime: '00:00:00',
          reason: 'Tempo indefinido ou sem registros no HLTB'
        };
      }

      // Converte segundos para HH:MM:SS e horas decimais
      const totalHours = targetSeconds / 3600;
      const formattedPlaytime = window.StorageService
        ? window.StorageService.formatPlaytimeToHHMMSS(totalHours)
        : this.formatSecondsToHHMMSS(targetSeconds);

      const hoursRounded = Math.round(totalHours * 10) / 10;

      return {
        found: true,
        gameName: best.game_name,
        gameId: best.game_id,
        seconds: targetSeconds,
        hours: hoursRounded,
        playtime: formattedPlaytime,
        timeType
      };
    }

    /**
     * Formata segundos para HH:MM:SS
     * @param {number} totalSec
     * @returns {string}
     */
    static formatSecondsToHHMMSS(totalSec) {
      if (!totalSec || totalSec <= 0) return '00:00:00';
      const sec = Math.round(totalSec);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * Verifica se um jogo é elegível para estimativa HLTB:
     * - Deve estar com status 'Zerado'
     * - Deve estar com tempo não calculado ou zerado (00:00:00 / 0h)
     * @param {Object} game
     * @returns {boolean}
     */
    static isEligible(game) {
      if (!game || game.status !== 'Zerado') return false;
      const hours = Number(game.playtimeHours) || 0;
      const timeStr = String(game.playtime || '').trim().toLowerCase();
      const isZero = hours === 0;
      const isUncalculated = timeStr === '' || timeStr === '00:00:00' || timeStr.startsWith('00:00') || timeStr.includes('não') || timeStr.includes('nao') || timeStr.includes('calcul');
      return isZero && isUncalculated;
    }

    /**
     * Retorna a lista de todos os jogos zerados sem tempo registrado
     * @param {Array} games
     * @returns {Array}
     */
    static getEligibleGames(games) {
      if (!Array.isArray(games)) return [];
      return games.filter(g => this.isEligible(g));
    }
  }

  window.HltbService = HltbService;
})(window);
