import * as Y from 'yjs';

/**
 * Deriva el texto plano para la vista previa de la tarjeta de nota a partir de un Y.Doc.
 * 
 * Reglas:
 * 1. Recorre los fragmentos de página en el orden indicado por `pageOrder` (o fallback a ['default']).
 * 2. Para cada fragmento: recorre los nodos del XmlFragment y concatena el texto de los párrafos,
 *    con '\n' entre párrafos y ' ' entre nodos inline.
 * 3. Normaliza espacios múltiples a uno, trim, y trunca a un máximo de 200 caracteres.
 * 4. Operación estrictamente de solo lectura: NO modifica el Y.Doc bajo ninguna circunstancia.
 */
export function derivePreviewText(doc: Y.Doc | null | undefined): string {
    if (!doc) return '';

    try {
        const pageOrder = doc.getArray<string>('pageOrder');
        const pageIds: string[] = pageOrder && pageOrder.length > 0 
            ? pageOrder.toArray().map(String) 
            : ['default'];

        const allParagraphs: string[] = [];

        function extractTextFromNode(node: any, currentInline: string[]) {
            if (!node) return;

            // Nodo de texto inline (Y.XmlText)
            if (node instanceof Y.XmlText) {
                const str = node.toString();
                if (str) currentInline.push(str);
                return;
            }

            // Elemento estructurado (Y.XmlElement)
            if (node instanceof Y.XmlElement) {
                const name = (node.nodeName || '').toLowerCase();

                if (name === 'youtube') {
                    // El nodo de video no aporta texto sustancial al snippet; se ignora limpiamente
                    return;
                }

                // Nodos que delimitan párrafos/bloques de contenido en Tiptap / ProseMirror
                const isBlock = 
                    name === 'paragraph' || 
                    name === 'heading' || 
                    name === 'p' || 
                    name === 'h1' || 
                    name === 'h2' || 
                    name === 'h3' || 
                    name === 'h4' || 
                    name === 'h5' || 
                    name === 'h6' || 
                    name === 'blockquote' || 
                    name === 'taskitem';

                if (isBlock) {
                    const inline: string[] = [];
                    for (let i = 0; i < node.length; i++) {
                        extractTextFromNode(node.get(i), inline);
                    }
                    const text = inline.join(' ').replace(/\s+/g, ' ').trim();
                    if (text) {
                        allParagraphs.push(text);
                    }
                } else {
                    // Contenedor intermedio (e.g. bulletList, orderedList, listItem)
                    for (let i = 0; i < node.length; i++) {
                        extractTextFromNode(node.get(i), currentInline);
                    }
                }
                return;
            }

            // Fragmento raíz o anidado (Y.XmlFragment)
            if (node instanceof Y.XmlFragment) {
                for (let i = 0; i < node.length; i++) {
                    const child = node.get(i);
                    if (child instanceof Y.XmlElement) {
                        extractTextFromNode(child, []);
                    } else if (child instanceof Y.XmlText) {
                        const str = child.toString().replace(/\s+/g, ' ').trim();
                        if (str) allParagraphs.push(str);
                    }
                }
            }
        }

        for (const pageId of pageIds) {
            const fragment = doc.getXmlFragment(pageId);
            if (fragment && fragment.length > 0) {
                extractTextFromNode(fragment, []);
            }
        }

        // Si no se encontraron bloques en los IDs de pageOrder pero existe contenido en 'default' o 'page_1'
        if (allParagraphs.length === 0) {
            const fallbackNames = ['default', 'page_1'];
            for (const name of fallbackNames) {
                if (!pageIds.includes(name)) {
                    const fragment = doc.getXmlFragment(name);
                    if (fragment && fragment.length > 0) {
                        extractTextFromNode(fragment, []);
                        if (allParagraphs.length > 0) break;
                    }
                }
            }
        }

        // Unir párrafos con '\n'
        let raw = allParagraphs.join('\n');
        // Normalizar espacios múltiples dentro de las líneas
        raw = raw.replace(/[ \t]+/g, ' ').trim();

        // Truncar a 200 caracteres
        if (raw.length > 200) {
            return raw.slice(0, 200).trim();
        }

        return raw;
    } catch (err) {
        console.warn('[derivePreviewText] Error derivando preview:', err);
        return '';
    }
}
