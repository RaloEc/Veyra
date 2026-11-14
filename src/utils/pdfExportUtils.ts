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
        if (kind === 'footer' && includePageNumbers) {
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

    return `
    <div style="position:relative;width:100%;height:100%;">
        ${imgsHtml}
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:space-between;z-index:2;pointer-events:none;">
            <div style="text-align:left;font-size:8.5pt;color:#94A3B8;">${left}</div>
            <div style="text-align:center;font-size:8.5pt;color:#94A3B8;">${center}</div>
            <div style="text-align:right;font-size:8.5pt;color:#94A3B8;">${right}</div>
        </div>
    </div>`;
}

/**
 * Convierte un conjunto de NotePage en un documento HTML A4 optimizado
 * para impresión vectorial idéntico a la versión Web y al editor móvil:
 * - Tamaño estricto A4 (210mm x 297mm) con márgenes estándar 25mm / 30mm.
 * - Tipografía idéntica: Inter (10.5pt / 14px), line-height 1.7, márgenes de párrafos 0.25rem 0 0.5rem 0.
 * - Sin banner artificial de título de nota (elimina la duplicación en la cabecera).
 * - Motor de paginación DOM físico por hojas (.pdf-page-sheet) que parte listas y elementos con precisión.
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

    const rawHojasHtml = pages
        .map((p, idx) => `
        <div class="raw-hoja" data-hoja-index="${idx}">
            ${p.content || ''}
        </div>
        `)
        .join('\n');

    // Título opcional solo si se solicitó explícitamente y no en modo A4 limpio
    const optionalTitleSection = includeHeaderTitle
        ? `
        <div class="note-header">
            <h1 class="note-title">${escapeHtml(cleanTitle)}</h1>
            <div class="note-divider"></div>
        </div>
        `
        : '';

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

        #raw-document {
            display: none !important;
        }

        #paged-output {
            padding: 0;
            margin: 0;
            width: 210mm;
            display: block;
        }

        .pdf-page-sheet {
            width: 210mm;
            height: 297mm;
            min-height: 297mm;
            max-height: 297mm;
            padding: 25mm 30mm 25mm 30mm;
            box-sizing: border-box;
            position: relative;
            display: flex;
            flex-direction: column;
            background: #FFFFFF;
            color: #1F2937;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
            overflow: hidden;
        }

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
            overflow: hidden;
            box-sizing: border-box;
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
            font-size: 24px;
            font-weight: 700;
            color: #0F172A;
            margin: 1.25rem 0 0.5rem 0;
            line-height: 1.3;
        }

        h2 {
            font-size: 20px;
            font-weight: 700;
            color: #1E293B;
            margin: 1rem 0 0.4rem 0;
            line-height: 1.35;
        }

        h3 {
            font-size: 16px;
            font-weight: 600;
            color: #334155;
            margin: 0.75rem 0 0.35rem 0;
            line-height: 1.4;
        }

        ul, ol {
            margin: 0.25rem 0 0.5rem 0;
            padding-left: 24px;
        }

        li {
            margin-bottom: 0.25rem;
            line-height: 1.7;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 0.75rem 0;
            font-size: 13px;
            page-break-inside: auto;
        }

        tr {
            page-break-inside: avoid;
        }

        th, td {
            border: 1px solid #CBD5E1;
            padding: 6px 10px;
            vertical-align: middle;
            line-height: 1.35;
        }

        th {
            background-color: #F8FAFC;
            font-weight: 600;
        }

        blockquote {
            border-left: 3px solid #8B5CF6;
            padding: 6px 14px;
            margin: 0.75rem 0;
            color: #4B5563;
            background-color: #F8FAFC;
            border-radius: 0 4px 4px 0;
            font-style: italic;
        }

        img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            display: block;
            margin: 8px auto;
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
    </style>
</head>
<body>
    <div id="raw-document">
        ${optionalTitleSection}
        ${rawHojasHtml}
    </div>

    <div id="paged-output"></div>

    <script>
        (function() {
            var rawDoc = document.getElementById('raw-document');
            var output = document.getElementById('paged-output');
            var hfConfig = ${JSON.stringify(hfConfig)};
            var cleanTitle = ${JSON.stringify(cleanTitle)};
            var authorName = ${JSON.stringify(authorName)};
            var dateStr = ${JSON.stringify(currentDateFormatted)};
            var includePageNumbers = ${includePageNumbers ? 'true' : 'false'};

            function replaceTokens(raw, pageNum, total) {
                if (!raw) return '';
                return String(raw)
                    .replace(/\\{page\\}/gi, String(pageNum))
                    .replace(/\\{total\\}/gi, String(total))
                    .replace(/\\{date\\}/gi, dateStr)
                    .replace(/\\{title\\}/gi, cleanTitle)
                    .replace(/\\{author\\}/gi, authorName);
            }

            function resolveBand(kind, pageNumber) {
                if (!hfConfig) return { left: '', center: '', right: '', images: [] };
                if (pageNumber === 1 && hfConfig.differentFirstPage) {
                    return (kind === 'header' ? hfConfig.firstPageHeader : hfConfig.firstPageFooter) || { left: '', center: '', right: '', images: [] };
                }
                if (hfConfig.oddEvenDifferent && pageNumber % 2 === 0) {
                    return (kind === 'header' ? hfConfig.evenHeader : hfConfig.evenFooter) || { left: '', center: '', right: '', images: [] };
                }
                return (kind === 'header' ? hfConfig.header : hfConfig.footer) || { left: '', center: '', right: '', images: [] };
            }

            function renderBand(kind, pageNum, totalPages) {
                var band = resolveBand(kind, pageNum);
                var left = replaceTokens(band.left || '', pageNum, totalPages);
                var center = replaceTokens(band.center || '', pageNum, totalPages);
                var right = replaceTokens(band.right || '', pageNum, totalPages);

                if (!right && kind === 'footer' && includePageNumbers && totalPages > 1) {
                    right = 'Página ' + pageNum + ' de ' + totalPages;
                }

                var images = Array.isArray(band.images) ? band.images : [];
                var imgsHtml = images.map(function(img) {
                    if (!img || !img.src) return '';
                    var xMm = ((Number(img.x) || 0) / 794) * 210;
                    var yMm = ((Number(img.y) || 0) / 95) * 25;
                    var wMm = ((Number(img.width) || 80) / 794) * 210;
                    var hMm = ((Number(img.height) || 36) / 95) * 25;
                    return '<img class="sheet-hf-img" src="' + img.src + '" style="position:absolute;left:' + xMm.toFixed(2) + 'mm;top:' + yMm.toFixed(2) + 'mm;width:' + wMm.toFixed(2) + 'mm;height:' + hMm.toFixed(2) + 'mm;object-fit:contain;" alt="" />';
                }).join('');

                var hasContent = left.trim() || center.trim() || right.trim() || imgsHtml.length > 0;
                if (!hasContent) return '';

                return '<div style="position:relative;width:100%;height:100%;">' +
                    imgsHtml +
                    '<div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:space-between;z-index:2;pointer-events:none;">' +
                        '<div style="text-align:left;font-size:8.5pt;color:#94A3B8;">' + left + '</div>' +
                        '<div style="text-align:center;font-size:8.5pt;color:#94A3B8;">' + center + '</div>' +
                        '<div style="text-align:right;font-size:8.5pt;color:#94A3B8;">' + right + '</div>' +
                    '</div>' +
                '</div>';
            }

            function runPaginator() {
                if (!rawDoc || !output) return;
                output.innerHTML = '';
                var sheetCount = 0;
                var currentSheet = null;
                var currentBody = null;

                function createNewSheet() {
                    sheetCount++;
                    var sheet = document.createElement('div');
                    sheet.className = 'pdf-page-sheet';
                    sheet.setAttribute('data-sheet-num', sheetCount);

                    var header = document.createElement('div');
                    header.className = 'sheet-header-band';
                    header.setAttribute('data-page', sheetCount);
                    sheet.appendChild(header);

                    var body = document.createElement('div');
                    body.className = 'sheet-body';
                    sheet.appendChild(body);

                    var footer = document.createElement('div');
                    footer.className = 'sheet-footer-band';
                    footer.setAttribute('data-page', sheetCount);
                    sheet.appendChild(footer);

                    output.appendChild(sheet);
                    currentSheet = sheet;
                    currentBody = body;
                    return sheet;
                }

                function checkOverflow(container) {
                    if (container.scrollHeight > container.clientHeight) return true;
                    var last = container.lastElementChild;
                    if (!last) return false;
                    var cRect = container.getBoundingClientRect();
                    var lRect = last.getBoundingClientRect();
                    if (cRect.height > 0 && lRect.bottom > (cRect.bottom - 4)) return true;
                    return false;
                }

                createNewSheet();

                var rawHojas = Array.from(rawDoc.querySelectorAll('.raw-hoja'));
                rawHojas.forEach(function(hoja, hojaIdx) {
                    if (hojaIdx > 0 && currentBody.children.length > 0) {
                        createNewSheet();
                    }

                    var elements = Array.from(hoja.children);
                    elements.forEach(function(el) {
                        if ((el.tagName === 'UL' || el.tagName === 'OL') && el.children.length > 1) {
                            var currentList = el.cloneNode(false);
                            currentBody.appendChild(currentList);

                            Array.from(el.children).forEach(function(li) {
                                var liClone = li.cloneNode(true);
                                currentList.appendChild(liClone);

                                if (checkOverflow(currentBody)) {
                                    if (currentList.children.length > 1 || currentBody.children.length > 1) {
                                        currentList.removeChild(liClone);
                                        if (currentList.children.length === 0) {
                                            currentBody.removeChild(currentList);
                                        }
                                        createNewSheet();
                                        currentList = el.cloneNode(false);
                                        currentBody.appendChild(currentList);
                                        currentList.appendChild(liClone);
                                    }
                                }
                            });
                            return;
                        }

                        var clone = el.cloneNode(true);
                        currentBody.appendChild(clone);

                        if (checkOverflow(currentBody)) {
                            if (currentBody.children.length > 1) {
                                currentBody.removeChild(clone);
                                createNewSheet();
                                currentBody.appendChild(clone);
                            }
                        }
                    });
                });

                var sheets = Array.from(output.querySelectorAll('.pdf-page-sheet'));
                var totalSheets = sheets.length;

                sheets.forEach(function(sheet, sIdx) {
                    var pNum = sIdx + 1;
                    var hBand = sheet.querySelector('.sheet-header-band');
                    var fBand = sheet.querySelector('.sheet-footer-band');
                    if (hBand) hBand.innerHTML = renderBand('header', pNum, totalSheets);
                    if (fBand) fBand.innerHTML = renderBand('footer', pNum, totalSheets);
                });
            }

            runPaginator();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', runPaginator);
            }
            window.addEventListener('load', runPaginator);
        })();
    </script>
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

