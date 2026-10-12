/**
 * Game Tracker "Nota 11" - Image Service & CORS Resolver
 * Garante que 100% das capas (IGDB, Google Imagens, URLs externas, uploads locais)
 * sejam convertidas e renderizadas sem falhas de CORS durante a exportação de Snapshots (.PNG).
 */

(function(window) {
  'use strict';

  const _cache = new Map();
  let _activeServerBaseUrl = null;

  const ImageService = {
    /**
     * Define ou atualiza a URL base do servidor local ativo (ex: http://localhost:3000)
     */
    setServerBaseUrl(url) {
      if (url && typeof url === 'string') {
        _activeServerBaseUrl = url.replace(/\/+$/, '');
      }
    },

    /**
     * Retorna a URL base do servidor local se disponível
     */
    async getServerBaseUrl() {
      if (_activeServerBaseUrl) return _activeServerBaseUrl;

      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          _activeServerBaseUrl = window.location.origin;
          return _activeServerBaseUrl;
        }
      }

      if (window.HltbService && typeof window.HltbService.detectActiveBaseUrl === 'function') {
        try {
          const detected = await window.HltbService.detectActiveBaseUrl();
          if (detected) {
            _activeServerBaseUrl = detected;
            return _activeServerBaseUrl;
          }
        } catch (e) {}
      }

      return null;
    },

    /**
     * Converte um Blob em Base64 Data URL
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },

    /**
     * Resolve uma URL de capa para Base64 Data URL com múltiplos níveis de resiliência
     * @param {string} url - URL da capa
     * @param {string} title - Título do jogo para fallback
     * @param {string} platform - Plataforma para fallback
     * @returns {Promise<string>}
     */
    async resolveCoverToDataUrl(url, title = 'Jogo', platform = 'PC') {
      const trimmed = (url || '').trim();

      // Se não há capa, gera placeholder SVG
      if (!trimmed) {
        if (window.PlaceholderGenerator) {
          return window.PlaceholderGenerator.generate(title, platform);
        }
        return '';
      }

      // Se já é Data URL base64 ou SVG inline, retorna diretamente
      if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
      }

      // Se já está no cache de memória, retorna imediatamente
      if (_cache.has(trimmed)) {
        return _cache.get(trimmed);
      }

      // ----------------------------------------------------------------------
      // TENTATIVA 1: Servidor Local (/api/proxy-image)
      // ----------------------------------------------------------------------
      try {
        const baseUrl = await this.getServerBaseUrl();
        if (baseUrl) {
          const proxyUrl = `${baseUrl}/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
          const res = await fetch(proxyUrl, { method: 'GET', cache: 'force-cache' });
          if (res.ok) {
            const blob = await res.blob();
            if (blob && blob.size > 200 && blob.type.startsWith('image/')) {
              const dataUrl = await this.blobToDataUrl(blob);
              _cache.set(trimmed, dataUrl);
              return dataUrl;
            }
          }
        }
      } catch (e) {
        // Segue para a próxima tentativa
      }

      // ----------------------------------------------------------------------
      // TENTATIVA 2: CDN Pública de Otimização & Proxy de Imagens (wsrv.nl com CORS)
      // ----------------------------------------------------------------------
      try {
        const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(trimmed)}&output=webp&w=600&q=85`;
        const res = await fetch(wsrvUrl, { method: 'GET', mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 200 && blob.type.startsWith('image/')) {
            const dataUrl = await this.blobToDataUrl(blob);
            _cache.set(trimmed, dataUrl);
            return dataUrl;
          }
        }
      } catch (e) {
        // Segue para a próxima tentativa
      }

      // ----------------------------------------------------------------------
      // TENTATIVA 3: Fetch Direto com CORS (funciona em IGDB, Steam, etc.)
      // ----------------------------------------------------------------------
      try {
        const res = await fetch(trimmed, { method: 'GET', mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 200 && blob.type.startsWith('image/')) {
            const dataUrl = await this.blobToDataUrl(blob);
            _cache.set(trimmed, dataUrl);
            return dataUrl;
          }
        }
      } catch (e) {
        // Segue para a próxima tentativa
      }

      // ----------------------------------------------------------------------
      // TENTATIVA 4: Desenho em Canvas Offscreen com Image Tag
      // ----------------------------------------------------------------------
      try {
        const canvasDataUrl = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width || 300;
              canvas.height = img.naturalHeight || img.height || 400;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const data = canvas.toDataURL('image/jpeg', 0.88);
              resolve(data);
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = reject;
          img.src = trimmed;
        });

        if (canvasDataUrl && canvasDataUrl.startsWith('data:image/')) {
          _cache.set(trimmed, canvasDataUrl);
          return canvasDataUrl;
        }
      } catch (e) {
        // Segue para fallback
      }

      // ----------------------------------------------------------------------
      // FALLBACK FINAL: Placeholder SVG Estilizado
      // ----------------------------------------------------------------------
      const fallback = window.PlaceholderGenerator
        ? window.PlaceholderGenerator.generate(title, platform)
        : '';
      
      _cache.set(trimmed, fallback);
      return fallback;
    },

    /**
     * Pré-carrega e converte um lote de capas em paralelo
     * @param {Array<Object>} gamesList - Lista de jogos com { id, title, platform, coverUrl }
     * @param {Function} onProgress - Callback opcional de progresso (processed, total)
     * @returns {Promise<Object>} Mapa { [gameId]: dataUrl }
     */
    async preloadCovers(gamesList = [], onProgress = null) {
      const results = {};
      if (!Array.isArray(gamesList) || gamesList.length === 0) {
        return results;
      }

      const total = gamesList.length;
      let processed = 0;
      const concurrency = 6;

      const queue = [...gamesList];
      const workers = Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
        while (queue.length > 0) {
          const game = queue.shift();
          if (!game) break;

          const key = game.id || game.coverUrl || game.title;
          try {
            const dataUrl = await this.resolveCoverToDataUrl(
              game.coverUrl,
              game.title || 'Jogo',
              game.platform || 'PC'
            );
            results[key] = dataUrl;
            if (game.id) results[game.id] = dataUrl;
            if (game.coverUrl) results[game.coverUrl] = dataUrl;
          } catch (e) {
            const placeholder = window.PlaceholderGenerator
              ? window.PlaceholderGenerator.generate(game.title, game.platform)
              : '';
            results[key] = placeholder;
            if (game.id) results[game.id] = placeholder;
          }

          processed++;
          if (typeof onProgress === 'function') {
            onProgress(processed, total);
          }
        }
      });

      await Promise.all(workers);
      return results;
    },

    /**
     * Comprime e redimensiona um arquivo de imagem selecionado localmente
     * @param {File} file - Arquivo de imagem do input
     * @param {number} maxWidth - Largura máxima (default 600)
     * @param {number} maxHeight - Altura máxima (default 900)
     * @param {number} quality - Qualidade JPEG (0.85)
     * @returns {Promise<string>} Base64 Data URL
     */
    compressImageFile(file, maxWidth = 600, maxHeight = 900, quality = 0.85) {
      return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
          reject(new Error('O arquivo selecionado não é uma imagem válida.'));
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const dataUrl = canvas.toDataURL(format, quality);
            resolve(dataUrl);
          };
          img.onerror = () => reject(new Error('Falha ao decodificar a imagem.'));
          img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
        reader.readAsDataURL(file);
      });
    },

    /**
     * Limpa o cache de imagens em memória
     */
    clearCache() {
      _cache.clear();
    }
  };

  window.ImageService = ImageService;
})(window);
