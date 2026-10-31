import { NotePage } from './pageUtils';

export interface PdfExportOptions {
    marginMm?: number;
    fontFamily?: string;
}

/**
 * Stub para futura exportación de notas paginadas a formato PDF (tamaño estándar A4).
 *
 * ARQUITECTURA Y ESTRATEGIA:
 * 1. Para preservar la fluidez y responsividad en dispositivos móviles, el editor
 *    (Tiptap / WebView) NO fuerza un viewport fijo A4 en pantalla.
 * 2. Durante la exportación, se concatenará el HTML de cada página (`NotePage.content` o
 *    el fragmento XML correspondiente en Yjs) y se inyectará el CSS paged media:
 *
 *    <style>
 *      @page {
 *        size: A4;
 *        margin: 20mm;
 *      }
 *      body {
 *        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
 *        line-height: 1.6;
 *        color: #111827;
 *        background-color: #ffffff;
 *      }
 *      .page-break {
 *        page-break-after: always;
 *        break-after: page;
 *      }
 *    </style>
 *
 * 3. Se utilizará la biblioteca `expo-print` (`printToFileAsync`) para renderizar el documento
 *    PDF nativo y compartirlo o guardarlo mediante `expo-sharing`.
 *
 * @param pages Listado de páginas de la nota con su contenido respectivo
 * @param title Título principal de la nota para el encabezado del documento
 * @param options Opciones adicionales de renderizado (márgenes, tipografía)
 */
export async function exportNoteToPdf(
    pages: NotePage[],
    title: string,
    options?: PdfExportOptions
): Promise<{ uri?: string; success: boolean }> {
    // STUB: Implementación pendiente con expo-print en fase futura
    console.log('[pdfUtils] exportNoteToPdf called (stub)', { title, pageCount: pages.length, options });

    return {
        success: false,
    };
}
