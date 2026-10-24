/**
 * Game Tracker "Nota 11" - Storage & Backup Service (Multi-Perfil & Onboarding)
 * Gerencia persistência em localStorage, multi-perfis independentes,
 * importação/exportação CSV e backup JSON universal.
 */

const STORAGE_KEYS = {
  GAMES: 'nota11_games_library',
  SETTINGS: 'nota11_user_settings',
  PROFILE: 'nota11_user_profile',
  PLAYING_CATEGORIES: 'nota11_playing_categories',
  ADD_GAME_DRAFT: 'nota11_add_game_draft'
};

function isPcPlatform(platform) {
  if (!platform) return false;
  const p = String(platform).trim().toLowerCase();
  if (p.includes('switch') || p.includes('nintendo') || p.includes('playstation') || 
      p.includes('ps1') || p.includes('ps2') || p.includes('ps3') || p.includes('ps4') || p.includes('ps5') || 
      p.includes('psp') || p.includes('vita') || p.includes('xbox') || p.includes('sega') || 
      p.includes('atari') || p.includes('android') || p.includes('ios') || p.includes('snes') || 
      p.includes('nes') || p.includes('gba') || p.includes('gbc') || p.includes('game boy') || 
      p.includes('gamecube') || p.includes('dreamcast') || p.includes('genesis') || p.includes('megadrive')) {
    return false;
  }
  return p === 'pc' || p.startsWith('pc ') || p.startsWith('pc/') || p.startsWith('pc(') || p.startsWith('pc -') ||
         p.includes('steam deck') || p.includes('rog ally') || p.includes('computador') || p.includes('recomp') || p.includes('decomp') ||
         p.includes('windows') || p.includes('steam') || p.includes('linux') || p.includes('mac') || p.includes('portátil');
}

const DEFAULT_PROFILE = {
  name: 'Jogador',
  nickname: 'Gamer Master',
  avatarUrl: '',
  bannerUrl: '',
  bannerPositionY: 50,
  bio: 'Registro pessoal de jogos concluídos, tempos e avaliações.',
  favoritePlatform: 'PC - Computador',
  favoriteGenre: '',
  top5GameIds: [],
  top5Games: [],
  myConsoles: '',
  mySetup: '',
  socialTwitter: '',
  socialInstagram: '',
  socialWebsite: '',
  socialSteam: '',
  socialTwitch: '',
  socialDiscord: '',
  socialYoutube: ''
};

const DEFAULT_SETTINGS = {
  defaultView: 'grid',
  defaultPlatform: 'PC - Computador',
  hideTableCovers: false,
  igdb_client_id: '',
  igdb_client_secret: '',
  igdb_access_token: '',
  igdb_token_expiry: 0,
  igdb_proxy: '',
  screenscraper_ssid: '',
  screenscraper_sspassword: ''
};

const COMPLETION_CONDITIONS = [
  'Platinado/Perfeitos',
  'Condição Padrão',
  'Condição Reduzida',
  'Jogo sem fim'
];

const SAMPLE_GAMES = [
  {
    id: 'sample_1',
    title: 'Elden Ring',
    platform: 'PC - Steam Deck',
    genre: 'RPG • Souls-like',
    status: 'Zerado',
    rating: 11,
    completionDate: '2024-02-18',
    completionYear: 2024,
    playtime: '135:00:00',
    playtimeHours: 135,
    completionCondition: 'Platinado/Perfeitos',
    isHandheld: true,
    isPlatinum: true,
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg',
    createdAt: '2024-01-05T10:00:00.000Z',
    updatedAt: '2024-02-18T22:30:00.000Z'
  },
  {
    id: 'sample_2',
    title: 'The Legend of Zelda: Tears of the Kingdom',
    platform: 'Nintendo Switch',
    genre: 'Ação • Aventura',
    status: 'Zerado',
    rating: 11,
    completionDate: '2023-11-20',
    completionYear: 2023,
    playtime: '110:30:00',
    playtimeHours: 110.5,
    completionCondition: 'Platinado/Perfeitos',
    isHandheld: false,
    isPlatinum: true,
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg',
    createdAt: '2023-09-12T14:00:00.000Z',
    updatedAt: '2023-11-20T19:15:00.000Z'
  },
  {
    id: 'sample_3',
    title: 'Baldur\'s Gate 3',
    platform: 'PC - Computador',
    genre: 'CRPG • Fantasia',
    status: 'Zerado',
    rating: 11,
    completionDate: '2024-01-14',
    completionYear: 2024,
    playtime: '145:15:00',
    playtimeHours: 145.25,
    completionCondition: 'Platinado/Perfeitos',
    isHandheld: false,
    isPlatinum: true,
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co670h.jpg',
    createdAt: '2023-10-01T08:00:00.000Z',
    updatedAt: '2024-01-14T21:00:00.000Z'
  },
  {
    id: 'sample_4',
    title: 'Cyberpunk 2077',
    platform: 'PC - Computador',
    genre: 'RPG • Ação • Ficção Científica',
    status: 'Jogando',
    rating: null,
    completionDate: '',
    completionYear: null,
    playtime: '28:30:00',
    playtimeHours: 28.5,
    completionCondition: 'Condição Padrão',
    isHandheld: false,
    isPlatinum: false,
    isNowPlaying: true,
    priority: 'high',
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co725v.jpg',
    createdAt: '2024-03-01T10:00:00.000Z',
    updatedAt: '2024-03-10T18:00:00.000Z'
  },
  {
    id: 'sample_5',
    title: 'Hollow Knight: Silksong',
    platform: 'PC - Steam Deck',
    genre: 'Metroidvania • Ação',
    status: 'Backlog',
    rating: null,
    completionDate: '',
    completionYear: null,
    playtime: '00:00:00',
    playtimeHours: 0,
    completionCondition: 'Condição Padrão',
    isHandheld: true,
    isPlatinum: false,
    isNowPlaying: false,
    priority: 'high',
    coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg',
    createdAt: '2024-03-05T12:00:00.000Z',
    updatedAt: '2024-03-05T12:00:00.000Z'
  }
];

class StorageService {
  /**
   * Converte qualquer formato de entrada de tempo para o formato padrão "xx:xx:xx" (HH:MM:SS).
   */
  static formatPlaytimeToHHMMSS(val) {
    if (val === null || val === undefined || val === '') return '00:00:00';

    if (typeof val === 'number') {
      const totalSeconds = Math.max(0, Math.round(val * 3600));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    let str = String(val).trim();
    const sLow = str.toLowerCase();
    if (sLow.includes('não') || sLow.includes('nao') || sLow.includes('calcul') || sLow === '-' || sLow === 'n/a' || sLow === 'null' || sLow === 'undefined') {
      return '00:00:00';
    }

    // Remove milissegundos se houver (.000 ou .123)
    str = str.replace(/\.\d+$/, '');

    // Formato com dois-pontos: "HH:MM:SS" ou "HH:MM" ou "H:M:S"
    if (str.includes(':')) {
      const parts = str.split(':');
      if (parts.length >= 3) {
        const h = parseInt(parts[0], 10) || 0;
        const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
        const s = Math.min(59, Math.max(0, parseInt(parts[2], 10) || 0));
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      } else if (parts.length === 2) {
        const h = parseInt(parts[0], 10) || 0;
        const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
      }
    }

    // Formato "25h 30m 15s" ou "25h30"
    const hMatch = str.match(/(\d+)\s*h(?:oras?)?/i);
    const mMatch = str.match(/(\d+)\s*m(?:in(?:utos?)?)?/i);
    const sMatch = str.match(/(\d+)\s*s(?:eg(?:undos?)?)?/i);
    if (hMatch || mMatch || sMatch) {
      const h = hMatch ? parseInt(hMatch[1], 10) : 0;
      const m = mMatch ? Math.min(59, parseInt(mMatch[1], 10)) : 0;
      const s = sMatch ? Math.min(59, parseInt(sMatch[1], 10)) : 0;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // Formato numérico em string (ex: "25.5" ou "25,5" ou "25")
    const cleanNum = parseFloat(str.replace(',', '.'));
    if (!isNaN(cleanNum)) {
      const totalSeconds = Math.max(0, Math.round(cleanNum * 3600));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return '00:00:00';
  }

  /**
   * Converte "xx:xx:xx" para número decimal de horas (para cálculos e estatísticas)
   */
  static playtimeToHours(val) {
    const formatted = this.formatPlaytimeToHHMMSS(val);
    const parts = formatted.split(':').map(Number);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;
    return h + (m / 60) + (s / 3600);
  }

  /**
   * Normaliza a Condição de Zerar para uma das 4 opções oficiais
   */
  static normalizeCompletionCondition(val, isPlatinumFlag = false) {
    if (isPlatinumFlag) return 'Platinado/Perfeitos';
    if (!val) return 'Condição Padrão';
    const s = String(val).toLowerCase().trim();

    if (s.includes('platina') || s.includes('perfeit') || s.includes('100%') || s === 'sim' || s === 'true' || s === '1' || s === 'yes') {
      return 'Platinado/Perfeitos';
    }
    if (s.includes('reduz') || s.includes('any%') || s.includes('curt') || s.includes('rush') || s.includes('principal') || s.includes('rapida') || s.includes('rápida') || s.includes('historia') || s.includes('história')) {
      return 'Condição Reduzida';
    }
    if (s.includes('sem fim') || s.includes('infinit') || s.includes('mmo') || s.includes('multi') || s.includes('endless') || s.includes('continuo') || s.includes('contínuo')) {
      return 'Jogo sem fim';
    }
    return 'Condição Padrão';
  }

  /**
   * Converte uma entrada de gênero em uma lista limpa de gêneros individuais.
   */
  static parseGenres(genreInput) {
    if (!genreInput) return [];
    if (Array.isArray(genreInput)) {
      const combined = [];
      for (const item of genreInput) {
        combined.push(...this.parseGenres(item));
      }
      return Array.from(new Set(combined));
    }

    const str = String(genreInput).trim();
    if (!str) return [];

    const rawTokens = str.split(/[•·∙,;|\/\\\n\r]+/);
    const seen = new Set();
    const result = [];

    for (let token of rawTokens) {
      if (!token) continue;
      let clean = token.replace(/^[•·∙,;|\/\\\s\-–—_]+|[•·∙,;|\/\\\s\-–—_]+$/g, '').trim();
      clean = clean.replace(/^["'`]+|["'`]+$/g, '').trim();

      if (clean && clean.length > 0) {
        const lower = clean.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          if (clean === clean.toLowerCase() && clean.length > 1) {
            clean = clean.charAt(0).toUpperCase() + clean.slice(1);
          }
          result.push(clean);
        }
      }
    }

    return result;
  }

  /**
   * Formata uma entrada de gêneros para string padronizada com separador ' • '
   */
  static formatGenres(genreInput, separator = ' • ') {
    const list = this.parseGenres(genreInput);
    return list.join(separator);
  }

  /**
   * Extrai o Ano de conclusão a partir da data ou do valor numérico
   */
  static extractCompletionYear(dateStr, explicitYear) {
    if (explicitYear !== undefined && explicitYear !== null && explicitYear !== '') {
      const parsedYear = parseInt(explicitYear, 10);
      if (!isNaN(parsedYear) && parsedYear >= 1970 && parsedYear <= 2100) {
        return parsedYear;
      }
    }
    if (dateStr) {
      const match = String(dateStr).match(/\b(19\d{2}|20\d{2})\b/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return new Date().getFullYear();
  }

  static isPcPlatform(platform) {
    return isPcPlatform(platform);
  }

  // =========================================================================
  // PERSISTÊNCIA REATIVA (LOCALSTORAGE & BANCO NATIVO)
  // =========================================================================

  static loadGames() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GAMES);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(game => {
        let platform = (game.platform || 'PC - Computador').trim();
        const pLow = platform.toLowerCase();
        if (pLow === 'pc (windows / steam)' || pLow === 'pc / steam' || pLow === 'pc (windows)' || pLow === 'pc(windows/steam)' || pLow === 'pc') {
          platform = game.isHandheld ? 'PC - Steam Deck' : 'PC - Computador';
        } else if (pLow === 'steam deck / pc portátil' || pLow === 'steam deck') {
          platform = 'PC - Steam Deck';
        } else if (pLow === 'rog ally') {
          platform = 'PC - Rog Ally';
        } else if (pLow.includes('recomp') || pLow.includes('decomp')) {
          platform = 'PC - Recomp/Decomp';
        } else if (pLow === 'switch 2' || pLow === 'nintendo switch 2') {
          platform = 'Nintendo Switch 2';
        }
        const condition = this.normalizeCompletionCondition(game.completionCondition, Boolean(game.isPlatinum));
        const isPlat = condition === 'Platinado/Perfeitos';
        let status = 'Zerado';
        const rawStatus = (game.status || '').toString().trim().toLowerCase();
        if (rawStatus === 'backlog' || rawStatus === 'fila' || rawStatus === 'quero jogar') {
          status = 'Backlog';
        } else if (rawStatus === 'jogando' || rawStatus === 'playing' || rawStatus === 'nowplaying' || Boolean(game.isNowPlaying)) {
          status = 'Jogando';
        } else if (rawStatus === 'zerado' || rawStatus === 'concluído' || rawStatus === 'concluido' || rawStatus === 'finished') {
          status = 'Zerado';
        } else if (game.status) {
          status = game.status;
        }

        const isZerado = status === 'Zerado';
        const year = isZerado ? this.extractCompletionYear(game.completionDate, game.completionYear) : null;
        const isHandheldFinal = isPcPlatform(platform) ? (Boolean(game.isHandheld) || platform === 'PC - Steam Deck' || platform === 'PC - Rog Ally') : false;
        const formattedPlaytime = this.formatPlaytimeToHHMMSS(game.playtime || game.playtimeHours || 0);

        return {
          ...game,
          status,
          platform,
          genre: this.formatGenres(game.genre || ''),
          completionYear: year,
          completionDate: isZerado ? (game.completionDate || null) : null,
          completionCondition: condition,
          isPlatinum: isPlat,
          isHandheld: isHandheldFinal,
          isReplay: Boolean(game.isReplay),
          isNowPlaying: status === 'Jogando',
          playtime: formattedPlaytime,
          playtimeHours: game.playtimeHours !== undefined ? Number(game.playtimeHours) : this.playtimeToHours(formattedPlaytime)
        };
      });
    } catch (e) {
      console.error('Erro ao ler jogos:', e);
      return [];
    }
  }

  static saveGames(games) {
    try {
      if (Array.isArray(games)) {
        games.forEach(game => {
          if (game.platform) {
            const pLow = game.platform.trim().toLowerCase();
            if (pLow === 'pc (windows / steam)' || pLow === 'pc / steam' || pLow === 'pc (windows)' || pLow === 'pc(windows/steam)' || pLow === 'pc') {
              game.platform = game.isHandheld ? 'PC - Steam Deck' : 'PC - Computador';
            } else if (pLow === 'steam deck / pc portátil' || pLow === 'steam deck') {
              game.platform = 'PC - Steam Deck';
            } else if (pLow === 'rog ally') {
              game.platform = 'PC - Rog Ally';
            } else if (pLow.includes('recomp') || pLow.includes('decomp')) {
              game.platform = 'PC - Recomp/Decomp';
            } else if (pLow === 'switch 2' || pLow === 'nintendo switch 2') {
              game.platform = 'Nintendo Switch 2';
            }
          }
          if (game.isHandheld && !isPcPlatform(game.platform)) {
            game.isHandheld = false;
          }
        });
      }
      localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
      this.syncNativeDatabase();
      return true;
    } catch (e) {
      console.error('Erro ao salvar jogos:', e);
      return false;
    }
  }

  static loadSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(data);
      const settings = { ...DEFAULT_SETTINGS, ...parsed };
      if (settings.defaultPlatform) {
        const pLow = settings.defaultPlatform.trim().toLowerCase();
        if (pLow === 'pc (windows / steam)' || pLow === 'pc / steam' || pLow === 'pc (windows)' || pLow === 'pc(windows/steam)' || pLow === 'pc') {
          settings.defaultPlatform = 'PC - Computador';
        } else if (pLow === 'steam deck / pc portátil' || pLow === 'steam deck') {
          settings.defaultPlatform = 'PC - Steam Deck';
        } else if (pLow === 'rog ally') {
          settings.defaultPlatform = 'PC - Rog Ally';
        } else if (pLow.includes('recomp') || pLow.includes('decomp')) {
          settings.defaultPlatform = 'PC - Recomp/Decomp';
        } else if (pLow === 'switch 2' || pLow === 'nintendo switch 2') {
          settings.defaultPlatform = 'Nintendo Switch 2';
        }
      }
      return settings;
    } catch (e) {
      console.error('Erro ao ler configurações:', e);
      return { ...DEFAULT_SETTINGS };
    }
  }

  static saveSettings(settings) {
    try {
      if (settings && settings.defaultPlatform) {
        const pLow = settings.defaultPlatform.trim().toLowerCase();
        if (pLow === 'pc (windows / steam)' || pLow === 'pc / steam' || pLow === 'pc (windows)' || pLow === 'pc(windows/steam)' || pLow === 'pc') {
          settings.defaultPlatform = 'PC - Computador';
        } else if (pLow === 'steam deck / pc portátil' || pLow === 'steam deck') {
          settings.defaultPlatform = 'PC - Steam Deck';
        } else if (pLow === 'rog ally') {
          settings.defaultPlatform = 'PC - Rog Ally';
        } else if (pLow.includes('recomp') || pLow.includes('decomp')) {
          settings.defaultPlatform = 'PC - Recomp/Decomp';
        } else if (pLow === 'switch 2' || pLow === 'nintendo switch 2') {
          settings.defaultPlatform = 'Nintendo Switch 2';
        }
      }
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      this.syncNativeDatabase();
      return true;
    } catch (e) {
      console.error('Erro ao salvar configurações:', e);
      return false;
    }
  }

  static loadUserProfile() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
      if (!data) return { ...DEFAULT_PROFILE };
      const parsed = JSON.parse(data);
      return {
        ...DEFAULT_PROFILE,
        ...parsed,
        top5GameIds: Array.isArray(parsed.top5GameIds) ? parsed.top5GameIds : (Array.isArray(parsed.top5Games) ? parsed.top5Games.map(g => typeof g === 'string' ? g : g?.id).filter(Boolean) : []),
        top5Games: Array.isArray(parsed.top5Games) ? parsed.top5Games : [],
        myConsoles: typeof parsed.myConsoles === 'string' ? parsed.myConsoles : (Array.isArray(parsed.myConsoles) ? parsed.myConsoles.join('\n') : ''),
        mySetup: typeof parsed.mySetup === 'string' ? parsed.mySetup : '',
        bannerUrl: typeof parsed.bannerUrl === 'string' ? parsed.bannerUrl.trim() : '',
        bannerPositionY: typeof parsed.bannerPositionY === 'number' && !isNaN(parsed.bannerPositionY) ? Math.max(0, Math.min(100, Math.round(parsed.bannerPositionY))) : 50,
        socialTwitter: typeof parsed.socialTwitter === 'string' ? parsed.socialTwitter.trim() : '',
        socialInstagram: typeof parsed.socialInstagram === 'string' ? parsed.socialInstagram.trim() : '',
        socialWebsite: typeof parsed.socialWebsite === 'string' ? parsed.socialWebsite.trim() : '',
        socialSteam: typeof parsed.socialSteam === 'string' ? parsed.socialSteam.trim() : '',
        socialTwitch: typeof parsed.socialTwitch === 'string' ? parsed.socialTwitch.trim() : '',
        socialDiscord: typeof parsed.socialDiscord === 'string' ? parsed.socialDiscord.trim() : '',
        socialYoutube: typeof parsed.socialYoutube === 'string' ? parsed.socialYoutube.trim() : ''
      };
    } catch (e) {
      console.error('Erro ao ler perfil do usuário:', e);
      return { ...DEFAULT_PROFILE };
    }
  }

  static saveUserProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
      this.syncNativeDatabase();
      return true;
    } catch (e) {
      console.error('Erro ao salvar perfil:', e);
      return false;
    }
  }

  static clearUserProfile() {
    try {
      const defaultProfile = { ...DEFAULT_PROFILE };
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(defaultProfile));
      this.syncNativeDatabase();
      return defaultProfile;
    } catch (e) {
      console.error('Erro ao limpar perfil:', e);
      return { ...DEFAULT_PROFILE };
    }
  }

  static getPlayingCategories() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PLAYING_CATEGORIES);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Erro ao ler categorias de Jogando Agora:', e);
      return [];
    }
  }

  static savePlayingCategories(categories) {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYING_CATEGORIES, JSON.stringify(categories));
      this.syncNativeDatabase();
      return true;
    } catch (e) {
      console.error('Erro ao salvar categorias:', e);
      return false;
    }
  }

  // =========================================================================
  // RASCUNHO AUTOMÁTICO DO FORMULÁRIO DE NOVO JOGO
  // =========================================================================

  static saveAddGameDraft(draftData) {
    try {
      if (!draftData) return false;
      const safeDraft = { ...draftData };
      // Se a imagem de capa for um Data URI muito pesado (> 1.5MB), não salva no rascunho para evitar estourar quota
      if (safeDraft.coverUrl && safeDraft.coverUrl.startsWith('data:image/') && safeDraft.coverUrl.length > 1500000) {
        safeDraft.coverUrl = '';
      }
      localStorage.setItem(STORAGE_KEYS.ADD_GAME_DRAFT, JSON.stringify(safeDraft));
      return true;
    } catch (e) {
      console.warn('Não foi possível salvar o rascunho de novo jogo:', e);
      return false;
    }
  }

  static loadAddGameDraft() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ADD_GAME_DRAFT);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      console.warn('Erro ao carregar rascunho de novo jogo:', e);
      return null;
    }
  }

  static clearAddGameDraft() {
    try {
      localStorage.removeItem(STORAGE_KEYS.ADD_GAME_DRAFT);
      return true;
    } catch (e) {
      console.warn('Erro ao limpar rascunho:', e);
      return false;
    }
  }

  static hasAddGameDraft() {
    try {
      const draft = this.loadAddGameDraft();
      if (!draft) return false;
      return Boolean(
        (draft.title && draft.title.trim()) ||
        (draft.igdbId && draft.igdbId.trim()) ||
        (draft.genre && draft.genre.trim()) ||
        (draft.coverUrl && draft.coverUrl.trim()) ||
        (draft.playtime && draft.playtime !== '00:00:00' && draft.playtime !== '0h' && draft.playtime !== '0') ||
        draft.isReplay ||
        draft.isEarlyAccess ||
        draft.isPlatinum
      );
    } catch (e) {
      return false;
    }
  }

  static isLocalNativeServer() {
    if (typeof window === 'undefined' || !window.location) return false;
    if (window.chrome && window.chrome.webview) return true;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  static async initNativeStorage() {
    try {
      if (!this.isLocalNativeServer()) {
        return null;
      }
      if (typeof fetch !== 'function') return null;

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 1500) : null;

      const response = await fetch('/api/storage/load', {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });

      if (timeoutId) clearTimeout(timeoutId);
      if (!response.ok) return null;

      const rawText = await response.text();
      if (!rawText || !rawText.trim() || rawText.trim() === 'null' || rawText.trim() === '{}') {
        return null;
      }

      const parsed = JSON.parse(rawText);
      if (!parsed) return null;

      if (Array.isArray(parsed.games) && parsed.games.length > 0) {
        localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(parsed.games));
      }
      if (parsed.profile && typeof parsed.profile === 'object') {
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(parsed.profile));
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsed.settings));
      }
      if (Array.isArray(parsed.playingCategories)) {
        localStorage.setItem(STORAGE_KEYS.PLAYING_CATEGORIES, JSON.stringify(parsed.playingCategories));
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  static onDataChanged = null;

  static notifyDataChanged() {
    if (typeof this.onDataChanged === 'function') {
      try {
        this.onDataChanged();
      } catch (err) {
        console.warn('Erro ao notificar alteração de dados no StorageService:', err);
      }
    }
  }

  static _syncNativeTimer = null;

  static syncNativeDatabase(data = null) {
    if (this._syncNativeTimer) {
      clearTimeout(this._syncNativeTimer);
    }
    this._syncNativeTimer = setTimeout(() => {
      this._doSyncNativeDatabase(data);
      this.notifyDataChanged();
    }, 200);
  }

  static _doSyncNativeDatabase(data = null) {
    const payload = data || {
      games: this.loadGames(),
      settings: this.loadSettings(),
      profile: this.loadUserProfile(),
      playingCategories: this.getPlayingCategories()
    };
    if (window.chrome && window.chrome.webview) {
      try {
        window.chrome.webview.postMessage({ action: 'save_database', data: payload });
      } catch (err) {}
    } else if (this.isLocalNativeServer()) {
      try {
        fetch('/api/storage/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (err) {}
    }
  }

  /**
   * Calcula o espaço ocupado no LocalStorage e o tamanho dos arquivos/dados de capa da lista
   */
  static getStorageUsage(gamesList = null, profile = null) {
    try {
      let totalBytes = 0;
      let gamesBytes = 0;
      let settingsBytes = 0;
      let profileBytes = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const value = localStorage.getItem(key) || '';
        const itemBytes = (key.length + value.length) * 2;
        totalBytes += itemBytes;

        if (key === STORAGE_KEYS.GAMES || key === STORAGE_KEYS.PROFILES_STATE) gamesBytes += itemBytes;
        else if (key === STORAGE_KEYS.SETTINGS) settingsBytes += itemBytes;
        else if (key === STORAGE_KEYS.PROFILE) profileBytes += itemBytes;
      }

      let games = gamesList;
      if (!games) {
        games = this.loadGames();
      }
      games = Array.isArray(games) ? games : [];

      let coversStorageBytes = 0;
      let coversBase64Bytes = 0;
      let coversBase64Count = 0;
      let coversSvgCount = 0;
      let coversUrlCount = 0;
      let coversTotalCount = 0;
      let estimatedFilesBytes = 0;

      let browserResourceImageBytes = 0;
      if (typeof window !== 'undefined' && window.performance && typeof window.performance.getEntriesByType === 'function') {
        try {
          const resources = window.performance.getEntriesByType('resource') || [];
          resources.forEach(r => {
            if (r.initiatorType === 'img' || (r.name && r.name.match(/\.(jpg|jpeg|png|webp|svg|gif)/i))) {
              const sz = r.encodedBodySize || r.decodedBodySize || r.transferSize || 0;
              if (sz > 0) browserResourceImageBytes += sz;
            }
          });
        } catch (err) {}
      }

      games.forEach(g => {
        if (!g || !g.coverUrl) return;
        const url = String(g.coverUrl).trim();
        if (!url) return;

        coversTotalCount++;
        const strBytes = url.length * 2;
        coversStorageBytes += strBytes;

        if (url.startsWith('data:image/svg+xml')) {
          coversSvgCount++;
          estimatedFilesBytes += url.length;
        } else if (url.startsWith('data:image/')) {
          coversBase64Count++;
          const commaIdx = url.indexOf(',');
          const base64Str = commaIdx !== -1 ? url.substring(commaIdx + 1) : url;
          const binaryBytes = Math.max(0, Math.floor((base64Str.length * 3) / 4));
          coversBase64Bytes += binaryBytes;
          estimatedFilesBytes += binaryBytes;
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
          coversUrlCount++;
          estimatedFilesBytes += 105 * 1024;
        } else {
          estimatedFilesBytes += 50 * 1024;
        }
      });

      let avatarBytes = 0;
      const userProf = profile || this.loadUserProfile();
      if (userProf && userProf.avatarUrl) {
        const av = String(userProf.avatarUrl).trim();
        if (av.startsWith('data:image/')) {
          const commaIdx = av.indexOf(',');
          const base64Str = commaIdx !== -1 ? av.substring(commaIdx + 1) : av;
          avatarBytes = Math.max(0, Math.floor((base64Str.length * 3) / 4));
          coversBase64Bytes += avatarBytes;
          estimatedFilesBytes += avatarBytes;
        }
      }
      if (userProf && userProf.bannerUrl) {
        const bn = String(userProf.bannerUrl).trim();
        if (bn.startsWith('data:image/')) {
          const commaIdx = bn.indexOf(',');
          const base64Str = commaIdx !== -1 ? bn.substring(commaIdx + 1) : bn;
          const bannerBytes = Math.max(0, Math.floor((base64Str.length * 3) / 4));
          coversBase64Bytes += bannerBytes;
          estimatedFilesBytes += bannerBytes;
        }
      }

      const totalCoversFilesBytes = Math.max(estimatedFilesBytes, browserResourceImageBytes + coversBase64Bytes);
      const gamesMetadataBytes = Math.max(0, gamesBytes - coversStorageBytes);

      const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      };

      const quotaLimitBytes = 5 * 1024 * 1024;
      const percentUsed = Math.min(100, Math.max(0, (totalBytes / quotaLimitBytes) * 100));

      return {
        totalBytes,
        totalFormatted: formatSize(totalBytes),
        gamesBytes,
        gamesFormatted: formatSize(gamesBytes),
        gamesMetadataBytes,
        gamesMetadataFormatted: formatSize(gamesMetadataBytes),
        settingsBytes,
        settingsFormatted: formatSize(settingsBytes),
        profileBytes,
        profileFormatted: formatSize(profileBytes),
        percentUsed: parseFloat(percentUsed.toFixed(1)),
        quotaFormatted: '5.0 MB',

        coversTotalCount,
        coversBase64Count,
        coversUrlCount,
        coversSvgCount,
        coversStorageBytes,
        coversStorageFormatted: formatSize(coversStorageBytes),
        coversFilesBytes: totalCoversFilesBytes,
        coversFilesFormatted: formatSize(totalCoversFilesBytes),
        
        totalWithCoversBytes: totalBytes + totalCoversFilesBytes,
        totalWithCoversFormatted: formatSize(totalBytes + totalCoversFilesBytes)
      };
    } catch (e) {
      console.error('Erro ao calcular uso de armazenamento e capas:', e);
      return {
        totalBytes: 0,
        totalFormatted: '0 KB',
        gamesBytes: 0,
        gamesFormatted: '0 KB',
        gamesMetadataBytes: 0,
        gamesMetadataFormatted: '0 KB',
        settingsBytes: 0,
        settingsFormatted: '0 KB',
        profileBytes: 0,
        profileFormatted: '0 KB',
        percentUsed: 0,
        quotaFormatted: '5.0 MB',
        coversTotalCount: 0,
        coversBase64Count: 0,
        coversUrlCount: 0,
        coversSvgCount: 0,
        coversStorageBytes: 0,
        coversStorageFormatted: '0 KB',
        coversFilesBytes: 0,
        coversFilesFormatted: '0 KB',
        totalWithCoversBytes: 0,
        totalWithCoversFormatted: '0 KB'
      };
    }
  }

  // =========================================================================
  // CSV EXPORT & IMPORT (FORMATO OFICIAL COM 8 COLUNAS)
  // Cabeçalho: Jogos Zerados,Plataforma,Gênero,Data,Ano,Tempo de Jogo,Nota,Condição de Zerar
  // =========================================================================

  static exportToCsv(games) {
    const finishedGames = games.filter(g => g.status === 'Zerado');
    const headers = [
      'Jogos Zerados',
      'Plataforma',
      'Gênero',
      'Data',
      'Ano',
      'Tempo de Jogo',
      'Nota',
      'Condição de Zerar'
    ];
    
    const rows = finishedGames.map(game => {
      const safeTitle = `"${(game.title || '').replace(/"/g, '""')}"`;
      const safePlatform = `"${(game.platform || 'PC').replace(/"/g, '""')}"`;
      const safeGenre = `"${(game.genre || '').replace(/"/g, '""')}"`;
      const date = game.completionDate || '';
      const year = game.completionYear || this.extractCompletionYear(game.completionDate);
      const playtimeStr = `"${this.formatPlaytimeToHHMMSS(game.playtime || game.playtimeHours)}"`;
      const rating = game.rating !== null && game.rating !== undefined ? game.rating : 10;
      const condition = `"${(game.completionCondition || (game.isPlatinum ? 'Platinado/Perfeitos' : 'Condição Padrão')).replace(/"/g, '""')}"`;

      return [safeTitle, safePlatform, safeGenre, date, year, playtimeStr, rating, condition].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    return csvContent;
  }

  static parseCsvRaw(csvText, customDelimiter = null) {
    if (!csvText || typeof csvText !== 'string') {
      return { records: [], delimiter: ',' };
    }

    const cleanText = csvText.replace(/^\uFEFF/, '');
    if (!cleanText.trim()) {
      return { records: [], delimiter: ',' };
    }

    let delimiter = customDelimiter;
    if (!delimiter) {
      let firstLine = '';
      let inFirstQuote = false;
      for (let i = 0; i < cleanText.length; i++) {
        const c = cleanText[i];
        if (c === '"') inFirstQuote = !inFirstQuote;
        if (!inFirstQuote && (c === '\n' || c === '\r')) {
          firstLine = cleanText.slice(0, i);
          break;
        }
      }
      if (!firstLine) firstLine = cleanText;

      const commaCount = (firstLine.match(/,/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
      else if (semiCount > commaCount) delimiter = ';';
      else delimiter = ',';
    }

    const records = [];
    let currentRecord = [];
    let currentField = '';
    let inQuotes = false;
    const len = cleanText.length;

    for (let i = 0; i < len; i++) {
      const char = cleanText[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < len && cleanText[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          currentRecord.push(currentField.trim());
          currentField = '';
        } else if (char === '\r') {
          if (i + 1 < len && cleanText[i + 1] === '\n') {
            i++;
          }
          currentRecord.push(currentField.trim());
          currentField = '';
          if (currentRecord.some(f => f.length > 0)) {
            records.push(currentRecord);
          }
          currentRecord = [];
        } else if (char === '\n') {
          currentRecord.push(currentField.trim());
          currentField = '';
          if (currentRecord.some(f => f.length > 0)) {
            records.push(currentRecord);
          }
          currentRecord = [];
        } else {
          currentField += char;
        }
      }
    }

    if (currentField.length > 0 || currentRecord.length > 0) {
      currentRecord.push(currentField.trim());
      if (currentRecord.some(f => f.length > 0)) {
        records.push(currentRecord);
      }
    }

    return { records, delimiter };
  }

  static parseCsv(csvText) {
    if (!csvText || typeof csvText !== 'string') {
      throw new Error('Conteúdo CSV vazio ou inválido.');
    }

    const { records } = this.parseCsvRaw(csvText);
    if (records.length === 0) {
      throw new Error('O arquivo CSV não contém dados.');
    }

    const importedGames = [];
    const seenTitles = new Set();

    let colMap = {
      title: 0,
      platform: 1,
      genre: 2,
      date: 3,
      year: 4,
      playtime: 5,
      rating: 6,
      condition: 7
    };

    let startIndex = 0;
    const firstRowCols = records[0].map(c => (c || '').toLowerCase().trim());

    const isPlaytimeHeader = (c) => c.includes('tempo') || c.includes('playtime') || c.includes('horas') || c.includes('hours') || c.includes('duração') || c.includes('duracao') || (c.includes('time') && !c.includes('title'));
    const isTitleHeader = (c) => !isPlaytimeHeader(c) && !c.includes('zerar') && !c.includes('conclu') && (c === 'jogos zerados' || c === 'jogo' || c === 'jogos' || c === 'título' || c === 'titulo' || c === 'title' || c === 'game' || c === 'games' || c === 'nome' || c === 'nome do jogo');
    const isPlatformHeader = (c) => c.includes('plataforma') || c.includes('platform') || c.includes('console') || c.includes('sistema') || c.includes('system');
    const isGenreHeader = (c) => c.includes('gênero') || c.includes('genero') || c.includes('genre') || c.includes('categoria') || c.includes('tags');
    const isDateHeader = (c) => !c.includes('ano') && !c.includes('year') && (c.includes('data') || c.includes('date') || c.includes('conclus') || c.includes('finished'));
    const isYearHeader = (c) => c.includes('ano') || c.includes('year');
    const isRatingHeader = (c) => c.includes('nota') || c.includes('rating') || c.includes('score') || c.includes('avalia') || c.includes('stars') || c.includes('grade');
    const isConditionHeader = (c) => c.includes('condição') || c.includes('condicao') || c.includes('condition') || c.includes('status de zerar') || (c.includes('zerar') && !c.includes('jogos'));
    const isStatusHeader = (c) => c.includes('status') || c.includes('estado') || c.includes('situação') || c.includes('situacao') || c.includes('fila');

    let headerMatches = 0;
    if (firstRowCols.some(isTitleHeader)) headerMatches++;
    if (firstRowCols.some(isPlatformHeader)) headerMatches++;
    if (firstRowCols.some(isGenreHeader)) headerMatches++;
    if (firstRowCols.some(isDateHeader)) headerMatches++;
    if (firstRowCols.some(isYearHeader)) headerMatches++;
    if (firstRowCols.some(isPlaytimeHeader)) headerMatches++;
    if (firstRowCols.some(isRatingHeader)) headerMatches++;
    if (firstRowCols.some(isConditionHeader)) headerMatches++;
    if (firstRowCols.some(isStatusHeader)) headerMatches++;

    const firstColIsExplicitTitleHeader = isTitleHeader(firstRowCols[0]);
    const hasHeader = firstColIsExplicitTitleHeader || (headerMatches >= 2);

    if (hasHeader) {
      startIndex = 1;
      const detectedMap = {};
      firstRowCols.forEach((colName, idx) => {
        if (isPlaytimeHeader(colName) && detectedMap.playtime === undefined) {
          detectedMap.playtime = idx;
        } else if (isTitleHeader(colName) && detectedMap.title === undefined) {
          detectedMap.title = idx;
        } else if (isPlatformHeader(colName) && detectedMap.platform === undefined) {
          detectedMap.platform = idx;
        } else if (isGenreHeader(colName) && detectedMap.genre === undefined) {
          detectedMap.genre = idx;
        } else if (isDateHeader(colName) && detectedMap.date === undefined) {
          detectedMap.date = idx;
        } else if (isYearHeader(colName) && detectedMap.year === undefined) {
          detectedMap.year = idx;
        } else if (isRatingHeader(colName) && detectedMap.rating === undefined) {
          detectedMap.rating = idx;
        } else if (isConditionHeader(colName) && detectedMap.condition === undefined) {
          detectedMap.condition = idx;
        } else if (isStatusHeader(colName) && detectedMap.status === undefined) {
          detectedMap.status = idx;
        }
      });
      colMap = { ...colMap, ...detectedMap };
    }

    for (let i = startIndex; i < records.length; i++) {
      const cols = records[i];
      if (!cols || cols.length === 0) continue;

      let rawTitle = (cols[colMap.title] !== undefined ? cols[colMap.title] : cols[0]) || '';
      let title = rawTitle.replace(/[\r\n]+/g, ' ').replace(/^["']+|["']+$/g, '').trim();
      if (!title) continue;

      let rawPlatform = (cols[colMap.platform] !== undefined ? cols[colMap.platform] : (cols[1] || 'PC')).trim();
      rawPlatform = rawPlatform.replace(/[\r\n]+/g, ' ').replace(/^["']+|["']+$/g, '').trim();
      const pLow = rawPlatform.toLowerCase();
      if (pLow === 'pc (windows / steam)' || pLow === 'pc / steam' || pLow === 'pc (windows)' || pLow === 'pc(windows/steam)' || pLow === 'pc (windows/steam)') {
        rawPlatform = 'PC';
      }
      const platform = rawPlatform || 'PC';

      const rawGenre = (cols[colMap.genre] !== undefined ? cols[colMap.genre] : (cols[2] || '')).replace(/[\r\n]+/g, ' ').trim();
      const genre = this.formatGenres(rawGenre);

      let rawDate = (cols[colMap.date] !== undefined ? cols[colMap.date] : (cols[3] || '')).replace(/[\r\n]+/g, ' ').trim();
      let completionDate = '';
      if (rawDate) {
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDate)) {
          const [d, m, y] = rawDate.split('/');
          completionDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(rawDate)) {
          const [y, m, d] = rawDate.split('-');
          completionDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(rawDate)) {
          const [d, m, y] = rawDate.split('-');
          completionDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(rawDate)) {
          const [y, m, d] = rawDate.split('/');
          completionDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else {
          const yearMatch = rawDate.match(/\b(19\d{2}|20\d{2})\b/);
          if (yearMatch) {
            completionDate = `${yearMatch[1]}-01-01`;
          }
        }
      }
      if (!completionDate) {
        completionDate = new Date().toISOString().split('T')[0];
      }

      const rawYear = (cols[colMap.year] !== undefined ? cols[colMap.year] : (cols[4] || '')).replace(/[\r\n]+/g, ' ').trim();
      const completionYear = this.extractCompletionYear(completionDate, rawYear);

      const rawPlaytime = (cols[colMap.playtime] !== undefined ? cols[colMap.playtime] : (cols[5] || '00:00:00')).replace(/[\r\n]+/g, ' ').trim();
      const formattedPlaytime = this.formatPlaytimeToHHMMSS(rawPlaytime);
      const playtimeHours = this.playtimeToHours(formattedPlaytime);

      let rating = 10;
      const ratingVal = cols[colMap.rating] !== undefined ? cols[colMap.rating] : cols[6];
      if (ratingVal !== undefined && ratingVal !== null && ratingVal !== '') {
        const rawRating = String(ratingVal).replace(/[\r\n]+/g, ' ').trim();
        const ratingLower = rawRating.toLowerCase();

        if (
          rawRating.includes('⭐') ||
          rawRating.includes('★') ||
          rawRating.includes('🌟') ||
          rawRating.includes('✨') ||
          rawRating.includes('🌠') ||
          ratingLower.includes('obra-prima') ||
          ratingLower.includes('masterpiece') ||
          rawRating === '11'
        ) {
          rating = 11;
        } else {
          const parsedNumber = parseFloat(rawRating.replace(',', '.'));
          if (!isNaN(parsedNumber)) {
            rating = Math.max(1, Math.min(11, Math.round(parsedNumber)));
          }
        }
      }

      const rawCondition = (cols[colMap.condition] !== undefined ? cols[colMap.condition] : (cols[7] || '')).replace(/[\r\n]+/g, ' ').trim();
      const completionCondition = this.normalizeCompletionCondition(rawCondition);
      const isPlatinum = completionCondition === 'Platinado/Perfeitos';

      const titleKey = title.toLowerCase();
      const isReplay = seenTitles.has(titleKey);
      seenTitles.add(titleKey);

      const coverUrl = window.PlaceholderGenerator
        ? window.PlaceholderGenerator.generate(title, platform)
        : '';

      const isHandheldParsed = Boolean(
        isPcPlatform(platform) &&
        (pLow.includes('steam deck') || pLow.includes('portátil') || pLow.includes('portatil') || pLow.includes('handheld') || pLow.includes('deck'))
      );

      let status = 'Zerado';
      if (colMap.status !== undefined && cols[colMap.status] !== undefined) {
        const rawStat = String(cols[colMap.status]).replace(/[\r\n]+/g, ' ').trim().toLowerCase();
        if (rawStat === 'backlog' || rawStat === 'fila' || rawStat === 'quero jogar') {
          status = 'Backlog';
        } else if (rawStat === 'jogando' || rawStat === 'playing' || rawStat === 'nowplaying') {
          status = 'Jogando';
        } else if (rawStat === 'zerado' || rawStat === 'concluído' || rawStat === 'concluido' || rawStat === 'finished') {
          status = 'Zerado';
        }
      }
      const isZerado = status === 'Zerado';

      importedGames.push({
        id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${i}`,
        title,
        platform,
        genre,
        status,
        rating: isZerado ? rating : null,
        completionDate: isZerado ? completionDate : null,
        completionYear: isZerado ? completionYear : null,
        playtime: formattedPlaytime,
        playtimeHours,
        completionCondition,
        isHandheld: isHandheldParsed,
        isEarlyAccess: false,
        isPlatinum,
        isReplay,
        isNowPlaying: status === 'Jogando',
        coverUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    if (importedGames.length === 0) {
      throw new Error('Nenhum jogo válido encontrado para importar.');
    }

    return importedGames;
  }

  // =========================================================================
  // JSON BACKUP & RESTORE
  // =========================================================================

  static exportBackup(games, settings, profile = null, playingCategories = []) {
    const backupData = {
      version: '4.0',
      timestamp: new Date().toISOString(),
      appName: 'Nota 11 - Game Tracker',
      totalGames: games.length,
      games,
      profile: profile || this.loadUserProfile(),
      settings: settings || this.loadSettings(),
      playingCategories: playingCategories || this.getPlayingCategories()
    };

    return JSON.stringify(backupData, null, 2);
  }

  static parseJsonBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data) {
        throw new Error('Arquivo JSON vazio ou formato inválido.');
      }

      const gamesRaw = Array.isArray(data.games) ? data.games : (data.profiles && data.profiles[0]?.games ? data.profiles[0].games : null);
      if (!Array.isArray(gamesRaw)) {
        throw new Error('Estrutura de arquivo JSON inválida. A propriedade "games" não foi encontrada.');
      }

      const sanitizedGames = gamesRaw.map(game => {
        let platform = (game.platform || 'PC').trim();
        const pLow = platform.toLowerCase();
        if (pLow === 'pc (windows / steam)' || pLow === 'pc / steam' || pLow === 'pc (windows)' || pLow === 'pc(windows/steam)') {
          platform = 'PC';
        }
        const condition = this.normalizeCompletionCondition(game.completionCondition, Boolean(game.isPlatinum));
        const isPlat = condition === 'Platinado/Perfeitos';
        const formattedPlaytime = this.formatPlaytimeToHHMMSS(game.playtime || game.playtimeHours || 0);

        let normalizedStatus = 'Zerado';
        const rawStatus = (game.status || '').toString().trim().toLowerCase();
        if (rawStatus === 'backlog' || rawStatus === 'fila' || rawStatus === 'quero jogar') {
          normalizedStatus = 'Backlog';
        } else if (rawStatus === 'jogando' || rawStatus === 'playing' || rawStatus === 'nowplaying' || Boolean(game.isNowPlaying)) {
          normalizedStatus = 'Jogando';
        } else if (rawStatus === 'zerado' || rawStatus === 'concluído' || rawStatus === 'concluido' || rawStatus === 'finished') {
          normalizedStatus = 'Zerado';
        } else if (game.status) {
          normalizedStatus = game.status;
        }

        const isZerado = normalizedStatus === 'Zerado';
        const year = isZerado ? this.extractCompletionYear(game.completionDate, game.completionYear) : null;
        const isHandheldFinal = isPcPlatform(platform) ? Boolean(game.isHandheld) : false;

        return {
          id: game.id || `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          title: game.title || 'Jogo Sem Título',
          platform,
          genre: this.formatGenres(game.genre || ''),
          status: normalizedStatus,
          rating: isZerado && game.rating !== undefined && game.rating !== null ? Math.max(1, Math.min(11, Number(game.rating))) : null,
          completionDate: isZerado ? (game.completionDate || null) : null,
          completionYear: year,
          playtime: formattedPlaytime,
          playtimeHours: game.playtimeHours !== undefined ? Number(game.playtimeHours) : this.playtimeToHours(formattedPlaytime),
          completionCondition: condition,
          isHandheld: isHandheldFinal,
          isEarlyAccess: Boolean(game.isEarlyAccess),
          isPlatinum: isPlat,
          isReplay: Boolean(game.isReplay),
          isNowPlaying: normalizedStatus === 'Jogando',
          priority: game.priority || null,
          playingCategory: game.playingCategory || null,
          coverUrl: game.coverUrl || (window.PlaceholderGenerator ? window.PlaceholderGenerator.generate(game.title, platform) : ''),
          createdAt: game.createdAt || new Date().toISOString(),
          updatedAt: game.updatedAt || new Date().toISOString()
        };
      });

      const profileRaw = data.profile || (data.profiles && data.profiles[0] ? data.profiles[0] : null);
      const sanitizedProfile = profileRaw ? {
        ...DEFAULT_PROFILE,
        ...profileRaw,
        top5GameIds: Array.isArray(profileRaw.top5GameIds) ? profileRaw.top5GameIds : (Array.isArray(profileRaw.top5Games) ? profileRaw.top5Games.map(g => typeof g === 'string' ? g : g?.id).filter(Boolean) : []),
        top5Games: Array.isArray(profileRaw.top5Games) ? profileRaw.top5Games : [],
        myConsoles: typeof profileRaw.myConsoles === 'string' ? profileRaw.myConsoles : (Array.isArray(profileRaw.myConsoles) ? profileRaw.myConsoles.join('\n') : ''),
        mySetup: typeof profileRaw.mySetup === 'string' ? profileRaw.mySetup : '',
        socialTwitter: typeof profileRaw.socialTwitter === 'string' ? profileRaw.socialTwitter.trim() : '',
        socialInstagram: typeof profileRaw.socialInstagram === 'string' ? profileRaw.socialInstagram.trim() : '',
        socialWebsite: typeof profileRaw.socialWebsite === 'string' ? profileRaw.socialWebsite.trim() : '',
        socialSteam: typeof profileRaw.socialSteam === 'string' ? profileRaw.socialSteam.trim() : '',
        socialTwitch: typeof profileRaw.socialTwitch === 'string' ? profileRaw.socialTwitch.trim() : '',
        socialDiscord: typeof profileRaw.socialDiscord === 'string' ? profileRaw.socialDiscord.trim() : '',
        socialYoutube: typeof profileRaw.socialYoutube === 'string' ? profileRaw.socialYoutube.trim() : ''
      } : null;

      const sanitizedCategories = Array.isArray(data.playingCategories) ? data.playingCategories.map(c => {
        if (typeof c === 'string') {
          return { id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: c.trim(), icon: 'folder' };
        }
        return {
          id: c.id || `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: (c.name || 'Nova Categoria').trim(),
          icon: c.icon || 'folder'
        };
      }) : [];

      return {
        games: sanitizedGames,
        profile: sanitizedProfile,
        settings: data.settings || null,
        playingCategories: sanitizedCategories
      };
    } catch (e) {
      throw new Error(`Falha ao restaurar backup JSON: ${e.message}`);
    }
  }

  static triggerDownload(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Expõe no escopo global
StorageService.DEFAULT_PROFILE = DEFAULT_PROFILE;
window.StorageService = StorageService;
window.SAMPLE_GAMES = SAMPLE_GAMES;
window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
window.DEFAULT_PROFILE = DEFAULT_PROFILE;
window.COMPLETION_CONDITIONS = COMPLETION_CONDITIONS;
