/**
 * Game Tracker "Nota 11" - Main Application Logic (Vue 3)
 * Compatível tanto com execução direta (duplo clique no index.html) quanto servidores web.
 * Sem dependências de APIs externas: entrada direta de URL com atalho inteligente para Google Imagens.
 */

function initApp() {
  if (!window.Vue) {
    console.error('Vue 3 não foi carregado corretamente.');
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.removeAttribute('v-cloak');
      appEl.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #ef4444; font-family: sans-serif;">
          <h2 style="font-size: 24px; margin-bottom: 12px; color: #f59e0b;">Nota 11 - Carregando Interface</h2>
          <p style="color: #94a3b8; margin-bottom: 20px;">Os scripts da interface estão sendo inicializados...</p>
          <button onclick="location.reload()" style="background: #6366f1; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Recarregar</button>
        </div>
      `;
    }
    return;
  }

  const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;
  const StorageService = window.StorageService;
  const PlaceholderGenerator = window.PlaceholderGenerator;
  const IgdbService = window.IgdbService || window.IGDBService;
  const ScreenScraperService = window.ScreenScraperService;
  const SAMPLE_GAMES = window.SAMPLE_GAMES || [];
  const DEFAULT_PROFILE = (typeof window !== 'undefined' && window.DEFAULT_PROFILE) || (StorageService && StorageService.DEFAULT_PROFILE) || {
    name: 'Jogador',
    nickname: 'Gamer Master',
    avatarUrl: '',
    bio: 'Registro pessoal de jogos concluídos, tempos e avaliações.',
    favoritePlatform: 'PC - Computador',
    favoriteGenre: '',
    top5GameIds: [],
    top5Games: [],
    myConsoles: [],
    mySetup: ''
  };

  const app = createApp({
    setup() {
      // =======================================================================
      // REATIVIDADE & ESTADO DA APLICAÇÃO
      // =======================================================================
      const games = ref([]);
      const settings = ref(StorageService ? StorageService.loadSettings() : {});
      // Estado de Navegação, Visão e Formato de Exibição
      const activePage = ref('library'); // 'library' | 'stats'
      
      // Agrupamento: 'year' (Por Ano - Padrão de Alta Performance) | 'all' (Geral / Mostrar Tudo Junto)
      const currentGrouping = ref(
        settings.value.grouping || 
        (settings.value.defaultView === 'all' ? 'all' : 'year')
      );

      // Formato de Layout: 'grid' (Grade/Cards) | 'table' (Tabela/Lista)
      const currentLayout = ref(
        settings.value.layout || 
        (settings.value.defaultView === 'table' ? 'table' : (settings.value.yearViewMode || 'grid'))
      );

      // Pontes de compatibilidade reativa
      const currentView = computed({
        get: () => currentGrouping.value === 'year' ? 'year' : currentLayout.value,
        set: (val) => {
          if (val === 'year') {
            currentGrouping.value = 'year';
          } else {
            currentGrouping.value = 'all';
            currentLayout.value = val;
          }
        }
      });
      const yearViewMode = computed({
        get: () => currentLayout.value,
        set: (val) => {
          currentLayout.value = val;
        }
      });

      // Ano Vigente e Aba de Ano Selecionada (Padrão: Ano Atual)
      const currentCalendarYear = new Date().getFullYear();
      const savedYearTab = localStorage.getItem('nota11_selected_year_tab');
      const selectedYearTab = ref(savedYearTab && savedYearTab !== 'ALL' ? Number(savedYearTab) : currentCalendarYear);
      const isCurrentYear = (year) => Number(year) === currentCalendarYear;

      const hideTableCovers = ref(Boolean(settings.value.hideTableCovers));

      // Filtros e Ordenação
      const searchQuery = ref('');
      const platformFilter = ref('ALL');
      const genreFilter = ref('ALL');
      const ratingFilter = ref('ALL');
      const conditionFilter = ref('ALL');
      const yearFilter = ref('ALL');
      const sortBy = ref('date-desc');
      const onlyHandheldFilter = ref(false);
      const onlyPlatinumFilter = ref(false);
      const onlyReplayFilter = ref(false);
      const onlyEarlyAccessFilter = ref(false);
      const onlyDuplicatesFilter = ref(false);
      const isMobileFilterOpen = ref(false);
      const isZeradosControlsOpen = ref(false);
      const toggleZeradosControls = () => {
        isZeradosControlsOpen.value = !isZeradosControlsOpen.value;
        nextTick(() => refreshLucideIcons());
      };
      const isNarrowScreen = ref(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

      const activeFiltersCount = computed(() => {
        let count = 0;
        if (platformFilter.value !== 'ALL') count++;
        if (genreFilter.value !== 'ALL') count++;
        if (ratingFilter.value !== 'ALL') count++;
        if (conditionFilter.value !== 'ALL') count++;
        if (yearFilter.value !== 'ALL') count++;
        if (onlyHandheldFilter.value) count++;
        if (onlyPlatinumFilter.value) count++;
        if (onlyReplayFilter.value) count++;
        if (onlyEarlyAccessFilter.value) count++;
        if (onlyDuplicatesFilter.value) count++;
        return count;
      });

      const resetAllFilters = () => {
        searchQuery.value = '';
        platformFilter.value = 'ALL';
        genreFilter.value = 'ALL';
        ratingFilter.value = 'ALL';
        conditionFilter.value = 'ALL';
        yearFilter.value = 'ALL';
        onlyHandheldFilter.value = false;
        onlyPlatinumFilter.value = false;
        onlyReplayFilter.value = false;
        onlyEarlyAccessFilter.value = false;
        onlyDuplicatesFilter.value = false;
      };

      // Categorias Customizadas, Layouts (Grade vs Tabela) e Barra de Zoom Dinâmica
      const heroTab = ref(localStorage.getItem('nota11_hero_tab') || 'nowPlaying'); // 'nowPlaying' | 'finished' | 'backlog'
      const playingCategories = ref(StorageService ? StorageService.getPlayingCategories() : []);
      const nowPlayingViewMode = ref(localStorage.getItem('nota11_nowplaying_view') || 'shelves'); // 'shelves' | 'unified'
      const nowPlayingLayout = ref(
        localStorage.getItem('nota11_nowplaying_layout') || (localStorage.getItem('nota11_nowplaying_card_size') === 'list' ? 'table' : 'grid')
      ); // 'grid' | 'table'
      const backlogLayout = ref(
        localStorage.getItem('nota11_backlog_layout') || (localStorage.getItem('nota11_backlog_card_size') === 'list' ? 'table' : 'grid')
      ); // 'grid' | 'table'
      const cardZoom = ref(
        parseInt(localStorage.getItem('nota11_card_zoom') || '165', 10) || 165
      ); // 95px a 275px (default 165px)
      const nowPlayingCardSize = ref(localStorage.getItem('nota11_nowplaying_card_size') || 'normal');
      const backlogCardSize = ref(localStorage.getItem('nota11_backlog_card_size') || 'normal');
      const isNowPlayingLayoutMenuOpen = ref(false);
      const isBacklogLayoutMenuOpen = ref(false);
      const isBacklogHltbSyncing = ref(false);
      const isManagePlayingCategoriesOpen = ref(false);
      const newCategoryName = ref('');
      const newCategoryIcon = ref('folder');
      const editingCategoryId = ref(null);
      const editingCategoryName = ref('');

      const categoryPresets = [
        { name: 'Singleplayer', icon: 'user' },
        { name: 'Multiplayer / Online', icon: 'users' },
        { name: 'Jogando com Amigos', icon: 'heart' },
        { name: 'Portáteis / Viagem', icon: 'gamepad-2' },
        { name: 'Campanha Principal', icon: 'sword' },
        { name: 'Casuais / Relax', icon: 'coffee' },
        { name: 'Rumo à Platina', icon: 'trophy' }
      ];

      // Modais
      const isAddEditOpen = ref(false);
      const isQuickFinishOpen = ref(false);
      const isBackupOpen = ref(false);
      const isDeleteConfirmOpen = ref(false);
      const isDetailOpen = ref(false);
      const isClearAllModalOpen = ref(false);
      const isScraperModalOpen = ref(false);
      const isScraperPickerOpen = ref(false);
      const isProfileOpen = ref(false);
      const isEditProfileOpen = ref(false);
      const isTop5ModalOpen = ref(false);
      const isConsolesModalOpen = ref(false);
      const isSetupModalOpen = ref(false);
      const isResetProfileConfirmOpen = ref(false);
      const isAboutOpen = ref(false);
      const appVersion = ref('beta web 1.0');
      const appVersionDisplay = ref('beta web 1.0');
      const isToolsMenuOpen = ref(false);
      const isNowPlayingMenuOpen = ref(false);
      const isShareModalOpen = ref(false);
      const isPickFinishedGameOpen = ref(false);
      const pickFinishedSearchQuery = ref('');

      // Estado de Nuvem, Autenticação e Sincronização Supabase (GitHub Pages + Nuvem)
      const isCloudModalOpen = ref(false);
      const cloudModalTab = ref('login'); // 'login' | 'register' | 'forgot' | 'reset_password' | 'account' | 'config'
      const cloudUser = ref(null);
      const isCloudLoading = ref(false);
      const isCloudSyncing = ref(false);
      const lastCloudSync = ref(window.SupabaseService ? window.SupabaseService.getLastSyncTime() : null);
      const cloudAutoSyncEnabled = ref(localStorage.getItem('nota11_cloud_autosync') !== 'false');
      const cloudErrorMessage = ref('');
      const cloudSuccessMessage = ref('');
      const cloudAuthForm = ref({
        email: '',
        password: '',
        confirmPassword: '',
        showPassword: false
      });
      const cloudResetForm = ref({
        password: '',
        confirmPassword: '',
        showPassword: false
      });
      const cloudChangePasswordForm = ref({
        password: '',
        confirmPassword: '',
        showPassword: false
      });
      const cloudConfigForm = ref({
        url: window.SupabaseService ? window.SupabaseService.getConfig().url : '',
        anonKey: window.SupabaseService ? window.SupabaseService.getConfig().anonKey : '',
        isTesting: false,
        testResult: null
      });

      // Estado de Perfil Público Compartilhado (Somente Leitura)
      const isPublicViewMode = ref(false);
      const publicProfileIdentifier = ref('');
      const publicProfileOwnerName = ref('');
      const isPublicLoading = ref(false);
      const publicProfileError = ref('');

      const ownAppUrl = computed(() => {
        const origin = window.location.origin;
        let path = window.location.pathname.replace(/\/(index|404)\.html$/i, '');
        if (!path.endsWith('/')) path += '/';
        return origin + path;
      });

      const publicProfileShareUrl = computed(() => {
        const hasSync = Boolean(lastCloudSync.value || (window.SupabaseService && window.SupabaseService.getLastSyncTime()));
        if (!hasSync) return '';

        const nick = (userProfile.value && userProfile.value.nickname ? userProfile.value.nickname : '').trim();
        const nm = (userProfile.value && userProfile.value.name ? userProfile.value.name : '').trim();
        const rawSlug = nick || nm || (cloudUser.value ? cloudUser.value.id : '');
        if (!rawSlug) return '';

        const origin = window.location.origin;
        let path = window.location.pathname.replace(/\/(index|404)\.html$/i, '');
        if (!path.endsWith('/')) path += '/';
        return `${origin}${path}?u=${encodeURIComponent(rawSlug)}&page=profile`;
      });

      const publicProfileQueryUrl = computed(() => {
        return publicProfileShareUrl.value;
      });

      const copyPublicProfileUrl = async () => {
        const url = publicProfileShareUrl.value;
        if (!url) {
          showToast('Faça o upload da sua lista para a nuvem para gerar o link público.', 'warning');
          return;
        }

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
          } else {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          showToast('Link do perfil público copiado! Compartilhe com seus amigos.', 'success');
        } catch (err) {
          showToast('Erro ao copiar link: ' + err.message, 'error');
        }
      };

      const loadPublicProfile = async (identifier) => {
        isPublicLoading.value = true;
        publicProfileError.value = '';
        try {
          if (!window.SupabaseService) {
            throw new Error('Serviço de nuvem Supabase indisponível no momento.');
          }
          const cleanId = String(identifier || '').trim();
          if (!cleanId) {
            publicProfileError.value = 'Nenhum identificador de perfil informado.';
            return false;
          }

          const publicData = await window.SupabaseService.loadPublicUserData(cleanId);
          if (!publicData) {
            publicProfileError.value = `O perfil "${cleanId}" não foi encontrado na nuvem ou ainda não sincronizou seus dados.`;
            return false;
          }

          const rawGames = Array.isArray(publicData.games) ? publicData.games : [];
          games.value = rawGames.map(g => {
            let platform = (g.platform || 'PC').trim();
            const pLow = platform.toLowerCase();
            if (pLow === 'pc (windows / steam)' || pLow === 'pc / steam' || pLow === 'pc (windows)' || pLow === 'pc(windows/steam)') {
              platform = 'PC';
            }

            let normalizedStatus = 'Zerado';
            const rawStatus = (g.status || '').toString().trim().toLowerCase();
            if (rawStatus === 'backlog' || rawStatus === 'fila' || rawStatus === 'quero jogar') {
              normalizedStatus = 'Backlog';
            } else if (rawStatus === 'jogando' || rawStatus === 'playing' || rawStatus === 'nowplaying' || Boolean(g.isNowPlaying)) {
              normalizedStatus = 'Jogando';
            } else if (rawStatus === 'zerado' || rawStatus === 'concluído' || rawStatus === 'concluido' || rawStatus === 'finished') {
              normalizedStatus = 'Zerado';
            } else if (g.status) {
              normalizedStatus = g.status;
            }

            const condition = StorageService ? StorageService.normalizeCompletionCondition(g.completionCondition, Boolean(g.isPlatinum)) : (g.completionCondition || (g.isPlatinum ? 'Platinado/Perfeitos' : 'Condição Padrão'));
            const isPlat = condition === 'Platinado/Perfeitos';
            const pt = parsePlaytimeInput(g.playtime || g.playtimeHours || 0);
            const isZerado = normalizedStatus === 'Zerado';
            const year = isZerado ? (StorageService ? StorageService.extractCompletionYear(g.completionDate, g.completionYear) : (g.completionYear || null)) : null;

            return {
              ...g,
              platform,
              status: normalizedStatus,
              rating: isZerado && g.rating !== undefined && g.rating !== null ? Math.max(1, Math.min(11, Number(g.rating))) : null,
              completionDate: isZerado ? (g.completionDate || null) : null,
              completionYear: year,
              playtime: pt.str,
              playtimeHours: pt.hours,
              genre: g.genre || '',
              completionCondition: condition,
              isHandheld: Boolean(g.isHandheld),
              isEarlyAccess: Boolean(g.isEarlyAccess),
              isPlatinum: isPlat,
              isReplay: Boolean(g.isReplay),
              isNowPlaying: normalizedStatus === 'Jogando',
              priority: g.priority || null,
              playingCategory: g.playingCategory || null
            };
          });

          if (publicData.profile && typeof publicData.profile === 'object') {
            userProfile.value = {
              ...DEFAULT_PROFILE,
              ...publicData.profile,
              top5GameIds: Array.isArray(publicData.profile.top5GameIds) ? publicData.profile.top5GameIds : (Array.isArray(publicData.profile.top5Games) ? publicData.profile.top5Games.map(g => typeof g === 'string' ? g : g?.id).filter(Boolean) : []),
              top5Games: Array.isArray(publicData.profile.top5Games) ? publicData.profile.top5Games : [],
              myConsoles: Array.isArray(publicData.profile.myConsoles) ? publicData.profile.myConsoles : [],
              mySetup: typeof publicData.profile.mySetup === 'string' ? publicData.profile.mySetup : ''
            };
            publicProfileOwnerName.value = userProfile.value.nickname || userProfile.value.name || cleanId;
          } else {
            publicProfileOwnerName.value = cleanId;
          }

          if (Array.isArray(publicData.playingCategories)) {
            playingCategories.value = publicData.playingCategories;
          }

          document.title = `Nota 11 - Lista de Jogos de ${publicProfileOwnerName.value}`;
          return true;
        } catch (err) {
          console.error('[loadPublicProfile] Erro:', err);
          publicProfileError.value = err.message || 'Falha ao carregar perfil público.';
          return false;
        } finally {
          isPublicLoading.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      // Estado da Integração HowLongToBeat (HLTB)
      const isHltbModalOpen = ref(false);
      const isHltbSyncing = ref(false);
      const isHltbSingleLoading = ref(false);
      const hltbSyncFinished = ref(false);
      const hltbProgressPercent = ref(0);
      const hltbCurrentGameTitle = ref('');
      const hltbStats = ref({ total: 0, processed: 0, updated: 0, skipped: 0, failed: 0 });
      const hltbSyncLogs = ref([]);
      const isHltbCancelled = ref(false);
      const hltbConnectionStatus = ref(null);

      const hltbEligibleGames = computed(() => {
        return window.HltbService ? window.HltbService.getEligibleGames(games.value) : [];
      });
      const hltbEligibleCount = computed(() => hltbEligibleGames.value.length);

      // Estado do Gerador de Snapshots (Compartilhamento PNG)
      const shareSnapshotType = ref('nowPlaying'); // 'nowPlaying' | 'year' | 'stats'
      const shareSelectedYear = ref(currentCalendarYear);
      const shareTheme = ref('gold'); // 'gold' | 'steam' | 'emerald' | 'purple'
      const shareShowStats = ref(true);
      const shareShowProfile = ref(true);
      const shareShowDates = ref(true);
      const shareShowHighlights = ref(true);
      const isGeneratingSnapshot = ref(false);
      const snapshotCoverMap = ref({});
      const isPreloadingSnapshotCovers = ref(false);

      // Perfil do Usuário
      const userProfile = ref(StorageService ? StorageService.loadUserProfile() : (window.DEFAULT_PROFILE || {
        name: 'Jogador',
        nickname: 'Gamer Master',
        avatarUrl: '',
        bio: 'Registro pessoal de jogos concluídos, tempos e avaliações.',
        favoritePlatform: 'PC',
        favoriteGenre: '',
        top5GameIds: [],
        top5Games: [],
        myConsoles: [],
        mySetup: ''
      }));

      const editProfileForm = ref({
        name: userProfile.value.name || '',
        nickname: userProfile.value.nickname || '',
        avatarUrl: userProfile.value.avatarUrl || '',
        bio: userProfile.value.bio || '',
        favoritePlatform: userProfile.value.favoritePlatform || 'PC',
        favoriteGenre: userProfile.value.favoriteGenre || ''
      });

      // Informações de Armazenamento e Cache Local (incluindo tamanho das capas)
      const storageInfo = ref(StorageService ? StorageService.getStorageUsage(games.value, userProfile.value) : { totalFormatted: '0 KB', percentUsed: 0, coversFilesFormatted: '0 KB' });
      const refreshStorageInfo = () => {
        if (StorageService) {
          storageInfo.value = StorageService.getStorageUsage(games.value, userProfile.value);
        }
      };

      // IGDB State (Baixador de Capas & Metadados Oficial)
      const igdbForm = ref({
        clientId: settings.value.igdb_client_id || '',
        clientSecret: settings.value.igdb_client_secret || '',
        accessToken: settings.value.igdb_access_token || '',
        proxy: settings.value.igdb_proxy || '',
        scanMode: 'missing_only', // 'missing_only' | 'replace_all'
        targetMode: 'covers_and_genres', // 'covers_and_genres' | 'genres_only' | 'covers_only'
        rememberCredentials: true,
        showAdvanced: false
      });

      const scraperForm = igdbForm; // Alias para templates e compatibilidade

      const scraperState = ref({
        isRunning: false,
        shouldCancel: false,
        total: 0,
        current: 0,
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        currentGameTitle: '',
        log: [],
        isFinished: false
      });

      const singleScraperState = ref({
        isSearching: false,
        candidates: []
      });

      // Formulários e Itens Ativos
      const gameToFinish = ref(null);
      const quickFinishForm = ref({
        completionDate: new Date().toISOString().split('T')[0],
        completionYear: new Date().getFullYear(),
        playtime: '00:00:00',
        playtimeHours: 0,
        rating: 10,
        completionCondition: 'Condição Padrão',
        isHandheld: false,
        isEarlyAccess: false,
        isPlatinum: false,
        isReplay: false,
        keepPlaying: false,
        genre: ''
      });

      const isEditMode = ref(false);
      const hasSavedDraft = ref(false);
      const gameForm = ref({
        id: null,
        title: '',
        platform: 'PC - Computador',
        genre: '',
        status: 'Zerado',
        rating: 10,
        completionDate: new Date().toISOString().split('T')[0],
        completionYear: new Date().getFullYear(),
        playtime: '00:00:00',
        playtimeHours: 0,
        completionCondition: 'Condição Padrão',
        isHandheld: false,
        isEarlyAccess: false,
        isPlatinum: false,
        isReplay: false,
        isNowPlaying: false,
        priority: '',
        playingCategory: null,
        coverUrl: '',
        igdbId: ''
      });

      const gameToDelete = ref(null);
      const detailGame = ref(null);

      // Abas de Backup
      const activeBackupTab = ref('csv');

      // Toasts
      const toasts = ref([]);

      // =======================================================================
      // PLATAFORMAS COMPLETAS (DA 1ª GERAÇÃO AO PC E PORTÁTEIS)
      // =======================================================================
      const platformCategories = [
        {
          group: 'PC & Portáteis PC',
          items: [
            'PC - Computador',
            'PC - Steam Deck',
            'PC - Rog Ally',
            'Mac / Apple Silicon',
            'Linux'
          ]
        },
        {
          group: '9ª Geração (Atuais)',
          items: [
            'PlayStation 5',
            'Xbox Series X/S',
            'Nintendo Switch'
          ]
        },
        {
          group: '8ª Geração',
          items: [
            'PlayStation 4',
            'Xbox One',
            'Nintendo Wii U',
            'Nintendo 3DS / 2DS',
            'PlayStation Vita'
          ]
        },
        {
          group: '7ª Geração',
          items: [
            'PlayStation 3',
            'Xbox 360',
            'Nintendo Wii',
            'Nintendo DS',
            'PlayStation Portable (PSP)'
          ]
        },
        {
          group: '6ª Geração',
          items: [
            'PlayStation 2 (PS2)',
            'Xbox (Clássico)',
            'Nintendo GameCube',
            'Sega Dreamcast',
            'Game Boy Advance (GBA)'
          ]
        },
        {
          group: '5ª Geração (32/64 Bits)',
          items: [
            'PlayStation 1 (PS1)',
            'Nintendo 64 (N64)',
            'Sega Saturn',
            'Game Boy Color (GBC)'
          ]
        },
        {
          group: '4ª Geração (16 Bits)',
          items: [
            'Super Nintendo (SNES)',
            'Sega Mega Drive / Genesis',
            'Neo Geo AES/CD',
            'Game Boy (Clássico)',
            'Sega Game Gear'
          ]
        },
        {
          group: '3ª Geração (8 Bits)',
          items: [
            'Nintendo Entertainment System (NES / Famicom)',
            'Sega Master System',
            'Atari 7800'
          ]
        },
        {
          group: '1ª e 2ª Gerações (Era Clássica)',
          items: [
            'Atari 2600',
            'Atari 5200',
            'ColecoVision',
            'Intellivision',
            'Magnavox Odyssey'
          ]
        },
        {
          group: 'Smartphones & Outros',
          items: [
            'Android',
            'iOS (iPhone / iPad)',
            'Emuladores / RetroArch',
            'Outra Plataforma'
          ]
        }
      ];

      const defaultPlatforms = computed(() => {
        const list = [];
        platformCategories.forEach(cat => list.push(...cat.items));
        return list;
      });

      // =======================================================================
      // FUNÇÕES AUXILIARES DE PARSER & FORMATAÇÃO DE TEMPO XX:XX:XX
      // =======================================================================
      const parsePlaytimeInput = (val) => {
        if (!StorageService) {
          return { str: '00:00:00', hours: 0 };
        }
        const formatted = StorageService.formatPlaytimeToHHMMSS(val);
        const hours = StorageService.playtimeToHours(formatted);
        return { str: formatted, hours };
      };

      const parsePlaytimeToHours = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const pt = parsePlaytimeInput(val);
        return pt.hours || 0;
      };

      // =======================================================================
      // LIFECYCLE & INICIALIZAÇÃO
      // =======================================================================
      const loadActiveProfileData = () => {
        if (!StorageService) return;
        const savedGames = StorageService.loadGames();
        games.value = (savedGames || []).map(g => {
          const pt = parsePlaytimeInput(g.playtime || g.playtimeHours || 0);
          const condition = StorageService.normalizeCompletionCondition(g.completionCondition, Boolean(g.isPlatinum));
          const year = g.status === 'Zerado' ? StorageService.extractCompletionYear(g.completionDate, g.completionYear) : null;
          return {
            ...g,
            playtime: pt.str,
            playtimeHours: pt.hours,
            genre: g.genre || '',
            completionYear: year,
            completionCondition: condition,
            isHandheld: Boolean(g.isHandheld),
            isEarlyAccess: Boolean(g.isEarlyAccess),
            isPlatinum: condition === 'Platinado/Perfeitos',
            isReplay: Boolean(g.isReplay),
            isNowPlaying: Boolean(g.isNowPlaying)
          };
        });

        userProfile.value = StorageService.loadUserProfile();
        settings.value = StorageService.loadSettings();
        playingCategories.value = StorageService.getPlayingCategories();

        editProfileForm.value = {
          name: userProfile.value.name || '',
          nickname: userProfile.value.nickname || '',
          avatarUrl: userProfile.value.avatarUrl || '',
          bio: userProfile.value.bio || '',
          favoritePlatform: userProfile.value.favoritePlatform || 'PC',
          favoriteGenre: userProfile.value.favoriteGenre || ''
        };

        igdbForm.value.clientId = settings.value.igdb_client_id || '';
        igdbForm.value.clientSecret = settings.value.igdb_client_secret || '';
        igdbForm.value.accessToken = settings.value.igdb_access_token || '';
        igdbForm.value.proxy = settings.value.igdb_proxy || '';

        refreshStorageInfo();
        nextTick(() => refreshLucideIcons());
      };

      const closeAllModals = () => {
        isAddEditOpen.value = false;
        isQuickFinishOpen.value = false;
        isBackupOpen.value = false;
        isDeleteConfirmOpen.value = false;
        isDetailOpen.value = false;
        isClearAllModalOpen.value = false;
        isScraperModalOpen.value = false;
        isScraperPickerOpen.value = false;
        isProfileOpen.value = false;
        isEditProfileOpen.value = false;
        isResetProfileConfirmOpen.value = false;
        isTop5ModalOpen.value = false;
        isConsolesModalOpen.value = false;
        isSetupModalOpen.value = false;
        isAboutOpen.value = false;
        isCloudModalOpen.value = false;
        isToolsMenuOpen.value = false;
        isNowPlayingMenuOpen.value = false;
        isNowPlayingLayoutMenuOpen.value = false;
        isBacklogLayoutMenuOpen.value = false;
        isManagePlayingCategoriesOpen.value = false;
        isShareModalOpen.value = false;
        isPickFinishedGameOpen.value = false;
        gameToFinish.value = null;
        gameToDelete.value = null;
        detailGame.value = null;
      };

      onMounted(async () => {
        // 1. Verifica se a URL contém parâmetro de perfil público (?u=... ou /Nota11/<slug>)
        const urlParams = new URLSearchParams(window.location.search);
        let publicSlug = urlParams.get('u') || urlParams.get('user') || urlParams.get('perfil') || urlParams.get('profile');

        if (!publicSlug && window.location.hash) {
          const hashMatch = window.location.hash.match(/#\/?u\/(.+)/i);
          if (hashMatch) publicSlug = decodeURIComponent(hashMatch[1]);
        }

        if (!publicSlug) {
          const pathSegments = window.location.pathname.split('/').filter(Boolean);
          if (pathSegments.length >= 2 && pathSegments[0].toLowerCase() === 'nota11') {
            const candidate = pathSegments[pathSegments.length - 1];
            if (candidate && !candidate.endsWith('.html') && candidate.toLowerCase() !== 'nota11') {
              publicSlug = decodeURIComponent(candidate);
            }
          }
        }

        if (publicSlug) {
          isPublicViewMode.value = true;
          publicProfileIdentifier.value = publicSlug.trim();
          await loadPublicProfile(publicProfileIdentifier.value);

          const pageParam = (urlParams.get('page') || urlParams.get('p') || '').toLowerCase();
          const tabParam = (urlParams.get('tab') || urlParams.get('aba') || '').toLowerCase();

          if (pageParam === 'profile' || pageParam === 'perfil' || tabParam === 'perfil' || tabParam === 'profile') {
            setActivePage('profile');
          } else if (pageParam === 'stats' || pageParam === 'estatisticas') {
            setActivePage('stats');
          } else if (tabParam === 'backlog') {
            setHeroTab('backlog');
          } else if (tabParam === 'jogando' || tabParam === 'nowplaying') {
            setHeroTab('nowPlaying');
          } else if (tabParam === 'zerados' || tabParam === 'finished') {
            setHeroTab('finished');
          } else if (nowPlayingGames.value.length === 0 && finishedGames.value.length > 0) {
            setHeroTab('finished');
          }
        } else {
          if (StorageService) {
            await StorageService.initNativeStorage();
            loadActiveProfileData();

            // Conecta listener de alterações locais para auto-sync com Supabase
            StorageService.onDataChanged = () => {
              if (cloudUser.value && cloudAutoSyncEnabled.value && !isCloudSyncing.value && games.value && games.value.length > 0) {
                debouncedCloudSync();
              }
            };
          }

          // Inicializa sessão e listener de autenticação Supabase
          if (window.SupabaseService) {
            initSupabaseAuth();
          }
        }

        refreshLucideIcons();
        window.addEventListener('resize', () => {
          isNarrowScreen.value = window.innerWidth < 768;
        });

        // Global Keyboard Shortcuts (Escape, /, Ctrl+K, N)
        window.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            closeAllModals();
            return;
          }

          const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
          const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;

          if ((e.key === '/' && !isInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
            e.preventDefault();
            const searchInput = document.querySelector('input[placeholder*="Buscar"]');
            if (searchInput) {
              searchInput.focus();
              searchInput.select();
            }
            return;
          }

          if (e.key.toLowerCase() === 'n' && !isInput && !isAddEditOpen.value && !isQuickFinishOpen.value && !isDetailOpen.value && !isProfileOpen.value && !isPublicViewMode.value) {
            e.preventDefault();
            openAddGame('Zerado');
          }
        });

        // Fechar dropdowns ao clicar fora
        window.addEventListener('click', (e) => {
          // Se o elemento foi desmontado ou não pertence mais ao DOM, ignore
          if (!e.target || !document.body.contains(e.target)) return;

          if (isNowPlayingLayoutMenuOpen.value) {
            const menuEl = document.querySelector('[data-nowplaying-layout-menu]');
            if (menuEl && !menuEl.contains(e.target)) {
              isNowPlayingLayoutMenuOpen.value = false;
            }
          }
          if (isNowPlayingMenuOpen.value) {
            const npMenuEl = document.querySelector('[data-nowplaying-options-menu]');
            if (npMenuEl && !npMenuEl.contains(e.target)) {
              isNowPlayingMenuOpen.value = false;
            }
          }
          if (isToolsMenuOpen.value) {
            const toolsMenuEl = document.querySelector('[data-tools-menu-container]');
            const mobileToolsBtn = document.querySelector('[data-mobile-tools-btn]');
            const mobileToolsSheet = document.querySelector('[data-mobile-tools-sheet]');
            if (
              (!toolsMenuEl || !toolsMenuEl.contains(e.target)) &&
              (!mobileToolsBtn || !mobileToolsBtn.contains(e.target)) &&
              (!mobileToolsSheet || !mobileToolsSheet.contains(e.target))
            ) {
              isToolsMenuOpen.value = false;
            }
          }
          if (isBacklogLayoutMenuOpen.value) {
            const bMenuEl = document.querySelector('[data-backlog-layout-menu]');
            if (bMenuEl && !bMenuEl.contains(e.target)) {
              isBacklogLayoutMenuOpen.value = false;
            }
          }
        });

        // Garante que o ano vigente ou o ano mais recente esteja selecionado por padrão
        const savedTab = localStorage.getItem('nota11_selected_year_tab');
        if (!savedTab || savedTab === 'ALL') {
          const currentCalYear = new Date().getFullYear();
          if (availableYears.value.includes(currentCalYear)) {
            selectedYearTab.value = currentCalYear;
          } else if (availableYears.value.length > 0) {
            selectedYearTab.value = availableYears.value[0];
          } else {
            selectedYearTab.value = currentCalYear;
          }
        }

        nextTick(() => {
          refreshLucideIcons();
          setTimeout(refreshLucideIcons, 100);
        });
      });

      // Salva automaticamente sempre que a lista de jogos mudar e recalcula armazenamento
      watch(games, (newGames) => {
        if (!isPublicViewMode.value && StorageService) {
          StorageService.saveGames(newGames);
        }
        refreshStorageInfo();
      }, { deep: true });

      // Recalcula armazenamento se o perfil mudar
      watch(userProfile, () => {
        if (!isPublicViewMode.value) {
          refreshStorageInfo();
        }
      }, { deep: true });

      // Salva rascunho do formulário de novo jogo em tempo real
      watch(gameForm, (newVal) => {
        if (!isEditMode.value && isAddEditOpen.value && StorageService) {
          const hasContent = Boolean(
            (newVal.title && newVal.title.trim()) ||
            (newVal.genre && newVal.genre.trim()) ||
            (newVal.coverUrl && newVal.coverUrl.trim()) ||
            (newVal.playtime && newVal.playtime !== '00:00:00' && newVal.playtime !== '0h' && newVal.playtime !== '0') ||
            newVal.isReplay ||
            newVal.isEarlyAccess ||
            newVal.isPlatinum
          );
          if (hasContent) {
            StorageService.saveAddGameDraft(newVal);
            hasSavedDraft.value = true;
          }
        }
      }, { deep: true });

      // Atualiza ícones quando a página, visão, filtros ou layout mudarem
      watch([activePage, currentView, selectedYearTab, onlyReplayFilter, onlyPlatinumFilter, onlyHandheldFilter, onlyEarlyAccessFilter, onlyDuplicatesFilter, nowPlayingLayout, backlogLayout, nowPlayingViewMode, heroTab, currentLayout], () => {
        refreshLucideIcons();
      });

      // Persiste preferência de ocultar capas na tabela
      watch(hideTableCovers, (newVal) => {
        if (settings.value) {
          settings.value.hideTableCovers = newVal;
          if (StorageService) {
            StorageService.saveSettings(settings.value);
          }
        }
        refreshLucideIcons();
      });

      // =======================================================================
      // COMPUTED PROPERTIES: FILTRAGEM, LISTAS & ESTATÍSTICAS
      // =======================================================================
      const nowPlayingGames = computed(() => {
        return games.value.filter(g => {
          const s = (g.status || '').toString().trim().toLowerCase();
          if (s === 'backlog' || s === 'fila' || s === 'quero jogar') return false;
          return g.status === 'Jogando' || s === 'jogando' || (g.status === 'Zerado' && Boolean(g.isNowPlaying));
        });
      });

      const playingShelves = computed(() => {
        if (!playingCategories.value || playingCategories.value.length === 0) {
          return [];
        }

        const categoryMap = new Map();
        playingCategories.value.forEach(cat => {
          categoryMap.set(cat.id, {
            id: cat.id,
            name: cat.name,
            icon: cat.icon || 'folder',
            games: []
          });
        });

        const uncategorizedGames = [];

        nowPlayingGames.value.forEach(game => {
          if (game.playingCategory && categoryMap.has(game.playingCategory)) {
            categoryMap.get(game.playingCategory).games.push(game);
          } else {
            const matchingCat = playingCategories.value.find(c => c.name.toLowerCase() === (game.playingCategory || '').toLowerCase());
            if (matchingCat && categoryMap.has(matchingCat.id)) {
              categoryMap.get(matchingCat.id).games.push(game);
            } else {
              uncategorizedGames.push(game);
            }
          }
        });

        const shelves = Array.from(categoryMap.values());

        if (uncategorizedGames.length > 0) {
          shelves.push({
            id: 'uncategorized',
            name: 'Outros / Sem Categoria',
            icon: 'layers',
            isDefault: true,
            games: uncategorizedGames
          });
        }

        return shelves;
      });

      const finishedGames = computed(() => {
        return games.value.filter(g => {
          const s = (g.status || '').toString().trim().toLowerCase();
          if (s === 'backlog' || s === 'fila' || s === 'quero jogar') return false;
          if (s === 'jogando') return false;
          return g.status === 'Zerado' || s === 'zerado' || s === 'finalizado' || s === 'concluido' || s === 'completed';
        });
      });

      const backlogGames = computed(() => {
        return games.value.filter(g => {
          const s = (g.status || '').toString().trim().toLowerCase();
          return s === 'backlog' || s === 'fila' || s === 'quero jogar' || g.status === 'Backlog';
        });
      });

      const backlogEligibleGames = computed(() => {
        return window.HltbService ? window.HltbService.getBacklogEligibleGames(backlogGames.value) : backlogGames.value.filter(g => !g.playtimeHours || g.playtimeHours === 0);
      });

      const availablePlatforms = computed(() => {
        const set = new Set();
        games.value.forEach(g => {
          if (g.platform) set.add(g.platform);
        });
        return Array.from(set).sort();
      });

      const availableGenres = computed(() => {
        const map = {};
        games.value.forEach(g => {
          const list = StorageService ? StorageService.parseGenres(g.genre) : (g.genre ? [g.genre] : []);
          list.forEach(gn => {
            if (!gn) return;
            const norm = gn.trim();
            if (!norm) return;
            map[norm] = (map[norm] || 0) + 1;
          });
        });
        return Object.keys(map)
          .map(name => ({ name, count: map[name] }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
      });

      const availableYears = computed(() => {
        const set = new Set();
        finishedGames.value.forEach(g => {
          if (g.completionYear) {
            set.add(Number(g.completionYear));
          } else if (g.completionDate) {
            const y = StorageService.extractCompletionYear(g.completionDate);
            if (y) set.add(y);
          }
        });
        return Array.from(set).sort((a, b) => b - a);
      });

      const completionConditions = [
        'Platinado/Perfeitos',
        'Condição Padrão',
        'Condição Reduzida',
        'Jogo sem fim'
      ];

      // =======================================================================
      // IDENTIFICAÇÃO DE JOGOS DUPLICADOS / REJOGADOS (DUPLICATE & REPLAY DETECTION)
      // =======================================================================
      const getGameDuplicateKey = (game) => {
        if (!game || !game.title) return '';
        const cleanTitle = (game.title || '').trim().toLowerCase();
        const cleanPlatform = (game.platform || '').trim().toLowerCase();
        const cleanStatus = (game.status || 'Zerado').trim().toLowerCase();
        const cleanPlaytime = String(game.playtime || game.playtimeHours || 0).trim();
        const cleanDate = (game.completionDate || '').trim();
        return `${cleanTitle}|${cleanPlatform}|${cleanStatus}|${cleanPlaytime}|${cleanDate}`;
      };

      const duplicateGameIds = computed(() => {
        const keyMap = new Map();
        const dupIds = new Set();
        
        for (const g of games.value) {
          const key = getGameDuplicateKey(g);
          if (!key) continue;
          if (!keyMap.has(key)) {
            keyMap.set(key, []);
          }
          keyMap.get(key).push(g.id);
        }

        for (const [key, ids] of keyMap.entries()) {
          if (ids.length > 1) {
            for (const id of ids) {
              dupIds.add(id);
            }
          }
        }

        return dupIds;
      });

      const isGameDuplicate = (game) => {
        if (!game || !game.id) return false;
        return duplicateGameIds.value.has(game.id);
      };

      // Precomputação O(N) de Replays com Set para consultas O(1) ultra-rápidas no template
      const replayGameIds = computed(() => {
        const repIds = new Set();
        const gamesByTitle = new Map();

        const allGames = games.value || [];
        for (let i = 0; i < allGames.length; i++) {
          const g = allGames[i];
          if (!g || !g.title) continue;
          if (g.isReplay) {
            repIds.add(g.id);
            continue;
          }
          const clean = g.title.trim().toLowerCase();
          let group = gamesByTitle.get(clean);
          if (!group) {
            group = [];
            gamesByTitle.set(clean, group);
          }
          group.push(g);
        }

        for (const list of gamesByTitle.values()) {
          if (list.length <= 1) continue;

          // Se tem 'Jogando' e múltiplos registros do mesmo jogo, o 'Jogando' é Replay
          for (let i = 0; i < list.length; i++) {
            const g = list[i];
            if (g.status === 'Jogando') {
              repIds.add(g.id);
            }
          }

          // Para os Zerados, o registro mais antigo é o original; os posteriores são Replay
          const finishedList = list.filter(g => g.status === 'Zerado');
          if (finishedList.length > 1) {
            finishedList.sort((a, b) => {
              const dateA = a.completionDate ? new Date(a.completionDate).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
              const dateB = b.completionDate ? new Date(b.completionDate).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
              return dateA - dateB;
            });
            for (let i = 1; i < finishedList.length; i++) {
              repIds.add(finishedList[i].id);
            }
          }
        }

        return repIds;
      });

      const isGameReplay = (game) => {
        if (!game || !game.id) return false;
        return replayGameIds.value.has(game.id);
      };

      const getReplayLabel = (game) => {
        if (!isGameReplay(game)) return null;
        return game.status === 'Jogando' ? 'Rejogando' : 'Rejogado';
      };

      const filteredFinishedGames = computed(() => {
        let list = [...finishedGames.value];

        // 1. Busca por Texto (Título, Plataforma, Gênero, Ano, Condição)
        if (searchQuery.value.trim()) {
          const q = searchQuery.value.toLowerCase().trim();
          list = list.filter(g => {
            const listGenres = StorageService ? StorageService.parseGenres(g.genre) : [];
            const genreMatch = (g.genre && g.genre.toLowerCase().includes(q)) || listGenres.some(gn => gn.toLowerCase().includes(q));
            return (
              (g.title && g.title.toLowerCase().includes(q)) ||
              (g.platform && g.platform.toLowerCase().includes(q)) ||
              genreMatch ||
              (g.completionYear && String(g.completionYear).includes(q)) ||
              (g.completionCondition && g.completionCondition.toLowerCase().includes(q))
            );
          });
        }

        // 2. Filtro de Plataforma
        if (platformFilter.value !== 'ALL') {
          list = list.filter(g => g.platform === platformFilter.value);
        }

        // 3. Filtro de Gênero Individual
        if (genreFilter.value !== 'ALL') {
          list = list.filter(g => {
            const listGenres = StorageService ? StorageService.parseGenres(g.genre) : (g.genre ? [g.genre] : []);
            return listGenres.some(gn => gn.toLowerCase() === genreFilter.value.toLowerCase());
          });
        }

        // 4. Filtro de Condição de Zerar
        if (conditionFilter.value !== 'ALL') {
          list = list.filter(g => g.completionCondition === conditionFilter.value);
        }

        // 5. Filtro de Ano
        if (yearFilter.value !== 'ALL') {
          list = list.filter(g => String(g.completionYear) === String(yearFilter.value));
        }

        // 6. Filtro de Nota (1 a 11)
        if (ratingFilter.value !== 'ALL') {
          if (ratingFilter.value === '11') {
            list = list.filter(g => g.rating === 11);
          } else if (ratingFilter.value === '9-10') {
            list = list.filter(g => g.rating >= 9 && g.rating <= 10);
          } else if (ratingFilter.value === '7-8') {
            list = list.filter(g => g.rating >= 7 && g.rating <= 8);
          } else if (ratingFilter.value === '1-6') {
            list = list.filter(g => g.rating >= 1 && g.rating <= 6);
          } else if (ratingFilter.value === '10') {
            list = list.filter(g => g.rating === 10);
          }
        }

        // 7. Filtro de Dispositivo Portátil (Steam Deck / PC)
        if (onlyHandheldFilter.value) {
          list = list.filter(g => isGameHandheld(g));
        }

        // 8. Filtro de Jogos Platinados
        if (onlyPlatinumFilter.value) {
          list = list.filter(g => g.completionCondition === 'Platinado/Perfeitos' || g.isPlatinum);
        }

        // 9. Filtro de Jogos Rejogados (Duplicados na lista)
        if (onlyReplayFilter.value) {
          list = list.filter(g => isGameReplay(g));
        }

        // 10. Filtro de Jogos em Early Access (Acesso Antecipado)
        if (onlyEarlyAccessFilter.value) {
          list = list.filter(g => g.isEarlyAccess);
        }

        // 11. Filtro de Possíveis Duplicados (Mesmos dados)
        if (onlyDuplicatesFilter.value) {
          list = list.filter(g => isGameDuplicate(g));
        }

        // 11. Ordenação
        list.sort((a, b) => {
          if (sortBy.value === 'custom') {
            return 0; // Ordem personalizada manual
          }
          if (sortBy.value === 'date-desc') {
            return new Date(b.completionDate || 0) - new Date(a.completionDate || 0);
          }
          if (sortBy.value === 'date-asc') {
            return new Date(a.completionDate || 0) - new Date(b.completionDate || 0);
          }
          if (sortBy.value === 'year-desc') {
            return (b.completionYear || 0) - (a.completionYear || 0);
          }
          if (sortBy.value === 'year-asc') {
            return (a.completionYear || 0) - (b.completionYear || 0);
          }
          if (sortBy.value === 'rating-desc') {
            return (b.rating || 0) - (a.rating || 0);
          }
          if (sortBy.value === 'rating-asc') {
            return (a.rating || 0) - (b.rating || 0);
          }
          if (sortBy.value === 'title-asc') {
            return (a.title || '').localeCompare(b.title || '');
          }
          if (sortBy.value === 'title-desc') {
            return (b.title || '').localeCompare(a.title || '');
          }
          if (sortBy.value === 'platform-asc') {
            return (a.platform || '').localeCompare(b.platform || '');
          }
          if (sortBy.value === 'platform-desc') {
            return (b.platform || '').localeCompare(a.platform || '');
          }
          if (sortBy.value === 'genre-asc') {
            return (a.genre || '').localeCompare(b.genre || '');
          }
          if (sortBy.value === 'genre-desc') {
            return (b.genre || '').localeCompare(a.genre || '');
          }
          if (sortBy.value === 'time-desc') {
            return (b.playtimeHours || 0) - (a.playtimeHours || 0);
          }
          if (sortBy.value === 'time-asc') {
            return (a.playtimeHours || 0) - (b.playtimeHours || 0);
          }
          if (sortBy.value === 'condition-asc') {
            return (a.completionCondition || '').localeCompare(b.completionCondition || '');
          }
          if (sortBy.value === 'condition-desc') {
            return (b.completionCondition || '').localeCompare(a.completionCondition || '');
          }
          return 0;
        });

        return list;
      });

      const masterpieceGames = computed(() => {
        return games.value.filter(g => g.status === 'Zerado' && g.rating === 11);
      });

      const backlogStats = computed(() => {
        const bgList = backlogGames.value || [];
        const total = bgList.length;
        let totalHoursNumber = 0;
        let estimatedCount = 0;
        let highPriorityCount = 0;
        let medPriorityCount = 0;
        let lowPriorityCount = 0;

        bgList.forEach(g => {
          const h = Number(g.playtimeHours) || 0;
          if (h > 0) {
            totalHoursNumber += h;
            estimatedCount++;
          }
          const p = (g.priority || '').toLowerCase();
          if (p === 'alta' || p === 'high' || p === '1' || p === 'p1') highPriorityCount++;
          else if (p === 'média' || p === 'media' || p === 'medium' || p === '2' || p === 'p2') medPriorityCount++;
          else if (p === 'baixa' || p === 'low' || p === '3' || p === 'p3') lowPriorityCount++;
        });

        const avgHours = estimatedCount > 0 ? (totalHoursNumber / estimatedCount).toFixed(1) : '0.0';
        const totMin = Math.round(totalHoursNumber * 60);
        const dispH = Math.floor(totMin / 60);
        const dispM = totMin % 60;
        const totalPlaytimeFormatted = dispM > 0 ? `${dispH}h ${dispM}m` : `${dispH}h`;
        const totalDays = (totalHoursNumber / 24).toFixed(1);

        // Previsão de ritmo baseada nos jogos zerados
        const finishedList = finishedGames.value || [];
        const finishedTotalHours = finishedList.reduce((acc, g) => acc + (Number(g.playtimeHours) || 0), 0);
        const yearsCount = Math.max(1, availableYears.value ? availableYears.value.length : 1);
        const avgHoursPerYear = finishedTotalHours > 0 ? (finishedTotalHours / yearsCount) : 0;
        const avgHoursPerMonth = avgHoursPerYear > 0 ? (avgHoursPerYear / 12) : 0;
        let estimatedMonthsToClear = null;
        if (avgHoursPerMonth > 0 && totalHoursNumber > 0) {
          estimatedMonthsToClear = Math.max(0.1, (totalHoursNumber / avgHoursPerMonth)).toFixed(1);
        }

        return {
          totalGames: total,
          totalHours: Math.round(totalHoursNumber),
          totalHoursDecimal: Number(totalHoursNumber.toFixed(1)),
          totalPlaytimeFormatted,
          totalDays,
          avgHours,
          estimatedCount,
          unestimatedCount: Math.max(0, total - estimatedCount),
          highPriorityCount,
          medPriorityCount,
          lowPriorityCount,
          estimatedMonthsToClear,
          avgHoursPerMonth: avgHoursPerMonth > 0 ? avgHoursPerMonth.toFixed(1) : null
        };
      });

      const stats = computed(() => {
        const finished = finishedGames.value || [];
        const total = finished.length;
        
        let totalHoursNumber = 0;
        let totalRatingSum = 0;
        let ratedCount = 0;
        let count11 = 0;
        let countHandheld = 0;
        let countEarlyAccess = 0;
        let countPlatinum = 0;
        let countStandard = 0;
        let countReduced = 0;
        let countEndless = 0;

        finished.forEach(g => {
          totalHoursNumber += (g.playtimeHours || 0);
          if (g.rating !== undefined && g.rating !== null) {
            totalRatingSum += g.rating;
            ratedCount++;
            if (g.rating === 11) count11++;
          }
          if (isGameHandheld(g)) countHandheld++;
          if (g.isEarlyAccess) countEarlyAccess++;
          if (g.completionCondition === 'Platinado/Perfeitos' || g.isPlatinum) countPlatinum++;
          if (g.completionCondition === 'Condição Padrão') countStandard++;
          if (g.completionCondition === 'Condição Reduzida') countReduced++;
          if (g.completionCondition === 'Jogo sem fim') countEndless++;
        });

        const avgRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : '0.0';
        
        const totMin = Math.round(totalHoursNumber * 60);
        const dispH = Math.floor(totMin / 60);
        const dispM = totMin % 60;
        const totalPlaytimeFormatted = dispM > 0 ? `${dispH}h ${dispM}m` : `${dispH}h`;

        const countReplay = finished.filter(g => isGameReplay(g)).length;
        const bStats = backlogStats.value || {};

        return {
          totalFinished: total,
          totalPlaying: nowPlayingGames.value ? nowPlayingGames.value.length : 0,
          nowPlayingCount: nowPlayingGames.value ? nowPlayingGames.value.length : 0,
          totalBacklog: backlogGames.value ? backlogGames.value.length : 0,
          backlogTotalHours: bStats.totalHours || 0,
          backlogTotalPlaytimeFormatted: bStats.totalPlaytimeFormatted || '0h',
          totalPlaytimeHours: Math.round(totalHoursNumber),
          totalPlaytimeFormatted,
          averageRating: avgRating,
          masterpiecesCount: count11,
          handheldCount: countHandheld,
          earlyAccessCount: countEarlyAccess,
          platinumCount: countPlatinum,
          standardCount: countStandard,
          reducedCount: countReduced,
          endlessCount: countEndless,
          replayCount: countReplay
        };
      });

      // =======================================================================
      // COMPUTED PROPERTIES: VISÃO POR ANO & ANÁLISE ANUAL
      // =======================================================================
      const yearlyStatsList = computed(() => {
        const finished = filteredFinishedGames.value;
        const years = availableYears.value;

        return years.map(year => {
          const yearGames = finished.filter(g => {
            const y = g.completionYear || (g.completionDate ? StorageService.extractCompletionYear(g.completionDate) : null);
            return Number(y) === Number(year);
          });

          let totalHours = 0;
          let totalRatingSum = 0;
          let ratedCount = 0;
          let count11 = 0;
          let countHandheld = 0;
          let countEarlyAccess = 0;
          let countPlatinum = 0;
          let countReplay = 0;

          yearGames.forEach(g => {
            totalHours += (g.playtimeHours || 0);
            if (g.rating !== undefined && g.rating !== null) {
              totalRatingSum += g.rating;
              ratedCount++;
              if (g.rating === 11) count11++;
            }
            if (isGameHandheld(g)) countHandheld++;
            if (g.isEarlyAccess) countEarlyAccess++;
            if (g.completionCondition === 'Platinado/Perfeitos' || g.isPlatinum) countPlatinum++;
            if (isGameReplay(g)) countReplay++;
          });

          const avgRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : '0.0';
          const totMin = Math.round(totalHours * 60);
          const dispH = Math.floor(totMin / 60);
          const dispM = totMin % 60;
          const totalPlaytimeFormatted = dispM > 0 ? `${dispH}h ${dispM}m` : `${dispH}h`;

          return {
            year,
            totalGames: yearGames.length,
            totalPlaytimeHours: Math.round(totalHours),
            totalPlaytimeFormatted,
            averageRating: avgRating,
            masterpiecesCount: count11,
            handheldCount: countHandheld,
            earlyAccessCount: countEarlyAccess,
            platinumCount: countPlatinum,
            replayCount: countReplay,
            games: yearGames
          };
        });
      });

      const selectedYearStats = computed(() => {
        if (selectedYearTab.value === 'ALL') {
          return {
            title: 'Todos os Anos',
            isAll: true,
            totalGames: finishedGames.value.length,
            totalPlaytimeFormatted: stats.value.totalPlaytimeFormatted,
            totalPlaytimeHours: stats.value.totalPlaytimeHours,
            averageRating: stats.value.averageRating,
            masterpiecesCount: stats.value.masterpiecesCount,
            platinumCount: stats.value.platinumCount,
            handheldCount: stats.value.handheldCount,
            earlyAccessCount: stats.value.earlyAccessCount,
            replayCount: stats.value.replayCount
          };
        }
        const found = yearlyStatsList.value.find(item => Number(item.year) === Number(selectedYearTab.value));
        if (found) {
          return {
            title: `Ano ${found.year}`,
            year: found.year,
            isAll: false,
            totalGames: found.totalGames,
            totalPlaytimeFormatted: found.totalPlaytimeFormatted,
            totalPlaytimeHours: found.totalPlaytimeHours,
            averageRating: found.averageRating,
            masterpiecesCount: found.masterpiecesCount,
            platinumCount: found.platinumCount,
            handheldCount: found.handheldCount,
            earlyAccessCount: found.earlyAccessCount,
            replayCount: found.replayCount
          };
        }
        return {
          title: `Ano ${selectedYearTab.value}`,
          year: selectedYearTab.value,
          isAll: false,
          totalGames: 0,
          totalPlaytimeFormatted: '0h',
          totalPlaytimeHours: 0,
          averageRating: '0.0',
          masterpiecesCount: 0,
          platinumCount: 0,
          handheldCount: 0,
          earlyAccessCount: 0,
          replayCount: 0
        };
      });

      const selectedYearGames = computed(() => {
        if (selectedYearTab.value === 'ALL') {
          return filteredFinishedGames.value;
        }
        return filteredFinishedGames.value.filter(g => {
          const y = g.completionYear || (g.completionDate ? StorageService.extractCompletionYear(g.completionDate) : null);
          return Number(y) === Number(selectedYearTab.value);
        });
      });

      // =======================================================================
      // COMPUTED PROPERTIES: SNAPSHOTS PARA COMPARTILHAMENTO EM IMAGEM (.PNG)
      // =======================================================================
      const shareGamesList = computed(() => {
        if (shareSnapshotType.value === 'nowPlaying') {
          return nowPlayingGames.value;
        }
        if (shareSelectedYear.value === 'ALL') {
          return finishedGames.value;
        }
        return finishedGames.value.filter(g => {
          const y = g.completionYear || (g.completionDate && StorageService ? StorageService.extractCompletionYear(g.completionDate) : null);
          return Number(y) === Number(shareSelectedYear.value);
        });
      });

      const shareYearStats = computed(() => {
        const list = shareGamesList.value;
        let totalHours = 0;
        let totalRatingSum = 0;
        let ratedCount = 0;
        let count11 = 0;
        let countHandheld = 0;
        let countPlatinum = 0;

        list.forEach(g => {
          totalHours += (g.playtimeHours || 0);
          if (g.rating !== undefined && g.rating !== null) {
            totalRatingSum += g.rating;
            ratedCount++;
            if (g.rating === 11) count11++;
          }
          if (isGameHandheld(g)) countHandheld++;
          if (g.completionCondition === 'Platinado/Perfeitos' || g.isPlatinum) countPlatinum++;
        });

        const avgRating = ratedCount > 0 ? (totalRatingSum / ratedCount).toFixed(1) : '0.0';
        const totMin = Math.round(totalHours * 60);
        const dispH = Math.floor(totMin / 60);
        const dispM = totMin % 60;
        const totalPlaytimeFormatted = dispM > 0 ? `${dispH}h ${dispM}m` : `${dispH}h`;

        return {
          totalGames: list.length,
          totalPlaytimeFormatted,
          totalPlaytimeHours: Math.round(totalHours),
          averageRating: avgRating,
          masterpiecesCount: count11,
          platinumCount: countPlatinum,
          handheldCount: countHandheld
        };
      });

      // =======================================================================
      // COMPUTED PROPERTIES: DASHBOARD DE ESTATÍSTICAS AVANÇADAS
      // =======================================================================
      const statsOverview = computed(() => {
        const s = stats.value;
        const totalDays = (s.totalPlaytimeHours / 24).toFixed(1);
        const platRate = s.totalFinished > 0 ? Math.round((s.platinumCount / s.totalFinished) * 100) : 0;
        const handheldRate = s.totalFinished > 0 ? Math.round((s.handheldCount / s.totalFinished) * 100) : 0;
        const earlyAccessRate = s.totalFinished > 0 ? Math.round((s.earlyAccessCount / s.totalFinished) * 100) : 0;
        const replayRate = s.totalFinished > 0 ? Math.round((s.replayCount / s.totalFinished) * 100) : 0;
        const masterpieceRate = s.totalFinished > 0 ? Math.round((s.masterpiecesCount / s.totalFinished) * 100) : 0;
        return {
          ...s,
          totalDays,
          platRate,
          handheldRate,
          earlyAccessRate,
          replayRate,
          masterpieceRate,
          backlogStats: backlogStats.value
        };
      });

      const platformDistribution = computed(() => {
        const finished = finishedGames.value;
        const total = finished.length || 1;
        const map = {};

        finished.forEach(g => {
          const plat = g.platform || 'Outra Plataforma';
          if (!map[plat]) {
            map[plat] = { platform: plat, count: 0, playtimeHours: 0, platinums: 0, masterpieces: 0 };
          }
          map[plat].count++;
          map[plat].playtimeHours += (g.playtimeHours || 0);
          if (g.completionCondition === 'Platinado/Perfeitos' || g.isPlatinum) map[plat].platinums++;
          if (g.rating === 11) map[plat].masterpieces++;
        });

        return Object.values(map)
          .map(item => {
            const totMin = Math.round(item.playtimeHours * 60);
            const dispH = Math.floor(totMin / 60);
            const dispM = totMin % 60;
            return {
              ...item,
              totalHoursRound: Math.round(item.playtimeHours),
              playtimeFormatted: dispM > 0 ? `${dispH}h ${dispM}m` : `${dispH}h`,
              percentage: Math.round((item.count / total) * 100)
            };
          })
          .sort((a, b) => b.count - a.count);
      });

      const genreDistribution = computed(() => {
        const finished = finishedGames.value;
        const total = finished.length || 1;
        const map = {};

        finished.forEach(g => {
          const parsed = StorageService ? StorageService.parseGenres(g.genre) : (g.genre ? [g.genre] : []);
          const genreList = parsed.length > 0 ? parsed : ['Não especificado'];
          
          genreList.forEach(genreName => {
            if (!map[genreName]) {
              map[genreName] = { genre: genreName, count: 0, playtimeHours: 0, platinums: 0, masterpieces: 0 };
            }
            map[genreName].count++;
            map[genreName].playtimeHours += (g.playtimeHours || 0);
            if (g.completionCondition === 'Platinado/Perfeitos' || g.isPlatinum) map[genreName].platinums++;
            if (g.rating === 11) map[genreName].masterpieces++;
          });
        });

        return Object.values(map)
          .map(item => {
            const totMin = Math.round(item.playtimeHours * 60);
            const dispH = Math.floor(totMin / 60);
            const dispM = totMin % 60;
            return {
              ...item,
              totalHoursRound: Math.round(item.playtimeHours),
              playtimeFormatted: dispM > 0 ? `${dispH}h ${dispM}m` : `${dispH}h`,
              percentage: Math.round((item.count / total) * 100)
            };
          })
          .sort((a, b) => b.count - a.count || b.playtimeHours - a.playtimeHours);
      });

      const ratingDistribution = computed(() => {
        const finished = finishedGames.value;
        const total = finished.length || 1;
        const counts = {};
        for (let i = 1; i <= 11; i++) counts[i] = 0;

        finished.forEach(g => {
          if (g.rating >= 1 && g.rating <= 11) {
            counts[g.rating]++;
          }
        });

        const maxCount = Math.max(...Object.values(counts), 1);

        return Object.keys(counts).map(key => {
          const score = Number(key);
          const count = counts[score];
          return {
            rating: score,
            count,
            percentage: Math.round((count / total) * 100),
            barHeightPercentage: Math.max(8, Math.round((count / maxCount) * 100))
          };
        });
      });

      const conditionDistribution = computed(() => {
        const finished = finishedGames.value;
        const total = finished.length || 1;
        const counts = {
          'Platinado/Perfeitos': 0,
          'Condição Padrão': 0,
          'Condição Reduzida': 0,
          'Jogo sem fim': 0
        };

        finished.forEach(g => {
          const cond = g.completionCondition || (g.isPlatinum ? 'Platinado/Perfeitos' : 'Condição Padrão');
          if (counts[cond] !== undefined) {
            counts[cond]++;
          } else {
            counts['Condição Padrão']++;
          }
        });

        return [
          { name: 'Platinado / Perfeitos', count: counts['Platinado/Perfeitos'], percentage: Math.round((counts['Platinado/Perfeitos'] / total) * 100), color: 'amber', icon: 'award' },
          { name: 'Condição Padrão', count: counts['Condição Padrão'], percentage: Math.round((counts['Condição Padrão'] / total) * 100), color: 'emerald', icon: 'check-circle-2' },
          { name: 'Condição Reduzida', count: counts['Condição Reduzida'], percentage: Math.round((counts['Condição Reduzida'] / total) * 100), color: 'blue', icon: 'fast-forward' },
          { name: 'Jogo Sem Fim', count: counts['Jogo sem fim'], percentage: Math.round((counts['Jogo sem fim'] / total) * 100), color: 'purple', icon: 'infinity' }
        ];
      });

      const topLongestGames = computed(() => {
        return [...finishedGames.value]
          .sort((a, b) => (b.playtimeHours || 0) - (a.playtimeHours || 0))
          .slice(0, 10);
      });

      // =======================================================================
      // NAVEGAÇÃO ENTRE TELAS E ABAS DE ANO
      // =======================================================================
      const setActivePage = (page) => {
        activePage.value = page;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        refreshLucideIcons();
      };

      const selectYearTab = (year) => {
        selectedYearTab.value = year;
        try {
          localStorage.setItem('nota11_selected_year_tab', String(year));
        } catch (e) {}
        refreshLucideIcons();
      };

      const navigateToYear = (year) => {
        activePage.value = 'library';
        heroTab.value = 'finished';
        try {
          localStorage.setItem('nota11_hero_tab', 'finished');
        } catch (e) {}
        currentGrouping.value = 'year';
        selectYearTab(year);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      // Indicador de salvamento
      const lastSavedText = ref('Salvo localmente');
      const isSaving = ref(false);

      // =======================================================================
      // OPERAÇÕES DE JOGOS (CRUD & FINALIZAÇÃO RÁPIDA)
      // =======================================================================

      // 1. FINALIZAR JOGO RÁPIDO ("Zerar Jogo")
      const openQuickFinish = (game) => {
        if (isPublicViewMode.value) return;
        gameToFinish.value = game;
        const today = new Date().toISOString().split('T')[0];
        const currentYear = new Date().getFullYear();
        const plat = game.platform || 'PC - Computador';

        quickFinishForm.value = {
          completionDate: today,
          completionYear: currentYear,
          platform: plat,
          playtime: game.playtime || '20:00:00',
          playtimeHours: game.playtimeHours || 20,
          rating: 10,
          completionCondition: 'Condição Padrão',
          isHandheld: isPcPlatform(plat) ? (Boolean(game.isHandheld) || plat === 'PC - Steam Deck' || plat === 'PC - Rog Ally') : false,
          isEarlyAccess: Boolean(game.isEarlyAccess),
          isPlatinum: false,
          isReplay: Boolean(game.isReplay || isGameReplay(game)),
          keepPlaying: Boolean(game.isNowPlaying),
          genre: game.genre || ''
        };
        isQuickFinishOpen.value = true;
        refreshLucideIcons();
      };

      const confirmQuickFinish = () => {
        if (!gameToFinish.value) return;
        const pt = parsePlaytimeInput(quickFinishForm.value.playtime);
        const completionDate = quickFinishForm.value.completionDate || new Date().toISOString().split('T')[0];
        const completionYear = StorageService.extractCompletionYear(completionDate, quickFinishForm.value.completionYear);
        const condition = quickFinishForm.value.completionCondition || 'Condição Padrão';
        const isPlat = condition === 'Platinado/Perfeitos';
        const isRep = Boolean(quickFinishForm.value.isReplay || gameToFinish.value.isReplay || isGameReplay(gameToFinish.value));
        const keepPlaying = Boolean(quickFinishForm.value.keepPlaying);

        const index = games.value.findIndex(g => g.id === gameToFinish.value.id);
        if (index !== -1) {
          const finalPlat = quickFinishForm.value.platform || games.value[index].platform || 'PC - Computador';
          const isHandheldFinal = isPcPlatform(finalPlat) ? (Boolean(quickFinishForm.value.isHandheld) || finalPlat === 'PC - Steam Deck' || finalPlat === 'PC - Rog Ally') : false;
          games.value[index] = {
            ...games.value[index],
            platform: finalPlat,
            status: 'Zerado',
            completionDate,
            completionYear,
            playtime: pt.str,
            playtimeHours: pt.hours,
            rating: Math.max(1, Math.min(11, quickFinishForm.value.rating || 10)),
            completionCondition: condition,
            isHandheld: isHandheldFinal,
            isEarlyAccess: Boolean(quickFinishForm.value.isEarlyAccess),
            isPlatinum: isPlat,
            isReplay: isRep,
            isNowPlaying: keepPlaying,
            genre: quickFinishForm.value.genre || games.value[index].genre || '',
            updatedAt: new Date().toISOString()
          };
          
          if (keepPlaying) {
            showToast(`🏆 Parabéns! "${gameToFinish.value.title}" foi registrado como Zerado e mantido em Jogando Agora!`, 'success');
          } else {
            showToast(`🏆 Parabéns! "${gameToFinish.value.title}" foi registrado como Zerado!`, 'success');
          }
        }

        isQuickFinishOpen.value = false;
        gameToFinish.value = null;
        refreshLucideIcons();
      };

      // HELPERS DE SUBCATEGORIAS DE PC
      const getPcSubcategory = (platform) => {
        if (!platform) return 'PC - Computador';
        const p = String(platform).toLowerCase();
        if (p.includes('steam deck') || p.includes('deck')) return 'PC - Steam Deck';
        if (p.includes('rog ally') || p.includes('ally')) return 'PC - Rog Ally';
        return 'PC - Computador';
      };

      const setPcSubcategory = (sub) => {
        gameForm.value.platform = sub;
        gameForm.value.isHandheld = (sub === 'PC - Steam Deck' || sub === 'PC - Rog Ally');
      };

      const setQuickFinishPcSubcategory = (sub) => {
        quickFinishForm.value.platform = sub;
        quickFinishForm.value.isHandheld = (sub === 'PC - Steam Deck' || sub === 'PC - Rog Ally');
      };

      // LIMPAR RASCUNHO E REINICIAR FORMULÁRIO EM BRANCO
      const clearDraftAndReset = () => {
        if (StorageService) {
          StorageService.clearAddGameDraft();
        }
        hasSavedDraft.value = false;
        const today = new Date().toISOString().split('T')[0];
        const currentYear = new Date().getFullYear();
        const curStatus = gameForm.value.status || 'Zerado';

        gameForm.value = {
          id: null,
          title: '',
          platform: settings.value.defaultPlatform || 'PC - Computador',
          genre: '',
          status: curStatus,
          rating: curStatus === 'Zerado' ? 10 : null,
          completionDate: curStatus === 'Zerado' ? today : '',
          completionYear: curStatus === 'Zerado' ? currentYear : null,
          playtime: '00:00:00',
          playtimeHours: 0,
          completionCondition: 'Condição Padrão',
          isHandheld: false,
          isEarlyAccess: false,
          isPlatinum: false,
          isReplay: false,
          isNowPlaying: false,
          priority: '',
          playingCategory: null,
          coverUrl: '',
          igdbId: ''
        };
        showToast('Rascunho descartado. Formulário limpo.', 'info');
        refreshLucideIcons();
      };

      // 2. NOVO JOGO / EDITAR JOGO
      const openAddGame = (status = 'Zerado') => {
        if (isPublicViewMode.value) return;
        isEditMode.value = false;
        const today = new Date().toISOString().split('T')[0];
        const currentYear = new Date().getFullYear();

        const savedDraft = StorageService ? StorageService.loadAddGameDraft() : null;
        const hasValidDraft = StorageService ? StorageService.hasAddGameDraft() : false;

        if (savedDraft && hasValidDraft) {
          gameForm.value = {
            id: null,
            title: savedDraft.title || '',
            platform: savedDraft.platform || settings.value.defaultPlatform || 'PC - Computador',
            genre: savedDraft.genre || '',
            status: savedDraft.status || status,
            rating: savedDraft.rating !== undefined ? savedDraft.rating : (status === 'Zerado' ? 10 : null),
            completionDate: savedDraft.completionDate || (status === 'Zerado' ? today : ''),
            completionYear: savedDraft.completionYear || (status === 'Zerado' ? currentYear : null),
            playtime: savedDraft.playtime || '00:00:00',
            playtimeHours: savedDraft.playtimeHours || 0,
            completionCondition: savedDraft.completionCondition || 'Condição Padrão',
            isHandheld: Boolean(savedDraft.isHandheld),
            isEarlyAccess: Boolean(savedDraft.isEarlyAccess),
            isPlatinum: Boolean(savedDraft.isPlatinum),
            isReplay: Boolean(savedDraft.isReplay),
            isNowPlaying: Boolean(savedDraft.isNowPlaying),
            priority: savedDraft.priority || '',
            playingCategory: savedDraft.playingCategory || null,
            coverUrl: savedDraft.coverUrl || '',
            igdbId: savedDraft.igdbId || ''
          };
          hasSavedDraft.value = true;
        } else {
          gameForm.value = {
            id: null,
            title: '',
            platform: settings.value.defaultPlatform || 'PC - Computador',
            genre: '',
            status: status,
            rating: status === 'Zerado' ? 10 : null,
            completionDate: status === 'Zerado' ? today : '',
            completionYear: status === 'Zerado' ? currentYear : null,
            playtime: '00:00:00',
            playtimeHours: 0,
            completionCondition: 'Condição Padrão',
            isHandheld: false,
            isEarlyAccess: false,
            isPlatinum: false,
            isReplay: false,
            isNowPlaying: false,
            priority: '',
            playingCategory: null,
            coverUrl: '',
            igdbId: ''
          };
          hasSavedDraft.value = false;
        }
        isAddEditOpen.value = true;
        refreshLucideIcons();
      };

      const openAddGameWithCategory = (shelfId) => {
        if (isPublicViewMode.value) return;
        openAddGame('Jogando');
        gameForm.value.playingCategory = (shelfId && shelfId !== 'uncategorized') ? shelfId : null;
      };

      const openEditGame = (game) => {
        if (isPublicViewMode.value) return;
        isEditMode.value = true;
        const pt = parsePlaytimeInput(game.playtime || game.playtimeHours || 0);
        const condition = game.completionCondition || (game.isPlatinum ? 'Platinado/Perfeitos' : 'Condição Padrão');
        const isPlat = Boolean(game.isPlatinum) || condition === 'Platinado/Perfeitos';
        const year = game.completionYear || (game.completionDate ? StorageService.extractCompletionYear(game.completionDate) : null);
        const plat = game.platform || 'PC - Computador';

        gameForm.value = {
          id: game.id,
          title: game.title || '',
          platform: plat,
          genre: game.genre || '',
          status: game.status || 'Zerado',
          rating: game.rating ?? 10,
          completionDate: game.completionDate || '',
          completionYear: year,
          playtime: pt.str,
          playtimeHours: pt.hours,
          completionCondition: condition,
          isHandheld: isPcPlatform(plat) ? (Boolean(game.isHandheld) || plat === 'PC - Steam Deck' || plat === 'PC - Rog Ally') : false,
          isEarlyAccess: Boolean(game.isEarlyAccess),
          isPlatinum: isPlat,
          isReplay: Boolean(game.isReplay || isGameReplay(game)),
          isNowPlaying: Boolean(game.isNowPlaying),
          priority: game.priority || '',
          playingCategory: game.playingCategory || null,
          coverUrl: game.coverUrl || '',
          igdbId: game.igdbId || ''
        };
        isAddEditOpen.value = true;
        refreshLucideIcons();
      };

      const saveGameForm = () => {
        if (isPublicViewMode.value) return;
        const title = (gameForm.value.title || '').trim();
        if (!title) {
          showToast('O título do jogo é obrigatório.', 'error');
          return;
        }

        const pt = parsePlaytimeInput(gameForm.value.playtime);
        const completionDate = gameForm.value.status === 'Zerado' ? (gameForm.value.completionDate || new Date().toISOString().split('T')[0]) : '';
        const completionYear = gameForm.value.status === 'Zerado' ? StorageService.extractCompletionYear(completionDate, gameForm.value.completionYear) : null;
        
        const isPlat = gameForm.value.status === 'Backlog'
          ? Boolean(gameForm.value.isPlatinum)
          : (gameForm.value.status === 'Zerado' ? (gameForm.value.completionCondition === 'Platinado/Perfeitos' || Boolean(gameForm.value.isPlatinum)) : false);
        const condition = gameForm.value.status === 'Backlog'
          ? (isPlat ? 'Platinado/Perfeitos' : 'Condição Padrão')
          : (gameForm.value.status === 'Zerado' ? (gameForm.value.completionCondition || 'Condição Padrão') : 'Condição Padrão');

        const ratingVal = gameForm.value.status === 'Zerado' ? Math.max(1, Math.min(11, gameForm.value.rating || 10)) : null;
        const priorityVal = (gameForm.value.status === 'Jogando' || gameForm.value.status === 'Backlog' || gameForm.value.isNowPlaying) ? (gameForm.value.priority || null) : null;
        const playingCategoryVal = (gameForm.value.status === 'Jogando' || gameForm.value.isNowPlaying) ? (gameForm.value.playingCategory || null) : null;
        const plat = gameForm.value.platform || 'PC - Computador';
        const isHandheldVal = isPcPlatform(plat) ? (Boolean(gameForm.value.isHandheld) || plat === 'PC - Steam Deck' || plat === 'PC - Rog Ally') : false;
        const isNowPlayingVal = gameForm.value.status === 'Zerado' ? Boolean(gameForm.value.isNowPlaying) : false;

        // Se a capa estiver vazia, gera o SVG elegante de fallback
        let cover = (gameForm.value.coverUrl || '').trim();
        if (!cover && PlaceholderGenerator) {
          cover = PlaceholderGenerator.generate(title, plat);
        }

        if (isEditMode.value && gameForm.value.id) {
          // Atualizar
          const idx = games.value.findIndex(g => g.id === gameForm.value.id);
          if (idx !== -1) {
            games.value[idx] = {
              ...games.value[idx],
              title,
              platform: plat,
              genre: (gameForm.value.genre || '').trim(),
              status: gameForm.value.status,
              rating: ratingVal,
              completionDate,
              completionYear,
              playtime: pt.str,
              playtimeHours: pt.hours,
              completionCondition: condition,
              isHandheld: isHandheldVal,
              isEarlyAccess: Boolean(gameForm.value.isEarlyAccess),
              isPlatinum: isPlat,
              isReplay: Boolean(gameForm.value.isReplay),
              isNowPlaying: isNowPlayingVal,
              priority: priorityVal,
              playingCategory: playingCategoryVal,
              coverUrl: cover,
              igdbId: (gameForm.value.igdbId || '').trim() || null,
              updatedAt: new Date().toISOString()
            };
            showToast(`Jogo "${title}" atualizado com sucesso!`, 'success');
          }
        } else {
          // Criar Novo
          const titleKey = title.trim().toLowerCase();
          const autoReplay = Boolean(gameForm.value.isReplay || games.value.some(g => (g.title || '').trim().toLowerCase() === titleKey));
          const newGame = {
            id: 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            title,
            platform: plat,
            genre: (gameForm.value.genre || '').trim(),
            status: gameForm.value.status,
            rating: ratingVal,
            completionDate,
            completionYear,
            playtime: pt.str,
            playtimeHours: pt.hours,
            completionCondition: condition,
            isHandheld: isHandheldVal,
            isEarlyAccess: Boolean(gameForm.value.isEarlyAccess),
            isPlatinum: isPlat,
            isReplay: autoReplay,
            isNowPlaying: isNowPlayingVal,
            priority: priorityVal,
            playingCategory: playingCategoryVal,
            coverUrl: cover,
            igdbId: (gameForm.value.igdbId || '').trim() || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          games.value.unshift(newGame);
          if (StorageService) {
            StorageService.clearAddGameDraft();
          }
          hasSavedDraft.value = false;
          showToast(`Jogo "${title}" adicionado à sua lista!`, 'success');
        }

        if (gameForm.value.status === 'Zerado') {
          setHeroTab('finished');
        } else if (gameForm.value.status === 'Jogando') {
          setHeroTab('nowPlaying');
        } else if (gameForm.value.status === 'Backlog') {
          setHeroTab('backlog');
        }

        isAddEditOpen.value = false;
        refreshLucideIcons();
      };

      // 3. VINCULAR / DESVINCULAR JOGOS ZERADOS EM "JOGANDO AGORA"
      const toggleNowPlayingStatus = (game) => {
        if (isPublicViewMode.value || !game) return;
        const idx = games.value.findIndex(g => g.id === game.id);
        if (idx === -1) return;

        if (games.value[idx].status === 'Zerado') {
          const nextState = !Boolean(games.value[idx].isNowPlaying);
          games.value[idx].isNowPlaying = nextState;
          if (detailGame.value && detailGame.value.id === game.id) {
            detailGame.value.isNowPlaying = nextState;
          }
          if (nextState) {
            showToast(`🎮 "${game.title}" agora também está sendo exibido na seção Jogando Agora!`, 'success');
          } else {
            showToast(`"${game.title}" removido de Jogando Agora (permanece na sua Biblioteca de Zerados).`, 'info');
          }
        } else {
          openQuickFinish(games.value[idx]);
        }
        refreshLucideIcons();
      };

      const removeFromNowPlaying = (game) => {
        if (isPublicViewMode.value || !game) return;
        const idx = games.value.findIndex(g => g.id === game.id);
        if (idx === -1) return;

        if (games.value[idx].status === 'Zerado') {
          games.value[idx].isNowPlaying = false;
          if (detailGame.value && detailGame.value.id === game.id) {
            detailGame.value.isNowPlaying = false;
          }
          showToast(`"${game.title}" foi removido da seção Jogando Agora (permanece na sua Biblioteca de Zerados).`, 'info');
        } else {
          openDeleteConfirm(games.value[idx]);
        }
        refreshLucideIcons();
      };

      const openPickFinishedGameModal = () => {
        pickFinishedSearchQuery.value = '';
        isPickFinishedGameOpen.value = true;
        refreshLucideIcons();
      };

      const finishedGamesForPicker = computed(() => {
        const query = (pickFinishedSearchQuery.value || '').trim().toLowerCase();
        return finishedGames.value.filter(g => {
          if (!query) return true;
          return (g.title || '').toLowerCase().includes(query) ||
                 (g.platform || '').toLowerCase().includes(query) ||
                 (g.genre || '').toLowerCase().includes(query) ||
                 String(g.completionYear || '').includes(query);
        });
      });

      const onStatusChange = () => {
        if (gameForm.value.status === 'Zerado') {
          if (gameForm.value.rating === null || gameForm.value.rating === undefined) {
            gameForm.value.rating = 10;
          }
          if (!gameForm.value.completionDate) {
            gameForm.value.completionDate = new Date().toISOString().split('T')[0];
          }
        } else {
          gameForm.value.rating = null;
          gameForm.value.completionDate = '';
        }
      };

      // =======================================================================
      // ATALHO PARA BUSCA NO GOOGLE IMAGENS
      // =======================================================================
      const openGoogleImages = (title) => {
        const cleanTitle = (title || gameForm.value.title || '').trim();
        const query = cleanTitle ? `${cleanTitle} game cover` : 'game cover';
        const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      };

      // =======================================================================
      // INTEGRAÇÃO COM IGDB (INTERNET GAME DATABASE / TWITCH)
      // =======================================================================
      const openScraperModal = () => {
        igdbForm.value.clientId = settings.value.igdb_client_id || igdbForm.value.clientId;
        igdbForm.value.clientSecret = settings.value.igdb_client_secret || igdbForm.value.clientSecret;
        igdbForm.value.accessToken = settings.value.igdb_access_token || igdbForm.value.accessToken;
        igdbForm.value.proxy = settings.value.igdb_proxy || igdbForm.value.proxy;
        scraperState.value.isFinished = false;
        scraperState.value.log = [];
        isScraperModalOpen.value = true;
        refreshLucideIcons();
      };

      const saveScraperCredentials = () => {
        if (igdbForm.value.rememberCredentials && StorageService) {
          settings.value.igdb_client_id = (igdbForm.value.clientId || '').trim();
          settings.value.igdb_client_secret = (igdbForm.value.clientSecret || '').trim();
          settings.value.igdb_access_token = (igdbForm.value.accessToken || '').trim();
          settings.value.igdb_proxy = (igdbForm.value.proxy || '').trim();
          StorageService.saveSettings(settings.value);
        }
      };

      const getScraperCredentials = () => {
        return {
          clientId: (igdbForm.value.clientId || settings.value.igdb_client_id || '').trim(),
          clientSecret: (igdbForm.value.clientSecret || settings.value.igdb_client_secret || '').trim(),
          accessToken: (igdbForm.value.accessToken || settings.value.igdb_access_token || '').trim(),
          tokenExpiry: Number(settings.value.igdb_token_expiry || 0),
          proxyUrl: (igdbForm.value.proxy || settings.value.igdb_proxy || '').trim()
        };
      };

      const openGenreReviewModal = () => {
        igdbForm.value.targetMode = 'genres_only';
        igdbForm.value.scanMode = 'missing_only';
        openScraperModal();
      };

      const parseGameGenres = (gameOrString) => {
        if (!gameOrString) return [];
        const raw = typeof gameOrString === 'object' ? gameOrString.genre : gameOrString;
        return StorageService ? StorageService.parseGenres(raw) : (raw ? [raw] : []);
      };

      const filterBySpecificGenre = (genreName) => {
        genreFilter.value = genreName;
        activePage.value = 'library';
        heroTab.value = 'finished';
        try {
          localStorage.setItem('nota11_hero_tab', 'finished');
        } catch (e) {}
        refreshLucideIcons();
      };

      const startBatchScrape = async () => {
        const creds = getScraperCredentials();
        if (!creds.clientId || (!creds.clientSecret && !creds.accessToken)) {
          showToast('Por favor, informe seu Client ID e Client Secret do IGDB/Twitch.', 'error');
          return;
        }

        saveScraperCredentials();

        const allGames = games.value;
        if (allGames.length === 0) {
          showToast('Nenhum jogo na lista para escanear.', 'info');
          return;
        }

        scraperState.value.isRunning = true;
        scraperState.value.shouldCancel = false;
        scraperState.value.isFinished = false;
        scraperState.value.total = allGames.length;
        scraperState.value.current = 0;
        scraperState.value.successCount = 0;
        scraperState.value.skippedCount = 0;
        scraperState.value.failedCount = 0;
        scraperState.value.log = [];

        const mode = igdbForm.value.scanMode || 'missing_only';
        const target = igdbForm.value.targetMode || 'covers_and_genres'; // 'covers_and_genres' | 'genres_only' | 'covers_only'

        // Pré-autenticação para validar/obter token
        try {
          const auth = await IgdbService.getAccessToken(creds.clientId, creds.clientSecret, creds.accessToken, creds.tokenExpiry);
          creds.accessToken = auth.accessToken;
          creds.tokenExpiry = Date.now() + (auth.expiresIn * 1000);
          settings.value.igdb_access_token = auth.accessToken;
          settings.value.igdb_token_expiry = creds.tokenExpiry;
          if (StorageService) StorageService.saveSettings(settings.value);
        } catch (authErr) {
          scraperState.value.isRunning = false;
          showToast(authErr.message, 'error');
          return;
        }

        for (let i = 0; i < allGames.length; i++) {
          if (scraperState.value.shouldCancel) {
            scraperState.value.log.unshift({
              type: 'info',
              time: new Date().toLocaleTimeString(),
              message: '⛔ Processamento cancelado pelo usuário.'
            });
            break;
          }

          const game = allGames[i];
          scraperState.value.current = i + 1;
          scraperState.value.currentGameTitle = game.title;

          const hasRealCover = !IgdbService.isPlaceholderCover(game.coverUrl);
          const hasGenre = Boolean(game.genre && game.genre.trim() !== '');

          // Checagem de skip dependendo do targetMode e scanMode
          if (mode === 'missing_only') {
            if (target === 'genres_only' && hasGenre) {
              scraperState.value.skippedCount++;
              scraperState.value.log.unshift({
                type: 'skip',
                time: new Date().toLocaleTimeString(),
                message: `⏭️ [Ignorado] "${game.title}" (gêneros já cadastrados: ${game.genre})`
              });
              continue;
            } else if (target === 'covers_only' && hasRealCover) {
              scraperState.value.skippedCount++;
              scraperState.value.log.unshift({
                type: 'skip',
                time: new Date().toLocaleTimeString(),
                message: `⏭️ [Ignorado] "${game.title}" (já possui capa)`
              });
              continue;
            } else if (target === 'covers_and_genres' && hasRealCover && hasGenre) {
              scraperState.value.skippedCount++;
              scraperState.value.log.unshift({
                type: 'skip',
                time: new Date().toLocaleTimeString(),
                message: `⏭️ [Ignorado] "${game.title}" (capa e gêneros completos)`
              });
              continue;
            }
          }

          try {
            const result = await IgdbService.getBestCoverForGame(game.title, game.platform, creds);
            if (result) {
              let updatedAny = false;
              let logDetails = [];

              // Atualização de Capa
              if (target !== 'genres_only') {
                if (result.coverUrl && (mode === 'replace_all' || !hasRealCover)) {
                  game.coverUrl = result.coverUrl;
                  updatedAny = true;
                  logDetails.push('Capa atualizada');
                }
              }

              // Atualização de Gêneros
              if (target !== 'covers_only') {
                const formattedGenre = StorageService && result.genre ? StorageService.formatGenres(result.genre) : (result.genre || '');
                if (formattedGenre && (mode === 'replace_all' || !hasGenre)) {
                  game.genre = formattedGenre;
                  updatedAny = true;
                  logDetails.push(`Gêneros: ${formattedGenre}`);
                }
              }

              if (updatedAny) {
                game.updatedAt = new Date().toISOString();
                scraperState.value.successCount++;
                scraperState.value.log.unshift({
                  type: 'success',
                  time: new Date().toLocaleTimeString(),
                  message: `✅ [IGDB] "${game.title}" (${logDetails.join(' | ') || 'Atualizado'})`
                });
                if (StorageService) {
                  StorageService.saveGames(games.value);
                }
              } else {
                scraperState.value.skippedCount++;
                scraperState.value.log.unshift({
                  type: 'skip',
                  time: new Date().toLocaleTimeString(),
                  message: `⏭️ [Sem novos dados] "${game.title}"`
                });
              }
            } else {
              scraperState.value.failedCount++;
              scraperState.value.log.unshift({
                type: 'fail',
                time: new Date().toLocaleTimeString(),
                message: `⚠️ [Não Encontrado] "${game.title}" no IGDB`
              });
            }
          } catch (err) {
            console.error(err);
            scraperState.value.failedCount++;
            scraperState.value.log.unshift({
              type: 'error',
              time: new Date().toLocaleTimeString(),
              message: `❌ [Erro] "${game.title}": ${err.message}`
            });
            if (err.isAuthError || (err.message && err.message.includes('Client ID ou Client Secret incorretos'))) {
              showToast(err.message, 'error');
              break;
            }
          }

          // Delay de 250ms para respeitar limites da API do IGDB (4 req/s)
          await new Promise(resolve => setTimeout(resolve, 250));
        }

        scraperState.value.isRunning = false;
        scraperState.value.isFinished = true;
        scraperState.value.currentGameTitle = '';

        if (StorageService) {
          StorageService.saveGames(games.value);
        }

        showToast(
          `Processamento IGDB finalizado! ${scraperState.value.successCount} jogos atualizados, ${scraperState.value.skippedCount} ignorados.`,
          scraperState.value.successCount > 0 ? 'success' : 'info'
        );
        refreshLucideIcons();
      };

      const cancelBatchScrape = () => {
        scraperState.value.shouldCancel = true;
      };

      // ----------------------------------------------------------------------
      // BUSCA DE JOGO POR ID DO IGDB (CAPA E GÊNERO AUTOMÁTICOS)
      // ----------------------------------------------------------------------
      const isFetchingIgdbId = ref(false);

      const fetchFromIgdbById = async () => {
        const idInput = (gameForm.value.igdbId || '').trim();
        if (!idInput) {
          showToast('Por favor, digite o ID numérico ou link do jogo no IGDB.', 'warning');
          return;
        }

        const cleanInput = idInput.replace(/^(id\s*[:=]?\s*|#)/i, '').trim();
        const isNumeric = /^\d+$/.test(cleanInput);
        const creds = getScraperCredentials();

        // Se for estritamente um ID numérico puro e não houver credenciais nem backend local
        if (isNumeric && !creds.clientId && !creds.accessToken && !StorageService?.isLocalNativeServer?.()) {
          openScraperModal();
          showToast('Para consultar por ID numérico puro, configure seu Client ID e Client Secret nas configurações do IGDB ou cole o link do jogo.', 'info');
          return;
        }

        isFetchingIgdbId.value = true;
        try {
          if (!IgdbService || typeof IgdbService.getGameById !== 'function') {
            showToast('Serviço do IGDB não disponível no momento.', 'error');
            return;
          }

          const gameData = await IgdbService.getGameById(idInput, gameForm.value.platform, creds);
          if (gameData) {
            // Atualiza Capa em alta definição
            if (gameData.coverUrl) {
              gameForm.value.coverUrl = gameData.coverUrl;
            }

            // Atualiza Gênero(s)
            if (gameData.genre) {
              gameForm.value.genre = StorageService ? StorageService.formatGenres(gameData.genre) : gameData.genre;
            }

            // Preenche o título oficial do IGDB se o campo estiver vazio
            if (!gameForm.value.title || !gameForm.value.title.trim()) {
              gameForm.value.title = gameData.title;
            }

            // Normaliza o ID para o ID numérico canônico do IGDB
            if (gameData.id) {
              gameForm.value.igdbId = String(gameData.id);
            }

            // Atualiza candidatos alternativos de capa
            if (gameData.candidateCovers && gameData.candidateCovers.length > 0) {
              singleScraperState.value.candidates = [gameData];
            }

            showToast(`Dados importados do IGDB: "${gameData.title}" (Capa e Gênero)!`, 'success');
            refreshLucideIcons();
          } else {
            showToast(`Nenhum jogo encontrado no IGDB com o ID/link "${idInput}".`, 'error');
          }
        } catch (err) {
          console.error('Erro ao buscar jogo por ID no IGDB:', err);
          if (err.isAuthError) {
            openScraperModal();
            showToast('Erro de autenticação no IGDB: verifique suas credenciais no painel.', 'error');
          } else {
            showToast(`Falha ao consultar IGDB: ${err.message || 'Erro de conexão'}`, 'error');
          }
        } finally {
          isFetchingIgdbId.value = false;
          refreshLucideIcons();
        }
      };

      // ----------------------------------------------------------------------
      // BUSCA DE CAPA INDIVIDUAL (IGDB / SCREEN SCRAPER)
      // ----------------------------------------------------------------------
      const searchSingleGameScreenScraper = async () => {
        // Se houver um ID do IGDB preenchido no formulário, prioriza a busca exata por ID
        if (gameForm.value.igdbId && gameForm.value.igdbId.trim()) {
          return await fetchFromIgdbById();
        }

        const title = (gameForm.value.title || '').trim();
        if (!title) {
          showToast('Por favor, digite o título do jogo ou o ID do IGDB antes de pesquisar.', 'error');
          return;
        }

        const creds = getScraperCredentials();
        singleScraperState.value.isSearching = true;
        singleScraperState.value.candidates = [];

        try {
          let results = [];
          if (IgdbService && typeof IgdbService.searchGames === 'function') {
            results = await IgdbService.searchGames(title, gameForm.value.platform, creds);
          } else if (ScreenScraperService && typeof ScreenScraperService.searchGames === 'function') {
            results = await ScreenScraperService.searchGames(title, gameForm.value.platform, creds);
          }

          if (results && results.length > 0) {
            singleScraperState.value.candidates = results;
            
            const bestGame = results[0];
            if (bestGame.coverUrl) {
              gameForm.value.coverUrl = bestGame.coverUrl;
            }
            if (bestGame.genre) {
              gameForm.value.genre = StorageService ? StorageService.formatGenres(bestGame.genre) : bestGame.genre;
            }

            isScraperPickerOpen.value = true;
            showToast(`Capa e dados encontrados para "${bestGame.title}"!`, 'success');
            refreshLucideIcons();
          } else {
            if (!creds.clientId && !creds.clientSecret) {
              openScraperModal();
              showToast(`Nenhum resultado encontrado para "${title}". Configure suas credenciais da Twitch/IGDB para buscas mais amplas.`, 'info');
            } else {
              showToast(`Nenhum resultado encontrado para "${title}". Tente simplificar o título ou use a busca no Google Imagens.`, 'info');
            }
          }
        } catch (err) {
          console.error('Erro na pesquisa de capa:', err);
          try {
            if (ScreenScraperService && typeof ScreenScraperService.searchGames === 'function') {
              const fallbackResults = await ScreenScraperService.searchGames(title, gameForm.value.platform, creds);
              if (fallbackResults && fallbackResults.length > 0) {
                singleScraperState.value.candidates = fallbackResults;
                const bestGame = fallbackResults[0];
                if (bestGame.coverUrl) gameForm.value.coverUrl = bestGame.coverUrl;
                if (bestGame.genre) gameForm.value.genre = StorageService ? StorageService.formatGenres(bestGame.genre) : bestGame.genre;
                isScraperPickerOpen.value = true;
                showToast(`Capa e dados encontrados para "${bestGame.title}"!`, 'success');
                refreshLucideIcons();
                return;
              }
            }
          } catch (fallbackErr) {
            console.warn('Fallback também falhou:', fallbackErr);
          }

          showToast(err.message || 'Erro ao buscar dados do jogo', 'error');
          if (err.isAuthError || (err.message && err.message.includes('Client ID ou Client Secret incorretos'))) {
            openScraperModal();
          }
        } finally {
          singleScraperState.value.isSearching = false;
        }
      };

      const applyScraperCover = (coverUrl, genre = '') => {
        if (coverUrl) {
          gameForm.value.coverUrl = coverUrl;
        }
        if (genre) {
          gameForm.value.genre = StorageService ? StorageService.formatGenres(genre) : genre;
        }
        isScraperPickerOpen.value = false;
        showToast('Capa e dados aplicados com sucesso!', 'success');
        refreshLucideIcons();
      };

      const handleCoverFileUpload = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          if (window.ImageService) {
            const dataUrl = await window.ImageService.compressImageFile(file, 600, 900, 0.88);
            gameForm.value.coverUrl = dataUrl;
            showToast('Capa importada do computador com sucesso!', 'success');
          } else {
            const reader = new FileReader();
            reader.onload = (e) => {
              gameForm.value.coverUrl = e.target.result;
              showToast('Capa importada do computador!', 'success');
            };
            reader.readAsDataURL(file);
          }
        } catch (err) {
          showToast('Erro ao carregar imagem local: ' + (err.message || ''), 'error');
        } finally {
          event.target.value = '';
        }
      };

      const handleCoverPaste = async (event) => {
        const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type && item.type.indexOf('image') !== -1) {
            const file = item.getAsFile();
            if (file) {
              try {
                if (window.ImageService) {
                  const dataUrl = await window.ImageService.compressImageFile(file, 600, 900, 0.88);
                  gameForm.value.coverUrl = dataUrl;
                  showToast('Capa colada da Área de Transferência com sucesso!', 'success');
                } else {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    gameForm.value.coverUrl = e.target.result;
                    showToast('Capa colada da Área de Transferência!', 'success');
                  };
                  reader.readAsDataURL(file);
                }
              } catch (err) {
                showToast('Erro ao processar imagem colada: ' + (err.message || ''), 'error');
              }
              break;
            }
          }
        }
      };

      // =======================================================================
      // IMPORTAÇÃO, EXPORTAÇÃO E BACKUP
      // =======================================================================
      const exportCsv = () => {
        if (!StorageService) return;
        const csvData = StorageService.exportToCsv(games.value);
        const today = new Date().toISOString().split('T')[0];
        StorageService.triggerDownload(csvData, `jogos_zerados_nota11_${today}.csv`, 'text/csv;charset=utf-8;');
        showToast('Exportação CSV realizada com sucesso!', 'success');
      };

      const handleCsvUpload = (event) => {
        const file = event.target.files[0];
        if (!file || !StorageService) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target.result;
            const importedGames = StorageService.parseCsv(content);
            if (!importedGames || importedGames.length === 0) {
              showToast('Nenhum jogo válido encontrado no arquivo CSV.', 'error');
              return;
            }

            const existingTitles = new Set(games.value.map(g => (g.title || '').trim().toLowerCase()));
            const batchTitles = new Set();
            let addedCount = 0;

            // Insere todas as entradas do CSV sem descartar duplicatas, preservando a ordem original
            const newObjects = importedGames.map((item, idx) => {
              const titleKey = (item.title || '').trim().toLowerCase();
              const isReplay = Boolean(item.isReplay || existingTitles.has(titleKey) || batchTitles.has(titleKey));
              batchTitles.add(titleKey);

              const pt = parsePlaytimeInput(item.playtime || item.playtimeHours || 0);
              const condition = StorageService.normalizeCompletionCondition(item.completionCondition, Boolean(item.isPlatinum));
              const year = StorageService.extractCompletionYear(item.completionDate, item.completionYear);

              return {
                id: 'game_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_' + idx,
                title: item.title,
                platform: item.platform,
                genre: item.genre || '',
                status: 'Zerado',
                rating: item.rating ?? 10,
                completionDate: item.completionDate || new Date().toISOString().split('T')[0],
                completionYear: year,
                playtime: pt.str,
                playtimeHours: pt.hours,
                completionCondition: condition,
                isHandheld: Boolean(item.isHandheld),
                isEarlyAccess: Boolean(item.isEarlyAccess),
                isPlatinum: condition === 'Platinado/Perfeitos',
                isReplay: isReplay,
                coverUrl: (item.coverUrl || '').trim() || (PlaceholderGenerator ? PlaceholderGenerator.generate(item.title, item.platform) : ''),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
            });

            games.value = [...newObjects, ...games.value];
            addedCount = newObjects.length;

            showToast(`Importação concluída! ${addedCount} jogos adicionados.`, 'success');
            isBackupOpen.value = false;
            event.target.value = '';
            refreshLucideIcons();
          } catch (err) {
            console.error(err);
            showToast('Erro ao processar arquivo CSV: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      };

      const exportJsonBackup = () => {
        if (!StorageService) return;
        const backupData = StorageService.exportBackup(games.value, settings.value, userProfile.value, playingCategories.value);
        const today = new Date().toISOString().split('T')[0];
        StorageService.triggerDownload(backupData, `backup_nota11_completo_${today}.json`, 'application/json');
        showToast('Backup JSON completo exportado com sucesso!', 'success');
      };

      const handleJsonUpload = (event) => {
        if (isPublicViewMode.value) return;
        const file = event.target.files[0];
        if (!file || !StorageService) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target.result;
            const parsed = StorageService.parseJsonBackup(content);

            if (parsed && Array.isArray(parsed.games)) {
              games.value = parsed.games.map(g => {
                const pt = parsePlaytimeInput(g.playtime || g.playtimeHours || 0);
                const condition = StorageService.normalizeCompletionCondition(g.completionCondition, Boolean(g.isPlatinum));
                const isZerado = g.status === 'Zerado';
                const year = isZerado ? StorageService.extractCompletionYear(g.completionDate, g.completionYear) : null;
                return {
                  ...g,
                  status: g.status || 'Zerado',
                  rating: isZerado && g.rating !== undefined && g.rating !== null ? Math.max(1, Math.min(11, Number(g.rating))) : null,
                  completionDate: isZerado ? (g.completionDate || null) : null,
                  playtime: pt.str,
                  playtimeHours: pt.hours,
                  genre: g.genre || '',
                  completionYear: year,
                  completionCondition: condition,
                  isHandheld: Boolean(g.isHandheld),
                  isEarlyAccess: Boolean(g.isEarlyAccess),
                  isPlatinum: condition === 'Platinado/Perfeitos',
                  isReplay: Boolean(g.isReplay),
                  isNowPlaying: g.status === 'Jogando',
                  priority: g.priority || null,
                  playingCategory: g.playingCategory || null
                };
              });

              if (parsed.profile && typeof parsed.profile === 'object') {
                userProfile.value = { ...userProfile.value, ...parsed.profile };
                StorageService.saveUserProfile(userProfile.value);
                editProfileForm.value = { ...userProfile.value };
              }

              if (parsed.playingCategories && Array.isArray(parsed.playingCategories)) {
                playingCategories.value = parsed.playingCategories;
                StorageService.savePlayingCategories(playingCategories.value);
              }

              if (parsed.settings && typeof parsed.settings === 'object') {
                settings.value = { ...settings.value, ...parsed.settings };
                StorageService.saveSettings(settings.value);
              }

              StorageService.saveGames(games.value);
              refreshStorageInfo();
              showToast(`Backup restaurado! ${games.value.length} jogos e perfil carregados.`, 'success');
              isBackupOpen.value = false;
              event.target.value = '';
              refreshLucideIcons();
            } else {
              showToast('Arquivo JSON de backup inválido.', 'error');
            }
          } catch (err) {
            console.error(err);
            showToast('Erro ao restaurar backup: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      };

      const restoreSampleData = () => {
        if (isPublicViewMode.value) return;
        games.value = (SAMPLE_GAMES || []).map(g => {
          const pt = parsePlaytimeInput(g.playtime || g.playtimeHours || 0);
          const condition = StorageService.normalizeCompletionCondition(g.completionCondition, Boolean(g.isPlatinum));
          const year = g.status === 'Zerado' ? StorageService.extractCompletionYear(g.completionDate, g.completionYear) : null;
          return {
            ...g,
            playtime: pt.str,
            playtimeHours: pt.hours,
            genre: g.genre || '',
            completionYear: year,
            completionCondition: condition,
            isHandheld: Boolean(g.isHandheld),
            isEarlyAccess: Boolean(g.isEarlyAccess),
            isPlatinum: condition === 'Platinado/Perfeitos',
            isReplay: Boolean(g.isReplay)
          };
        });
        if (StorageService) {
          StorageService.saveGames(games.value);
        }
        showToast('Dados de demonstração restaurados!', 'success');
        isBackupOpen.value = false;
        nextTick(() => {
          refreshLucideIcons();
          refreshStorageInfo();
        });
      };

      // =======================================================================
      // LIMPEZA TOTAL DA LISTA
      // =======================================================================
      const openClearAllModal = () => {
        if (isPublicViewMode.value) return;
        isClearAllModalOpen.value = true;
        refreshLucideIcons();
      };

      const confirmClearAll = () => {
        if (isPublicViewMode.value) return;
        games.value = [];
        if (StorageService) {
          StorageService.saveGames([]);
        }
        isClearAllModalOpen.value = false;
        showToast('Toda a lista foi apagada. Você pode recomeçar do zero!', 'info');
        refreshLucideIcons();
      };

      // =======================================================================
      // EXCLUSÃO INDIVIDUAL & DETALHES
      // =======================================================================
      const openDeleteConfirm = (game) => {
        if (isPublicViewMode.value) return;
        gameToDelete.value = game;
        isDeleteConfirmOpen.value = true;
        refreshLucideIcons();
      };

      const confirmDelete = () => {
        if (isPublicViewMode.value || !gameToDelete.value) return;
        const title = gameToDelete.value.title;
        games.value = games.value.filter(g => g.id !== gameToDelete.value.id);
        isDeleteConfirmOpen.value = false;
        gameToDelete.value = null;
        showToast(`"${title}" foi removido da lista.`, 'info');
        refreshLucideIcons();
      };

      const openDetail = (game) => {
        detailGame.value = game;
        isDetailOpen.value = true;
        refreshLucideIcons();
      };

      // =======================================================================
      // TOASTS & FEEDBACK
      // =======================================================================
      const showToast = (message, type = 'info') => {
        const id = Date.now() + Math.random();
        toasts.value.push({ id, message, type });
        refreshLucideIcons();
        setTimeout(() => {
          removeToast(id);
        }, 4000);
      };

      const removeToast = (id) => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      };

      // =======================================================================
      // HELPERS VISUAIS & FORMATADORES
      // =======================================================================
      let lucideRafId = null;
      let lucideRetryTimer = null;
      const refreshLucideIcons = (targetEl = null) => {
        if (lucideRafId) {
          cancelAnimationFrame(lucideRafId);
        }
        lucideRafId = requestAnimationFrame(() => {
          try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
              if (targetEl && targetEl instanceof Element) {
                window.lucide.createIcons({ root: targetEl });
              } else {
                window.lucide.createIcons();
              }
            } else {
              if (lucideRetryTimer) clearInterval(lucideRetryTimer);
              let attempts = 0;
              lucideRetryTimer = setInterval(() => {
                attempts++;
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                  clearInterval(lucideRetryTimer);
                  lucideRetryTimer = null;
                  window.lucide.createIcons();
                } else if (attempts > 30) {
                  clearInterval(lucideRetryTimer);
                  lucideRetryTimer = null;
                }
              }, 60);
            }
          } catch (e) {
            console.warn('Lucide icon refresh warning:', e);
          }
        });
      };

      const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return dateStr;
          return d.toLocaleDateString('pt-BR');
        } catch (e) {
          return dateStr;
        }
      };

      const formatPlaytime = (game) => {
        if (!game) return '00:00:00';
        if (game.playtime) return game.playtime;
        if (game.playtimeHours !== undefined) {
          const pt = parsePlaytimeInput(game.playtimeHours);
          return pt.str;
        }
        return '00:00:00';
      };

      const hasPlaytime = (game) => {
        if (!game) return false;
        if (game.playtimeHours !== undefined && Number(game.playtimeHours) > 0) return true;
        if (game.playtime) {
          const pt = parsePlaytimeInput(game.playtime);
          return Boolean(pt && pt.hours > 0);
        }
        return false;
      };

      const isPcPlatform = (platform) => {
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
               p.includes('steam deck') || p.includes('rog ally') || p.includes('computador') ||
               p.includes('windows') || p.includes('steam') || p.includes('linux') || p.includes('mac') || p.includes('portátil');
      };

      const isGameHandheld = (game) => {
        if (!game) return false;
        const plat = String(game.platform || '').toLowerCase();
        if (plat.includes('steam deck') || plat.includes('rog ally') || plat.includes('portátil')) return true;
        if (!game.isHandheld) return false;
        return isPcPlatform(game.platform);
      };

      const getRatingBadgeClass = (rating) => {
        if (rating === null || rating === undefined || rating === '') {
          return 'bg-slate-800 text-slate-400 border-slate-700';
        }
        const r = Math.round(Number(rating));
        if (r === 11) return 'rating-badge-11';
        if (r === 10) return 'bg-emerald-900/90 text-emerald-200 border-emerald-400/80 shadow-sm shadow-emerald-500/20';
        if (r === 9) return 'bg-emerald-950/90 text-emerald-300 border-emerald-500/70';
        if (r === 8) return 'bg-green-950/90 text-green-300 border-green-600/70';
        if (r === 7) return 'bg-lime-950/90 text-lime-300 border-lime-600/70';
        if (r === 6) return 'bg-yellow-950/90 text-yellow-300 border-yellow-600/70';
        if (r === 5) return 'bg-amber-950/90 text-amber-300 border-amber-600/70';
        if (r === 4) return 'bg-orange-950/90 text-orange-300 border-orange-600/70';
        if (r === 3) return 'bg-rose-950/90 text-rose-300 border-rose-600/70';
        if (r === 2) return 'bg-red-900/90 text-red-300 border-red-600/70';
        if (r <= 1) return 'bg-red-950/95 text-red-400 border-red-700/70';
        return 'bg-slate-800 text-slate-300 border-slate-700';
      };

      const getRatingBtnClass = (score, currentRating) => {
        if (currentRating !== score) {
          return 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800';
        }
        if (score === 11) return 'rating-btn-11 ring-2 ring-amber-300 font-black';
        if (score === 10) return 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-400 shadow-sm shadow-emerald-500/30';
        if (score === 9) return 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-400';
        if (score === 8) return 'bg-green-600 text-white font-bold ring-2 ring-green-400';
        if (score === 7) return 'bg-lime-600 text-white font-bold ring-2 ring-lime-400';
        if (score === 6) return 'bg-yellow-600 text-white font-bold ring-2 ring-yellow-400';
        if (score === 5) return 'bg-amber-600 text-white font-bold ring-2 ring-amber-400';
        if (score === 4) return 'bg-orange-600 text-white font-bold ring-2 ring-orange-400';
        if (score === 3) return 'bg-rose-600 text-white font-bold ring-2 ring-rose-400';
        if (score === 2) return 'bg-red-600 text-white font-bold ring-2 ring-red-400';
        return 'bg-red-700 text-white font-bold ring-2 ring-red-500';
      };

      const getPlatformBadgeColor = (platform) => {
        if (!platform) return 'badge-platform-default';
        const p = platform.toLowerCase().trim();

        // 1. PC & Portáteis PC
        if (p.includes('steam deck') || p.includes('deck')) {
          return 'badge-platform-steam-deck';
        }
        if (p.includes('rog ally') || p.includes('ally') || p.includes('legion go') || p.includes('claw')) {
          return 'badge-platform-rog-ally';
        }
        if (p.includes('mac') || p.includes('apple') || p.includes('silicon') || p.includes('macos')) {
          return 'badge-platform-mac';
        }
        if (p.includes('linux') || p.includes('ubuntu') || p.includes('steam os') || p.includes('steamos')) {
          return 'badge-platform-linux';
        }
        if (p.includes('pc') || p.includes('computador') || p.includes('steam') || p.includes('windows') || p.includes('gog') || p.includes('epic') || p.includes('battlenet') || p.includes('ea app') || p.includes('ubisoft')) {
          return 'badge-platform-pc';
        }

        // 2. PlayStation Family (Cores e identidades exclusivas por geração)
        if (p.includes('playstation 5') || p.includes('ps5') || p.includes('ps 5')) {
          return 'badge-platform-ps5';
        }
        if (p.includes('playstation 4') || p.includes('ps4') || p.includes('ps 4')) {
          return 'badge-platform-ps4';
        }
        if (p.includes('playstation 3') || p.includes('ps3') || p.includes('ps 3')) {
          return 'badge-platform-ps3';
        }
        if (p.includes('playstation 2') || p.includes('ps2') || p.includes('ps 2')) {
          return 'badge-platform-ps2';
        }
        if (p.includes('playstation 1') || p.includes('ps1') || p.includes('ps 1') || p.includes('psx') || p.includes('psone')) {
          return 'badge-platform-ps1';
        }
        if (p.includes('vita') || p.includes('psvita') || p.includes('ps vita') || p.includes('psp') || p.includes('portable')) {
          return 'badge-platform-ps-handheld';
        }
        if (p.includes('playstation') || p.includes('sony') || p.includes('psn')) {
          return 'badge-platform-playstation';
        }

        // 3. Xbox Family (Identidades Xbox clássicas e modernas)
        if (p.includes('xbox series') || p.includes('series x') || p.includes('series s') || p.includes('xsx') || p.includes('xss')) {
          return 'badge-platform-xbox-series';
        }
        if (p.includes('xbox one') || p.includes('xone')) {
          return 'badge-platform-xbox-one';
        }
        if (p.includes('xbox 360') || p.includes('x360')) {
          return 'badge-platform-xbox-360';
        }
        if (p.includes('xbox clássico') || p.includes('xbox classic') || p.includes('original xbox')) {
          return 'badge-platform-xbox-classic';
        }
        if (p.includes('xbox') || p.includes('microsoft')) {
          return 'badge-platform-xbox';
        }

        // 4. Nintendo Family (Cores e estilos representativos de cada era)
        if (p.includes('switch') || p.includes('ns')) {
          return 'badge-platform-switch';
        }
        if (p.includes('wii u') || p.includes('wiiu') || p.includes('wii')) {
          return 'badge-platform-wii';
        }
        if (p.includes('gamecube') || p.includes('game cube') || p.includes('cube') || p.includes('ngc')) {
          return 'badge-platform-gamecube';
        }
        if (p.includes('nintendo 64') || p.includes('n64')) {
          return 'badge-platform-n64';
        }
        if (p.includes('super nintendo') || p.includes('snes') || p.includes('super famicom')) {
          return 'badge-platform-snes';
        }
        if (p.includes('nes') || p.includes('famicom') || p.includes('nintendo entertainment system')) {
          return 'badge-platform-nes';
        }
        if (p.includes('3ds') || p.includes('2ds') || p.includes('ds') || p.includes('dual screen') || p.includes('dsi')) {
          return 'badge-platform-ds';
        }
        if (p.includes('game boy advance') || p.includes('gba')) {
          return 'badge-platform-gba';
        }
        if (p.includes('game boy color') || p.includes('gbc')) {
          return 'badge-platform-gbc';
        }
        if (p.includes('game boy') || p.includes('dmg') || p.includes('gameboy')) {
          return 'badge-platform-gb';
        }
        if (p.includes('nintendo')) {
          return 'badge-platform-nintendo';
        }

        // 5. Sega Family
        if (p.includes('dreamcast') || p.includes('dc')) {
          return 'badge-platform-dreamcast';
        }
        if (p.includes('saturn') || p.includes('sega saturn')) {
          return 'badge-platform-saturn';
        }
        if (p.includes('mega drive') || p.includes('genesis') || p.includes('megadrive') || p.includes('sega genesis')) {
          return 'badge-platform-megadrive';
        }
        if (p.includes('master system') || p.includes('sega master')) {
          return 'badge-platform-mastersystem';
        }
        if (p.includes('game gear') || p.includes('gamegear')) {
          return 'badge-platform-gamegear';
        }
        if (p.includes('sega')) {
          return 'badge-platform-sega';
        }

        // 6. Retro, Arcade, Mobile, VR & Emulação
        if (p.includes('neo geo') || p.includes('neogeo') || p.includes('arcade') || p.includes('fliperama') || p.includes('mame') || p.includes('cps')) {
          return 'badge-platform-arcade';
        }
        if (p.includes('atari')) {
          return 'badge-platform-atari';
        }
        if (p.includes('coleco') || p.includes('intellivision') || p.includes('odyssey') || p.includes('magnavox')) {
          return 'badge-platform-vintage';
        }
        if (p.includes('android')) {
          return 'badge-platform-android';
        }
        if (p.includes('ios') || p.includes('iphone') || p.includes('ipad') || p.includes('apple mobile')) {
          return 'badge-platform-ios';
        }
        if (p.includes('emulador') || p.includes('retroarch') || p.includes('emulação') || p.includes('emulator')) {
          return 'badge-platform-emulator';
        }
        if (p.includes('vr') || p.includes('quest') || p.includes('oculus') || p.includes('virtual reality') || p.includes('psvr')) {
          return 'badge-platform-vr';
        }

        return 'badge-platform-default';
      };

      const getConditionBadgeClass = (condition) => {
        switch (condition) {
          case 'Platinado/Perfeitos':
            return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
          case 'Condição Padrão':
            return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
          case 'Condição Reduzida':
            return 'bg-orange-500/20 text-orange-300 border-orange-500/50';
          case 'Jogo sem fim':
            return 'bg-purple-500/20 text-purple-300 border-purple-500/50';
          default:
            return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
        }
      };

      const getConditionIcon = (condition) => {
        switch (condition) {
          case 'Platinado/Perfeitos':
            return 'trophy';
          case 'Condição Padrão':
            return 'check-circle-2';
          case 'Condição Reduzida':
            return 'fast-forward';
          case 'Jogo sem fim':
            return 'infinity';
          default:
            return 'check';
        }
      };

      const getPlatformIcon = (platform) => {
        if (!platform) return 'gamepad-2';
        const p = platform.toLowerCase().trim();

        // 1. PC & Portáteis PC
        if (p.includes('steam deck') || p.includes('deck') || p.includes('rog ally') || p.includes('ally') || p.includes('legion go') || p.includes('claw')) {
          return 'gamepad-2';
        }
        if (p.includes('mac') || p.includes('apple') || p.includes('silicon') || p.includes('macos')) {
          return 'laptop';
        }
        if (p.includes('linux') || p.includes('ubuntu') || p.includes('steam os')) {
          return 'terminal';
        }
        if (p.includes('pc') || p.includes('computador') || p.includes('steam') || p.includes('windows') || p.includes('gog') || p.includes('epic') || p.includes('battlenet') || p.includes('ea app') || p.includes('ubisoft')) {
          return 'monitor';
        }

        // 2. PlayStation Family (Consoles e Portáteis Sony)
        if (p.includes('playstation 5') || p.includes('ps5') || p.includes('ps 5') || p.includes('playstation 4') || p.includes('ps4') || p.includes('ps 4')) {
          return 'tv';
        }
        if (p.includes('playstation 3') || p.includes('ps3') || p.includes('playstation 2') || p.includes('ps2') || p.includes('playstation 1') || p.includes('ps1') || p.includes('psx') || p.includes('psone')) {
          return 'disc';
        }
        if (p.includes('vita') || p.includes('psvita') || p.includes('ps vita') || p.includes('psp') || p.includes('portable')) {
          return 'gamepad-2';
        }
        if (p.includes('playstation') || p.includes('sony')) {
          return 'tv';
        }

        // 3. Xbox Family (Consoles Microsoft)
        if (p.includes('xbox series') || p.includes('series x') || p.includes('series s') || p.includes('xbox one') || p.includes('xbox clássico') || p.includes('xbox classic') || p.includes('original xbox')) {
          return 'box';
        }
        if (p.includes('xbox 360')) {
          return 'disc';
        }
        if (p.includes('xbox') || p.includes('microsoft')) {
          return 'box';
        }

        // 4. Nintendo Family
        if (p.includes('switch') || p.includes('ns')) {
          return 'gamepad-2';
        }
        if (p.includes('wii u') || p.includes('wii')) {
          return 'disc';
        }
        if (p.includes('gamecube') || p.includes('game cube') || p.includes('cube')) {
          return 'box';
        }
        if (p.includes('nintendo 64') || p.includes('n64')) {
          return 'joystick';
        }
        if (p.includes('super nintendo') || p.includes('snes') || p.includes('super famicom') || p.includes('nes') || p.includes('famicom') || p.includes('nintendo entertainment system')) {
          return 'gamepad';
        }
        if (p.includes('3ds') || p.includes('2ds') || p.includes('ds') || p.includes('dual screen') || p.includes('dsi')) {
          return 'tablet-smartphone';
        }
        if (p.includes('game boy advance') || p.includes('gba') || p.includes('game boy color') || p.includes('gbc') || p.includes('game boy') || p.includes('dmg')) {
          return 'gamepad';
        }
        if (p.includes('nintendo')) {
          return 'gamepad-2';
        }

        // 5. Sega Family
        if (p.includes('dreamcast') || p.includes('saturn')) {
          return 'disc';
        }
        if (p.includes('mega drive') || p.includes('genesis') || p.includes('master system') || p.includes('game gear') || p.includes('sega')) {
          return 'gamepad';
        }

        // 6. Retro, Arcade, Mobile, VR & Emulação
        if (p.includes('neo geo') || p.includes('arcade') || p.includes('fliperama') || p.includes('mame') || p.includes('cps') || p.includes('atari') || p.includes('coleco') || p.includes('intellivision') || p.includes('odyssey')) {
          return 'joystick';
        }
        if (p.includes('android') || p.includes('ios') || p.includes('iphone') || p.includes('ipad') || p.includes('mobile') || p.includes('celular') || p.includes('smartphone')) {
          return 'smartphone';
        }
        if (p.includes('emulador') || p.includes('retroarch') || p.includes('emulação') || p.includes('emulator')) {
          return 'cpu';
        }
        if (p.includes('vr') || p.includes('quest') || p.includes('oculus') || p.includes('virtual reality') || p.includes('psvr')) {
          return 'glasses';
        }

        return 'gamepad-2';
      };

      const PLATFORM_ICONS_MAP = {
        'PC - Computador': 'icones/computador.png',
        'PC - Steam Deck': 'icones/Steam Deck.png',
        'PC - Rog Ally': 'icones/rog ally asus.png',
        'Mac / Apple Silicon': 'icones/mac.png',
        'Linux': 'icones/linux.png',
        'PC': 'icones/computador.png',

        'PlayStation 5': 'icones/ps5.png',
        'Xbox Series X/S': 'icones/xbox series.png',
        'Nintendo Switch': 'icones/nintendo switch.png',

        'PlayStation 4': 'icones/ps4.png',
        'Xbox One': 'icones/xbox one.png',
        'Nintendo Wii U': 'icones/nintendo wiiu.png',
        'Nintendo 3DS / 2DS': 'icones/n3ds.png',
        'Nintendo 3DS': 'icones/n3ds.png',
        'PlayStation Vita': 'icones/psvita.png',

        'PlayStation 3': 'icones/ps3.png',
        'Xbox 360': 'icones/xbox360.png',
        'Nintendo Wii': 'icones/nintendo wii.png',
        'Nintendo DS': 'icones/nintendo ds.png',
        'PlayStation Portable (PSP)': 'icones/psp.png',
        'PSP': 'icones/psp.png',

        'PlayStation 2 (PS2)': 'icones/ps2.png',
        'Nintendo GameCube': 'icones/gamecube.png',
        'Sega Dreamcast': 'icones/dreamcast.png',
        'Game Boy Advance (GBA)': 'icones/gba.png',

        'PlayStation 1 (PS1)': 'icones/ps1.png',
        'Nintendo 64 (N64)': 'icones/nintendo 64.png',
        'Sega Saturn': 'icones/sega saturn.png',
        'Game Boy Color (GBC)': 'icones/gameboy color.png',

        'Super Nintendo (SNES)': 'icones/super nintendo.png',
        'Sega Mega Drive / Genesis': 'icones/sega mega drive.png',
        'Neo Geo AES/CD': 'icones/neogeo.png',

        'Nintendo Entertainment System (NES / Famicom)': 'icones/NES.png',
        'Sega Master System': 'icones/Sega master system.png',
        'Atari 7800': 'icones/atari.png',

        'Atari 2600': 'icones/atari.png',
        'Atari 5200': 'icones/atari.png',

        'Android': 'icones/android.png',
        'iOS (iPhone / iPad)': 'icones/ios.png'
      };

      const getPlatformCustomIcon = (platform) => {
        if (!platform) return null;
        const trimmed = String(platform).trim();
        if (PLATFORM_ICONS_MAP[trimmed]) {
          return encodeURI(PLATFORM_ICONS_MAP[trimmed]);
        }

        const p = trimmed.toLowerCase();

        // Atari (All Atari systems use atari.png)
        if (p.includes('atari')) return encodeURI('icones/atari.png');

        // PC & Portáteis PC
        if (p.includes('steam deck') || p === 'deck') return encodeURI('icones/Steam Deck.png');
        if (p.includes('rog ally') || p === 'ally') return encodeURI('icones/rog ally asus.png');
        if (p.includes('mac') || p.includes('apple silicon') || p.includes('macos')) return encodeURI('icones/mac.png');
        if (p.includes('linux') || p.includes('ubuntu')) return encodeURI('icones/linux.png');
        if (p === 'pc' || p.includes('computador') || p.includes('windows')) return encodeURI('icones/computador.png');

        // PlayStation
        if (p.includes('ps5') || p.includes('playstation 5')) return encodeURI('icones/ps5.png');
        if (p.includes('ps4') || p.includes('playstation 4')) return encodeURI('icones/ps4.png');
        if (p.includes('ps3') || p.includes('playstation 3')) return encodeURI('icones/ps3.png');
        if (p.includes('ps2') || p.includes('playstation 2')) return encodeURI('icones/ps2.png');
        if (p.includes('ps1') || p.includes('playstation 1') || p.includes('psx') || p.includes('psone')) return encodeURI('icones/ps1.png');
        if (p.includes('vita') || p.includes('psvita')) return encodeURI('icones/psvita.png');
        if (p.includes('psp') || p.includes('playstation portable')) return encodeURI('icones/psp.png');

        // Xbox
        if (p.includes('series x') || p.includes('series s') || p.includes('xbox series') || p.includes('xsx') || p.includes('xss')) return encodeURI('icones/xbox series.png');
        if (p.includes('xbox one') || p.includes('xone')) return encodeURI('icones/xbox one.png');
        if (p.includes('xbox 360') || p.includes('x360')) return encodeURI('icones/xbox360.png');

        // Nintendo
        if (p.includes('switch')) return encodeURI('icones/nintendo switch.png');
        if (p.includes('wii u') || p.includes('wiiu')) return encodeURI('icones/nintendo wiiu.png');
        if (p.includes('wii') && !p.includes('wii u') && !p.includes('wiiu')) return encodeURI('icones/nintendo wii.png');
        if (p.includes('3ds') || p.includes('2ds')) return encodeURI('icones/n3ds.png');
        if (p.includes('gamecube') || p.includes('cube')) return encodeURI('icones/gamecube.png');
        if (p.includes('nintendo 64') || p.includes('n64')) return encodeURI('icones/nintendo 64.png');
        if (p.includes('super nintendo') || p.includes('snes') || p.includes('super famicom')) return encodeURI('icones/super nintendo.png');
        if (p.includes('nes') || p.includes('famicom') || p.includes('nintendo entertainment system')) return encodeURI('icones/NES.png');
        if (p.includes('advance') || p.includes('gba')) return encodeURI('icones/gba.png');
        if (p.includes('color') || p.includes('gbc')) return encodeURI('icones/gameboy color.png');
        if (p.includes('ds') && !p.includes('3ds') && !p.includes('2ds')) return encodeURI('icones/nintendo ds.png');

        // Sega
        if (p.includes('dreamcast')) return encodeURI('icones/dreamcast.png');
        if (p.includes('saturn')) return encodeURI('icones/sega saturn.png');
        if (p.includes('mega drive') || p.includes('genesis') || p.includes('megadrive')) return encodeURI('icones/sega mega drive.png');
        if (p.includes('master system')) return encodeURI('icones/Sega master system.png');

        // Neo Geo
        if (p.includes('neo geo') || p.includes('neogeo')) return encodeURI('icones/neogeo.png');

        // Smartphones
        if (p.includes('android')) return encodeURI('icones/android.png');
        if (p.includes('ios') || p.includes('iphone') || p.includes('ipad')) return encodeURI('icones/ios.png');

        return null;
      };

      const getPlayingCategoryIcon = (catIdOrName) => {
        if (!catIdOrName) return 'layers';
        const cat = playingCategories.value.find(c => c.id === catIdOrName || c.name.toLowerCase() === catIdOrName.toLowerCase());
        return (cat && cat.icon) ? cat.icon : 'layers';
      };

      const onCompletionDateChange = (form) => {
        if (form && form.completionDate && StorageService) {
          const y = StorageService.extractCompletionYear(form.completionDate);
          if (y) form.completionYear = y;
        }
      };

      const handleImageError = (e, game) => {
        if (game && game.fallbackCoverUrl && e.target.src !== game.fallbackCoverUrl) {
          e.target.src = game.fallbackCoverUrl;
          return;
        }
        e.target.onerror = null;
        if (PlaceholderGenerator) {
          e.target.src = PlaceholderGenerator.generate(game?.title || 'Jogo', game?.platform || 'PC');
        }
      };

      // =======================================================================
      // MÉTODOS DE PÁGINA DE PERFIL & GESTÃO
      // =======================================================================
      const openProfileModal = () => {
        setActivePage('profile');
      };

      const openEditProfileModal = () => {
        if (isPublicViewMode.value) return;
        editProfileForm.value = {
          name: userProfile.value.name || '',
          nickname: userProfile.value.nickname || '',
          avatarUrl: userProfile.value.avatarUrl || '',
          bio: userProfile.value.bio || '',
          favoritePlatform: userProfile.value.favoritePlatform || 'PC - Computador',
          favoriteGenre: userProfile.value.favoriteGenre || ''
        };
        isEditProfileOpen.value = true;
        refreshLucideIcons();
      };

      const saveProfile = async () => {
        if (isPublicViewMode.value) return;
        userProfile.value = {
          ...userProfile.value,
          ...editProfileForm.value
        };
        if (StorageService) {
          StorageService.saveUserProfile(userProfile.value);
        }
        isEditProfileOpen.value = false;
        refreshStorageInfo();
        showToast('Perfil atualizado com sucesso!', 'success');
        refreshLucideIcons();

        if (cloudUser.value && window.SupabaseService) {
          try {
            await syncToCloud(false);
          } catch (e) {
            console.warn('Falha no upload do perfil:', e);
          }
        }
      };

      // =======================================================================
      // NICHOS CUSTOMIZÁVEIS DA PÁGINA DE PERFIL (TOP 5, CONSOLES, MEU SETUP)
      // =======================================================================
      
      // 1. MEU TOP 5 (Jogos da Vida • Escolhidos entre os Nota 11)
      const top5SelectedIds = ref([]);
      const top5SearchQuery = ref('');

      const filteredMasterpieceGamesForTop5 = computed(() => {
        const list = games.value.filter(g => Number(g.rating) === 11);
        const q = top5SearchQuery.value.trim().toLowerCase();
        if (!q) return list;
        return list.filter(g => (g.title || '').toLowerCase().includes(q) || (g.platform || '').toLowerCase().includes(q));
      });

      const top5SelectedGames = computed(() => {
        return top5SelectedIds.value.map(id => games.value.find(g => String(g.id) === String(id))).filter(Boolean);
      });

      const profileTop5Games = computed(() => {
        const ids = Array.isArray(userProfile.value?.top5GameIds) ? userProfile.value.top5GameIds : [];
        const snapshots = Array.isArray(userProfile.value?.top5Games) ? userProfile.value.top5Games : [];

        if (ids.length > 0) {
          const resolved = ids.map(id => {
            const found = games.value.find(g => String(g.id) === String(id) || (g.title && String(g.title).toLowerCase() === String(id).toLowerCase()));
            if (found) return found;
            const snap = snapshots.find(s => s && (String(s.id) === String(id) || (s.title && String(s.title).toLowerCase() === String(id).toLowerCase())));
            if (snap) return snap;
            return null;
          }).filter(Boolean);

          if (resolved.length > 0) return resolved;
        }

        if (snapshots.length > 0) {
          return snapshots.map(item => {
            if (typeof item === 'string') {
              return games.value.find(g => String(g.id) === String(item) || g.title === item) || { id: item, title: item, coverUrl: '' };
            }
            return item;
          }).filter(Boolean);
        }

        return [];
      });

      const openTop5Modal = () => {
        if (isPublicViewMode.value) return;
        top5SelectedIds.value = [...(userProfile.value.top5GameIds || [])];
        top5SearchQuery.value = '';
        isTop5ModalOpen.value = true;
        nextTick(() => refreshLucideIcons());
      };

      const closeTop5Modal = () => {
        isTop5ModalOpen.value = false;
      };

      const toggleTop5Game = (gameId) => {
        if (!gameId) return;
        const idx = top5SelectedIds.value.indexOf(gameId);
        if (idx !== -1) {
          top5SelectedIds.value.splice(idx, 1);
        } else {
          if (top5SelectedIds.value.length >= 5) {
            showToast('Você já selecionou 5 jogos para o Top 5. Remova um para adicionar outro.', 'warning');
            return;
          }
          top5SelectedIds.value.push(gameId);
        }
        nextTick(() => refreshLucideIcons());
      };

      const isTop5GameSelected = (gameId) => {
        return top5SelectedIds.value.includes(gameId);
      };

      const getTop5GameRank = (gameId) => {
        const idx = top5SelectedIds.value.indexOf(gameId);
        return idx !== -1 ? idx + 1 : null;
      };

      const moveTop5Game = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= top5SelectedIds.value.length) return;
        const temp = top5SelectedIds.value[index];
        top5SelectedIds.value[index] = top5SelectedIds.value[target];
        top5SelectedIds.value[target] = temp;
        nextTick(() => refreshLucideIcons());
      };

      const removeTop5Game = (index) => {
        top5SelectedIds.value.splice(index, 1);
        nextTick(() => refreshLucideIcons());
      };

      const saveTop5Modal = async () => {
        if (isPublicViewMode.value) return;
        userProfile.value.top5GameIds = [...top5SelectedIds.value];
        const snapshots = top5SelectedIds.value.map(id => games.value.find(g => String(g.id) === String(id))).filter(Boolean).map(g => ({
          id: g.id,
          title: g.title,
          coverUrl: g.coverUrl,
          platform: g.platform,
          rating: g.rating,
          completionYear: g.completionYear
        }));
        userProfile.value.top5Games = snapshots;
        if (StorageService) {
          StorageService.saveUserProfile(userProfile.value);
        }
        isTop5ModalOpen.value = false;
        showToast('Top 5 de jogos da vida atualizado com sucesso!', 'success');
        refreshLucideIcons();

        if (cloudUser.value && window.SupabaseService) {
          try {
            await syncToCloud(false);
          } catch (e) {
            console.warn('Falha no upload do Top 5:', e);
          }
        }
      };

      // 2. MEUS CONSOLES (Plataformas que Possui)
      const consolesSelectedList = ref([]);
      const consoleSearchQuery = ref('');

      const filteredConsoleCategories = computed(() => {
        const q = consoleSearchQuery.value.trim().toLowerCase();
        if (!q) return platformCategories;
        return platformCategories.map(cat => ({
          group: cat.group,
          items: cat.items.filter(item => item.toLowerCase().includes(q))
        })).filter(cat => cat.items.length > 0);
      });

      const openConsolesModal = () => {
        if (isPublicViewMode.value) return;
        consolesSelectedList.value = [...(userProfile.value.myConsoles || [])];
        consoleSearchQuery.value = '';
        isConsolesModalOpen.value = true;
        nextTick(() => refreshLucideIcons());
      };

      const closeConsolesModal = () => {
        isConsolesModalOpen.value = false;
      };

      const toggleConsole = (consoleName) => {
        if (!consoleName) return;
        const idx = consolesSelectedList.value.indexOf(consoleName);
        if (idx !== -1) {
          consolesSelectedList.value.splice(idx, 1);
        } else {
          consolesSelectedList.value.push(consoleName);
        }
      };

      const isConsoleSelected = (consoleName) => {
        return consolesSelectedList.value.includes(consoleName);
      };

      const saveConsolesModal = async () => {
        if (isPublicViewMode.value) return;
        userProfile.value.myConsoles = [...consolesSelectedList.value];
        if (StorageService) {
          StorageService.saveUserProfile(userProfile.value);
        }
        isConsolesModalOpen.value = false;
        showToast('Lista de consoles atualizada com sucesso!', 'success');
        refreshLucideIcons();

        if (cloudUser.value && window.SupabaseService) {
          try {
            await syncToCloud(false);
          } catch (e) {
            console.warn('Falha no upload de consoles:', e);
          }
        }
      };

      // 3. MEU PC / MEU SETUP
      const setupFormText = ref('');

      const openSetupModal = () => {
        if (isPublicViewMode.value) return;
        setupFormText.value = userProfile.value.mySetup || '';
        isSetupModalOpen.value = true;
        nextTick(() => refreshLucideIcons());
      };

      const closeSetupModal = () => {
        isSetupModalOpen.value = false;
      };

      const fillSetupTemplate = () => {
        const template = 
`Processador (CPU): 
Placa de Vídeo (GPU): 
Memória RAM: 
Placa-Mãe: 
Armazenamento (SSD/HD): 
Fonte de Alimentação: 
Gabinete & Refrigeração: 
Monitor Principal: 
Teclado & Mouse: 
Headset / Áudio: `;
        if (!setupFormText.value || confirm('Preencher com o modelo padrão de hardware?')) {
          setupFormText.value = template;
        }
      };

      const saveSetupModal = async () => {
        if (isPublicViewMode.value) return;
        userProfile.value.mySetup = setupFormText.value.trim();
        if (StorageService) {
          StorageService.saveUserProfile(userProfile.value);
        }
        isSetupModalOpen.value = false;
        showToast('Configuração do PC atualizada com sucesso!', 'success');
        refreshLucideIcons();

        if (cloudUser.value && window.SupabaseService) {
          try {
            await syncToCloud(false);
          } catch (e) {
            console.warn('Falha no upload do setup:', e);
          }
        }
      };

      const formattedSetupLines = computed(() => {
        const text = (userProfile.value?.mySetup || '').trim();
        if (!text) return [];
        return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0 && colonIdx < 35) {
            return {
              label: line.substring(0, colonIdx).trim(),
              value: line.substring(colonIdx + 1).trim()
            };
          }
          return {
            label: null,
            value: line
          };
        });
      });

      // =======================================================================
      // MODAL SOBRE & INFORMAÇÕES DO NOTA 11
      // =======================================================================
      const openAboutModal = () => {
        isAboutOpen.value = true;
        isToolsMenuOpen.value = false;
        refreshLucideIcons();
      };

      const closeAboutModal = () => {
        isAboutOpen.value = false;
      };

      const openExternalUrl = (url) => {
        if (!url) return;
        if (window.chrome && window.chrome.webview) {
          try {
            window.chrome.webview.postMessage({ action: 'open_url', url });
            return;
          } catch (e) {}
        }
        window.open(url, '_blank', 'noopener,noreferrer');
      };

      const handleAvatarUpload = (event) => {
        if (isPublicViewMode.value) return;
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          showToast('A imagem de avatar deve ter no máximo 2MB.', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          editProfileForm.value.avatarUrl = e.target.result;
          showToast('Avatar carregado com sucesso!', 'info');
        };
        reader.readAsDataURL(file);
      };

      const openResetProfileConfirm = () => {
        if (isPublicViewMode.value) return;
        isResetProfileConfirmOpen.value = true;
        refreshLucideIcons();
      };

      const confirmResetProfile = () => {
        if (isPublicViewMode.value) return;
        if (StorageService) {
          userProfile.value = StorageService.clearUserProfile();
        } else {
          userProfile.value = {
            name: 'Jogador',
            nickname: 'Gamer Master',
            avatarUrl: '',
            bio: 'Registro pessoal de jogos concluídos, tempos e avaliações.',
            favoritePlatform: 'PC',
            favoriteGenre: ''
          };
        }
        editProfileForm.value = {
          name: userProfile.value.name || '',
          nickname: userProfile.value.nickname || '',
          avatarUrl: userProfile.value.avatarUrl || '',
          bio: userProfile.value.bio || '',
          favoritePlatform: userProfile.value.favoritePlatform || 'PC',
          favoriteGenre: userProfile.value.favoriteGenre || ''
        };
        isResetProfileConfirmOpen.value = false;
        isEditProfileOpen.value = false;
        refreshStorageInfo();
        showToast('Perfil limpo e redefinido para o padrão!', 'info');
        refreshLucideIcons();
      };

      // =======================================================================
      // GERADOR DE SNAPSHOTS EM IMAGEM (.PNG) - COMPARTILHAMENTO & CORS RESOLVER
      // =======================================================================
      const preloadSnapshotImages = async () => {
        if (!window.ImageService) return;
        isPreloadingSnapshotCovers.value = true;
        try {
          let listToPreload = [];
          if (shareSnapshotType.value === 'stats') {
            listToPreload = [...(topLongestGames.value || [])];
          } else {
            listToPreload = [...(shareGamesList.value || [])];
          }

          if (userProfile.value && userProfile.value.avatarUrl) {
            listToPreload.push({
              id: '__avatar__',
              title: userProfile.value.nickname || 'Avatar',
              platform: 'PC',
              coverUrl: userProfile.value.avatarUrl
            });
          }

          const map = await window.ImageService.preloadCovers(listToPreload);
          snapshotCoverMap.value = {
            ...snapshotCoverMap.value,
            ...map
          };
        } catch (err) {
          console.warn('Erro ao pré-carregar capas para snapshot:', err);
        } finally {
          isPreloadingSnapshotCovers.value = false;
        }
      };

      const getSnapshotCover = (game) => {
        if (!game) return '';
        const key = game.id || game.coverUrl || game.title;
        if (snapshotCoverMap.value[key]) {
          return snapshotCoverMap.value[key];
        }
        if (game.coverUrl) {
          return game.coverUrl;
        }
        return window.PlaceholderGenerator ? window.PlaceholderGenerator.generate(game.title || 'Jogo', game.platform || 'PC') : '';
      };

      const getSnapshotAvatar = () => {
        if (snapshotCoverMap.value['__avatar__']) {
          return snapshotCoverMap.value['__avatar__'];
        }
        return userProfile.value?.avatarUrl || '';
      };

      const openShareModal = (type = 'nowPlaying', year = null) => {
        shareSnapshotType.value = type;
        if (year) {
          shareSelectedYear.value = year;
        } else if (type === 'year') {
          shareSelectedYear.value = selectedYearTab.value || currentCalendarYear;
        }
        isShareModalOpen.value = true;
        isToolsMenuOpen.value = false;
        nextTick(() => {
          refreshLucideIcons();
          preloadSnapshotImages();
        });
      };

      const closeShareModal = () => {
        isShareModalOpen.value = false;
      };

      // Observadores para re-carregar capas quando o usuário mudar abas ou anos no snapshot
      watch([shareSnapshotType, shareSelectedYear, () => shareGamesList.value.length], () => {
        if (isShareModalOpen.value) {
          nextTick(() => {
            preloadSnapshotImages();
          });
        }
      });

      const getSnapshotTitle = () => {
        if (shareSnapshotType.value === 'nowPlaying') {
          return 'O QUE ESTOU JOGANDO AGORA';
        }
        if (shareSnapshotType.value === 'stats') {
          return 'ESTATÍSTICAS & ANALYTICS DA COLEÇÃO';
        }
        if (shareSelectedYear.value === 'ALL') {
          return 'JOGOS ZERADOS - BIBLIOTECA COMPLETA';
        }
        return `JOGOS ZERADOS EM ${shareSelectedYear.value}`;
      };

      const downloadSnapshotPng = async () => {
        const node = document.getElementById('snapshot-canvas-card');
        if (!node) {
          showToast('Elemento do snapshot não encontrado.', 'error');
          return;
        }

        if (!window.htmlToImage) {
          showToast('Aguarde o carregamento do motor de imagem...', 'warning');
          return;
        }

        isGeneratingSnapshot.value = true;
        try {
          // 1. Garante que 100% das imagens foram convertidas para Data URLs locais imunes a CORS
          await preloadSnapshotImages();
          await nextTick();
          refreshLucideIcons();

          // 2. Aguarda carregamento total de todas as tags de imagem do nó
          const imgElements = Array.from(node.querySelectorAll('img'));
          await Promise.all(imgElements.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(res => {
              img.onload = res;
              img.onerror = res;
              setTimeout(res, 2500);
            });
          }));

          await new Promise(r => setTimeout(r, 150));

          const dataUrl = await window.htmlToImage.toPng(node, {
            quality: 0.98,
            pixelRatio: 2,
            cacheBust: false
          });

          let typeLabel = 'estatisticas_colecao';
          if (shareSnapshotType.value === 'nowPlaying') {
            typeLabel = 'jogando_agora';
          } else if (shareSnapshotType.value === 'year') {
            typeLabel = `zerados_${shareSelectedYear.value}`;
          }
          const filename = `nota11_${typeLabel}_${Date.now()}.png`;

          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();

          showToast('🎉 Imagem PNG exportada com sucesso!', 'success');
        } catch (err) {
          console.error('Snapshot error:', err);
          showToast('Erro ao exportar imagem. ' + (err.message || ''), 'error');
        } finally {
          isGeneratingSnapshot.value = false;
        }
      };

      const copySnapshotToClipboard = async () => {
        const node = document.getElementById('snapshot-canvas-card');
        if (!node) return;

        if (!window.htmlToImage) {
          showToast('Aguarde o carregamento do motor de imagem...', 'warning');
          return;
        }

        if (!navigator.clipboard || !window.ClipboardItem) {
          showToast('Seu navegador não suporta cópia direta de imagem. Use o botão Baixar PNG.', 'warning');
          return;
        }

        isGeneratingSnapshot.value = true;
        try {
          // 1. Garante pré-carregamento total das imagens com Data URLs
          await preloadSnapshotImages();
          await nextTick();
          refreshLucideIcons();

          const imgElements = Array.from(node.querySelectorAll('img'));
          await Promise.all(imgElements.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(res => {
              img.onload = res;
              img.onerror = res;
              setTimeout(res, 2500);
            });
          }));

          await new Promise(r => setTimeout(r, 150));

          const blob = await window.htmlToImage.toBlob(node, {
            quality: 0.98,
            pixelRatio: 2,
            cacheBust: false
          });

          if (!blob) throw new Error('Falha ao gerar arquivo de imagem');

          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);

          showToast('📋 Imagem copiada para a área de transferência! Cole no Discord ou WhatsApp (Ctrl+V).', 'success');
        } catch (err) {
          console.error('Clipboard copy error:', err);
          showToast('Não foi possível copiar para a área de transferência. Use o botão Baixar PNG.', 'warning');
        } finally {
          isGeneratingSnapshot.value = false;
        }
      };

      // =======================================================================
      // HOWLONGTOBEAT (HLTB) - ESTIMATIVAS DE TEMPO AUTOMÁTICAS
      // =======================================================================
      const openHltbModal = async () => {
        hltbSyncFinished.value = false;
        hltbProgressPercent.value = 0;
        hltbCurrentGameTitle.value = '';
        hltbSyncLogs.value = [];
        hltbStats.value = {
          total: hltbEligibleGames.value.length,
          processed: 0,
          updated: 0,
          skipped: 0,
          failed: 0
        };
        isHltbModalOpen.value = true;
        refreshLucideIcons();

        // Checagem em background do status do servidor
        if (window.HltbService) {
          try {
            hltbConnectionStatus.value = await window.HltbService.checkConnection();
          } catch (e) {
            hltbConnectionStatus.value = { ok: false, message: 'Servidor local não detectado.' };
          }
          refreshLucideIcons();
        }
      };

      const cancelHltbSync = () => {
        isHltbCancelled.value = true;
        isHltbSyncing.value = false;
        hltbSyncLogs.value.unshift({
          type: 'error',
          icon: '⛔',
          message: 'Sincronização interrompida pelo usuário.'
        });
        refreshLucideIcons();
      };

      const startHltbSync = async () => {
        if (!window.HltbService) {
          showToast('Serviço HLTB não carregado.', 'error');
          return;
        }

        const targets = [...hltbEligibleGames.value];
        if (targets.length === 0) {
          showToast('Nenhum jogo zerado com tempo 00:00:00 encontrado.', 'info');
          return;
        }

        // Verifica estado da conexão antes de iniciar
        const conn = await window.HltbService.checkConnection();
        hltbConnectionStatus.value = conn;

        isHltbSyncing.value = true;
        isHltbCancelled.value = false;
        hltbSyncFinished.value = false;
        hltbSyncLogs.value = [];
        hltbStats.value = {
          total: targets.length,
          processed: 0,
          updated: 0,
          skipped: 0,
          failed: 0
        };
        hltbProgressPercent.value = 0;

        if (!conn.ok) {
          hltbSyncLogs.value.push({
            type: 'info',
            icon: 'ℹ️',
            message: 'Iniciando busca (tentando portas locais 3000/3001 e proxies)...'
          });
        }

        hltbSyncLogs.value.push({
          type: 'info',
          icon: '🚀',
          message: `Iniciando estimativa para ${targets.length} jogos zerados sem tempo registrado...`
        });

        for (let i = 0; i < targets.length; i++) {
          if (isHltbCancelled.value) break;

          const game = targets[i];
          hltbCurrentGameTitle.value = game.title;

          try {
            const res = await window.HltbService.getEstimatedPlaytime(game.title, game.completionCondition);

            if (res.found && res.seconds > 0) {
              game.playtime = res.playtime;
              game.playtimeHours = res.hours;
              game.updatedAt = new Date().toISOString();
              hltbStats.value.updated++;

              hltbSyncLogs.value.unshift({
                type: 'success',
                icon: '✅',
                message: `${game.title} -> ${res.hours}h adicionadas (${res.timeType})`
              });
            } else {
              hltbStats.value.skipped++;
              hltbSyncLogs.value.unshift({
                type: 'skipped',
                icon: '⏩',
                message: `${game.title} -> ${res.reason || 'Sem registros no HLTB (mantido)'}`
              });
            }
          } catch (err) {
            console.error(`Erro ao consultar HLTB para ${game.title}:`, err);
            hltbStats.value.failed++;
            hltbSyncLogs.value.unshift({
              type: 'error',
              icon: '❌',
              message: `${game.title} -> Erro na consulta: ${err.message || 'Falha de conexão'}`
            });
          }

          hltbStats.value.processed++;
          hltbProgressPercent.value = (hltbStats.value.processed / targets.length) * 100;
          refreshLucideIcons();

          // Intervalo educado entre requisições para evitar rate limit
          if (i < targets.length - 1 && !isHltbCancelled.value) {
            await new Promise(r => setTimeout(r, 220));
          }
        }

        if (!isHltbCancelled.value) {
          isHltbSyncing.value = false;
          hltbSyncFinished.value = true;
          hltbCurrentGameTitle.value = '';

          // Salva biblioteca atualizada
          if (StorageService) {
            StorageService.saveGames(games.value);
            refreshStorageInfo();
          }

          hltbSyncLogs.value.unshift({
            type: 'info',
            icon: '🎉',
            message: `Estimativa concluída! ${hltbStats.value.updated} de ${targets.length} jogos atualizados com sucesso.`
          });

          showToast(`Estimativa HLTB concluída! ${hltbStats.value.updated} jogos atualizados.`, 'success');
          refreshLucideIcons();
        }
      };

      const fetchHltbForSingleGame = async (targetForm) => {
        if (!targetForm || !targetForm.title) {
          showToast('Informe o título do jogo antes de consultar o HLTB.', 'warning');
          return;
        }

        if (!window.HltbService) {
          showToast('Serviço HLTB não carregado.', 'error');
          return;
        }

        isHltbSingleLoading.value = true;
        try {
          const isPlat = Boolean(targetForm.isPlatinum) || targetForm.completionCondition === 'Platinado/Perfeitos';
          const condition = isPlat ? 'Platinado/Perfeitos' : (targetForm.completionCondition || 'Condição Padrão');
          const res = await window.HltbService.getEstimatedPlaytime(targetForm.title, condition);

          if (res.found && res.seconds > 0) {
            targetForm.playtime = res.playtime;
            targetForm.playtimeHours = res.hours;

            // Se for um jogo existente da biblioteca (ex: Detail modal)
            if (targetForm.id && games.value) {
              const liveGame = games.value.find(g => g.id === targetForm.id);
              if (liveGame) {
                liveGame.playtime = res.playtime;
                liveGame.playtimeHours = res.hours;
                liveGame.updatedAt = new Date().toISOString();
                if (StorageService) {
                  StorageService.saveGames(games.value);
                  refreshStorageInfo();
                }
              }
            }

            showToast(`HLTB: ${res.hours}h encontradas para "${res.gameName || targetForm.title}" (${res.timeType})`, 'success');
          } else {
            showToast(`HLTB: ${res.reason || 'Nenhum tempo encontrado.'}`, 'warning');
          }
        } catch (err) {
          console.error('HLTB single search error:', err);
          showToast('Erro ao consultar HLTB: ' + (err.message || ''), 'error');
        } finally {
          isHltbSingleLoading.value = false;
          refreshLucideIcons();
        }
      };

      // =======================================================================
      // MENU UNIFICADO DE FERRAMENTAS E DADOS
      // =======================================================================
      const toggleToolsMenu = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        isToolsMenuOpen.value = !isToolsMenuOpen.value;
        if (isToolsMenuOpen.value) {
          isNowPlayingMenuOpen.value = false;
          refreshStorageInfo();
        }
        nextTick(() => {
          refreshLucideIcons();
        });
      };

      const closeToolsMenu = () => {
        isToolsMenuOpen.value = false;
      };

      const toggleNowPlayingMenu = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        isNowPlayingMenuOpen.value = !isNowPlayingMenuOpen.value;
        if (isNowPlayingMenuOpen.value) {
          isToolsMenuOpen.value = false;
        }
        nextTick(() => {
          refreshLucideIcons();
        });
      };

      const closeNowPlayingMenu = () => {
        isNowPlayingMenuOpen.value = false;
      };

      // =======================================================================
      // ORDENAÇÃO INTERATIVA E REORDENAÇÃO MANUAL NA TABELA
      // =======================================================================
      const toggleTableSort = (column) => {
        if (column === 'title') {
          sortBy.value = sortBy.value === 'title-asc' ? 'title-desc' : 'title-asc';
        } else if (column === 'platform') {
          sortBy.value = sortBy.value === 'platform-asc' ? 'platform-desc' : 'platform-asc';
        } else if (column === 'genre') {
          sortBy.value = sortBy.value === 'genre-asc' ? 'genre-desc' : 'genre-asc';
        } else if (column === 'date') {
          sortBy.value = sortBy.value === 'date-desc' ? 'date-asc' : 'date-desc';
        } else if (column === 'year') {
          sortBy.value = sortBy.value === 'year-desc' ? 'year-asc' : 'year-desc';
        } else if (column === 'time') {
          sortBy.value = sortBy.value === 'time-desc' ? 'time-asc' : 'time-desc';
        } else if (column === 'rating') {
          sortBy.value = sortBy.value === 'rating-desc' ? 'rating-asc' : 'rating-desc';
        } else if (column === 'condition') {
          sortBy.value = sortBy.value === 'condition-asc' ? 'condition-desc' : 'condition-asc';
        }
        refreshLucideIcons();
      };

      // =======================================================================
      // PERSISTÊNCIA DEBOUNCED & DRAG & DROP ULTRA-FLUIDO (JOGANDO AGORA & BIBLIOTECA)
      // =======================================================================
      const draggedGameId = ref(null);
      const dragOverGameId = ref(null);
      const dragOverShelfId = ref(null);
      const dragOverHeroTab = ref(null);

      // Aliases para compatibilidade total com templates existentes
      const draggedNowPlayingGameId = draggedGameId;
      const draggedNowPlayingIndex = ref(null);
      const dragOverNowPlayingIndex = ref(null);

      let saveDebounceTimer = null;
      const debouncedSaveGames = (toastMsg = null) => {
        if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
        saveDebounceTimer = setTimeout(() => {
          if (StorageService) {
            StorageService.saveGames(games.value);
          }
          refreshStorageInfo();
          if (toastMsg) showToast(toastMsg, 'info');
        }, 120);
      };

      const setNowPlayingLayout = (layout) => {
        nowPlayingLayout.value = layout;
        try {
          localStorage.setItem('nota11_nowplaying_layout', layout);
        } catch (e) {}
        nextTick(() => refreshLucideIcons());
      };

      const setBacklogLayout = (layout) => {
        backlogLayout.value = layout;
        try {
          localStorage.setItem('nota11_backlog_layout', layout);
        } catch (e) {}
        nextTick(() => refreshLucideIcons());
      };

      const setNowPlayingViewMode = (mode) => {
        nowPlayingViewMode.value = mode;
        try {
          localStorage.setItem('nota11_nowplaying_view', mode);
        } catch (e) {}
        nextTick(() => refreshLucideIcons());
      };

      const onCardZoomChange = (val) => {
        const num = parseInt(val, 10);
        if (!isNaN(num)) {
          cardZoom.value = Math.min(Math.max(num, 90), 300);
          try {
            localStorage.setItem('nota11_card_zoom', String(cardZoom.value));
          } catch (e) {}
        }
      };

      const resetCardZoom = () => {
        cardZoom.value = 165;
        try {
          localStorage.setItem('nota11_card_zoom', '165');
        } catch (e) {}
      };

      // =======================================================================
      // CONTROLES DE LAYOUT & ALTERNADOR HERO (JOGANDO AGORA VS BACKLOG)
      // =======================================================================
      const setHeroTab = (tab) => {
        heroTab.value = tab;
        try {
          localStorage.setItem('nota11_hero_tab', tab);
        } catch (e) {}
        nextTick(() => refreshLucideIcons());
      };

      const setNowPlayingCardSize = (size) => {
        if (size === 'list') setNowPlayingLayout('table');
        else setNowPlayingLayout('grid');
      };

      const setBacklogCardSize = (size) => {
        if (size === 'list') setBacklogLayout('table');
        else setBacklogLayout('grid');
      };

      const nowPlayingLayoutLabel = computed(() => nowPlayingLayout.value === 'table' ? 'Tabela' : 'Grade');
      const nowPlayingLayoutIcon = computed(() => nowPlayingLayout.value === 'table' ? 'list' : 'layout-grid');
      const backlogLayoutLabel = computed(() => backlogLayout.value === 'table' ? 'Tabela' : 'Grade');
      const backlogLayoutIcon = computed(() => backlogLayout.value === 'table' ? 'list' : 'layout-grid');

      const toggleNowPlayingLayoutMenu = (event) => {
        if (event) event.stopPropagation();
        isNowPlayingLayoutMenuOpen.value = !isNowPlayingLayoutMenuOpen.value;
      };

      const toggleBacklogLayoutMenu = (event) => {
        if (event) event.stopPropagation();
        isBacklogLayoutMenuOpen.value = !isBacklogLayoutMenuOpen.value;
      };


      const createPlayingCategory = (name = '', icon = 'folder') => {
        if (isPublicViewMode.value) return;
        const cleanName = (name || newCategoryName.value || '').trim();
        if (!cleanName) {
          showToast('Informe um nome para a categoria.', 'warning');
          return;
        }

        const exists = playingCategories.value.some(c => c.name.toLowerCase() === cleanName.toLowerCase());
        if (exists) {
          showToast('Já existe uma categoria com este nome.', 'warning');
          return;
        }

        const newCat = {
          id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: cleanName,
          icon: icon || 'folder'
        };

        playingCategories.value.push(newCat);
        newCategoryName.value = '';
        if (StorageService) {
          StorageService.savePlayingCategories(playingCategories.value);
        }
        refreshStorageInfo();
        showToast(`Categoria "${cleanName}" criada com sucesso!`, 'success');
        refreshLucideIcons();
      };

      const startEditPlayingCategory = (cat) => {
        if (isPublicViewMode.value) return;
        editingCategoryId.value = cat.id;
        editingCategoryName.value = cat.name;
      };

      const saveEditPlayingCategory = () => {
        if (isPublicViewMode.value || !editingCategoryId.value) return;
        const cleanName = editingCategoryName.value.trim();
        if (!cleanName) {
          showToast('O nome da categoria não pode ficar vazio.', 'warning');
          return;
        }

        const cat = playingCategories.value.find(c => c.id === editingCategoryId.value);
        if (cat) {
          cat.name = cleanName;
          if (StorageService) {
            StorageService.savePlayingCategories(playingCategories.value);
          }
          refreshStorageInfo();
          showToast('Categoria atualizada!', 'info');
        }
        editingCategoryId.value = null;
        editingCategoryName.value = '';
        refreshLucideIcons();
      };

      const cancelEditPlayingCategory = () => {
        editingCategoryId.value = null;
        editingCategoryName.value = '';
      };

      const deletePlayingCategory = (catId) => {
        if (isPublicViewMode.value) return;
        const cat = playingCategories.value.find(c => c.id === catId);
        const catName = cat ? cat.name : 'Categoria';

        playingCategories.value = playingCategories.value.filter(c => c.id !== catId);

        let affected = 0;
        games.value = games.value.map(g => {
          if (g.playingCategory === catId || (cat && g.playingCategory === cat.name)) {
            affected++;
            return { ...g, playingCategory: null };
          }
          return g;
        });

        if (StorageService) {
          StorageService.savePlayingCategories(playingCategories.value);
          StorageService.saveGames(games.value);
        }
        refreshStorageInfo();
        showToast(`Categoria "${catName}" excluída.${affected > 0 ? ` ${affected} jogo(s) movido(s) para Sem Categoria.` : ''}`, 'info');
        refreshLucideIcons();
      };

      const movePlayingCategory = (catId, direction) => {
        if (isPublicViewMode.value) return;
        const idx = playingCategories.value.findIndex(c => c.id === catId);
        if (idx === -1) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= playingCategories.value.length) return;

        const temp = playingCategories.value[idx];
        playingCategories.value[idx] = playingCategories.value[targetIdx];
        playingCategories.value[targetIdx] = temp;

        if (StorageService) {
          StorageService.savePlayingCategories(playingCategories.value);
        }
        refreshLucideIcons();
      };

      const getPlayingCategoryName = (catIdOrName) => {
        if (!catIdOrName) return null;
        const cat = playingCategories.value.find(c => c.id === catIdOrName || c.name.toLowerCase() === catIdOrName.toLowerCase());
        return cat ? cat.name : catIdOrName;
      };

      const setGamePlayingCategory = (gameId, catId) => {
        const game = games.value.find(g => g.id === gameId);
        if (game) {
          game.playingCategory = catId === 'uncategorized' ? null : catId;
          debouncedSaveGames(`Jogo movido para "${getPlayingCategoryName(catId) || 'Sem Categoria'}"`);
        }
      };

      // 1. Início do Arraste de Jogo
      const onGameDragStart = (event, game, context = 'any') => {
        if (!game || !game.id) return;
        draggedGameId.value = game.id;
        dragOverGameId.value = null;
        if (event && event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(game.id));
        }
      };

      // 2. DragOver sobre Card Alvo
      const onGameDragOver = (event, targetGame, shelfId = null) => {
        if (event) {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
        }
        if (!targetGame || targetGame.id === draggedGameId.value) return;
        if (dragOverGameId.value !== targetGame.id) {
          dragOverGameId.value = targetGame.id;
        }
        if (shelfId && dragOverShelfId.value !== shelfId) {
          dragOverShelfId.value = shelfId;
        }
      };

      // 3. DragOver / DragLeave sobre Prateleira (Dropzone)
      const onShelfDragOver = (event, shelfId) => {
        if (event) {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
        }
        if (dragOverShelfId.value !== shelfId) {
          dragOverShelfId.value = shelfId;
        }
      };

      const onShelfDragLeave = (shelfId) => {
        if (dragOverShelfId.value === shelfId) {
          dragOverShelfId.value = null;
        }
      };

      // 4. Drop sobre Card Alvo (Reordenação Instantânea por ID)
      const onGameDrop = (event, targetGame, targetShelfId = null) => {
        if (event && event.preventDefault) event.preventDefault();
        if (isPublicViewMode.value) {
          onGameDragEnd();
          return;
        }
        const sourceId = draggedGameId.value;
        const targetId = targetGame ? targetGame.id : null;

        if (!sourceId) {
          onGameDragEnd();
          return;
        }

        const sourceIdx = games.value.findIndex(g => g.id === sourceId);
        if (sourceIdx === -1) {
          onGameDragEnd();
          return;
        }

        const list = [...games.value];
        const [movedGame] = list.splice(sourceIdx, 1);

        // Se uma prateleira de destino foi informada
        if (targetShelfId !== null) {
          movedGame.playingCategory = targetShelfId === 'uncategorized' ? null : targetShelfId;
        }

        if (targetId && sourceId !== targetId) {
          const targetIdx = list.findIndex(g => g.id === targetId);
          if (targetIdx !== -1) {
            list.splice(targetIdx, 0, movedGame);
          } else {
            list.unshift(movedGame);
          }
        } else {
          list.unshift(movedGame);
        }

        if (movedGame.status === 'Zerado') {
          sortBy.value = 'custom';
        }

        games.value = list;
        debouncedSaveGames();
        onGameDragEnd();
      };

      // 5. Drop Direto na Prateleira
      const onShelfDrop = (shelfId) => {
        if (isPublicViewMode.value) {
          onGameDragEnd();
          return;
        }
        const sourceId = draggedGameId.value;
        if (!sourceId) {
          onGameDragEnd();
          return;
        }

        const game = games.value.find(g => g.id === sourceId);
        if (game) {
          const newCat = shelfId === 'uncategorized' ? null : shelfId;
          if (game.playingCategory !== newCat) {
            game.playingCategory = newCat;
            const catName = getPlayingCategoryName(shelfId) || 'Sem Categoria';
            debouncedSaveGames(`Jogo movido para "${catName}"!`);
          }
        }
        onGameDragEnd();
      };

      // 6. Fim do Arraste
      const onGameDragEnd = () => {
        draggedGameId.value = null;
        dragOverGameId.value = null;
        dragOverShelfId.value = null;
        dragOverHeroTab.value = null;
        draggedNowPlayingIndex.value = null;
        dragOverNowPlayingIndex.value = null;
      };

      // 7. Soltar sobre Abas Principais (Jogando Agora / Backlog)
      const onDropOnHeroTab = (targetTab) => {
        if (isPublicViewMode.value) {
          onGameDragEnd();
          return;
        }
        const sourceId = draggedGameId.value;
        dragOverHeroTab.value = null;
        if (!sourceId) {
          onGameDragEnd();
          return;
        }

        const game = games.value.find(g => g.id === sourceId);
        if (!game) {
          onGameDragEnd();
          return;
        }

        if (targetTab === 'backlog') {
          if (game.status !== 'Backlog') {
            moveToBacklog(game);
          }
        } else if (targetTab === 'nowPlaying') {
          if (game.status === 'Backlog') {
            startPlayingBacklogGame(game);
          } else if (game.status === 'Zerado') {
            game.isNowPlaying = true;
            debouncedSaveGames(`"${game.title}" adicionado a Jogando Agora!`);
            setHeroTab('nowPlaying');
          }
        }
        onGameDragEnd();
      };

      // Métodos de compatibilidade
      const onNowPlayingDragStart = (event, game) => onGameDragStart(event, game, 'nowPlaying');
      const onNowPlayingDragOver = (event, targetGame, shelfId = null) => onGameDragOver(event, targetGame, shelfId);
      const onNowPlayingDragEnter = (event, targetGame) => onGameDragOver(event, targetGame);
      const onNowPlayingDragLeave = () => {};
      const onNowPlayingDrop = (event, targetGame, targetShelfId = null) => onGameDrop(event, targetGame, targetShelfId);
      const onNowPlayingDragEnd = () => onGameDragEnd();

      const moveNowPlayingGame = (gameId, direction) => {
        if (isPublicViewMode.value) return;
        const nowPlayingList = [...nowPlayingGames.value];
        const idx = nowPlayingList.findIndex(g => g.id === gameId);
        if (idx === -1) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= nowPlayingList.length) return;

        const temp = nowPlayingList[idx];
        nowPlayingList[idx] = nowPlayingList[targetIdx];
        nowPlayingList[targetIdx] = temp;

        const otherGames = games.value.filter(g => !nowPlayingGames.value.some(np => np.id === g.id));
        games.value = [...nowPlayingList, ...otherGames];

        debouncedSaveGames();
      };

      // 4. AÇÕES DO BACKLOG (TRANSIÇÃO RÁPIDA, REORDENAÇÃO & HLTB)
      // =======================================================================
      const startPlayingBacklogGame = (game) => {
        if (isPublicViewMode.value || !game) return;
        const idx = games.value.findIndex(g => g.id === game.id);
        if (idx === -1) return;

        games.value[idx].status = 'Jogando';
        games.value[idx].isNowPlaying = false;
        games.value[idx].updatedAt = new Date().toISOString();

        if (detailGame.value && detailGame.value.id === game.id) {
          detailGame.value.status = 'Jogando';
        }

        if (StorageService) {
          StorageService.saveGames(games.value);
          refreshStorageInfo();
        }

        showToast(`🎮 "${game.title}" movido para Jogando Agora! Bom jogo!`, 'success');
        setHeroTab('nowPlaying');
      };

      const moveToBacklog = (game) => {
        if (isPublicViewMode.value || !game) return;
        const idx = games.value.findIndex(g => g.id === game.id);
        if (idx === -1) return;

        games.value[idx].status = 'Backlog';
        games.value[idx].isNowPlaying = false;
        games.value[idx].updatedAt = new Date().toISOString();

        if (detailGame.value && detailGame.value.id === game.id) {
          detailGame.value.status = 'Backlog';
        }

        if (StorageService) {
          StorageService.saveGames(games.value);
          refreshStorageInfo();
        }

        showToast(`📋 "${game.title}" movido para o Backlog!`, 'info');
        nextTick(() => refreshLucideIcons());
      };

      const moveBacklogGame = (gameId, direction) => {
        if (isPublicViewMode.value) return;
        const backlogList = [...backlogGames.value];
        const idx = backlogList.findIndex(g => g.id === gameId);
        if (idx === -1) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= backlogList.length) return;

        const temp = backlogList[idx];
        backlogList[idx] = backlogList[targetIdx];
        backlogList[targetIdx] = temp;

        const otherGames = games.value.filter(g => !backlogGames.value.some(bg => bg.id === g.id));
        games.value = [...backlogList, ...otherGames];

        debouncedSaveGames();
        nextTick(() => refreshLucideIcons());
      };

      const fetchHltbForBacklogGame = async (game) => {
        if (isPublicViewMode.value || !game || !game.title) return;
        if (!window.HltbService) {
          showToast('Serviço HLTB não carregado.', 'error');
          return;
        }

        try {
          const isPlat = Boolean(game.isPlatinum) || game.completionCondition === 'Platinado/Perfeitos';
          const condition = isPlat ? 'Platinado/Perfeitos' : (game.completionCondition || 'Condição Padrão');
          const res = await window.HltbService.getEstimatedPlaytime(game.title, condition);
          if (res.found && res.seconds > 0) {
            const idx = games.value.findIndex(g => g.id === game.id);
            if (idx !== -1) {
              games.value[idx].playtime = res.playtime;
              games.value[idx].playtimeHours = res.hours;
              games.value[idx].updatedAt = new Date().toISOString();
              if (StorageService) {
                StorageService.saveGames(games.value);
                refreshStorageInfo();
              }
            }
            if (detailGame.value && detailGame.value.id === game.id) {
              detailGame.value.playtime = res.playtime;
              detailGame.value.playtimeHours = res.hours;
            }
            showToast(`HLTB: ${res.hours}h estimadas para "${res.gameName || game.title}" (${res.timeType})`, 'success');
          } else {
            showToast(`HLTB: ${res.reason || 'Nenhum tempo encontrado no HLTB.'}`, 'warning');
          }
        } catch (err) {
          showToast('Erro ao consultar HLTB: ' + (err.message || ''), 'error');
        }
        nextTick(() => refreshLucideIcons());
      };

      const runBacklogHltbSync = async (targets) => {
        if (isPublicViewMode.value) return;
        if (!window.HltbService) {
          showToast('Serviço HLTB não carregado.', 'error');
          return;
        }

        isBacklogHltbSyncing.value = true;
        let updatedCount = 0;
        let failedCount = 0;

        showToast(`Consultando HLTB para ${targets.length} jogos do Backlog...`, 'info');

        for (let i = 0; i < targets.length; i++) {
          const game = targets[i];
          try {
            const isPlat = Boolean(game.isPlatinum) || game.completionCondition === 'Platinado/Perfeitos';
            const condition = isPlat ? 'Platinado/Perfeitos' : (game.completionCondition || 'Condição Padrão');
            const res = await window.HltbService.getEstimatedPlaytime(game.title, condition);
            if (res.found && res.seconds > 0) {
              const liveGame = games.value.find(g => g.id === game.id);
              if (liveGame) {
                liveGame.playtime = res.playtime;
                liveGame.playtimeHours = res.hours;
                liveGame.updatedAt = new Date().toISOString();
                updatedCount++;
              }
            }
          } catch (e) {
            failedCount++;
          }
          if (i < targets.length - 1) {
            await new Promise(r => setTimeout(r, 220));
          }
        }

        isBacklogHltbSyncing.value = false;
        if (StorageService) {
          StorageService.saveGames(games.value);
          refreshStorageInfo();
        }

        if (updatedCount > 0) {
          showToast(`Estimativas HLTB concluídas! ${updatedCount} de ${targets.length} jogos atualizados no Backlog.`, 'success');
        } else {
          showToast('Nenhuma nova estimativa encontrada no HLTB.', 'info');
        }
        nextTick(() => refreshLucideIcons());
      };

      const syncAllBacklogHltb = async () => {
        const targets = [...backlogEligibleGames.value];
        if (targets.length === 0) {
          const allBacklog = [...backlogGames.value];
          if (allBacklog.length === 0) {
            showToast('Nenhum jogo no Backlog para estimar.', 'info');
            return;
          }
          await runBacklogHltbSync(allBacklog);
          return;
        }
        await runBacklogHltbSync(targets);
      };

      const moveGameInList = (gameId, direction) => {
        if (isPublicViewMode.value) return;
        const idx = games.value.findIndex(g => g.id === gameId);
        if (idx === -1) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= games.value.length) return;

        const list = [...games.value];
        const temp = list[idx];
        list[idx] = list[targetIdx];
        list[targetIdx] = temp;

        sortBy.value = 'custom';
        games.value = list;

        debouncedSaveGames();
      };

      const getPriorityMeta = (priorityVal) => {
        const p = (priorityVal || '').toLowerCase().trim();
        if (p === 'alta' || p === 'high' || p === '1' || p === 'p1') {
          return {
            value: 'alta',
            label: 'Alta Prioridade (Foco Principal)',
            shortLabel: 'Alta Prioridade',
            badgeClass: 'badge-priority-alta',
            icon: 'flame'
          };
        }
        if (p === 'media' || p === 'média' || p === 'medium' || p === '2' || p === 'p2') {
          return {
            value: 'media',
            label: 'Média Prioridade (Em Andamento)',
            shortLabel: 'Média Prioridade',
            badgeClass: 'badge-priority-media',
            icon: 'activity'
          };
        }
        if (p === 'baixa' || p === 'low' || p === '3' || p === 'p3') {
          return {
            value: 'baixa',
            label: 'Baixa Prioridade (Casual)',
            shortLabel: 'Baixa Prioridade',
            badgeClass: 'badge-priority-baixa',
            icon: 'coffee'
          };
        }
        return null;
      };

      const setGamePriority = (game, priorityVal) => {
        if (isPublicViewMode.value) return;
        const idx = games.value.findIndex(g => g.id === game.id);
        if (idx !== -1) {
          games.value[idx].priority = priorityVal || null;
          games.value[idx].updatedAt = new Date().toISOString();
          if (StorageService) {
            StorageService.saveGames(games.value);
          }
          refreshStorageInfo();
          const meta = getPriorityMeta(priorityVal);
          if (meta) {
            showToast(`Prioridade de "${game.title}" definida para ${meta.shortLabel}!`, 'success');
          } else {
            showToast(`Prioridade de "${game.title}" removida.`, 'info');
          }
          refreshLucideIcons();
        }
      };

      const cycleGamePriority = (game) => {
        if (isPublicViewMode.value) return;
        const current = (game.priority || '').toLowerCase();
        let next = '';
        if (!current) next = 'alta';
        else if (current === 'alta') next = 'media';
        else if (current === 'media') next = 'baixa';
        else if (current === 'baixa') next = '';
        setGamePriority(game, next);
      };

      watch([currentGrouping, currentLayout], ([newGrouping, newLayout]) => {
        if (settings.value) {
          settings.value.grouping = newGrouping;
          settings.value.layout = newLayout;
          settings.value.defaultView = newGrouping === 'year' ? 'year' : newLayout;
          settings.value.yearViewMode = newLayout;
          if (StorageService) StorageService.saveSettings(settings.value);
        }
        refreshLucideIcons();
      });

      const getAdaptiveKpiClass = (val) => {
        if (val === null || val === undefined) return 'text-xl font-black leading-tight';
        const str = String(val).trim();
        const len = str.length;
        if (len >= 12) return 'text-[11px] font-black tracking-tighter leading-tight';
        if (len >= 9) return 'text-xs font-black tracking-tighter leading-tight';
        if (len >= 7) return 'text-sm font-black tracking-tight leading-tight';
        if (len >= 6) return 'text-base font-black tracking-tight leading-tight';
        return 'text-xl font-black leading-tight';
      };

      // =======================================================================
      // NUVEM & SUPABASE (AUTENTICAÇÃO, SINCRONIZAÇÃO E RECUPERAÇÃO)
      // =======================================================================
      const openCloudModal = (preferredTab = null) => {
        cloudErrorMessage.value = '';
        cloudSuccessMessage.value = '';
        if (window.SupabaseService) {
          const cfg = window.SupabaseService.getConfig();
          cloudConfigForm.value.url = cfg.url;
          cloudConfigForm.value.anonKey = cfg.anonKey;
        }
        if (preferredTab) {
          cloudModalTab.value = preferredTab;
        } else if (cloudUser.value) {
          cloudModalTab.value = 'account';
        } else {
          cloudModalTab.value = 'login';
        }
        isCloudModalOpen.value = true;
        nextTick(() => refreshLucideIcons());
      };

      const closeCloudModal = () => {
        isCloudModalOpen.value = false;
      };

      const continueWithoutLogin = () => {
        isCloudModalOpen.value = false;
        showToast('Continuando sem login. Seus jogos permanecem salvos no navegador!', 'info');
      };

      const initSupabaseAuth = async () => {
        if (!window.SupabaseService) return;
        try {
          const user = await window.SupabaseService.getCurrentUser();
          if (user) {
            cloudUser.value = user;
            lastCloudSync.value = window.SupabaseService.getLastSyncTime();

            // Se o usuário está autenticado, sincroniza os dados da nuvem para o navegador
            const cloudData = await window.SupabaseService.loadUserData(user.id);
            if (cloudData) {
              const hasCloudProfile = Boolean(cloudData.profile && (cloudData.profile.nickname || (Array.isArray(cloudData.profile.top5Games) && cloudData.profile.top5Games.length > 0) || (Array.isArray(cloudData.profile.myConsoles) && cloudData.profile.myConsoles.length > 0) || cloudData.profile.mySetup));
              if (games.value.length === 0 || hasCloudProfile) {
                if (StorageService) {
                  if (games.value.length === 0 && Array.isArray(cloudData.games)) StorageService.saveGames(cloudData.games);
                  if (hasCloudProfile) StorageService.saveUserProfile(cloudData.profile);
                  if (cloudData.settings && games.value.length === 0) StorageService.saveSettings(cloudData.settings);
                  if (Array.isArray(cloudData.playingCategories) && games.value.length === 0) StorageService.savePlayingCategories(cloudData.playingCategories);
                  loadActiveProfileData();
                } else {
                  if (games.value.length === 0 && Array.isArray(cloudData.games)) games.value = cloudData.games;
                  if (hasCloudProfile) userProfile.value = cloudData.profile;
                  if (cloudData.settings && games.value.length === 0) settings.value = { ...settings.value, ...cloudData.settings };
                  if (Array.isArray(cloudData.playingCategories) && games.value.length === 0) playingCategories.value = cloudData.playingCategories;
                }
                refreshStorageInfo();
              }
            } else if (games.value.length > 0 && cloudAutoSyncEnabled.value && !isCloudSyncing.value) {
              debouncedCloudSync();
            }
          }

          window.SupabaseService.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
              cloudUser.value = session ? session.user : null;
              cloudModalTab.value = 'reset_password';
              isCloudModalOpen.value = true;
              showToast('Link de recuperação verificado! Defina sua nova senha.', 'info');
              nextTick(() => refreshLucideIcons());
            } else if (event === 'SIGNED_IN') {
              cloudUser.value = session ? session.user : null;
              lastCloudSync.value = window.SupabaseService.getLastSyncTime();
              if (cloudUser.value) {
                const cloudData = await window.SupabaseService.loadUserData(cloudUser.value.id);
                if (cloudData) {
                  const hasCloudProfile = Boolean(cloudData.profile && (cloudData.profile.nickname || (Array.isArray(cloudData.profile.top5Games) && cloudData.profile.top5Games.length > 0) || (Array.isArray(cloudData.profile.myConsoles) && cloudData.profile.myConsoles.length > 0) || cloudData.profile.mySetup));
                  if (games.value.length === 0 || hasCloudProfile) {
                    if (StorageService) {
                      if (games.value.length === 0 && Array.isArray(cloudData.games)) StorageService.saveGames(cloudData.games);
                      if (hasCloudProfile) StorageService.saveUserProfile(cloudData.profile);
                      if (cloudData.settings && games.value.length === 0) StorageService.saveSettings(cloudData.settings);
                      if (Array.isArray(cloudData.playingCategories) && games.value.length === 0) StorageService.savePlayingCategories(cloudData.playingCategories);
                      loadActiveProfileData();
                    } else {
                      if (games.value.length === 0 && Array.isArray(cloudData.games)) games.value = cloudData.games;
                      if (hasCloudProfile) userProfile.value = cloudData.profile;
                      if (cloudData.settings && games.value.length === 0) settings.value = { ...settings.value, ...cloudData.settings };
                      if (Array.isArray(cloudData.playingCategories) && games.value.length === 0) playingCategories.value = cloudData.playingCategories;
                    }
                    refreshStorageInfo();
                  }
                }
              }
              refreshLucideIcons();
            } else if (event === 'SIGNED_OUT') {
              cloudUser.value = null;
              refreshLucideIcons();
            }
          });
        } catch (e) {
          console.warn('Erro ao inicializar auth Supabase:', e);
        }
      };

      let _cloudSyncDebounceTimer = null;
      const debouncedCloudSync = () => {
        if (!cloudUser.value || !cloudAutoSyncEnabled.value) return;
        if (!games.value || games.value.length === 0) return;
        if (_cloudSyncDebounceTimer) clearTimeout(_cloudSyncDebounceTimer);
        _cloudSyncDebounceTimer = setTimeout(() => {
          syncToCloud(false);
        }, 1500);
      };

      const loginCloudUser = async () => {
        cloudErrorMessage.value = '';
        cloudSuccessMessage.value = '';
        const email = (cloudAuthForm.value.email || '').trim();
        const password = cloudAuthForm.value.password || '';

        if (!email || !password) {
          cloudErrorMessage.value = 'Por favor, informe seu e-mail e senha.';
          return;
        }

        if (!window.SupabaseService) {
          cloudErrorMessage.value = 'Serviço Supabase não carregado.';
          return;
        }

        isCloudLoading.value = true;
        try {
          const data = await window.SupabaseService.signIn(email, password);
          cloudUser.value = data.user;
          cloudAuthForm.value.password = '';
          cloudAuthForm.value.confirmPassword = '';

          // Carrega dados da nuvem se existirem, ou sincroniza os dados locais
          const cloudData = await window.SupabaseService.loadUserData();
          const hasCloudContent = Boolean(
            cloudData && (
              (Array.isArray(cloudData.games) && cloudData.games.length > 0) ||
              (cloudData.profile && (cloudData.profile.nickname || (Array.isArray(cloudData.profile.top5Games) && cloudData.profile.top5Games.length > 0) || (Array.isArray(cloudData.profile.myConsoles) && cloudData.profile.myConsoles.length > 0) || cloudData.profile.mySetup))
            )
          );

          if (hasCloudContent) {
            if (StorageService) {
              if (Array.isArray(cloudData.games)) StorageService.saveGames(cloudData.games);
              if (cloudData.profile) StorageService.saveUserProfile(cloudData.profile);
              if (cloudData.settings) StorageService.saveSettings(cloudData.settings);
              if (Array.isArray(cloudData.playingCategories)) StorageService.savePlayingCategories(cloudData.playingCategories);
              loadActiveProfileData();
            } else {
              if (Array.isArray(cloudData.games)) games.value = cloudData.games;
              if (cloudData.profile) userProfile.value = cloudData.profile;
              if (cloudData.settings) settings.value = { ...settings.value, ...cloudData.settings };
              if (Array.isArray(cloudData.playingCategories)) playingCategories.value = cloudData.playingCategories;
            }
            refreshStorageInfo();
            showToast('Coleção e perfil sincronizados da nuvem com sucesso!', 'success');
          } else if (games.value.length > 0) {
            // Nuvem estava vazia, envia dados locais
            await syncToCloud(false);
          }

          cloudModalTab.value = 'account';
          showToast(`Bem-vindo, ${email}! Conectado ao Supabase.`, 'success');
        } catch (err) {
          cloudErrorMessage.value = err.message || 'Erro ao realizar login.';
        } finally {
          isCloudLoading.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const registerCloudUser = async () => {
        cloudErrorMessage.value = '';
        cloudSuccessMessage.value = '';
        const email = (cloudAuthForm.value.email || '').trim();
        const password = cloudAuthForm.value.password || '';
        const confirmPassword = cloudAuthForm.value.confirmPassword || '';

        if (!email || !password) {
          cloudErrorMessage.value = 'Por favor, informe e-mail e senha.';
          return;
        }

        if (password.length < 6) {
          cloudErrorMessage.value = 'A senha deve conter no mínimo 6 caracteres.';
          return;
        }

        if (password !== confirmPassword) {
          cloudErrorMessage.value = 'As senhas não coincidem.';
          return;
        }

        if (!window.SupabaseService) {
          cloudErrorMessage.value = 'Serviço Supabase não carregado.';
          return;
        }

        isCloudLoading.value = true;
        try {
          const data = await window.SupabaseService.signUp(email, password);
          if (data && data.user) {
            cloudUser.value = data.user;
            cloudAuthForm.value.password = '';
            cloudAuthForm.value.confirmPassword = '';
            // Faz upload imediato dos dados locais atuais para o banco
            await syncToCloud(false);
            cloudModalTab.value = 'account';
            showToast('Conta criada com sucesso! Seus jogos foram sincronizados.', 'success');
          } else {
            cloudSuccessMessage.value = 'Conta criada com sucesso! Verifique seu e-mail para ativar.';
          }
        } catch (err) {
          cloudErrorMessage.value = err.message || 'Erro ao criar conta.';
        } finally {
          isCloudLoading.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const logoutCloudUser = async () => {
        if (!window.SupabaseService) return;
        isCloudLoading.value = true;
        try {
          await window.SupabaseService.signOut();
          cloudUser.value = null;
          cloudModalTab.value = 'login';
          showToast('Sessão encerrada. Seus dados locais continuam seguros!', 'info');
        } catch (err) {
          showToast(err.message || 'Erro ao sair.', 'error');
        } finally {
          isCloudLoading.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const requestPasswordReset = async () => {
        cloudErrorMessage.value = '';
        cloudSuccessMessage.value = '';
        const email = (cloudAuthForm.value.email || '').trim();

        if (!email) {
          cloudErrorMessage.value = 'Digite o e-mail cadastrado para recuperar sua senha.';
          return;
        }

        if (!window.SupabaseService) {
          cloudErrorMessage.value = 'Serviço Supabase não carregado.';
          return;
        }

        isCloudLoading.value = true;
        try {
          await window.SupabaseService.resetPasswordForEmail(email);
          cloudSuccessMessage.value = `Enviamos um link de recuperação para "${email}". Verifique sua caixa de entrada e spam.`;
        } catch (err) {
          cloudErrorMessage.value = err.message || 'Erro ao solicitar recuperação de senha.';
        } finally {
          isCloudLoading.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const updateUserPassword = async () => {
        cloudErrorMessage.value = '';
        cloudSuccessMessage.value = '';
        const p1 = cloudChangePasswordForm.value.password || '';
        const p2 = cloudChangePasswordForm.value.confirmPassword || '';

        if (!p1 || p1.length < 6) {
          cloudErrorMessage.value = 'A nova senha deve ter no mínimo 6 caracteres.';
          return;
        }

        if (p1 !== p2) {
          cloudErrorMessage.value = 'A confirmação de senha não coincide.';
          return;
        }

        if (!window.SupabaseService) {
          cloudErrorMessage.value = 'Serviço Supabase não carregado.';
          return;
        }

        isCloudLoading.value = true;
        try {
          await window.SupabaseService.updatePassword(p1);
          cloudChangePasswordForm.value.password = '';
          cloudChangePasswordForm.value.confirmPassword = '';
          cloudSuccessMessage.value = 'Senha alterada com sucesso!';
          showToast('Sua senha foi alterada com sucesso!', 'success');
        } catch (err) {
          cloudErrorMessage.value = err.message || 'Erro ao alterar senha.';
        } finally {
          isCloudLoading.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const saveNewPasswordFromReset = async () => {
        cloudErrorMessage.value = '';
        cloudSuccessMessage.value = '';
        const p1 = cloudResetForm.value.password || '';
        const p2 = cloudResetForm.value.confirmPassword || '';

        if (!p1 || p1.length < 6) {
          cloudErrorMessage.value = 'A nova senha deve ter no mínimo 6 caracteres.';
          return;
        }

        if (p1 !== p2) {
          cloudErrorMessage.value = 'As senhas não coincidem.';
          return;
        }

        if (!window.SupabaseService) {
          cloudErrorMessage.value = 'Serviço Supabase não carregado.';
          return;
        }

        isCloudLoading.value = true;
        try {
          await window.SupabaseService.updatePassword(p1);
          cloudResetForm.value.password = '';
          cloudResetForm.value.confirmPassword = '';
          cloudModalTab.value = cloudUser.value ? 'account' : 'login';
          showToast('Senha redefinida com sucesso! Você já pode entrar.', 'success');
        } catch (err) {
          cloudErrorMessage.value = err.message || 'Erro ao salvar nova senha.';
        } finally {
          isCloudLoading.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const testAndSaveCloudConfig = async () => {
        cloudErrorMessage.value = '';
        cloudSuccessMessage.value = '';
        const url = (cloudConfigForm.value.url || '').trim();
        const key = (cloudConfigForm.value.anonKey || '').trim();

        if (!url || !key) {
          cloudErrorMessage.value = 'Informe a URL e a Anon Key do Supabase.';
          return;
        }

        cloudConfigForm.value.isTesting = true;
        try {
          const testRes = await window.SupabaseService.testConnection(url, key);
          if (testRes.success) {
            window.SupabaseService.saveConfig(url, key);
            cloudConfigForm.value.testResult = { success: true, message: 'Conexão estabelecida com sucesso!' };
            cloudSuccessMessage.value = 'Configurações salvas e conexão verificada com sucesso!';
            showToast('Supabase conectado com sucesso!', 'success');
            await initSupabaseAuth();
          } else {
            cloudConfigForm.value.testResult = { success: false, message: testRes.message };
            cloudErrorMessage.value = testRes.message;
          }
        } catch (err) {
          cloudErrorMessage.value = err.message || 'Falha ao testar conexão.';
        } finally {
          cloudConfigForm.value.isTesting = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const syncToCloud = async (isManual = false) => {
        if (!cloudUser.value || !window.SupabaseService) {
          if (isManual) showToast('Faça login para sincronizar com a nuvem.', 'warning');
          return;
        }

        // SEGURANÇA CRÍTICA: Previne que o auto-sync em segundo plano envie lista vazia e apague o banco na nuvem
        if (!isManual && (!games.value || games.value.length === 0)) {
          console.warn('[Supabase] Auto-sync evitado: lista local vazia para proteger os dados na nuvem.');
          return;
        }

        if (isManual && (!games.value || games.value.length === 0)) {
          const confirmEmpty = confirm('Sua biblioteca local está vazia. Tem certeza que deseja enviar uma lista vazia para a nuvem? Isso apagará os jogos salvos no banco de dados.');
          if (!confirmEmpty) return;
        }

        isCloudSyncing.value = true;
        try {
          const payload = {
            games: games.value,
            settings: settings.value,
            profile: userProfile.value,
            playingCategories: playingCategories.value
          };
          const res = await window.SupabaseService.saveUserData(payload);
          if (res && res.success === false) {
            throw new Error(res.error || 'Erro ao salvar dados na nuvem.');
          }
          lastCloudSync.value = new Date().toISOString();
          if (isManual) {
            showToast('Dados salvos na nuvem com sucesso!', 'success');
          }
        } catch (err) {
          console.error('Erro na sincronização com a nuvem:', err);
          if (isManual) {
            showToast(err.message || 'Erro ao sincronizar com a nuvem.', 'error');
          }
        } finally {
          isCloudSyncing.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const syncFromCloud = async (isManual = false) => {
        if (!cloudUser.value || !window.SupabaseService) {
          if (isManual) showToast('Faça login para baixar da nuvem.', 'warning');
          return;
        }

        if (isManual && games.value.length > 0) {
          const confirmLoad = confirm('Deseja baixar os dados da nuvem e atualizar sua biblioteca local? As alterações locais serão mescladas com o banco de dados.');
          if (!confirmLoad) return;
        }

        isCloudSyncing.value = true;
        try {
          const cloudData = await window.SupabaseService.loadUserData();
          if (cloudData) {
            if (StorageService) {
              if (Array.isArray(cloudData.games)) StorageService.saveGames(cloudData.games);
              if (cloudData.profile) StorageService.saveUserProfile(cloudData.profile);
              if (cloudData.settings) StorageService.saveSettings(cloudData.settings);
              if (Array.isArray(cloudData.playingCategories)) StorageService.savePlayingCategories(cloudData.playingCategories);
              loadActiveProfileData();
            } else {
              if (Array.isArray(cloudData.games)) games.value = cloudData.games;
              if (cloudData.profile) userProfile.value = cloudData.profile;
              if (cloudData.settings) settings.value = { ...settings.value, ...cloudData.settings };
              if (Array.isArray(cloudData.playingCategories)) playingCategories.value = cloudData.playingCategories;
            }
            refreshStorageInfo();
            lastCloudSync.value = new Date().toISOString();
            showToast('Dados baixados da nuvem com sucesso!', 'success');
          } else {
            showToast('Nenhum dado encontrado na nuvem para este usuário.', 'info');
          }
        } catch (err) {
          console.error('Erro ao baixar da nuvem:', err);
          showToast(err.message || 'Erro ao baixar dados da nuvem.', 'error');
        } finally {
          isCloudSyncing.value = false;
          nextTick(() => refreshLucideIcons());
        }
      };

      const toggleCloudAutoSync = () => {
        cloudAutoSyncEnabled.value = !cloudAutoSyncEnabled.value;
        localStorage.setItem('nota11_cloud_autosync', cloudAutoSyncEnabled.value ? 'true' : 'false');
        if (cloudAutoSyncEnabled.value) {
          showToast('Sincronização automática ativada.', 'info');
        } else {
          showToast('Sincronização automática desativada.', 'info');
        }
      };

      return {
        getAdaptiveKpiClass,
        // Estado de Visão e Layout
        activePage,
        currentGrouping,
        currentLayout,
        currentView,
        yearViewMode,
        selectedYearTab,
        currentCalendarYear,
        isCurrentYear,
        games,
        settings,
        searchQuery,
        platformFilter,
        genreFilter,
        ratingFilter,
        conditionFilter,
        yearFilter,
        sortBy,
        isMobileFilterOpen,
        isZeradosControlsOpen,
        toggleZeradosControls,
        isNarrowScreen,
        activeFiltersCount,
        resetAllFilters,
        toasts,
        lastSavedText,
        isSaving,

        userProfile,
        isProfileOpen,
        isEditProfileOpen,
        isResetProfileConfirmOpen,
        editProfileForm,
        openProfileModal,
        openEditProfileModal,
        openResetProfileConfirm,
        confirmResetProfile,
        saveProfile,
        handleAvatarUpload,

        // Nichos da Página de Perfil
        isTop5ModalOpen,
        top5SelectedIds,
        top5SelectedGames,
        top5SearchQuery,
        filteredMasterpieceGamesForTop5,
        profileTop5Games,
        openTop5Modal,
        closeTop5Modal,
        toggleTop5Game,
        isTop5GameSelected,
        getTop5GameRank,
        moveTop5Game,
        removeTop5Game,
        saveTop5Modal,

        isConsolesModalOpen,
        consolesSelectedList,
        consoleSearchQuery,
        filteredConsoleCategories,
        openConsolesModal,
        closeConsolesModal,
        toggleConsole,
        isConsoleSelected,
        saveConsolesModal,

        isSetupModalOpen,
        setupFormText,
        openSetupModal,
        closeSetupModal,
        fillSetupTemplate,
        saveSetupModal,
        formattedSetupLines,

        // Menu Unificado de Ferramentas & Armazenamento
        isToolsMenuOpen,
        toggleToolsMenu,
        closeToolsMenu,
        isNowPlayingMenuOpen,
        toggleNowPlayingMenu,
        closeNowPlayingMenu,
        storageInfo,
        refreshStorageInfo,

        // Modais
        closeAllModals,
        isAddEditOpen,
        isQuickFinishOpen,
        isBackupOpen,
        isDeleteConfirmOpen,
        isDetailOpen,
        isClearAllModalOpen,
        isScraperModalOpen,
        isScraperPickerOpen,
        isShareModalOpen,
        isAboutOpen,
        appVersion,
        appVersionDisplay,
        openAboutModal,
        closeAboutModal,
        openExternalUrl,

        // Compartilhamento & Snapshots (.PNG)
        shareSnapshotType,
        shareSelectedYear,
        shareTheme,
        shareShowStats,
        shareShowProfile,
        shareShowDates,
        shareShowHighlights,
        isGeneratingSnapshot,
        snapshotCoverMap,
        isPreloadingSnapshotCovers,
        getSnapshotCover,
        getSnapshotAvatar,
        shareGamesList,
        shareYearStats,
        openShareModal,
        closeShareModal,
        getSnapshotTitle,
        downloadSnapshotPng,
        copySnapshotToClipboard,
        handleCoverFileUpload,
        handleCoverPaste,

        // Formulários, Rascunho & Scraper State
        gameToFinish,
        quickFinishForm,
        isEditMode,
        gameForm,
        hasSavedDraft,
        clearDraftAndReset,
        getPcSubcategory,
        setPcSubcategory,
        setQuickFinishPcSubcategory,
        gameToDelete,
        detailGame,
        activeBackupTab,
        defaultPlatforms,
        scraperForm,
        scraperState,
        singleScraperState,

        // Computadas
        nowPlayingGames,
        finishedGames,
        filteredFinishedGames,
        masterpieceGames,
        stats,
        availablePlatforms,
        availableGenres,
        availableYears,
        completionConditions,

        // Visão por Ano & Estatísticas
        yearlyStatsList,
        selectedYearStats,
        selectedYearGames,
        statsOverview,
        platformDistribution,
        genreDistribution,
        ratingDistribution,
        conditionDistribution,
        topLongestGames,

        // Métodos de Navegação
        setActivePage,
        selectYearTab,
        navigateToYear,

        // Métodos
        openQuickFinish,
        confirmQuickFinish,
        openAddGame,
        openEditGame,
        saveGameForm,
        toggleNowPlayingStatus,
        removeFromNowPlaying,
        isPickFinishedGameOpen,
        pickFinishedSearchQuery,
        openPickFinishedGameModal,
        finishedGamesForPicker,
        onStatusChange,
        onCompletionDateChange,
        openGoogleImages,
        openDeleteConfirm,
        confirmDelete,
        openDetail,
        exportCsv,
        handleCsvUpload,
        exportJsonBackup,
        handleJsonUpload,
        restoreSampleData,
        openClearAllModal,
        confirmClearAll,
        showToast,
        removeToast,
        formatDate,
        formatPlaytime,
        parsePlaytimeToHours,
        hasPlaytime,
        getRatingBadgeClass,
        getRatingBtnClass,
        getPlatformBadgeColor,
        getConditionBadgeClass,
        getConditionIcon,
        handleImageError,
        refreshLucideIcons,
        parseGameGenres,
        filterBySpecificGenre,

        // ScreenScraper / IGDB Métodos
        openScraperModal,
        openGenreReviewModal,
        saveScraperCredentials,
        startBatchScrape,
        cancelBatchScrape,
        searchSingleGameScreenScraper,
        fetchFromIgdbById,
        isFetchingIgdbId,
        applyScraperCover,

        // Identificação de Rejogados / Replay
        isGameReplay,
        getReplayLabel,

        // Plataformas, Portáteis, Platinados, Rejogados, Early Access & Duplicados
        platformCategories,
        isPcPlatform,
        isGameHandheld,
        onlyHandheldFilter,
        onlyPlatinumFilter,
        onlyReplayFilter,
        onlyEarlyAccessFilter,
        onlyDuplicatesFilter,
        isGameDuplicate,
        duplicateGameIds,

        // Visualização Tabela & Ordenação
        hideTableCovers,
        toggleTableSort,
        moveGameInList,

        // Drag & Drop Universal, Prioridade e Prateleiras
        draggedGameId,
        dragOverGameId,
        dragOverHeroTab,
        onDropOnHeroTab,
        onGameDragStart,
        onGameDragOver,
        onGameDrop,
        onGameDragEnd,
        playingCategories,
        nowPlayingViewMode,
        setNowPlayingViewMode,
        nowPlayingLayout,
        setNowPlayingLayout,
        nowPlayingCardSize,
        setNowPlayingCardSize,
        isNowPlayingLayoutMenuOpen,
        nowPlayingLayoutLabel,
        nowPlayingLayoutIcon,
        toggleNowPlayingLayoutMenu,
        cardZoom,
        onCardZoomChange,
        resetCardZoom,
        playingShelves,
        isManagePlayingCategoriesOpen,
        newCategoryName,
        newCategoryIcon,
        editingCategoryId,
        editingCategoryName,
        draggedNowPlayingGameId,
        dragOverShelfId,
        categoryPresets,
        createPlayingCategory,
        startEditPlayingCategory,
        saveEditPlayingCategory,
        cancelEditPlayingCategory,
        deletePlayingCategory,
        movePlayingCategory,
        getPlayingCategoryName,
        getPlayingCategoryIcon,
        getPlatformIcon,
        getPlatformCustomIcon,
        setGamePlayingCategory,
        openAddGameWithCategory,
        draggedNowPlayingIndex,
        dragOverNowPlayingIndex,
        onNowPlayingDragStart,
        onNowPlayingDragOver,
        onNowPlayingDragEnter,
        onNowPlayingDragLeave,
        onNowPlayingDrop,
        onShelfDragOver,
        onShelfDragLeave,
        onShelfDrop,
        onNowPlayingDragEnd,
        getPriorityMeta,
        setGamePriority,
        cycleGamePriority,

        // HowLongToBeat (HLTB)
        isHltbModalOpen,
        isHltbSyncing,
        isHltbSingleLoading,
        hltbSyncFinished,
        hltbProgressPercent,
        hltbCurrentGameTitle,
        hltbStats,
        hltbSyncLogs,
        hltbEligibleGames,
        hltbEligibleCount,
        hltbConnectionStatus,
        openHltbModal,
        startHltbSync,
        cancelHltbSync,
        fetchHltbForSingleGame,

        // Backlog (Hero Tab, Métodos & HLTB Sync)
        heroTab,
        setHeroTab,
        backlogGames,
        backlogEligibleGames,
        backlogStats,
        backlogLayout,
        setBacklogLayout,
        backlogCardSize,
        setBacklogCardSize,
        isBacklogLayoutMenuOpen,
        backlogLayoutLabel,
        backlogLayoutIcon,
        toggleBacklogLayoutMenu,
        startPlayingBacklogGame,
        moveToBacklog,
        moveBacklogGame,
        isBacklogHltbSyncing,
        fetchHltbForBacklogGame,
        syncAllBacklogHltb,

        // Nuvem & Supabase (Autenticação, Sincronização e Recuperação)
        isCloudModalOpen,
        cloudModalTab,
        cloudUser,
        isCloudLoading,
        isCloudSyncing,
        lastCloudSync,
        cloudAutoSyncEnabled,
        cloudErrorMessage,
        cloudSuccessMessage,
        cloudAuthForm,
        cloudResetForm,
        cloudChangePasswordForm,
        cloudConfigForm,
        openCloudModal,
        closeCloudModal,
        continueWithoutLogin,
        loginCloudUser,
        registerCloudUser,
        logoutCloudUser,
        requestPasswordReset,
        updateUserPassword,
        saveNewPasswordFromReset,
        testAndSaveCloudConfig,
        syncToCloud,
        syncFromCloud,
        toggleCloudAutoSync,

        // Perfil Público Compartilhado (Somente Leitura)
        isPublicViewMode,
        publicProfileIdentifier,
        publicProfileOwnerName,
        isPublicLoading,
        publicProfileError,
        ownAppUrl,
        publicProfileShareUrl,
        publicProfileQueryUrl,
        copyPublicProfileUrl,
        loadPublicProfile
      };
    }
  });

  try {
    app.mount('#app');
  } catch (err) {
    console.error('Erro ao montar o Vue:', err);
    const appEl = document.getElementById('app');
    if (appEl) appEl.removeAttribute('v-cloak');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
