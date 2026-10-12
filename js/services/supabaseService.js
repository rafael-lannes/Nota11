/**
 * Game Tracker "Nota 11" - Supabase Cloud Service
 * Gerencia autenticação segura (Login, Cadastro, Recuperação e Troca de Senha)
 * e sincronização transparente dos dados do jogador na nuvem (PostgreSQL com RLS).
 */

(function (window) {
  'use strict';

  const SUPABASE_STORAGE_KEYS = {
    CONFIG: 'nota11_supabase_config',
    LAST_SYNC: 'nota11_supabase_last_sync'
  };

  // Configuração padrão pré-definida (pode ser preenchida aqui ou configurada pela interface)
  const DEFAULT_SUPABASE_CONFIG = {
    url: 'https://hvixstidgsvhkqgotamt.supabase.co',
    anonKey: 'sb_publishable_72kpfP00LeX_TOXe6MsK1A_ewOwYYaU'
  };

  let _supabaseClient = null;
  let _currentConfig = null;

  class SupabaseService {
    /**
     * Retorna a configuração atual do Supabase (URL e Chave Anon)
     */
    static getConfig() {
      if (_currentConfig) return _currentConfig;
      try {
        const saved = localStorage.getItem(SUPABASE_STORAGE_KEYS.CONFIG);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.url && parsed.anonKey) {
            _currentConfig = {
              url: String(parsed.url).trim(),
              anonKey: String(parsed.anonKey).trim()
            };
            return _currentConfig;
          }
        }
      } catch (e) {
        console.warn('[SupabaseService] Erro ao ler configuração local:', e);
      }

      _currentConfig = { ...DEFAULT_SUPABASE_CONFIG };
      return _currentConfig;
    }

    /**
     * Salva nova configuração do Supabase e reinicializa o cliente
     */
    static saveConfig(url, anonKey) {
      const cleanUrl = String(url || '').trim();
      const cleanKey = String(anonKey || '').trim();

      _currentConfig = { url: cleanUrl, anonKey: cleanKey };
      _supabaseClient = null;

      try {
        localStorage.setItem(SUPABASE_STORAGE_KEYS.CONFIG, JSON.stringify(_currentConfig));
      } catch (e) {
        console.error('[SupabaseService] Erro ao salvar configuração:', e);
      }

      return this.initClient();
    }

    /**
     * Verifica se o Supabase está configurado com URL e Chave Anon válidas
     */
    static hasConfig() {
      const cfg = this.getConfig();
      return Boolean(cfg.url && cfg.anonKey && cfg.url.startsWith('http'));
    }

    /**
     * Inicializa o cliente do Supabase
     */
    static initClient() {
      if (_supabaseClient) return _supabaseClient;

      const cfg = this.getConfig();
      if (!cfg.url || !cfg.anonKey || !cfg.url.startsWith('http')) {
        return null;
      }

      const supabaseLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
      if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
        console.warn('[SupabaseService] Biblioteca supabase-js não encontrada no escopo global.');
        return null;
      }

      try {
        _supabaseClient = supabaseLib.createClient(cfg.url, cfg.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        return _supabaseClient;
      } catch (err) {
        console.error('[SupabaseService] Falha ao criar cliente Supabase:', err);
        return null;
      }
    }

    /**
     * Obtém o cliente ativo do Supabase
     */
    static getClient() {
      if (!_supabaseClient) {
        return this.initClient();
      }
      return _supabaseClient;
    }

    /**
     * Testa se as credenciais do Supabase conseguem se conectar com sucesso
     */
    static async testConnection(testUrl, testKey) {
      const cleanUrl = String(testUrl || '').trim();
      const cleanKey = String(testKey || '').trim();

      if (!cleanUrl || !cleanKey) {
        return { success: false, error: 'Por favor, informe a URL do projeto e a Chave Anon.' };
      }

      const supabaseLib = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
      if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
        return { success: false, error: 'SDK do Supabase ainda não carregado no navegador.' };
      }

      try {
        const tempClient = supabaseLib.createClient(cleanUrl, cleanKey, {
          auth: { persistSession: false }
        });
        const { error } = await tempClient.auth.getSession();
        if (error) {
          return { success: false, error: this.formatAuthError(error) };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || 'Falha ao conectar com o Supabase.' };
      }
    }

    // =========================================================================
    // AUTENTICAÇÃO
    // =========================================================================

    /**
     * Obtém a sessão atual
     */
    static async getSession() {
      const client = this.getClient();
      if (!client) return null;
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return data ? data.session : null;
      } catch (err) {
        console.warn('[SupabaseService] Erro ao obter sessão:', err);
        return null;
      }
    }

    /**
     * Obtém o usuário atualmente logado
     */
    static async getCurrentUser() {
      const client = this.getClient();
      if (!client) return null;
      try {
        const { data, error } = await client.auth.getUser();
        if (error) return null;
        return data ? data.user : null;
      } catch (err) {
        return null;
      }
    }

    /**
     * Cadastra um novo usuário com e-mail e senha
     */
    static async signUp(email, password, displayName = '') {
      const client = this.getClient();
      if (!client) {
        throw new Error('Supabase não configurado. Por favor, configure a URL e a Chave Anon nas configurações de nuvem.');
      }

      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !password) {
        throw new Error('Informe um e-mail e uma senha válidos.');
      }

      if (password.length < 6) {
        throw new Error('A senha deve ter no mínimo 6 caracteres.');
      }

      const options = {};
      if (displayName && displayName.trim()) {
        options.data = { display_name: displayName.trim() };
      }

      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: password,
        options
      });

      if (error) {
        throw new Error(this.formatAuthError(error));
      }

      return data;
    }

    /**
     * Realiza login com e-mail e senha
     */
    static async signIn(email, password) {
      const client = this.getClient();
      if (!client) {
        throw new Error('Supabase não configurado. Verifique as credenciais de nuvem.');
      }

      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !password) {
        throw new Error('Informe o e-mail e a senha.');
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (error) {
        throw new Error(this.formatAuthError(error));
      }

      return data;
    }

    /**
     * Encerra a sessão (Logout)
     */
    static async signOut() {
      const client = this.getClient();
      if (!client) return;

      try {
        await client.auth.signOut();
      } catch (err) {
        console.warn('[SupabaseService] Erro ao deslogar:', err);
      }
    }

    /**
     * Envia e-mail gratuito de recuperação de senha
     */
    static async resetPasswordForEmail(email) {
      const client = this.getClient();
      if (!client) {
        throw new Error('Supabase não configurado.');
      }

      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail) {
        throw new Error('Digite o e-mail cadastrado para recuperar a senha.');
      }

      // Redireciona de volta para a mesma página
      const redirectUrl = window.location.origin + window.location.pathname;

      const { data, error } = await client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl
      });

      if (error) {
        throw new Error(this.formatAuthError(error));
      }

      return data;
    }

    /**
     * Atualiza a senha do usuário logado ou em processo de recuperação
     */
    static async updatePassword(newPassword) {
      const client = this.getClient();
      if (!client) {
        throw new Error('Supabase não conectado.');
      }

      if (!newPassword || newPassword.length < 6) {
        throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
      }

      const { data, error } = await client.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw new Error(this.formatAuthError(error));
      }

      return data;
    }

    /**
     * Inscreve um callback para monitorar eventos de autenticação
     */
    static onAuthStateChange(callback) {
      const client = this.getClient();
      if (!client || typeof callback !== 'function') return null;

      try {
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
          callback(event, session);
        });
        return subscription;
      } catch (err) {
        console.warn('[SupabaseService] Falha ao registrar onAuthStateChange:', err);
        return null;
      }
    }

    // =========================================================================
    // BANCO DE DADOS & SINCRONIZAÇÃO EM NUVEM (POSTGRESQL + RLS)
    // =========================================================================

    /**
     * Carrega os dados salvos do usuário na nuvem
     */
    static async loadUserData(userId) {
      const client = this.getClient();
      if (!client || !userId) return null;

      try {
        const { data, error } = await client
          .from('user_data')
          .select('games, profile, settings, playing_categories, updated_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('[SupabaseService] Erro ao carregar dados da nuvem:', error);
          return null;
        }

        if (!data) return null;

        return {
          games: Array.isArray(data.games) ? data.games : [],
          profile: data.profile && typeof data.profile === 'object' ? data.profile : null,
          settings: data.settings && typeof data.settings === 'object' ? data.settings : null,
          playingCategories: Array.isArray(data.playing_categories) ? data.playing_categories : [],
          updatedAt: data.updated_at
        };
      } catch (err) {
        console.error('[SupabaseService] Falha inesperada ao ler user_data:', err);
        return null;
      }
    }

    /**
     * Salva ou atualiza os dados completos do usuário na nuvem (Upsert atômico)
     */
    static async saveUserData(userId, userEmail, payload = {}) {
      const client = this.getClient();
      if (!client || !userId) return { success: false, error: 'Usuário não autenticado.' };

      const games = Array.isArray(payload.games) ? payload.games : [];
      const profile = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};
      const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
      const playingCategories = Array.isArray(payload.playingCategories) ? payload.playingCategories : [];

      const record = {
        user_id: userId,
        email: userEmail || null,
        games: games,
        profile: profile,
        settings: settings,
        playing_categories: playingCategories,
        updated_at: new Date().toISOString()
      };

      try {
        const { error } = await client
          .from('user_data')
          .upsert(record, { onConflict: 'user_id' });

        if (error) {
          console.error('[SupabaseService] Erro ao salvar dados na nuvem:', error);
          return { success: false, error: error.message || 'Falha ao salvar no banco.' };
        }

        try {
          localStorage.setItem(SUPABASE_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
        } catch (e) {}

        return { success: true, timestamp: record.updated_at };
      } catch (err) {
        console.error('[SupabaseService] Falha de rede ao salvar no banco:', err);
        return { success: false, error: err.message || 'Erro de rede ao sincronizar.' };
      }
    }

    /**
     * Retorna o timestamp da última sincronização bem-sucedida
     */
    static getLastSyncTime() {
      try {
        return localStorage.getItem(SUPABASE_STORAGE_KEYS.LAST_SYNC);
      } catch (e) {
        return null;
      }
    }

    // =========================================================================
    // FORMATAÇÃO DE ERROS AMIGÁVEIS
    // =========================================================================

    static formatAuthError(error) {
      if (!error) return 'Ocorreu um erro desconhecido.';
      const msg = (error.message || String(error)).toLowerCase();

      if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
        return 'E-mail ou senha incorretos.';
      }
      if (msg.includes('user already registered') || msg.includes('already exists')) {
        return 'Este e-mail já está cadastrado. Tente entrar ou recuperar a senha.';
      }
      if (msg.includes('password should be at least')) {
        return 'A senha deve conter no mínimo 6 caracteres.';
      }
      if (msg.includes('email not confirmed')) {
        return 'E-mail cadastrado, mas ainda não confirmado. Verifique sua caixa de entrada.';
      }
      if (msg.includes('rate limit') || msg.includes('too many requests')) {
        return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.';
      }
      if (msg.includes('networkerror') || msg.includes('failed to fetch')) {
        return 'Falha de conexão com a internet ou com o servidor Supabase.';
      }
      if (msg.includes('jwt expired')) {
        return 'Sua sessão expirou. Por favor, faça login novamente.';
      }
      if (msg.includes('invalid email')) {
        return 'Formato de e-mail inválido. Por favor, verifique a digitação.';
      }

      return error.message || 'Erro na operação de autenticação.';
    }
  }

  // Inicializa o cliente imediatamente se houver credenciais salvas
  SupabaseService.initClient();

  // Expõe globalmente
  window.SupabaseService = SupabaseService;

})(typeof window !== 'undefined' ? window : this);
