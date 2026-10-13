export interface NoteFontOption {
    id: string;
    name: string;
    fontName: string; // Used by execCommand('fontName', ...)
    family: string; // CSS font-family stack
    description: string;
    sampleText: string;
}

export const KAOMOJI_FALLBACK_CSS = `
@font-face {
    font-family: 'VeyraKaomojiFallback';
    src: local('Roboto'), local('Noto Sans'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('sans-serif');
    unicode-range: U+0250-02AF, U+0300-036F, U+0370-03FF, U+1D00-1DBF, U+2000-209F, U+2500-25FF, U+2700-27BF, U+2900-29FF, U+FF00-FFEF;
}
`;

export const UNICODE_FONT_FALLBACKS = `'VeyraKaomojiFallback', 'Plus Jakarta Sans', Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'Noto Sans Symbols', 'Noto Sans Symbols 2', 'Noto Sans Math', 'Noto Sans JP', 'Noto Sans CJK JP', 'Noto Sans CJK SC', 'Noto Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Apple Color Emoji', 'Helvetica Neue', Arial, sans-serif`;

/**
 * Mapa de fuentes locales para ser cargadas de forma nativa por expo-font.
 */
export const APP_NOTE_FONTS_MAP = {
    'Caveat': require('../../assets/fonts/Caveat.ttf'),
    'Cherry Bomb One': require('../../assets/fonts/CherryBombOne.ttf'),
    'Crafty Girls': require('../../assets/fonts/CraftyGirls.ttf'),
    'Dekko': require('../../assets/fonts/Dekko.ttf'),
    'Fira Sans': require('../../assets/fonts/FiraSans.ttf'),
    'Hachi Maru Pop': require('../../assets/fonts/HachiMaruPop.ttf'),
    'JetBrains Mono': require('../../assets/fonts/JetBrainsMono.ttf'),
    'Lora': require('../../assets/fonts/Lora.ttf'),
    'Noto Serif Khitan Small Script': require('../../assets/fonts/NotoSerifKhitanSmallScript.ttf'),
    'Plus Jakarta Sans': require('../../assets/fonts/PlusJakartaSans.ttf'),
    'Quicksand': require('../../assets/fonts/Quicksand.ttf'),
    'Sniglet': require('../../assets/fonts/Sniglet.ttf'),
};

/**
 * Ajustes ópticos por tipografía para que se vean proporcionadas y equilibradas.
 */
export const getFontPreviewStyle = (fontId: string) => {
    switch (fontId) {
        case 'script': // Caveat
            return { fontSize: 16 };
        case 'crafty': // Crafty Girls
            return { fontSize: 14 };
        case 'dekko': // Dekko
            return { fontSize: 14 };
        case 'cherry': // Cherry Bomb One
            return { fontSize: 12.5 };
        case 'mono': // JetBrains Mono
            return { fontSize: 12.5, letterSpacing: -0.3 };
        case 'hachi': // Hachi Maru Pop
            return { fontSize: 13 };
        case 'sniglet': // Sniglet
            return { fontSize: 13.5 };
        case 'serif': // Lora
            return { fontSize: 13.5 };
        case 'khitan': // Noto Serif Khitan Small Script
            return { fontSize: 13.5 };
        default:
            return { fontSize: 13.5 };
    }
};

export const NOTE_FONTS: NoteFontOption[] = [
    {
        id: 'sans',
        name: 'Moderna',
        fontName: 'Plus Jakarta Sans',
        family: `'Plus Jakarta Sans', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Limpia, moderna y minimalista',
        sampleText: 'Aa Bb Gg — Ideas claras y enfoque diario',
    },
    {
        id: 'fira',
        name: 'Fira Sans',
        fontName: 'Fira Sans',
        family: `'Fira Sans', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Estructurada, equilibrada y versátil',
        sampleText: 'Aa Bb Gg — Lectura clara y precisa',
    },
    {
        id: 'serif',
        name: 'Elegante',
        fontName: 'Lora',
        family: `'Lora', 'Georgia', 'Times New Roman', Cambria, ${UNICODE_FONT_FALLBACKS}`,
        description: 'Editorial, literaria y formal',
        sampleText: 'Aa Bb Gg — Textos largos y narrativas',
    },
    {
        id: 'mono',
        name: 'Código',
        fontName: 'JetBrains Mono',
        family: `'JetBrains Mono', 'Fira Code', 'Courier New', Courier, ${UNICODE_FONT_FALLBACKS}`,
        description: 'Espaciado técnico y uniforme',
        sampleText: 'Aa Bb Gg — 0123 const note = true;',
    },
    {
        id: 'script',
        name: 'Libreta',
        fontName: 'Caveat',
        family: `'Caveat', 'Dancing Script', 'Comic Sans MS', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Manuscrita, cálida y personal',
        sampleText: 'Aa Bb Gg — Apuntes rápidos y diario',
    },
    {
        id: 'crafty',
        name: 'Crafty',
        fontName: 'Crafty Girls',
        family: `'Crafty Girls', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Dibujada a mano, alegre y creativa',
        sampleText: 'Aa Bb Gg — Notas divertidas y creativas',
    },
    {
        id: 'dekko',
        name: 'Dekko',
        fontName: 'Dekko',
        family: `'Dekko', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Trazos sueltos y estilo rotulador',
        sampleText: 'Aa Bb Gg — Ideas espontáneas de clase',
    },
    {
        id: 'hachi',
        name: 'Hachi Pop',
        fontName: 'Hachi Maru Pop',
        family: `'Hachi Maru Pop', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Pop japonesa, juvenil y llamativa',
        sampleText: 'Aa Bb Gg — Notas vibrantes y con estilo',
    },
    {
        id: 'sniglet',
        name: 'Sniglet',
        fontName: 'Sniglet',
        family: `'Sniglet', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Redondeada, amigable y suave',
        sampleText: 'Aa Bb Gg — Mensajes alegres y amables',
    },
    {
        id: 'cherry',
        name: 'Cherry Bomb',
        fontName: 'Cherry Bomb One',
        family: `'Cherry Bomb One', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Burbuja gruesa y de gran impacto',
        sampleText: 'Aa Bb Gg — TITULARES DESTACADOS',
    },
    {
        id: 'rounded',
        name: 'Suave',
        fontName: 'Quicksand',
        family: `'Quicksand', 'Nunito', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Geométrica, redondeada y ligera',
        sampleText: 'Aa Bb Gg — Pensamientos y recordatorios',
    },
    {
        id: 'khitan',
        name: 'Khitan Script',
        fontName: 'Noto Serif Khitan Small Script',
        family: `'Noto Serif Khitan Small Script', ${UNICODE_FONT_FALLBACKS}`,
        description: 'Estilo epigráfico y clásico oriental',
        sampleText: 'Aa Bb Gg — Trazos históricos únicos',
    },
];

export const DEFAULT_NOTE_FONT_ID = 'sans';

export const GOOGLE_FONTS_CSS_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Cherry+Bomb+One&family=Crafty+Girls&family=Dekko&family=Fira+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Hachi+Maru+Pop&family=JetBrains+Mono:wght@400;600&family=Lora:ital,wght@0,400;0,600;1,400&family=Noto+Serif+Khitan+Small+Script&family=Plus+Jakarta+Sans:wght@400;600;700&family=Quicksand:wght@500;700&family=Sniglet:wght@400;800&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+Math&family=Noto+Sans+Symbols:wght@400;700&display=swap');`;

/**
 * Retorna la regla CSS completa para font-family dado un id o nombre de fuente.
 */
export function getFontFamilyCss(fontId?: string | null): string {
    const defaultFont = NOTE_FONTS.find(f => f.id === DEFAULT_NOTE_FONT_ID) || NOTE_FONTS[0];
    const found = (!fontId || fontId === 'inherit' || fontId === 'default')
        ? defaultFont
        : (NOTE_FONTS.find(f => f.id === fontId || f.fontName.toLowerCase() === fontId.toLowerCase()) || defaultFont);
    return `'VeyraKaomojiFallback', ${found.family}`;
}

/**
 * Retorna la opción de fuente dada su id.
 */
export function getFontOption(fontId?: string | null): NoteFontOption {
    const found = NOTE_FONTS.find(f => f.id === fontId || f.fontName.toLowerCase() === (fontId || '').toLowerCase());
    return found || NOTE_FONTS[0];
}

/**
 * Reglas CSS personalizadas para asegurar que las etiquetas <font face="...">
 * y <span style="font-family: ..."> respeten exactamente las familias de fuentes y fallbacks.
 */
export const NOTE_FONTS_OVERRIDE_CSS = `
    ${KAOMOJI_FALLBACK_CSS}
    font[face="Plus Jakarta Sans"], span[style*="Plus Jakarta Sans"] {
        font-family: 'VeyraKaomojiFallback', 'Plus Jakarta Sans', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Fira Sans"], span[style*="Fira Sans"] {
        font-family: 'VeyraKaomojiFallback', 'Fira Sans', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Lora"], span[style*="Lora"] {
        font-family: 'VeyraKaomojiFallback', 'Lora', 'Georgia', 'Times New Roman', Cambria, ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="JetBrains Mono"], span[style*="JetBrains Mono"] {
        font-family: 'VeyraKaomojiFallback', 'JetBrains Mono', 'Fira Code', 'Courier New', Courier, ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Caveat"], span[style*="Caveat"] {
        font-family: 'VeyraKaomojiFallback', 'Caveat', 'Dancing Script', 'Comic Sans MS', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Crafty Girls"], span[style*="Crafty Girls"] {
        font-family: 'VeyraKaomojiFallback', 'Crafty Girls', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Dekko"], span[style*="Dekko"] {
        font-family: 'VeyraKaomojiFallback', 'Dekko', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Hachi Maru Pop"], span[style*="Hachi Maru Pop"] {
        font-family: 'VeyraKaomojiFallback', 'Hachi Maru Pop', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Sniglet"], span[style*="Sniglet"] {
        font-family: 'VeyraKaomojiFallback', 'Sniglet', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Cherry Bomb One"], span[style*="Cherry Bomb One"] {
        font-family: 'VeyraKaomojiFallback', 'Cherry Bomb One', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Quicksand"], span[style*="Quicksand"] {
        font-family: 'VeyraKaomojiFallback', 'Quicksand', 'Nunito', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="Noto Serif Khitan Small Script"], span[style*="Noto Serif Khitan Small Script"] {
        font-family: 'VeyraKaomojiFallback', 'Noto Serif Khitan Small Script', ${UNICODE_FONT_FALLBACKS} !important;
    }
    font[face="inherit"], span[style*="inherit"] {
        font-family: inherit !important;
    }
`;
