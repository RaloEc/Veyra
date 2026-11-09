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
            --accent-primary: var(--accent-color, \${accentColor});
            --text-main: var(--text-color);
            --text-muted: var(--text-secondary);
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
            --bg-color: #000000 !important;
            background-color: #000000 !important;
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
            -webkit-tap-highlight-color: transparent !important;
            -webkit-touch-callout: none !important;
            -webkit-user-select: text; /* Permitir seleccionar texto */
            user-select: text;
            outline: none !important;
        }
        *:focus,
        *:focus-visible,
        *:active {
            outline: none !important;
            box-shadow: none !important;
        }
        html, body, #editor-container, #editor {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
        }
        .ProseMirror,
        .ProseMirror:focus,
        .ProseMirror:focus-visible,
        .ProseMirror-focused,
        .ProseMirror-selectednode {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
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
            transition: none !important;
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

        /* ─── Inline Image Node Canonical Classes (Web & Mobile Shared Specification) ─── */
        .veyra-image-node {
            display: block !important;
            width: 100% !important;
            margin: 12px 0;
            position: relative;
            clear: both;
            box-sizing: border-box;
        }

        .veyra-image-wrapper {
            position: relative;
            max-width: 100%;
            min-width: 0;
            display: block;
            box-sizing: border-box;
            border-radius: 8px;
            margin-right: auto;
        }
        .veyra-figcaption-container {
            position: relative;
            display: block;
            box-sizing: border-box;
            max-width: 100%;
            margin-right: auto;
        }
        .veyra-image-wrapper.is-loading {
            min-height: 140px;
            background: linear-gradient(90deg, rgba(128,128,128,0.08) 25%, rgba(128,128,128,0.18) 50%, rgba(128,128,128,0.08) 75%);
            background-size: 200% 100%;
            animation: veyraShimmer 1.4s infinite ease-in-out;
        }
        @keyframes veyraShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        .veyra-image-wrapper img {
            width: 100% !important;
            height: auto !important;
            display: block !important;
            max-width: 100% !important;
            object-fit: contain !important;
            border-radius: 8px;
            margin: 0 !important;
            pointer-events: auto;
        }

        /* Transición suave y limpia al cambiar presets de tamaño y alinear (Modo NO arrastrando) */
        .veyra-image-node:not(.is-resizing) .veyra-image-wrapper,
        .veyra-image-node:not(.is-resizing) .veyra-figcaption-container {
            transition: width 220ms cubic-bezier(0.16, 1, 0.3, 1),
                        margin-left 220ms cubic-bezier(0.16, 1, 0.3, 1) !important;
            will-change: width, margin-left;
        }

        /* En arrastre en vivo: cero transición para 60fps instantáneos */
        .veyra-image-node.is-resizing,
        .veyra-image-node.is-resizing *,
        .veyra-image-node.is-resizing .veyra-image-wrapper,
        .veyra-image-node.is-resizing img {
            transition: none !important;
            touch-action: none !important;
            user-select: none;
        }
        .veyra-image-node.is-resizing .veyra-figcaption-container {
            display: none !important;
        }
        .veyra-image-node.is-selected .veyra-image-wrapper,
        .veyra-image-node[data-selected="true"] .veyra-image-wrapper {
            outline: 1px solid var(--accent-primary, #8B5CF6);
            outline-offset: 1px;
            border-radius: 8px;
        }
        .resize-handle {
            display: none;
            position: absolute;
            width: 12px;
            height: 12px;
            background: #ffffff;
            border: 2px solid var(--accent-primary, #8B5CF6);
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
            z-index: 20;
            pointer-events: auto;
            touch-action: none;
            transition: transform 0.1s ease;
            transform-origin: center center;
        }
        .resize-handle::after {
            content: '';
            position: absolute;
            top: -10px;
            left: -10px;
            right: -10px;
            bottom: -10px;
        }
        .veyra-resize-pill {
            display: none;
            position: absolute;
            top: 8px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #ffffff;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 9999px;
            pointer-events: none;
            z-index: 30;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            white-space: nowrap;
        }
        .veyra-image-node.is-resizing .veyra-resize-pill {
            display: block;
        }
        .veyra-image-node[data-selected="true"] .resize-handle,
        .veyra-image-node.is-selected .resize-handle {
            display: block;
        }
        /* Ocultar handles de redimensión, píldora y contornos en modo lectura */
        .is-readonly .resize-handle,
        .ProseMirror[contenteditable="false"] .resize-handle,
        #editor[contenteditable="false"] .resize-handle,
        .veyra-image-node.is-readonly .resize-handle,
        .veyra-image-node[data-editable="false"] .resize-handle {
            display: none !important;
        }
        .is-readonly .veyra-resize-pill,
        .ProseMirror[contenteditable="false"] .veyra-resize-pill,
        #editor[contenteditable="false"] .veyra-resize-pill,
        .veyra-image-node.is-readonly .veyra-resize-pill,
        .veyra-image-node[data-editable="false"] .veyra-resize-pill {
            display: none !important;
        }
        .is-readonly .veyra-image-node .veyra-image-wrapper,
        .is-readonly .veyra-image-node.is-selected .veyra-image-wrapper,
        .is-readonly .veyra-image-node[data-selected="true"] .veyra-image-wrapper,
        .ProseMirror[contenteditable="false"] .veyra-image-node .veyra-image-wrapper,
        .ProseMirror[contenteditable="false"] .veyra-image-node.is-selected .veyra-image-wrapper,
        .ProseMirror[contenteditable="false"] .veyra-image-node[data-selected="true"] .veyra-image-wrapper,
        #editor[contenteditable="false"] .veyra-image-node .veyra-image-wrapper,
        .veyra-image-node.is-readonly .veyra-image-wrapper,
        .veyra-image-node[data-editable="false"] .veyra-image-wrapper {
            outline: none !important;
        }
        .resize-handle:active {
            transform: scale(1.15);
        }
        .resize-nw { top: -6px; left: -6px; cursor: nwse-resize; }
        .resize-ne { top: -6px; right: -6px; cursor: nesw-resize; }
        .resize-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
        .resize-se { bottom: -6px; right: -6px; cursor: nwse-resize; }
        .veyra-figcaption-container {
            display: block;
            box-sizing: border-box;
            max-width: 100%;
        }
        .veyra-figcaption-input {
            display: block;
            width: 100%;
            margin-top: 6px;
            padding: 4px 8px;
            font-size: 0.85em;
            text-align: center;
            background: transparent;
            border: none;
            border-bottom: 1px solid var(--accent-primary, #8B5CF6);
            color: var(--text-main, inherit);
            outline: none;
            font-family: inherit;
        }
        .veyra-figcaption-input::placeholder {
            color: var(--text-muted, #a6a6a6);
            opacity: 0.6;
        }
        .veyra-figcaption-text {
            display: block;
            margin-top: 6px;
            font-size: 0.85em;
            text-align: center;
            color: var(--text-muted, #a6a6a6);
            cursor: text;
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

        /* Línea vertical del cursor colaborativo */
        .collaboration-cursor__caret {
            position: relative;
            margin-left: -1px;
            margin-right: -1px;
            border-left: 2px solid;
            border-right: none;
            word-break: normal;
            pointer-events: none;
        }

        /* Etiqueta flotante con el nombre del usuario remoto */
        .collaboration-cursor__label {
            position: absolute;
            top: -1.4em;
            left: -1px;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 11px;
            font-weight: 600;
            line-height: 1;
            user-select: none;
            color: #FFFFFF !important;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
            pointer-events: none;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            z-index: 9999;
            transition: opacity 0.2s ease-in-out;
        }

        /* Selección de texto hecha por el otro dispositivo */
        .ProseMirror-yjs-selection {
            opacity: 0.25;
            pointer-events: none;
        }

        /* ═══════════════════════════════════════════════════════════════
           YouTube Embedded Video Node (Tiptap Custom Node + Resize)
           ═══════════════════════════════════════════════════════════════ */
        .veyra-youtube-node,
        .ProseMirror [data-youtube-video],
        .prose [data-youtube-video] {
            display: block !important;
            width: 100% !important;
            margin: 14px 0;
            position: relative;
            clear: both;
            box-sizing: border-box;
        }

        .veyra-youtube-wrapper {
            position: relative;
            max-width: 100%;
            min-width: 0;
            display: block;
            box-sizing: border-box;
            border-radius: 8px;
            aspect-ratio: 16 / 9;
            background: #000;
            overflow: hidden;
            margin-right: auto;
        }

        /* Transición suave para presets y alineación en YouTube */
        .veyra-youtube-node:not(.is-resizing) .veyra-youtube-wrapper {
            transition: width 220ms cubic-bezier(0.16, 1, 0.3, 1),
                        margin-left 220ms cubic-bezier(0.16, 1, 0.3, 1) !important;
            will-change: width, margin-left;
        }

        .veyra-youtube-node.is-resizing,
        .veyra-youtube-node.is-resizing * {
            transition: none !important;
        }

        .veyra-youtube-node[data-embed="false"] .veyra-youtube-wrapper {
            aspect-ratio: auto;
            background: transparent;
            border-radius: 0;
            overflow: visible;
        }

        /* Iframe (Estado C) */
        [data-youtube-video] iframe,
        .veyra-youtube-wrapper iframe {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: 0;
            border-radius: 8px;
        }
        [data-youtube-video][data-embed="false"] iframe { display: none; }

        /* Thumbnail (Estado B) */
        [data-youtube-video] .yt-thumbnail,
        .veyra-youtube-wrapper .yt-thumbnail {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 8px;
            cursor: pointer;
        }

        /* Overlay con botones (hover / selección) */
        [data-youtube-video] .yt-overlay { opacity: 0; transition: opacity 120ms; }
        [data-youtube-video]:hover .yt-overlay,
        [data-youtube-video].ProseMirror-selectednode .yt-overlay { opacity: 1; }

        /* Play button central (Estado B) */
        [data-youtube-video] .yt-play,
        .veyra-youtube-wrapper .yt-play {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        }
        [data-youtube-video] .yt-play svg,
        .veyra-youtube-wrapper .yt-play svg {
            width: 68px; height: 48px;
            filter: drop-shadow(0 2px 6px rgba(0,0,0,.5));
        }

        /* Selección y Handles de Resize para YouTube */
        .veyra-youtube-node.is-selected .veyra-youtube-wrapper,
        .veyra-youtube-node[data-selected="true"] .veyra-youtube-wrapper {
            outline: 1px solid var(--accent-primary, #8B5CF6);
            outline-offset: 1px;
            border-radius: 8px;
        }
        .veyra-youtube-node.is-resizing {
            touch-action: none !important;
            user-select: none;
        }
        .veyra-youtube-node[data-selected="true"] .resize-handle,
        .veyra-youtube-node.is-selected .resize-handle {
            display: block;
        }
        .veyra-youtube-node.is-resizing .veyra-resize-pill {
            display: block;
        }

        /* Modo Lectura: Ocultar handles, píldoras y contornos de YouTube */
        .is-readonly .veyra-youtube-node .resize-handle,
        .ProseMirror[contenteditable="false"] .veyra-youtube-node .resize-handle,
        .veyra-youtube-node.is-readonly .resize-handle,
        .veyra-youtube-node[data-editable="false"] .resize-handle {
            display: none !important;
        }
        .is-readonly .veyra-youtube-node .veyra-resize-pill,
        .ProseMirror[contenteditable="false"] .veyra-youtube-node .veyra-resize-pill,
        .veyra-youtube-node.is-readonly .veyra-resize-pill,
        .veyra-youtube-node[data-editable="false"] .veyra-resize-pill {
            display: none !important;
        }
        .is-readonly .veyra-youtube-node .veyra-youtube-wrapper,
        .is-readonly .veyra-youtube-node.is-selected .veyra-youtube-wrapper,
        .is-readonly .veyra-youtube-node[data-selected="true"] .veyra-youtube-wrapper,
        .ProseMirror[contenteditable="false"] .veyra-youtube-node .veyra-youtube-wrapper,
        .ProseMirror[contenteditable="false"] .veyra-youtube-node.is-selected .veyra-youtube-wrapper,
        .ProseMirror[contenteditable="false"] .veyra-youtube-node[data-selected="true"] .veyra-youtube-wrapper,
        .veyra-youtube-node.is-readonly .veyra-youtube-wrapper,
        .veyra-youtube-node[data-editable="false"] .veyra-youtube-wrapper {
            outline: none !important;
        }

        /* Placeholder offline (Estado offline) */
        [data-youtube-video] .yt-offline {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: var(--bg-surface, var(--bg-color, #1a1a1a));
            color: var(--text-main, var(--text-color, #fcfcfc));
            text-align: center;
            padding: 16px;
        }
        [data-youtube-video] .yt-offline-icon { font-size: 32px; opacity: 0.6; }
        [data-youtube-video] .yt-offline-text { font-size: 14px; font-weight: 600; }
        [data-youtube-video] .yt-offline-sub { font-size: 12px; opacity: 0.7; }
        [data-youtube-video] .yt-offline a { font-size: 11px; opacity: 0.6; word-break: break-all; }

        /* Enlace en embed=false */
        [data-youtube-video][data-embed="false"] a {
            color: var(--text-main, var(--text-color, #fcfcfc));
            text-decoration: underline;
            text-underline-offset: 2px;
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
