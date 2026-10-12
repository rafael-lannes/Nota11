/**
 * Game Tracker "Nota 11" - Image Helper & Fallback Generator
 * Suporte a URLs diretas de imagens de capa, atalho para busca no Google Imagens
 * e gerador dinâmico de capas SVG em caso de imagens offline ou links ausentes.
 */

class PlaceholderGenerator {
  /**
   * Gera uma capa elegante em SVG Data-URI com gradiente gamer e tipografia estilizada.
   */
  static generate(title = 'Jogo', platform = 'PC') {
    const cleanTitle = (title || 'Jogo').trim();
    
    const palettes = [
      ['#3b0764', '#1e1b4b', '#701a75'],
      ['#0f172a', '#1e293b', '#0369a1'],
      ['#14532d', '#064e3b', '#047857'],
      ['#450a0a', '#1c1917', '#991b1b'],
      ['#2e1065', '#172554', '#581c87'],
      ['#78350f', '#451a03', '#b45309']
    ];

    let hash = 0;
    for (let i = 0; i < cleanTitle.length; i++) {
      hash = cleanTitle.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palette = palettes[Math.abs(hash) % palettes.length];

    const words = cleanTitle.split(' ');
    let line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    let line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
    if (words.length === 1 && cleanTitle.length > 14) {
      line1 = cleanTitle.slice(0, 12) + '...';
      line2 = '';
    }

    const platformLabel = (platform || 'GAME').toUpperCase();

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${palette[0]}" />
            <stop offset="50%" stop-color="${palette[1]}" />
            <stop offset="100%" stop-color="${palette[2]}" />
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="30%" r="50%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
          </radialGradient>
        </defs>
        
        <rect width="300" height="400" fill="url(#grad)" rx="12" />
        <rect width="300" height="400" fill="url(#glow)" rx="12" />
        <rect x="1" y="1" width="298" height="398" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2" rx="11" />
        
        <g transform="translate(110, 110)" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 11H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-3" transform="scale(3.2)" />
          <line x1="22" y1="36" x2="38" y2="36" />
          <line x1="30" y1="28" x2="30" y2="44" />
          <circle cx="58" cy="32" r="3" fill="rgba(255,255,255,0.4)" />
          <circle cx="50" cy="40" r="3" fill="rgba(255,255,255,0.4)" />
        </g>
        
        <g transform="translate(20, 30)">
          <rect width="${Math.max(60, platformLabel.length * 8 + 16)}" height="22" rx="6" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.1)" />
          <text x="8" y="15" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="11" font-weight="600" letter-spacing="0.5">${platformLabel}</text>
        </g>

        <g transform="translate(150, 290)">
          <text text-anchor="middle" y="${line2 ? '0' : '15'}" fill="#ffffff" font-family="system-ui, sans-serif" font-size="18" font-weight="800" letter-spacing="-0.5">${line1}</text>
          ${line2 ? `<text text-anchor="middle" y="24" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="16" font-weight="700">${line2}</text>` : ''}
        </g>
        
        <text x="150" y="375" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-family="system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1">TRACKER NOTA 11</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}

class ImageHelperService {
  /**
   * Retorna a URL de pesquisa direta no Google Imagens para a capa do jogo
   * Query: [Título do Jogo] + game cover
   */
  static getGoogleImagesUrl(title = '') {
    const query = (title && title.trim()) ? `${title.trim()} game cover` : 'game cover';
    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
  }

  /**
   * Abre a busca no Google Imagens em uma nova aba do navegador
   */
  static openGoogleImagesSearch(title = '') {
    const url = ImageHelperService.getGoogleImagesUrl(title);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Gera capa SVG para fallback
   */
  static generateFallbackCover(title, platform) {
    return PlaceholderGenerator.generate(title, platform);
  }
}

// Expõe utilitários globalmente
window.PlaceholderGenerator = PlaceholderGenerator;
window.ImageHelperService = ImageHelperService;
window.getGoogleImagesUrl = ImageHelperService.getGoogleImagesUrl;
window.openGoogleImagesSearch = ImageHelperService.openGoogleImagesSearch;
