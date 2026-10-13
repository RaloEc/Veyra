const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, 'bundle.min.js');
const bundleJs = fs.readFileSync(bundlePath, 'utf8');

// Escapar caracteres peligrosos si los hay dentro del template string
const escapedBundle = bundleJs.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

const template = `/**
 * HTML Template auto-generado para el WebView del Editor Tiptap + Yjs
 */
export function getTiptapHtml(options: { isDark?: boolean; accentColor?: string } = {}) {
    const isDark = options.isDark ?? true;
    const accentColor = options.accentColor ?? '#8B5CF6';
    const bg = isDark ? '#121214' : '#FFFFFF';
    const text = isDark ? '#EDEDED' : '#1A1A1E';
    const placeholder = isDark ? '#52525B' : '#A1A1AA';
    const selection = isDark ? 'rgba(139, 92, 246, 0.35)' : 'rgba(139, 92, 246, 0.25)';

    return \`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>Veyra Tiptap Yjs</title>
    <style>
        * {
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: \${bg};
            color: \${text};
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            overflow-x: hidden;
            overflow-y: auto;
        }
        #editor-container {
            width: 100%;
            min-height: 100%;
            padding: 28px 20px 80px 20px;
        }
        .ProseMirror {
            outline: none;
            min-height: 300px;
            word-wrap: break-word;
            white-space: pre-wrap;
            caret-color: \${accentColor};
        }
        .ProseMirror ::selection {
            background: \${selection};
            color: inherit;
        }
        ::selection {
            background: \${selection};
            color: inherit;
        }
        .ProseMirror strong, .ProseMirror b, strong, b,
        .ProseMirror [style*="font-weight: bold"],
        .ProseMirror [style*="font-weight:bold"] {
            font-weight: bold !important;
            font-weight: 700 !important;
            -webkit-text-stroke: 0.6px currentColor !important;
            text-shadow: 0.3px 0 0 currentColor, -0.3px 0 0 currentColor !important;
            color: \${isDark ? '#FFFFFF' : '#000000'} !important;
        }
        .ProseMirror em, .ProseMirror i, em, i,
        .ProseMirror [style*="font-style: italic"],
        .ProseMirror [style*="font-style:italic"] {
            font-style: italic !important;
            font-synthesis: weight style !important;
            -webkit-font-synthesis: weight style !important;
            transform: skewX(-9deg) !important;
            display: inline-block !important;
            color: \${isDark ? '#F4F4F5' : '#18181B'} !important;
        }
        .ProseMirror p {
            margin: 0 0 12px 0;
        }
        .ProseMirror h1 {
            font-size: 1.75rem;
            font-weight: 700;
            margin: 16px 0 12px 0;
            color: \${isDark ? '#F4F4F5' : '#09090B'};
        }
        .ProseMirror h2 {
            font-size: 1.4rem;
            font-weight: 600;
            margin: 14px 0 10px 0;
            color: \${isDark ? '#E4E4E7' : '#18181B'};
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
        .ProseMirror p.is-editor-empty:first-child::before {
            color: \${placeholder};
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
    </style>
</head>
<body>
    <div id="editor-container">
        <div id="editor"></div>
    </div>
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
