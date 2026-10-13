import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { NotePage } from './pageUtils';
import { getFontFamilyCss, GOOGLE_FONTS_CSS_IMPORT, NOTE_FONTS_OVERRIDE_CSS } from '../constants/noteFonts';

export interface ExportPdfOptions {
    includeHeaderTitle?: boolean;
    includePageNumbers?: boolean;
    fontFamily?: string;
}

/**
 * Convierte un conjunto de NotePage y su título en un documento HTML
 * optimizado para impresión y renderizado PDF en estándares A4.
 */
export function buildPdfHtml(
    title: string,
    pages: NotePage[],
    options: ExportPdfOptions = {}
): string {
    const { includeHeaderTitle = true, includePageNumbers = true, fontFamily } = options;
    const cleanTitle = title?.trim() || 'Sin título';
    const totalPages = pages.length;
    const activeFontCss = getFontFamilyCss(fontFamily);

    // Procesar cada hoja individualmente
    const renderedPagesHtml = pages.map((page, index) => {
        const pageNum = index + 1;
        const pageContent = page.content || '';

        // El título principal de la nota se renderiza prominentemente en la página 1
        const titleSection = (index === 0 && includeHeaderTitle)
            ? `
            <div class="note-header">
                <h1 class="note-title">${escapeHtml(cleanTitle)}</h1>
                <div class="note-divider"></div>
            </div>
            `
            : '';

        const pageFooter = includePageNumbers && totalPages > 1
            ? `<div class="page-footer">Página ${pageNum} de ${totalPages}</div>`
            : '';

        const isLast = index === totalPages - 1;

        return `
        <div class="page-wrapper ${isLast ? 'page-last' : 'page-break'}">
            ${titleSection}
            <div class="page-content">
                ${pageContent}
            </div>
            ${pageFooter}
        </div>
        `;
    }).join('\n');

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(cleanTitle)}</title>
        <style>
            ${GOOGLE_FONTS_CSS_IMPORT}
            ${NOTE_FONTS_OVERRIDE_CSS}

            @page {
                size: A4 portrait;
                margin: 16mm 16mm 18mm 16mm;
            }

            * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            body {
                margin: 0;
                padding: 0;
                font-family: ${activeFontCss};
                color: #1F2937;
                background-color: #FFFFFF;
                font-size: 14px;
                line-height: 1.65;
            }

            .page-wrapper {
                position: relative;
                width: 100%;
                min-height: 94%;
                display: flex;
                flex-direction: column;
            }

            .page-break {
                page-break-after: always;
                break-after: page;
            }

            .page-content {
                flex: 1;
            }

            .note-header {
                margin-bottom: 22px;
                padding-bottom: 12px;
            }

            .note-title {
                font-size: 26px;
                font-weight: 800;
                color: #111827;
                letter-spacing: -0.5px;
                margin: 0 0 10px 0;
                line-height: 1.25;
            }

            .note-divider {
                width: 48px;
                height: 3.5px;
                background: linear-gradient(90deg, #6366F1, #8B5CF6);
                border-radius: 2px;
            }

            /* Estilos para el contenido HTML enriquecido */
            h1 { font-size: 22px; font-weight: 700; color: #111827; margin: 18px 0 8px 0; }
            h2 { font-size: 18px; font-weight: 700; color: #1F2937; margin: 16px 0 8px 0; }
            h3 { font-size: 16px; font-weight: 600; color: #374151; margin: 14px 0 6px 0; }
            p { margin: 0 0 10px 0; }
            
            blockquote {
                border-left: 3.5px solid #6366F1;
                margin: 12px 0;
                padding: 6px 14px;
                color: #4B5563;
                background-color: #F9FAFB;
                border-radius: 0 6px 6px 0;
            }

            img {
                max-width: 100% !important;
                height: auto !important;
                border-radius: 8px;
                margin: 12px auto;
                display: block;
            }

            ul, ol {
                margin: 8px 0;
                padding-left: 22px;
            }

            li {
                margin-bottom: 4px;
            }

            /* Estilo para casillas de verificación / listas de tareas */
            input[type="checkbox"] {
                width: 15px;
                height: 15px;
                margin-right: 8px;
                accent-color: #6366F1;
                vertical-align: middle;
            }

            code {
                background-color: #F3F4F6;
                padding: 2px 5px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12.5px;
                color: #C026D3;
            }

            pre {
                background-color: #1E293B;
                color: #F8FAFC;
                padding: 12px 16px;
                border-radius: 8px;
                overflow-x: auto;
                font-size: 12px;
                line-height: 1.5;
            }

            pre code {
                background: none;
                color: inherit;
                padding: 0;
            }

            hr {
                border: none;
                height: 1px;
                background-color: #E5E7EB;
                margin: 20px 0;
            }

            .page-footer {
                margin-top: auto;
                padding-top: 14px;
                font-size: 11px;
                color: #9CA3AF;
                text-align: right;
                border-top: 1px solid #F3F4F6;
            }
        </style>
    </head>
    <body>
        ${renderedPagesHtml}
    </body>
    </html>
    `;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
    const html = buildPdfHtml(title, pages, options);

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
