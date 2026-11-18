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

export function getTiptapHtml(options: { isDark?: boolean; isAmoled?: boolean; accentColor?: string; activePageId?: string; pageFormat?: 'infinite' | 'a4'; notePaperMode?: 'auto' | 'light' } = {}) {
    const isDark = options.isDark ?? true;
    const isAmoled = Boolean(isDark && (options.isAmoled ?? false));
    const accentColor = options.accentColor ?? '#8B5CF6';
    const activePageId = options.activePageId || null;
    const pageFormat = options.pageFormat || 'infinite';
    const notePaperMode = options.notePaperMode || 'auto';
    const isPaperLight = isDark && notePaperMode === 'light' && pageFormat === 'a4';
    const useDarkInk = !isDark || isPaperLight;
    const initialThemeClass = isAmoled ? 'dark amoled' : (isDark ? 'dark' : 'light');
    const initialBgColor = isAmoled ? '#000000' : (isDark ? '#121212' : '#FFFFFF');
    const pageFormatClass = pageFormat === 'a4' ? 'a4-page-mode' : '';
    const paperModeClass = isPaperLight ? 'sheet-light-mode' : '';
    const initialViewport = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, user-scalable=yes, viewport-fit=cover';
    return \`<!DOCTYPE html>
<html lang="es" class="\${initialThemeClass} \${pageFormatClass} \${paperModeClass}">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" id="veyra-viewport" content="\${initialViewport}" />
    <title>Veyra Tiptap Yjs</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet" />
    <style>
        \${GOOGLE_FONTS_CSS_IMPORT}
        :root {
            --bg-color: \${initialBgColor};
            --text-color: \${useDarkInk ? '#18181B' : '#F4F4F5'};
            --text-bold: \${useDarkInk ? '#000000' : '#FFFFFF'};
            --text-italic: \${useDarkInk ? '#18181B' : '#F4F4F5'};
            --heading-1: \${useDarkInk ? '#09090B' : '#F4F4F5'};
            --heading-2: \${useDarkInk ? '#18181B' : '#E4E4E7'};
            --placeholder: \${useDarkInk ? '#A1A1AA' : '#71717A'};
            --text-secondary: \${useDarkInk ? '#71717A' : '#A1A1AA'};
            --selection: \${useDarkInk ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.4)'};
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
            transition: background-color 0.38s cubic-bezier(0.2, 0.8, 0.2, 1);
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
            transition: padding 0.38s cubic-bezier(0.2, 0.8, 0.2, 1);
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
            transition: box-shadow 0.38s cubic-bezier(0.2, 0.8, 0.2, 1),
                        border 0.38s cubic-bezier(0.2, 0.8, 0.2, 1),
                        border-radius 0.38s ease,
                        background-color 0.38s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        /* TRANSICIONES Y ANIMACIONES FANCY ENTRE FORMATO A4 E INFINITO */
        @keyframes veyraA4Entrance {
            0% {
                opacity: 0.55;
                transform: scale(0.96) translateY(14px);
            }
            60% {
                transform: scale(1.008) translateY(-2px);
            }
            100% {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        @keyframes veyraInfiniteEntrance {
            0% {
                opacity: 0.6;
                transform: scale(1.025) translateY(-8px);
            }
            100% {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        html.veyra-animating-to-a4 #editor {
            animation: veyraA4Entrance 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
            transform-origin: top center;
        }

        html.veyra-animating-to-infinite #editor {
            animation: veyraInfiniteEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
            transform-origin: top center;
        }

        /* FORMATO HOJA A4 CON SEPARACION VISUAL - DIMENSIONES REALES A4 (794x1123px) */
        html.a4-page-mode, html.a4-page-mode body {
            background-color: #EEF2F6 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow-x: auto !important;
        }
        html.dark.a4-page-mode, html.dark.a4-page-mode body {
            background-color: #0B0D11 !important;
        }
        html.amoled.a4-page-mode, html.amoled.a4-page-mode body {
            background-color: #000000 !important;
        }
        html.a4-page-mode #editor-container {
            width: 820px !important;
            min-width: 820px !important;
            max-width: 820px !important;
            min-height: 1267px !important;
            margin: 0 auto !important;
            padding: 24px 13px 140px 13px !important;
            box-sizing: border-box !important;
            transform-origin: top center;
        }
        html.a4-page-mode #editor {
            position: relative !important;
            width: 794px !important;
            min-height: 1123px !important;
            margin: 0 auto !important;
        }
        html.a4-page-mode .ProseMirror {
            display: flow-root !important;
            width: 794px !important;
            min-width: 794px !important;
            max-width: 794px !important;
            min-height: 1123px !important;
            cursor: text;
            padding: 25mm 30mm !important;
            box-sizing: border-box !important;
            border-radius: 4px !important;
            font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
            font-size: 14px !important;
            line-height: 1.7 !important;
            background-color: #FFFFFF !important;
            border: 1px solid #E2E8F0 !important;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08) !important;
        }
        .a4-virtual-page-break {
            display: inline-block !important;
            vertical-align: top !important;
            user-select: none !important;
            pointer-events: none !important;
            background: transparent !important;
            width: 100% !important;
        }
        .a4-measuring .a4-virtual-page-break {
            display: none !important;
            height: 0 !important;
        }
        html.a4-page-mode .ProseMirror p {
            font-size: 14px !important;
            line-height: 1.7 !important;
            margin-top: 0.25rem !important;
            margin-bottom: 0.5rem !important;
            width: 100%;
        }
        html.dark.a4-page-mode .ProseMirror {
            background-color: #16181D !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45) !important;
        }
        html.amoled.a4-page-mode .ProseMirror {
            background-color: #101216 !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6) !important;
        }

        /* Modo Papel Claro en la Hoja (Interfaz oscura con Hoja blanca en A4) - Idéntico a Veyra WEB */
        html.dark.sheet-light-mode.a4-page-mode,
        html.amoled.sheet-light-mode.a4-page-mode,
        html.dark.sheet-light-mode.a4-page-mode body,
        html.amoled.sheet-light-mode.a4-page-mode body,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror {
            --text-color: #18181B !important;
            --text-bold: #000000 !important;
            --text-italic: #18181B !important;
            --heading-1: #09090B !important;
            --heading-2: #18181B !important;
            --placeholder: #A1A1AA !important;
            --text-secondary: #71717A !important;
        }

        html.dark.sheet-light-mode.a4-page-mode .ProseMirror,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror {
            background-color: #FFFFFF !important;
            border: 1px solid #CBD5E1 !important;
            color: #18181B !important;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45) !important;
        }

        html.dark.sheet-light-mode.a4-page-mode .ProseMirror,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror p,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror h1,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror h2,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror h3,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror h4,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror h5,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror h6,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror li,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror td,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror th,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror strong,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror b,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror em,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror i,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror strong,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror b,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror em,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror i {
            color: #18181B !important;
        }

        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] strong,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] b,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] em,
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] i,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] strong,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] b,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] em,
        html.amoled.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:"] i {
            color: inherit !important;
        }

        /* Evitar que texto negro o carbón se convierta en blanco */
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#18181B" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#000000" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#111113" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#0B0B0C" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#27272A" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#3F3F46" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color: black" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:black" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="rgb(24, 24, 27)" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="rgb(24,24,27)" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="rgb(0, 0, 0)" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="rgb(0,0,0)" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="rgb(17, 17, 19)" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="rgb(11, 11, 12)" i] {
            color: #18181B !important;
        }

        /* Si un texto se guardó en blanco en modo oscuro, convertirlo a oscuro para que sea legible en la hoja blanca */
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#F4F4F5" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#EDEDEF" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#FFFFFF" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="#FAFAFA" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color: white" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="color:white" i],
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror [style*="rgb(255" i] {
            color: #18181B !important;
        }

        /* Encabezados y pie de página en hoja blanca */
        html.dark.sheet-light-mode.a4-page-mode .veyra-a4-hf-slot {
            color: #475569 !important;
            opacity: 0.9 !important;
        }
        html.dark.sheet-light-mode.a4-page-mode .veyra-a4-hf-hint {
            color: #64748B !important;
            opacity: 0.45 !important;
        }

        /* Tablas, citas, bloques de código en hoja blanca */
        html.dark.sheet-light-mode.a4-page-mode .veyra-table {
            border-color: #CBD5E1 !important;
        }
        html.dark.sheet-light-mode.a4-page-mode .veyra-table td,
        html.dark.sheet-light-mode.a4-page-mode .veyra-table th {
            border-color: #CBD5E1 !important;
        }
        html.dark.sheet-light-mode.a4-page-mode .veyra-table th {
            background-color: #F8FAFC !important;
            color: #18181B !important;
        }
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror blockquote {
            color: #475569 !important;
            background: rgba(0, 0, 0, 0.03) !important;
            border-left-color: var(--accent-primary) !important;
        }
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror pre {
            background-color: #F8FAFC !important;
            border-color: #E2E8F0 !important;
            color: #0F172A !important;
        }
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror :not(pre)>code {
            background-color: rgba(0, 0, 0, 0.06) !important;
            color: #0284C7 !important;
        }
        html.dark.sheet-light-mode.a4-page-mode .ProseMirror a {
            color: #1D4ED8 !important;
        }
        .veyra-a4-hf-band {
            display: none !important;
            position: absolute;
            left: 0;
            right: 0;
            box-sizing: border-box;
            user-select: none;
            z-index: 18;
            flex-direction: column;
            justify-content: center;
            pointer-events: auto;
            cursor: pointer;
            transition: background-color 0.15s ease, opacity 0.32s ease;
            animation: veyraHfBandFade 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        html.a4-page-mode .veyra-a4-hf-band {
            display: flex !important;
        }
        @keyframes veyraHfBandFade {
            0% { opacity: 0; transform: translateY(-4px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        .veyra-a4-hf-band:active {
            background-color: rgba(139, 92, 246, 0.08);
        }
        .veyra-a4-hf-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            align-items: center;
            gap: 6px;
            width: 100%;
            box-sizing: border-box;
            position: relative;
            z-index: 2;
            pointer-events: none;
        }
        .veyra-a4-hf-slot {
            font-size: 9.5px;
            line-height: 1.25;
            color: var(--text-secondary);
            opacity: 0.82;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: pre-wrap;
        }
        .veyra-a4-hf-img {
            position: absolute;
            object-fit: contain;
            pointer-events: none;
            z-index: 1;
            border-radius: 2px;
        }
        .veyra-a4-hf-hint {
            font-size: 8.5px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--text-secondary);
            opacity: 0.28;
            text-align: center;
            pointer-events: none;
        }
        html.a4-page-mode .veyra-table {
            margin: 1.5rem 0;
        }
        html.a4-page-mode .veyra-table td,
        html.a4-page-mode .veyra-table th {
            padding: 8px 14px;
        }
        html.a4-page-mode hr {
            border: none;
            border-top: 1px solid rgba(148, 163, 184, 0.45);
            margin: 1.5rem 0;
            height: 0;
        }
        html.dark.a4-page-mode hr {
            border-top-color: rgba(255, 255, 255, 0.12);
        }
        #veyra-a4-breaks-overlay {
            display: none !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 794px;
            pointer-events: none;
            z-index: 25;
            transition: opacity 0.32s ease;
        }
        html.a4-page-mode #veyra-a4-breaks-overlay {
            display: block !important;
        }
        .veyra-a4-break-gap {
            position: absolute;
            left: -1px;
            right: -1px;
            height: 36px;
            pointer-events: none;
            user-select: none;
            z-index: 25;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            animation: veyraFadeInGap 0.32s ease both;
        }
        @keyframes veyraFadeInGap {
            0% { opacity: 0; }
            100% { opacity: 1; }
        }
        .veyra-a4-break-edge-top {
            width: 100%;
            height: 1px;
            background: rgba(128, 128, 128, 0.28);
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
        }
        .veyra-a4-break-edge-bottom {
            width: 100%;
            height: 1px;
            background: rgba(128, 128, 128, 0.28);
            box-shadow: 0 -3px 8px rgba(0, 0, 0, 0.14);
        }
        .veyra-a4-break-body {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #EEF2F6;
        }
        html.dark .veyra-a4-break-body {
            background: #0B0D11;
        }
        html.amoled .veyra-a4-break-body {
            background: #000000;
        }
        .veyra-a4-break-pill {
            padding: 2px 10px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            background: var(--bg-color);
            color: var(--text-secondary);
            border: 1px solid rgba(128, 128, 128, 0.3);
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

        /* Reglas de normalización de modo oscuro: asegura que texto con estilos oscuros residuales sea claro (excepto en hoja blanca) */
        html.dark:not(.sheet-light-mode) .ProseMirror,
        html.dark:not(.sheet-light-mode) .ProseMirror p,
        html.dark:not(.sheet-light-mode) .ProseMirror li {
            color: var(--text-color) !important;
        }
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color: #0F172A"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color:#0F172A"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color: rgb(15, 23, 42)"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color: #18181B"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color:#18181B"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color: rgb(24, 24, 27)"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color: #000000"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color:#000000"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color: rgb(0, 0, 0)"],
        html.dark:not(.sheet-light-mode) .ProseMirror span[style*="color: black"] {
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
        .ProseMirror > *:first-child {
            margin-top: 0 !important;
        }
        .ProseMirror p {
            margin-top: 0.25rem;
            margin-bottom: 0.5rem;
            font-size: 16px;
            line-height: 1.7;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            overflow-wrap: break-word;
            word-break: break-word;
            white-space: pre-wrap;
        }
        .ProseMirror h1 {
            font-size: 1.875rem !important; /* ~30px */
            font-weight: 700 !important;
            line-height: 1.25 !important;
            margin-top: 1.75rem;
            margin-bottom: 0.5rem;
            letter-spacing: -0.025em;
            color: var(--heading-1);
            display: block !important;
        }
        .ProseMirror h2 {
            font-size: 1.45rem !important; /* ~23px */
            font-weight: 600 !important;
            line-height: 1.3 !important;
            margin-top: 1.4rem;
            margin-bottom: 0.375rem;
            letter-spacing: -0.02em;
            color: var(--heading-2);
            display: block !important;
        }
        .ProseMirror h3 {
            font-size: 1.2rem !important; /* ~19px */
            font-weight: 600 !important;
            line-height: 1.4 !important;
            margin-top: 1.15rem;
            margin-bottom: 0.25rem;
            letter-spacing: -0.015em;
            color: inherit;
            display: block !important;
        }
        .ProseMirror blockquote {
            border-left: 3px solid var(--accent-color);
            padding: 0.35rem 0.75rem 0.35rem 1rem;
            margin: 0.85rem 0;
            font-style: italic;
            color: var(--text-secondary);
            background: rgba(255, 255, 255, 0.02);
            border-radius: 0 6px 6px 0;
        }
        .ProseMirror blockquote p {
            margin: 0 !important;
        }
        .ProseMirror ul:not([data-type="taskList"]) {
            list-style-type: disc !important;
            padding-left: 1.6rem !important;
            margin: 0.5rem 0 !important;
        }
        .ProseMirror ul:not([data-type="taskList"]) ul {
            list-style-type: circle !important;
            padding-left: 1.4rem !important;
            margin: 0.25rem 0 !important;
        }
        .ProseMirror ul:not([data-type="taskList"]) ul ul {
            list-style-type: square !important;
        }
        .ProseMirror ul:not([data-type="taskList"]) li {
            margin: 0.2rem 0;
            padding-left: 0.15rem;
            display: list-item !important;
        }
        .ProseMirror ul:not([data-type="taskList"]) li > p {
            margin: 0 !important;
        }
        .ProseMirror ol {
            padding-left: 1.6rem !important;
            margin: 0.5rem 0 !important;
        }
        .ProseMirror ol li {
            margin: 0.2rem 0;
        }
        .ProseMirror ol li > p {
            margin: 0 !important;
        }
        .ProseMirror ul[data-type="taskList"] {
            list-style: none;
            padding: 0;
            margin: 0.8rem 0;
        }
        .ProseMirror ul[data-type="taskList"] li {
            display: flex;
            align-items: flex-start;
            margin-bottom: 0.5rem;
        }

        /* ─── Nodo Inline Asistente IA Minimalista Flat ─── */
        .veyra-ai-prompt-wrapper {
            margin: 8px 0;
            width: 100%;
        }
        .veyra-ai-prompt-container {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.04);
            color: var(--text-color);
            transition: border-color 0.15s ease;
        }
        html.light .veyra-ai-prompt-container,
        html:not(.dark):not(.amoled) .veyra-ai-prompt-container {
            border-color: rgba(0, 0, 0, 0.12);
            background: rgba(0, 0, 0, 0.03);
        }
        .veyra-ai-prompt-label {
            font-family: monospace;
            font-size: 13px;
            color: var(--text-secondary);
            user-select: none;
            -webkit-user-select: none;
            flex-shrink: 0;
        }
        .veyra-ai-prompt-input {
            flex: 1;
            background: transparent;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            color: var(--text-color);
            font-size: 14px;
            font-family: inherit;
            padding: 0;
            margin: 0;
        }
        .veyra-ai-prompt-input::placeholder {
            color: var(--placeholder);
            opacity: 0.7;
        }
        .veyra-ai-prompt-action {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
            user-select: none;
            -webkit-user-select: none;
        }
        .veyra-ai-enter-badge,
        .veyra-ai-close-badge {
            font-family: monospace;
            font-size: 11px;
            color: var(--text-secondary);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 4px;
            padding: 2px 6px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .veyra-ai-enter-badge:active,
        .veyra-ai-close-badge:active {
            opacity: 0.7;
            transform: scale(0.95);
        }
        html.light .veyra-ai-enter-badge,
        html.light .veyra-ai-close-badge,
        html:not(.dark):not(.amoled) .veyra-ai-enter-badge,
        html:not(.dark):not(.amoled) .veyra-ai-close-badge {
            border-color: rgba(0, 0, 0, 0.15);
        }

        /* Switch "Solo enlace" en /enlace */
        .veyra-ai-switch-wrapper {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            padding: 2px 4px;
            border-radius: 6px;
            flex-shrink: 0;
        }
        .veyra-ai-switch-label {
            font-size: 11px;
            color: var(--text-secondary);
            transition: color 0.15s ease;
        }
        .veyra-ai-switch-label.active {
            color: var(--accent-primary, #6366f1);
            font-weight: 600;
        }
        .veyra-ai-switch-track {
            position: relative;
            width: 26px;
            height: 15px;
            background: rgba(148, 163, 184, 0.35);
            border-radius: 9999px;
            transition: background-color 0.2s ease;
        }
        .veyra-ai-switch-track.active {
            background: var(--accent-primary, #6366f1);
        }
        .veyra-ai-switch-thumb {
            position: absolute;
            top: 1.5px;
            left: 1.5px;
            width: 12px;
            height: 12px;
            background: #ffffff;
            border-radius: 9999px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
            transition: transform 0.2s ease;
        }
        .veyra-ai-switch-track.active .veyra-ai-switch-thumb {
            transform: translateX(11px);
        }

        /* Enlaces de hipervínculo estándar en Móvil (no tarjetas) */
        .ProseMirror a:not(.veyra-bookmark-card) {
            color: var(--accent-primary, #6366f1);
            text-decoration: underline;
            text-underline-offset: 3px;
            word-break: break-all;
            cursor: pointer;
        }
        html.dark .ProseMirror a:not(.veyra-bookmark-card),
        html.amoled .ProseMirror a:not(.veyra-bookmark-card) {
            color: #818cf8;
        }
        .veyra-ai-loading {
            font-size: 12px;
            color: var(--text-secondary);
            animation: veyraPulse 1.2s infinite ease-in-out;
        }
        @keyframes veyraPulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
        }

        /* ─── Bloques de Código en Móvil (Contenedor + Cabecera Minimalista) ─── */
        .veyra-code-block-wrapper {
            margin: 12px 0;
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: #0f1013;
        }
        html:not(.dark):not(.amoled) .veyra-code-block-wrapper {
            background: #fcfcfd;
            border-color: rgba(0, 0, 0, 0.1);
        }
        .veyra-code-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 5px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            background: rgba(255, 255, 255, 0.02);
            user-select: none;
            -webkit-user-select: none;
        }
        html:not(.dark):not(.amoled) .veyra-code-header {
            border-bottom-color: rgba(0, 0, 0, 0.06);
            background: rgba(0, 0, 0, 0.02);
        }
        .veyra-code-lang-container {
            position: relative;
        }
        .veyra-code-lang-btn {
            background: transparent;
            border: none;
            padding: 2px 6px;
            border-radius: 6px;
            color: #a1a1aa;
            font-size: 11px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            outline: none;
            font-family: inherit;
        }
        .veyra-code-lang-btn:active {
            background: rgba(255, 255, 255, 0.08);
        }
        .veyra-code-chevron {
            font-size: 9px;
            opacity: 0.6;
        }
        .veyra-code-lang-menu {
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            background: #18181b;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            z-index: 9999;
            max-height: 180px;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            width: 140px;
            padding: 3px;
        }
        html:not(.dark):not(.amoled) .veyra-code-lang-menu {
            background: #ffffff;
            border-color: #e4e4e7;
            box-shadow: 0 8px 20px rgba(0,0,0,0.12);
        }
        .veyra-code-lang-item {
            padding: 6px 10px;
            font-size: 11.5px;
            color: #d4d4d8;
            border-radius: 5px;
            cursor: pointer;
        }
        html:not(.dark):not(.amoled) .veyra-code-lang-item {
            color: #27272a;
        }
        .veyra-code-lang-item:active {
            background: rgba(139, 92, 246, 0.2);
            color: var(--accent-primary, #8b5cf6);
        }
        .veyra-code-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .veyra-code-action-btn {
            background: transparent;
            border: none;
            padding: 3px 6px;
            border-radius: 5px;
            color: #a1a1aa;
            font-size: 11px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            outline: none;
            font-family: inherit;
        }
        .veyra-code-action-btn:active {
            background: rgba(255, 255, 255, 0.08);
        }
        .veyra-code-wrap-btn.is-active {
            color: var(--accent-primary, #8b5cf6);
            background: rgba(139, 92, 246, 0.15);
        }
        .veyra-code-copy-btn.is-copied {
            color: #10b981;
        }

        /* ─── Pre & Code en Móvil ─── */
        .ProseMirror pre {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 10px 12px;
            margin: 0;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12.5px;
            line-height: 1.6;
            color: #9cdcfe;
            tab-size: 2;
        }
        .ProseMirror pre.is-wrapped {
            white-space: pre-wrap !important;
            word-break: break-all !important;
            overflow-x: hidden !important;
        }
        .ProseMirror pre.is-wrapped code {
            white-space: pre-wrap !important;
            word-break: break-all !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre {
            color: #001080;
        }
        .ProseMirror pre code {
            background: transparent !important;
            color: inherit !important;
            padding: 0 !important;
            border-radius: 0 !important;
            font-size: inherit !important;
            font-family: inherit !important;
            display: block;
            white-space: pre;
        }
        .ProseMirror :not(pre) > code {
            background-color: rgba(139, 92, 246, 0.12);
            color: var(--accent-primary, #8b5cf6);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.88em;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        /* ─── Tokens de Sintaxis en Móvil (VS Code Dark+) ─── */
        .ProseMirror pre .hljs-keyword,
        .ProseMirror pre .hljs-selector-tag {
            color: #c586c0 !important;
            font-weight: 500;
        }
        .ProseMirror pre .hljs-title.function_,
        .ProseMirror pre .hljs-title.class_,
        .ProseMirror pre .hljs-title {
            color: #dcdcaa !important;
            font-weight: 500;
        }
        .ProseMirror pre .hljs-property,
        .ProseMirror pre .hljs-attr,
        .ProseMirror pre .hljs-attribute {
            color: #4ec9b0 !important;
        }
        .ProseMirror pre .hljs-string,
        .ProseMirror pre .hljs-doctag {
            color: #ce9178 !important;
        }
        .ProseMirror pre .hljs-number {
            color: #b5cea8 !important;
        }
        .ProseMirror pre .hljs-literal,
        .ProseMirror pre .hljs-boolean {
            color: #569cd6 !important;
        }
        .ProseMirror pre .hljs-comment,
        .ProseMirror pre .hljs-quote {
            color: #6a9955 !important;
            font-style: italic;
        }
        .ProseMirror pre .hljs-type,
        .ProseMirror pre .hljs-built_in,
        .ProseMirror pre .hljs-builtin-name {
            color: #4ec9b0 !important;
        }
        .ProseMirror pre .hljs-tag {
            color: #808080 !important;
        }
        .ProseMirror pre .hljs-name {
            color: #569cd6 !important;
        }
        .ProseMirror pre .hljs-operator,
        .ProseMirror pre .hljs-punctuation {
            color: #d4d4d4 !important;
        }
        .ProseMirror pre .hljs-variable,
        .ProseMirror pre .hljs-template-variable,
        .ProseMirror pre .hljs-params {
            color: #9cdcfe !important;
        }
        .ProseMirror pre .hljs-meta {
            color: #9cdcfe !important;
        }

        /* Tokens de Sintaxis en Móvil (VS Code Light+) */
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-keyword,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-selector-tag {
            color: #af00db !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-title.function_,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-title.class_,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-title {
            color: #795e26 !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-property,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-attr,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-attribute {
            color: #0070c1 !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-string,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-doctag {
            color: #a31515 !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-number {
            color: #098658 !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-literal,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-boolean {
            color: #0000ff !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-comment,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-quote {
            color: #008000 !important;
            font-style: italic;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-type,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-built_in,
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-builtin-name {
            color: #267f99 !important;
        }
        html:not(.dark):not(.amoled) .ProseMirror pre .hljs-name {
            color: #800000 !important;
        }

        /* ─── Tablas en Móvil ─── */
        .tableWrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 12px 0;
            max-width: 100%;
        }
        .veyra-table {
            border-collapse: collapse;
            table-layout: auto;
            min-width: 100%;
            margin: 0;
            border: 1.5px solid var(--table-custom-border, rgba(148, 163, 184, 0.4));
            border-radius: 4px;
        }

        /* ─── Alineación de Posición de Tablas en Móvil ─── */
        .veyra-table[data-table-align="center"]:not([style*="width"]),
        .veyra-table[align="center"]:not([style*="width"]) {
            min-width: unset !important;
            width: fit-content !important;
            max-width: 100% !important;
        }
        .veyra-table[data-table-align="right"]:not([style*="width"]),
        .veyra-table[align="right"]:not([style*="width"]) {
            min-width: unset !important;
            width: fit-content !important;
            max-width: 100% !important;
        }
        .veyra-table[data-table-align="center"],
        .veyra-table[align="center"] {
            margin-left: auto !important;
            margin-right: auto !important;
        }
        .veyra-table[data-table-align="right"],
        .veyra-table[align="right"] {
            margin-left: auto !important;
            margin-right: 0 !important;
        }
        .veyra-table[data-table-align="left"],
        .veyra-table[align="left"],
        .veyra-table:not([data-table-align]):not([align]) {
            margin-left: 0 !important;
            margin-right: auto !important;
        }
        .veyra-table tr {
            box-sizing: border-box;
        }
        .veyra-table td,
        .veyra-table th {
            min-width: 80px;
            padding: 5px 8px;
            border: 1px solid var(--table-custom-border, rgba(148, 163, 184, 0.35));
            vertical-align: middle;
            box-sizing: border-box;
            position: relative;
            text-align: inherit;
            line-height: 1.35;
        }
        .veyra-table th {
            font-weight: 600;
            background-color: rgba(148, 163, 184, 0.12);
        }
        .veyra-table p {
            margin: 0 !important;
            line-height: 1.35 !important;
        }

        /* Presets de tabla en Móvil */
        .veyra-table[data-table-style="minimal"] {
            border-left: none !important;
            border-right: none !important;
            border-top: 1.5px solid var(--table-custom-border, rgba(148, 163, 184, 0.4));
            border-bottom: 1.5px solid var(--table-custom-border, rgba(148, 163, 184, 0.4));
        }
        .veyra-table[data-table-style="minimal"] td,
        .veyra-table[data-table-style="minimal"] th {
            border-left: none !important;
            border-right: none !important;
            border-top: 1px solid var(--table-custom-border, rgba(148, 163, 184, 0.25));
            border-bottom: 1px solid var(--table-custom-border, rgba(148, 163, 184, 0.25));
        }
        .veyra-table[data-table-style="striped"] tr:nth-child(even) td {
            background-color: rgba(148, 163, 184, 0.08);
        }
        .veyra-table[data-table-style="borderless"] {
            border: none !important;
        }
        .veyra-table[data-table-style="borderless"] td,
        .veyra-table[data-table-style="borderless"] th {
            border: 1px solid transparent !important;
        }
        .veyra-table[data-table-style="compact"] td,
        .veyra-table[data-table-style="compact"] th {
            padding: 3px 6px !important;
            font-size: 11.5px;
        }

        /* ─── Tarjetas de Enlace Web (Bookmarks) en Móvil (Estilo Notion con Portada) ─── */
        .veyra-bookmark-card {
            display: flex;
            align-items: stretch;
            justify-content: space-between;
            margin: 12px 0;
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            background: rgba(255, 255, 255, 0.9);
            text-decoration: none !important;
            color: inherit !important;
            user-select: none;
            -webkit-user-select: none;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            transition: all 0.15s ease;
        }
        .dark .veyra-bookmark-card,
        .amoled .veyra-bookmark-card {
            background: #18181b;
            border-color: rgba(255, 255, 255, 0.1);
        }
        .veyra-bookmark-card:active {
            opacity: 0.9;
        }
        .veyra-bookmark-body {
            flex: 1;
            min-width: 0;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .veyra-bookmark-meta {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-family: monospace;
            color: #71717a;
            margin-bottom: 4px;
        }
        .dark .veyra-bookmark-meta,
        .amoled .veyra-bookmark-meta {
            color: #a1a1aa;
        }
        .veyra-bookmark-favicon {
            width: 13px;
            height: 13px;
            border-radius: 2px;
            object-fit: contain;
            flex-shrink: 0;
        }
        .veyra-bookmark-domain {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .veyra-bookmark-title {
            font-size: 13.5px;
            font-weight: 600;
            color: #18181b;
            line-height: 1.35;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .dark .veyra-bookmark-title,
        .amoled .veyra-bookmark-title {
            color: #f4f4f5;
        }
        .veyra-bookmark-desc {
            font-size: 11.5px;
            color: #71717a;
            margin-top: 3px;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .dark .veyra-bookmark-desc,
        .amoled .veyra-bookmark-desc {
            color: #a1a1aa;
        }
        .veyra-bookmark-cover-wrapper {
            width: 100px;
            min-height: 80px;
            flex-shrink: 0;
            position: relative;
            background: rgba(148, 163, 184, 0.12);
            border-left: 1px solid rgba(148, 163, 184, 0.2);
            overflow: hidden;
        }
        .veyra-bookmark-cover {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        /* Footer con acción de Abrir y switch Solo texto en Móvil */
        .veyra-bookmark-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 8px;
            padding-top: 6px;
            border-top: 1px solid rgba(148, 163, 184, 0.18);
        }
        .dark .veyra-bookmark-footer,
        .amoled .veyra-bookmark-footer {
            border-top-color: rgba(255, 255, 255, 0.08);
        }
        .veyra-bookmark-open-link {
            font-size: 11px;
            color: var(--accent-primary, #6366f1);
            font-weight: 500;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 2px;
        }
        .veyra-bookmark-switch-btn {
            background: transparent;
            border: none;
            padding: 2px 4px;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            outline: none;
            color: var(--text-secondary);
            user-select: none;
            -webkit-user-select: none;
        }
        .veyra-bookmark-switch-btn:active {
            opacity: 0.8;
        }
        .veyra-bookmark-switch-label {
            font-size: 10.5px;
            font-weight: 500;
        }
        .veyra-bookmark-switch-track {
            position: relative;
            width: 24px;
            height: 14px;
            background: rgba(148, 163, 184, 0.35);
            border-radius: 9999px;
            transition: background-color 0.2s ease;
        }
        .dark .veyra-bookmark-switch-track,
        .amoled .veyra-bookmark-switch-track {
            background: rgba(255, 255, 255, 0.18);
        }
        .veyra-bookmark-switch-thumb {
            position: absolute;
            top: 1px;
            left: 1px;
            width: 12px;
            height: 12px;
            background: #ffffff;
            border-radius: 9999px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
            transition: transform 0.2s ease;
        }

        /* ─── Bookmark Skeleton Animation en Móvil ─── */
        @keyframes veyraShimmer {
            0% { opacity: 0.45; }
            50% { opacity: 0.85; }
            100% { opacity: 0.45; }
        }
        .veyra-bookmark-loading-pill {
            margin-left: auto;
            font-size: 10px;
            color: var(--accent-primary, #6366f1);
            animation: veyraShimmer 1.5s infinite ease-in-out;
            font-family: inherit;
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }
        .veyra-bookmark-skeleton-lines {
            margin: 8px 0 6px 0;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .veyra-skeleton-line {
            height: 12px;
            border-radius: 4px;
            background: rgba(148, 163, 184, 0.25);
            animation: veyraShimmer 1.5s infinite ease-in-out;
        }
        .dark .veyra-skeleton-line,
        .amoled .veyra-skeleton-line {
            background: rgba(255, 255, 255, 0.1);
        }
        .veyra-skeleton-title-1 {
            width: 82%;
            height: 14px;
        }
        .veyra-skeleton-title-2 {
            width: 45%;
            height: 14px;
        }
        .veyra-skeleton-desc {
            width: 65%;
            height: 10px;
            margin-top: 2px;
            opacity: 0.75;
        }
        .veyra-skeleton-cover {
            background: rgba(148, 163, 184, 0.18) !important;
            animation: veyraShimmer 1.5s infinite ease-in-out;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .dark .veyra-skeleton-cover,
        .amoled .veyra-skeleton-cover {
            background: rgba(255, 255, 255, 0.06) !important;
        }

        /* ─── Menú Flotante de Comandos (Slash Menu) en Móvil ─── */
        .veyra-mobile-slash-menu {
            position: fixed;
            z-index: 99999;
            width: calc(100vw - 32px);
            max-width: 310px;
            max-height: 230px;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            touch-action: pan-y !important;
            overscroll-behavior: contain;
            user-select: none;
            -webkit-user-select: none;
            border-radius: 14px;
            padding: 6px;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(255, 255, 255, 0.96);
            color: #18181b;
            font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
            font-size: 13px;
        }
        html.dark .veyra-mobile-slash-menu,
        html.amoled .veyra-mobile-slash-menu {
            background: rgba(24, 24, 27, 0.96);
            color: #f4f4f5;
            border-color: rgba(255, 255, 255, 0.15);
        }
        .veyra-slash-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            border-radius: 9px;
            cursor: pointer;
            transition: background 0.15s ease;
            user-select: none;
            -webkit-user-select: none;
            touch-action: pan-y !important;
            -webkit-tap-highlight-color: transparent;
        }
        .veyra-slash-item:active {
            background: rgba(139, 92, 246, 0.2);
        }
        .veyra-slash-icon {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(139, 92, 246, 0.15);
            color: var(--accent-primary, #8b5cf6);
            flex-shrink: 0;
            font-size: 12px;
            font-weight: 700;
        }
        .veyra-slash-text {
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .veyra-slash-title {
            font-weight: 600;
            font-size: 13px;
            line-height: 1.2;
        }
        .veyra-slash-desc {
            font-size: 10.5px;
            opacity: 0.65;
            line-height: 1.2;
            margin-top: 1px;
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

        /* Ancla del cursor colaborativo (0 dimensiones en el flujo, no altera jamás el line-box ni la posición de la línea) */
        .collaboration-cursor__caret {
            position: relative !important;
            display: inline !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            line-height: 0 !important;
            font-size: 0 !important;
            vertical-align: baseline !important;
            word-break: normal !important;
            pointer-events: none !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            white-space: nowrap !important;
        }

        /* Línea vertical visible del cursor colaborativo (100% absoluta fuera del flujo) */
        .collaboration-cursor__line {
            position: absolute !important;
            left: -1px !important;
            bottom: -3px !important;
            width: 2px !important;
            height: 20px !important;
            pointer-events: none !important;
            border-radius: 1px !important;
            z-index: 20 !important;
        }

        /* Etiqueta flotante con el nombre del usuario remoto (100% absoluta fuera del flujo) */
        .collaboration-cursor__label {
            position: absolute !important;
            bottom: 19px !important;
            left: -1px !important;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            line-height: 1 !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            color: #FFFFFF !important;
            padding: 2px 6px !important;
            border-radius: 4px 4px 4px 0 !important;
            white-space: nowrap !important;
            pointer-events: none !important;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3) !important;
            z-index: 9999 !important;
            opacity: 1 !important;
            transition: none !important;
        }

        /* Cuando el cursor está cerca del borde derecho de la pantalla, flipear la etiqueta hacia la izquierda para evitar desbordamiento */
        .collaboration-cursor__caret.collaboration-cursor__caret--flip-x .collaboration-cursor__label {
            left: auto !important;
            right: -1px !important;
            border-radius: 4px 4px 0 4px !important;
        }

        /* Anular de raíz los saltos que ProseMirror inyecta al final del párrafo cuando hay widgets (evita que la línea salte hacia abajo) */
        .ProseMirror p:has(.collaboration-cursor__caret) .ProseMirror-trailingBreak,
        .ProseMirror li:has(.collaboration-cursor__caret) .ProseMirror-trailingBreak,
        .ProseMirror h1:has(.collaboration-cursor__caret) .ProseMirror-trailingBreak,
        .ProseMirror h2:has(.collaboration-cursor__caret) .ProseMirror-trailingBreak,
        .ProseMirror h3:has(.collaboration-cursor__caret) .ProseMirror-trailingBreak,
        .ProseMirror blockquote:has(.collaboration-cursor__caret) .ProseMirror-trailingBreak,
        .ProseMirror-trailingBreak:not(:only-child) {
            display: none !important;
            height: 0 !important;
            font-size: 0 !important;
            line-height: 0 !important;
        }

        .ProseMirror-separator,
        img.ProseMirror-separator {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
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
<body class="\${initialThemeClass} \${pageFormatClass} \${paperModeClass}">
    <div id="editor-container">
        <div id="editor"></div>
    </div>
    <script>
        window.VEYRA_INITIAL_PAGE_ID = \${JSON.stringify(activePageId)};
        window.VEYRA_INITIAL_THEME = \${JSON.stringify(initialThemeClass)};
        window.VEYRA_INITIAL_PAGE_FORMAT = \${JSON.stringify(pageFormat)};
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
