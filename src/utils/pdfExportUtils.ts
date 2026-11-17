import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { NotePage } from './pageUtils';
import { getFontFamilyCss, GOOGLE_FONTS_CSS_IMPORT, NOTE_FONTS_OVERRIDE_CSS } from '../constants/noteFonts';
import {
    A4HeaderFooterConfig,
    resolvePageBand,
    DEFAULT_A4_HEADER_FOOTER_CONFIG,
    A4BandConfig,
} from './a4HeaderFooterUtils';

export interface ExportPdfOptions {
    includeHeaderTitle?: boolean;
    includePageNumbers?: boolean;
    fontFamily?: string;
    customA4Html?: string;
    pageFormat?: 'infinite' | 'a4';
    a4HeaderFooterConfig?: A4HeaderFooterConfig;
    authorName?: string;
}

function escapeHtml(text: string): string {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function replaceTokens(
    raw: string,
    pageNum: number,
    total: number,
    dateStr: string,
    titleStr: string,
    authorStr: string
): string {
    if (!raw) return '';
    return String(raw)
        .replace(/\{page\}/gi, String(pageNum))
        .replace(/\{total\}/gi, String(total))
        .replace(/\{date\}/gi, dateStr)
        .replace(/\{title\}/gi, titleStr)
        .replace(/\{author\}/gi, authorStr);
}

function renderBandHtml(
    band: A4BandConfig | undefined,
    kind: 'header' | 'footer',
    pageNum: number,
    totalPages: number,
    dateStr: string,
    titleStr: string,
    authorStr: string,
    includePageNumbers: boolean
): string {
    if (!band) {
        if (kind === 'footer' && includePageNumbers && totalPages > 1) {
            return `
            <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:flex-end;">
                <div style="font-size:8.5pt;color:#94A3B8;">Página ${pageNum} de ${totalPages}</div>
            </div>`;
        }
        return '';
    }

    const left = escapeHtml(replaceTokens(band.left || '', pageNum, totalPages, dateStr, titleStr, authorStr));
    const center = escapeHtml(replaceTokens(band.center || '', pageNum, totalPages, dateStr, titleStr, authorStr));
    let right = escapeHtml(replaceTokens(band.right || '', pageNum, totalPages, dateStr, titleStr, authorStr));

    if (!right && kind === 'footer' && includePageNumbers && totalPages > 1) {
        right = `Página ${pageNum} de ${totalPages}`;
    }

    const images = Array.isArray(band.images) ? band.images : [];
    const imgsHtml = images.map((img) => {
        if (!img || !img.src) return '';
        // img.x y width referenciados sobre hoja base 794px ancho (210mm)
        const xMm = ((Number(img.x) || 0) / 794) * 210;
        // img.y y height referenciados sobre banda base 95px alto (25mm)
        const yMm = ((Number(img.y) || 0) / 95) * 25;
        const wMm = ((Number(img.width) || 80) / 794) * 210;
        const hMm = ((Number(img.height) || 36) / 95) * 25;
        return `<img class="sheet-hf-img" src="${escapeHtml(img.src)}" style="position:absolute;left:${xMm.toFixed(2)}mm;top:${yMm.toFixed(2)}mm;width:${wMm.toFixed(2)}mm;height:${hMm.toFixed(2)}mm;object-fit:contain;" alt="" />`;
    }).join('');

    const hasContent = left.trim().length > 0 || center.trim().length > 0 || right.trim().length > 0 || imgsHtml.length > 0;
    if (!hasContent) return '';

    return `
    <div style="position:relative;width:100%;height:100%;">
        ${imgsHtml}
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:space-between;z-index:2;pointer-events:none;">
            <div style="text-align:left;font-size:8.5pt;color:#94A3B8;flex:1;">${left}</div>
            <div style="text-align:center;font-size:8.5pt;color:#94A3B8;flex:1;">${center}</div>
            <div style="text-align:right;font-size:8.5pt;color:#94A3B8;flex:1;">${right}</div>
        </div>
    </div>`;
}

/**
 * Convierte un conjunto de NotePage en un documento HTML A4 optimizado
 * para impresión vectorial idéntico a la versión Web y al editor móvil:
 * - Tamaño estricto A4 (210mm x 297mm) con márgenes estándar 25mm / 30mm.
 * - Tipografía idéntica: Inter (10.5pt / 14px), line-height 1.7, márgenes de párrafos 0.25rem 0 0.5rem 0.
 * - Renderizado 100% estático y seguro para expo-print (iOS y Android) sin scripts de cliente.
 * - Soporte de encabezados y pies de página personalizables con tokens ({page}, {total}, etc.) e imágenes.
 */
export function buildPdfHtml(
    title: string,
    pages: NotePage[],
    options: ExportPdfOptions = {}
): string {
    const {
        includeHeaderTitle = false, // Por defecto NUNCA se inyecta el banner con el título de la nota en A4
        includePageNumbers = true,
        fontFamily,
        a4HeaderFooterConfig,
        authorName = '',
    } = options;

    const cleanTitle = title?.trim() || 'Documento';
    const activeFontCss = getFontFamilyCss(fontFamily) || "'Inter', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
    const hfConfig = a4HeaderFooterConfig || DEFAULT_A4_HEADER_FOOTER_CONFIG;

    const currentDateFormatted = new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date());

    const cleanPages = (pages && pages.length > 0)
        ? pages
        : [{ id: 'default', content: '' }];
    const totalPages = cleanPages.length;

    // Título opcional solo si se solicitó explícitamente y no en modo A4 limpio
    const optionalTitleSection = includeHeaderTitle
        ? `
        <div class="note-header">
            <h1 class="note-title">${escapeHtml(cleanTitle)}</h1>
            <div class="note-divider"></div>
        </div>
        `
        : '';

    const renderedPagesHtml = cleanPages.map((page, idx) => {
        const pageNum = idx + 1;
        const isLast = idx === totalPages - 1;
        const pageContent = (page.content || '').trim();

        const headerBand = resolvePageBand(hfConfig, 'header', pageNum);
        const footerBand = resolvePageBand(hfConfig, 'footer', pageNum);

        const headerHtml = renderBandHtml(
            headerBand,
            'header',
            pageNum,
            totalPages,
            currentDateFormatted,
            cleanTitle,
            authorName,
            includePageNumbers
        );

        const footerHtml = renderBandHtml(
            footerBand,
            'footer',
            pageNum,
            totalPages,
            currentDateFormatted,
            cleanTitle,
            authorName,
            includePageNumbers
        );

        const pageTitleSection = (idx === 0 && includeHeaderTitle) ? optionalTitleSection : '';

        return `
        <div class="pdf-page-sheet ${isLast ? 'pdf-page-sheet-last' : ''}" data-sheet-num="${pageNum}">
            ${headerHtml ? `<div class="sheet-header-band">${headerHtml}</div>` : ''}
            <div class="sheet-body">
                ${pageTitleSection}
                ${pageContent}
            </div>
            ${footerHtml ? `<div class="sheet-footer-band">${footerHtml}</div>` : ''}
        </div>
        `;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(cleanTitle)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet" />
    <style>
        ${GOOGLE_FONTS_CSS_IMPORT}
        ${NOTE_FONTS_OVERRIDE_CSS}

        @page {
            size: 210mm 297mm;
            margin: 0;
        }

        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        html, body {
            margin: 0;
            padding: 0;
            background: #FFFFFF;
            color: #1F2937;
            font-family: ${activeFontCss};
            font-size: 10.5pt;
            line-height: 1.7;
            -webkit-font-smoothing: antialiased;
        }

        .pdf-page-sheet {
            width: 210mm;
            min-height: 297mm;
            padding: 25mm 30mm 25mm 30mm;
            box-sizing: border-box;
            position: relative;
            display: flex;
            flex-direction: column;
            background: #FFFFFF;
            color: #1F2937;
            page-break-after: always;
            break-after: page;
        }

        .pdf-page-sheet.pdf-page-sheet-last,
        .pdf-page-sheet:last-child {
            page-break-after: avoid;
            break-after: avoid;
        }

        .sheet-header-band {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 25mm;
            padding: 0 30mm;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: space-between;
            z-index: 10;
        }

        .sheet-body {
            flex: 1;
            min-height: 0;
            box-sizing: border-box;
            position: relative;
            z-index: 1;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .sheet-footer-band {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 25mm;
            padding: 0 30mm;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 8.5pt;
            color: #94A3B8;
            z-index: 10;
        }

        .sheet-hf-img {
            pointer-events: none;
            user-select: none;
        }

        p {
            font-size: 10.5pt;
            line-height: 1.7;
            margin: 0.25rem 0 0.5rem 0;
            width: 100%;
            word-wrap: break-word;
            color: #1F2937;
        }

        h1 {
            font-size: 1.5em;
            font-weight: 700;
            color: #0F172A;
            margin: 16px 0 8px 0;
            line-height: 1.25;
        }

        h2 {
            font-size: 1.25em;
            font-weight: 700;
            color: #1E293B;
            margin: 14px 0 6px 0;
            line-height: 1.3;
        }

        h3 {
            font-size: 1.1em;
            font-weight: 600;
            color: #334155;
            margin: 12px 0 5px 0;
            line-height: 1.35;
        }

        ul, ol {
            margin: 6px 0 10px 0;
            padding-left: 22px;
        }

        li {
            margin-bottom: 3px;
            line-height: 1.7;
        }

        input[type="checkbox"] {
            width: 13px;
            height: 13px;
            margin-right: 8px;
            accent-color: #6366F1;
            vertical-align: middle;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 0.9em;
            page-break-inside: auto;
        }

        tr {
            page-break-inside: avoid;
        }

        th, td {
            border: 1px solid #CBD5E1;
            padding: 4px 8px;
            vertical-align: middle;
            line-height: 1.35;
        }

        th {
            background-color: #F8FAFC;
            font-weight: 600;
        }

        blockquote {
            border-left: 3px solid #6366F1;
            padding: 6px 14px;
            margin: 10px 0;
            color: #475569;
            background-color: #F8FAFC;
            border-radius: 0 4px 4px 0;
            font-style: italic;
        }

        img {
            max-width: 100% !important;
            height: auto !important;
            border-radius: 4px;
            display: block;
            margin: 10px auto;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        code {
            font-family: monospace;
            font-size: 12px;
            background: #F3F4F6;
            padding: 2px 4px;
            border-radius: 3px;
        }

        pre {
            background: #1E293B;
            color: #F8FAFC;
            padding: 10px 14px;
            border-radius: 6px;
            font-size: 12px;
            line-height: 1.45;
            margin: 10px 0;
            overflow: hidden;
        }

        .note-header {
            margin-bottom: 20px;
            padding-bottom: 10px;
        }

        .note-title {
            font-size: 26px;
            font-weight: 800;
            color: #111827;
            margin: 0 0 10px 0;
            line-height: 1.25;
        }

        .note-divider {
            width: 48px;
            height: 3px;
            background: #8B5CF6;
            border-radius: 2px;
        }

        .veyra-bookmark-card {
            display: flex;
            align-items: stretch;
            justify-content: space-between;
            margin: 12px 0;
            border-radius: 10px;
            border: 1px solid #E2E8F0;
            background: #F8FAFC;
            text-decoration: none !important;
            color: inherit !important;
            overflow: hidden;
            page-break-inside: avoid;
        }

        .veyra-bookmark-body {
            flex: 1;
            min-width: 0;
            padding: 10px 14px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        .veyra-bookmark-meta {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #64748B;
            margin-bottom: 4px;
        }

        .veyra-bookmark-title {
            font-size: 13px;
            font-weight: 600;
            color: #0F172A;
            line-height: 1.35;
        }

        .veyra-bookmark-desc {
            font-size: 11.5px;
            color: #475569;
            line-height: 1.4;
            margin-top: 4px;
        }

        .veyra-bookmark-cover-wrapper {
            width: 120px;
            min-height: 70px;
            background: #E2E8F0;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .veyra-bookmark-cover {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
    </style>
</head>
<body>
    ${renderedPagesHtml}
</body>
</html>
`;
}

/**
 * Exporta una nota completa a formato PDF y abre el diálogo nativo del sistema operativo
 * para compartir, imprimir o guardar en el almacenamiento del dispositivo.
 */
export async function exportNoteToPdf(
    title: string,
    pages: NotePage[],
    options?: ExportPdfOptions
): Promise<string> {
    const html = (options && options.customA4Html && options.customA4Html.trim().length > 0)
        ? options.customA4Html
        : buildPdfHtml(title, pages, options);

    // 1. Generar el PDF mediante expo-print solicitando también el string base64.
    // En Android / Expo Go, la URI generada por Print suele estar en cache/Print/
    // que queda fuera de las carpetas autorizadas por FilePermissionService para SharingModule.
    // Usar base64 nos permite guardarlo en el directorio seguro y autorizado de la app.
    const { uri, base64 } = await Print.printToFileAsync({
        html,
        base64: true,
    });

    // 2. Sanitizar el nombre del archivo para que sea representativo y limpio
    const cleanName = (title?.trim() || 'Nota')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '_') || 'Nota';
    const fileName = `${cleanName}_${Date.now()}.pdf`;

    // 3. Ubicar el archivo en el directorio local autorizado (cacheDirectory o documentDirectory)
    const targetDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    let fileToShare = uri;

    if (targetDir) {
        const targetUri = `${targetDir}${fileName}`;
        try {
            if (base64) {
                await FileSystem.writeAsStringAsync(targetUri, base64, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                fileToShare = targetUri;
            } else {
                await FileSystem.copyAsync({
                    from: uri,
                    to: targetUri,
                });
                fileToShare = targetUri;
            }
        } catch (storageErr) {
            console.warn('[exportNoteToPdf] No se pudo reubicar el archivo en cacheDirectory:', storageErr);
            fileToShare = uri;
        }
    }

    // 4. Invocar el diálogo de compartir nativo con fallback a IntentLauncher en Android
    if (await Sharing.isAvailableAsync()) {
        try {
            await Sharing.shareAsync(fileToShare, {
                UTI: '.pdf',
                mimeType: 'application/pdf',
                dialogTitle: title?.trim() || 'Nota Veyra',
            });
        } catch (shareErr) {
            console.warn('[exportNoteToPdf] Sharing.shareAsync rechazado, intentando fallback con IntentLauncher:', shareErr);
            if (Platform.OS === 'android') {
                try {
                    const contentUri = await FileSystem.getContentUriAsync(fileToShare);
                    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                        data: contentUri,
                        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                        type: 'application/pdf',
                    });
                } catch (fallbackErr) {
                    console.error('[exportNoteToPdf] Fallback con IntentLauncher falló:', fallbackErr);
                    throw shareErr;
                }
            } else {
                throw shareErr;
            }
        }
    }

    return fileToShare;
}

