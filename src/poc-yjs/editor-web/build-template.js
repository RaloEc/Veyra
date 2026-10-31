const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const entryPath = path.join(__dirname, 'entry.js');
const bundlePath = path.join(__dirname, 'bundle.min.js');

// 1. Compilar automáticamente entry.js -> bundle.min.js con esbuild
console.log('Compilando entry.js con esbuild...');
execSync(`npx esbuild "${entryPath}" --bundle --minify --format=iife --outfile="${bundlePath}"`, { stdio: 'inherit' });

const bundleJs = fs.readFileSync(bundlePath, 'utf8');

// Escapar caracteres peligrosos si los hay dentro del template string
const escapedBundle = bundleJs.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

const template = `/**
 * HTML Template auto-generado para el WebView del Editor Tiptap + Yjs
 */
import { GOOGLE_FONTS_CSS_IMPORT } from '../../constants/noteFonts';

export function getTiptapHtml(options: { isDark?: boolean; isAmoled?: boolean; accentColor?: string; activePageId?: string } = {}) {
    const isDark = options.isDark ?? true;
    const isAmoled = options.isAmoled ?? false;
    const accentColor = options.accentColor ?? '#8B5CF6';
    const activePageId = options.activePageId || null;
    const initialThemeClass = isAmoled ? 'dark amoled' : (isDark ? 'dark' : 'light');
    const initialBgColor = isAmoled ? '#000000' : (isDark ? '#121212' : '#FFFFFF');
    return \`<!DOCTYPE html>
<html lang="es" class="\${initialThemeClass}">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, user-scalable=yes, viewport-fit=cover" />
    <title>Veyra Tiptap Yjs</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet" />
    <style>
        \${GOOGLE_FONTS_CSS_IMPORT}
        :root {
            --bg-color: \${initialBgColor};
            --text-color: \${isDark ? '#F4F4F5' : '#18181B'};
            --text-bold: \${isDark ? '#FFFFFF' : '#000000'};
            --text-italic: \${isDark ? '#F4F4F5' : '#18181B'};
            --heading-1: \${isDark ? '#F4F4F5' : '#09090B'};
            --heading-2: \${isDark ? '#E4E4E7' : '#18181B'};
            --placeholder: \${isDark ? '#71717A' : '#A1A1AA'};
            --text-secondary: \${isDark ? '#A1A1AA' : '#71717A'};
            --selection: \${isDark ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.3)'};
            --accent-color: \${accentColor};
        }
        html.light, body.light {
            --bg-color: #FFFFFF;
            --text-color: #18181B;
            --text-bold: #000000;
            --text-italic: #18181B;
            --heading-1: #09090B;
            --heading-2: #18181B;
            --placeholder: #A1A1AA;
            --text-secondary: #71717A;
            --selection: rgba(139, 92, 246, 0.3);
        }
        html.dark, body.dark {
            --bg-color: #121212;
            --text-color: #F4F4F5;
            --text-bold: #FFFFFF;
            --text-italic: #F4F4F5;
            --heading-1: #F4F4F5;
            --heading-2: #E4E4E7;
            --placeholder: #71717A;
            --text-secondary: #A1A1AA;
            --selection: rgba(139, 92, 246, 0.4);
        }
        html.amoled, body.amoled {
            --bg-color: #000000;
            --text-color: #F4F4F5;
            --text-bold: #FFFFFF;
            --text-italic: #F4F4F5;
            --heading-1: #F4F4F5;
            --heading-2: #E4E4E7;
            --placeholder: #71717A;
            --text-secondary: #A1A1AA;
            --selection: rgba(139, 92, 246, 0.4);
        }
        * {
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none !important;
            -webkit-user-select: text; /* Permitir seleccionar texto */
            user-select: text;
        }
        html {
            font-size: 16px !important;
            box-sizing: border-box;
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden !important;
        }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
            height: 100%;
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 'Noto Sans', sans-serif;
            font-size: 16px;
            line-height: 24px;
            -webkit-text-size-adjust: 100% !important;
            -moz-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
            font-synthesis: weight style !important;
            -webkit-font-synthesis: weight style !important;
            touch-action: pan-x pan-y pinch-zoom;
            overflow-x: hidden !important;
            overflow-y: auto;
        }
        ::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none !important;
        }
        #editor-container {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            min-height: 100%;
            padding: 10px 18px 80px 18px;
        }
        .ProseMirror {
            outline: none;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            min-height: 300px;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 'Noto Sans', sans-serif;
            font-synthesis: weight style !important;
            -webkit-font-synthesis: weight style !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
            white-space: pre-wrap;
            caret-color: var(--accent-color);
            color: var(--text-color) !important;
        }
        .ProseMirror p,
        .ProseMirror li {
            color: var(--text-color);
        }

        /* Reglas de normalización de modo claro: asegura que texto normal o con estilos claros residuales sea oscuro */
        html.light .ProseMirror,
        html.light .ProseMirror p,
        html.light .ProseMirror li {
            color: var(--text-color) !important;
        }
        html.light .ProseMirror span[style*="color: #F4F4F5"],
        html.light .ProseMirror span[style*="color:#F4F4F5"],
        html.light .ProseMirror span[style*="color: rgb(244, 244, 245)"],
        html.light .ProseMirror span[style*="color: #EDEDED"],
        html.light .ProseMirror span[style*="color:#EDEDED"],
        html.light .ProseMirror span[style*="color: rgb(237, 237, 237)"],
        html.light .ProseMirror span[style*="color: #FFFFFF"],
        html.light .ProseMirror span[style*="color:#FFFFFF"],
        html.light .ProseMirror span[style*="color: rgb(255, 255, 255)"],
        html.light .ProseMirror span[style*="color: white"] {
            color: var(--text-color) !important;
        }

        /* Reglas de normalización de modo oscuro: asegura que texto con estilos oscuros residuales sea claro */
        html.dark .ProseMirror,
        html.dark .ProseMirror p,
        html.dark .ProseMirror li {
            color: var(--text-color) !important;
        }
        html.dark .ProseMirror span[style*="color: #0F172A"],
        html.dark .ProseMirror span[style*="color:#0F172A"],
        html.dark .ProseMirror span[style*="color: rgb(15, 23, 42)"],
        html.dark .ProseMirror span[style*="color: #18181B"],
        html.dark .ProseMirror span[style*="color:#18181B"],
        html.dark .ProseMirror span[style*="color: rgb(24, 24, 27)"],
        html.dark .ProseMirror span[style*="color: #000000"],
        html.dark .ProseMirror span[style*="color:#000000"],
        html.dark .ProseMirror span[style*="color: rgb(0, 0, 0)"],
        html.dark .ProseMirror span[style*="color: black"] {
            color: var(--text-color) !important;
        }
        .ProseMirror ::selection {
            background-color: var(--selection);
            color: inherit;
        }
        ::selection {
            background-color: var(--selection);
            color: inherit;
        }
        .ProseMirror strong, .ProseMirror b, strong, b,
        .ProseMirror [style*="font-weight: bold"],
        .ProseMirror [style*="font-weight:bold"] {
            font-weight: bold !important;
            font-weight: 700 !important;
            -webkit-text-stroke: 0.6px currentColor !important;
            text-shadow: 0.3px 0 0 currentColor, -0.3px 0 0 currentColor !important;
            color: var(--text-bold) !important;
        }
        .ProseMirror em, .ProseMirror i, em, i,
        .ProseMirror [style*="font-style: italic"],
        .ProseMirror [style*="font-style:italic"] {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 'Noto Sans', sans-serif !important;
            font-style: italic !important;
            font-style: oblique 14deg !important;
            font-synthesis: style !important;
            -webkit-font-synthesis: style !important;
            color: var(--text-italic) !important;
        }
        .ProseMirror [style*="color:"] strong,
        .ProseMirror [style*="color:"] b,
        .ProseMirror [style*="color:"] em,
        .ProseMirror [style*="color:"] i {
            color: inherit !important;
        }
        .ProseMirror mark {
            border-radius: 2px;
            padding: 1px 2px;
            color: #111111 !important;
        }
        .ProseMirror mark * {
            color: #111111 !important;
        }
        /* Para resaltados translúcidos (RGBA estilo Notion / Docs), preservar el color natural del texto (blanco en modo oscuro) */
        .ProseMirror mark[data-color*="rgba"],
        .ProseMirror mark[style*="rgba"] {
            color: inherit !important;
        }
        .ProseMirror mark[data-color*="rgba"] *,
        .ProseMirror mark[style*="rgba"] * {
            color: inherit !important;
        }
        .ProseMirror p {
            margin: 0 0 12px 0;
            font-size: 16px;
            line-height: 24px;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            overflow-wrap: break-word;
            word-break: break-word;
            white-space: pre-wrap;
        }
        .ProseMirror h1 {
            font-size: 1.75rem;
            font-weight: 700;
            margin: 16px 0 12px 0;
            color: var(--heading-1);
        }
        .ProseMirror h2 {
            font-size: 1.4rem;
            font-weight: 600;
            margin: 14px 0 10px 0;
            color: var(--heading-2);
        }
        .ProseMirror h3 {
            font-size: 1.15rem;
            font-weight: 600;
            margin: 12px 0 8px 0;
        }
        .ProseMirror ul, .ProseMirror ol {
            margin: 0 0 12px 0;
            padding-left: 24px;
        }
        .ProseMirror li {
            margin-bottom: 6px;
        }
        .ProseMirror blockquote {
            border-left: 3px solid var(--accent-color);
            padding-left: 12px;
            margin: 8px 0 12px 0;
            font-style: italic;
            opacity: 0.9;
        }

        /* ─── Imágenes en el Editor ─── */
        .ProseMirror img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 12px 0;
            display: block;
            min-height: 50px;
            background-color: rgba(0, 0, 0, 0.1);
            transition: width 0.2s ease, margin 0.2s ease;
            cursor: pointer;
        }

        .ProseMirror img[src^="file://"] {
            min-height: 100px;
            background-color: rgba(0,0,0,0.1);
            border: 1px dashed rgba(0,0,0,0.3);
            position: relative;
        }
        .ProseMirror img[src^="file://"]::after {
            content: "Cargando imagen...";
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            color: #888;
            font-size: 14px;
        }

        /* Alineación de imágenes como bloques */
        .ProseMirror img[style*="text-align: center"],
        .ProseMirror img[style*="text-align:center"],
        .ProseMirror img[data-text-align="center"],
        .ProseMirror [data-text-align="center"] img,
        .ProseMirror [style*="text-align: center"] img,
        .ProseMirror [style*="text-align:center"] img {
            margin-left: auto !important;
            margin-right: auto !important;
        }

        .ProseMirror img[style*="text-align: right"],
        .ProseMirror img[style*="text-align:right"],
        .ProseMirror img[data-text-align="right"],
        .ProseMirror [data-text-align="right"] img,
        .ProseMirror [style*="text-align: right"] img,
        .ProseMirror [style*="text-align:right"] img {
            margin-left: auto !important;
            margin-right: 0 !important;
        }

        .ProseMirror img[style*="text-align: left"],
        .ProseMirror img[style*="text-align:left"],
        .ProseMirror img[data-text-align="left"],
        .ProseMirror [data-text-align="left"] img,
        .ProseMirror [style*="text-align: left"] img,
        .ProseMirror [style*="text-align:left"] img {
            margin-left: 0 !important;
            margin-right: auto !important;
        }

        /* ─── Herramienta de Checklist / TaskList (Estilo Premium Veyra) ─── */
        .ProseMirror ul[data-type="taskList"] input[type="checkbox"],
        .ProseMirror ul[data-type="task-list"] input[type="checkbox"] {
            display: none !important;
            opacity: 0;
            position: absolute;
            pointer-events: none;
        }
        .ProseMirror ul[data-type="taskList"],
        .ProseMirror ul[data-type="task-list"] {
            list-style: none;
            padding: 0;
            margin: 0 0 12px 0;
        }
        .ProseMirror ul[data-type="taskList"] li,
        .ProseMirror ul[data-type="task-list"] li {
            display: flex;
            align-items: flex-start;
            margin-bottom: 8px;
        }
        .ProseMirror ul[data-type="taskList"] li > label,
        .ProseMirror ul[data-type="task-list"] li > label {
            flex: 0 0 auto;
            padding: 4px 10px 6px 0;
            margin-top: 2px;
            user-select: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-tap-highlight-color: transparent;
        }
        .ProseMirror ul[data-type="taskList"] li > label > span,
        .ProseMirror ul[data-type="task-list"] li > label > span {
            width: 20px;
            height: 20px;
            border: 2px solid var(--text-secondary);
            border-radius: 6px; /* Squircle */
            display: inline-block;
            position: relative;
            box-sizing: border-box;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            background-color: transparent;
        }
        .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > label > span,
        .ProseMirror ul[data-type="task-list"] li[data-checked="true"] > label > span {
            background-color: var(--accent-color);
            border-color: var(--accent-color);
        }
        .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > label > span::after,
        .ProseMirror ul[data-type="task-list"] li[data-checked="true"] > label > span::after {
            content: '';
            position: absolute;
            left: 5px;
            top: 2px;
            width: 6px;
            height: 10px;
            border: solid white;
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
            box-sizing: border-box;
        }
        .ProseMirror ul[data-type="taskList"] li > div,
        .ProseMirror ul[data-type="task-list"] li > div {
            flex: 1 1 auto;
            min-width: 0;
        }
        .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div,
        .ProseMirror ul[data-type="task-list"] li[data-checked="true"] > div {
            text-decoration: line-through;
            opacity: 0.5;
            transition: all 0.2s ease;
        }
        .ProseMirror ul[data-type="taskList"] li > div > p:last-child,
        .ProseMirror ul[data-type="task-list"] li > div > p:last-child {
            margin-bottom: 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
            color: var(--placeholder);
            content: "Escribe tu nota colaborativa aquí...";
            float: left;
            height: 0;
            pointer-events: none;
        }

        /* Estilos de Cursores Remotos Colaborativos */
        .collaboration-cursor__caret,
        .ProseMirror-yjs-cursor {
            border-left: 2px solid;
            border-right: 0 !important;
            border-top: 0 !important;
            border-bottom: 0 !important;
            margin-left: -1px;
            margin-right: -1px;
            pointer-events: none;
            position: relative;
            word-break: normal;
            display: inline;
            line-height: normal;
        }
        .collaboration-cursor__label,
        .ProseMirror-yjs-cursor > div {
            border-radius: 4px;
            color: #FFFFFF !important;
            font-size: 11px !important;
            font-style: normal;
            font-weight: 600;
            left: -2px;
            line-height: 1.2;
            padding: 2px 6px;
            position: absolute;
            top: -1.4em;
            user-select: none;
            white-space: nowrap;
            pointer-events: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            z-index: 100;
            display: inline-block;
            animation: fadeIn 0.15s ease-out;
        }
        .ProseMirror-yjs-selection,
        .collaboration-cursor__selection {
            opacity: 0.7;
            pointer-events: none;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(3px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Ocultar cursores colaborativos en modo visualización */
        .veyra-no-cursors .collaboration-cursor__caret,
        .veyra-no-cursors .collaboration-cursor__label,
        .veyra-no-cursors .ProseMirror-yjs-cursor {
            display: none !important;
            visibility: hidden !important;
        }

        .veyra-no-cursors .ProseMirror-yjs-selection,
        .veyra-no-cursors .collaboration-cursor__selection {
            background-color: transparent !important;
            background: transparent !important;
            border-color: transparent !important;
            /* NO usar display: none, NO usar visibility: hidden */
        }
    </style>
</head>
<body class="\${initialThemeClass}">
    <div id="editor-container">
        <div id="editor"></div>
    </div>
    <script>
        window.VEYRA_INITIAL_PAGE_ID = \${JSON.stringify(activePageId)};
        window.VEYRA_INITIAL_THEME = \${JSON.stringify(initialThemeClass)};
    </script>
    <script>
${escapedBundle}
    </script>
</body>
</html>\`;
}
`;

const outputPath = path.join(__dirname, 'htmlTemplate.ts');
fs.writeFileSync(outputPath, template, 'utf8');
console.log('htmlTemplate.ts generado exitosamente en:', outputPath);
