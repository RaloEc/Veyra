import Image from '@tiptap/extension-image';
import { createImageNodeView } from './image-nodeview.js';

export const CustomImage = Image.extend({
    name: 'image',

    addStorage() {
        return { editingCaptionPos: null };
    },

    addNodeView() {
        return ({ node, editor, getPos }) =>
            createImageNodeView(node, editor.view, getPos);
    },

    parseHTML() {
        return [
            // Regla 1: <figure data-text-align="X"><img ...></figure>
            {
                tag: 'figure[data-text-align]',
                getAttrs: (figure) => {
                    const img = figure.querySelector('img');
                    if (!img) return false;
                    let width = null;
                    const widthAttr = img.getAttribute('width');
                    if (widthAttr) {
                        const parsed = parseInt(widthAttr, 10);
                        if (!isNaN(parsed) && parsed > 0 && parsed <= 100) width = parsed;
                    }
                    if (!width) {
                        const style = img.getAttribute('style') || '';
                        const match = style.match(/width:\s*(\d+)%/i);
                        if (match && match[1]) {
                            const parsed = parseInt(match[1], 10);
                            if (!isNaN(parsed) && parsed > 0 && parsed <= 100) width = parsed;
                        }
                    }
                    const caption =
                        img.getAttribute('data-caption') ||
                        figure.querySelector('figcaption')?.textContent?.trim() ||
                        null;
                    const textAlign = figure.getAttribute('data-text-align') || null;

                    return {
                        src: img.getAttribute('src'),
                        alt: img.getAttribute('alt') || null,
                        title: img.getAttribute('title') || null,
                        width,
                        caption,
                        textAlign,
                        style: width ? `width: ${width}%; height: auto;` : (img.getAttribute('style') || null),
                    };
                },
                priority: 60,
            },
            // Regla 2: <img> directo (comportamiento actual)
            {
                tag: 'img[src]',
            },
        ];
    },

    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: element => {
                    const widthAttr = element.getAttribute('width');
                    if (widthAttr) {
                        const parsed = parseInt(widthAttr, 10);
                        if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                            return parsed;
                        }
                    }
                    const style = element.getAttribute('style') || '';
                    const match = style.match(/width:\s*(\d+)%/i);
                    if (match && match[1]) {
                        const parsed = parseInt(match[1], 10);
                        if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                            return parsed;
                        }
                    }
                    return null;
                },
                renderHTML: attributes => {
                    if (!attributes.width) {
                        return {};
                    }
                    return {
                        width: String(attributes.width)
                    };
                }
            },
            caption: {
                default: null,
                parseHTML: element => {
                    return element.getAttribute('data-caption') || null;
                },
                renderHTML: attributes => {
                    if (!attributes.caption) {
                        return {};
                    }
                    return {
                        'data-caption': attributes.caption
                    };
                }
            },
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => {
                    // Si width existe, renderiza style con porcentaje para compatibilidad total
                    if (attributes.width) {
                        return { style: `width: ${attributes.width}%; height: auto;` };
                    }
                    if (attributes.style) {
                        return { style: attributes.style };
                    }
                    return {};
                }
            }
        };
    }
}).configure({
    inline: false,
    allowBase64: false
});
