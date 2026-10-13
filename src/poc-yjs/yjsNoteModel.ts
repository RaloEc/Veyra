import * as Y from 'yjs';

export type PageLayoutMode = 'vertical' | 'horizontal';

export interface NoteMetadata {
    title: string;
    layout: PageLayoutMode;
    fontFamily: string;
    updatedAt: number;
    customProperties?: Record<string, any>;
}

export interface YjsPageSummary {
    id: string;
    xmlFragment: Y.XmlFragment;
    length: number;
}

/**
 * Modelo colaborativo Yjs para una Nota de Veyra.
 * 
 * Estructura del Y.Doc:
 * - `meta` (Y.Map): Metadatos compartidos de la nota (título, layout, tipografía, timestamps).
 * - `pageOrder` (Y.Array<string>): Identificadores estables y persistentes de cada hoja.
 * - `page_<id>` (Y.XmlFragment): Árbol de contenido ProseMirror/Tiptap exclusivo de cada hoja.
 * 
 * Ventajas arquitectónicas:
 * 1. Cada hoja tiene una identidad inmutable (`page_<uuid>`), desacoplada de su índice visual.
 * 2. Agregar, borrar o mover hojas en `pageOrder` nunca confunde ni sobreescribe el contenido
 *    de las páginas existentes, eliminando las colisiones por corrimiento de índices.
 */
export class YjsNoteModel {
    public doc: Y.Doc;
    private meta: Y.Map<any>;
    private pageOrder: Y.Array<string>;

    constructor(existingDoc?: Y.Doc) {
        this.doc = existingDoc || new Y.Doc();
        this.meta = this.doc.getMap('meta');
        this.pageOrder = this.doc.getArray('pageOrder');
    }

    /**
     * Inicializa los valores por defecto si el documento está recién creado.
     */
    public initializeDefaults(options: { title?: string; layout?: PageLayoutMode; fontFamily?: string } = {}) {
        this.doc.transact(() => {
            if (!this.meta.has('title')) {
                this.meta.set('title', options.title || '');
            }
            if (!this.meta.has('layout')) {
                this.meta.set('layout', options.layout || 'vertical');
            }
            if (!this.meta.has('fontFamily')) {
                this.meta.set('fontFamily', options.fontFamily || 'sans');
            }
            if (!this.meta.has('createdAt')) {
                this.meta.set('createdAt', Date.now());
            }
            if (this.pageOrder.length === 0) {
                // Crear al menos una primera hoja inicial
                this.addPage();
            }
        }, 'local-init');
    }

    // ─── GESTIÓN DE METADATOS ───────────────────────────────────────────────

    public getTitle(): string {
        return (this.meta.get('title') as string) || '';
    }

    public setTitle(newTitle: string, origin: string = 'local') {
        this.doc.transact(() => {
            this.meta.set('title', newTitle);
            this.meta.set('updatedAt', Date.now());
        }, origin);
    }

    public getLayout(): PageLayoutMode {
        return (this.meta.get('layout') as PageLayoutMode) || 'vertical';
    }

    public setLayout(layout: PageLayoutMode, origin: string = 'local') {
        this.doc.transact(() => {
            this.meta.set('layout', layout);
            this.meta.set('updatedAt', Date.now());
        }, origin);
    }

    public getFontFamily(): string {
        return (this.meta.get('fontFamily') as string) || 'sans';
    }

    public setFontFamily(fontFamily: string, origin: string = 'local') {
        this.doc.transact(() => {
            this.meta.set('fontFamily', fontFamily);
            this.meta.set('updatedAt', Date.now());
        }, origin);
    }

    public getMetadata(): NoteMetadata {
        return {
            title: this.getTitle(),
            layout: this.getLayout(),
            fontFamily: this.getFontFamily(),
            updatedAt: (this.meta.get('updatedAt') as number) || Date.now(),
        };
    }

    // ─── GESTIÓN DE HOJAS CON IDENTIFICADORES ESTABLES ──────────────────────

    /**
     * Retorna el listado ordenado de IDs de páginas activas.
     */
    public getPageIds(): string[] {
        return this.pageOrder.toArray();
    }

    /**
     * Obtiene el XmlFragment de Tiptap asociado a una página por su ID estable.
     */
    public getPageFragment(pageId: string): Y.XmlFragment {
        return this.doc.getXmlFragment(pageId);
    }

    /**
     * Añade una nueva hoja con ID estable en una posición determinada.
     * @param targetIndex Índice donde insertar (si no se define, se añade al final)
     * @param customPageId ID personalizado opcional (por defecto genera page_<uuid>)
     * @param origin Origen de la transacción
     */
    public addPage(targetIndex?: number, customPageId?: string, origin: string = 'local'): string {
        const id = customPageId || `page_${Math.random().toString(36).substring(2, 11)}_${Date.now().toString(36)}`;

        this.doc.transact(() => {
            const index = typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= this.pageOrder.length
                ? targetIndex
                : this.pageOrder.length;

            this.pageOrder.insert(index, [id]);

            // Inicializar la página con un párrafo y un nodo de texto vacío
            const fragment = this.doc.getXmlFragment(id);
            if (fragment.length === 0) {
                const p = new Y.XmlElement('paragraph');
                const text = new Y.XmlText();
                p.insert(0, [text]);
                fragment.insert(0, [p]);
            }

            this.meta.set('updatedAt', Date.now());
        }, origin);

        return id;
    }

    /**
     * Elimina una hoja por su ID estable.
     * Si era la única hoja, recrea una vacía para mantener la consistencia.
     */
    public removePage(pageId: string, origin: string = 'local'): boolean {
        let removed = false;
        this.doc.transact(() => {
            const currentIds = this.pageOrder.toArray();
            const index = currentIds.indexOf(pageId);
            if (index !== -1) {
                this.pageOrder.delete(index, 1);
                removed = true;

                // Si no quedan hojas, crear una hoja vacía de respaldo
                if (this.pageOrder.length === 0) {
                    this.addPage(0, undefined, origin);
                }

                this.meta.set('updatedAt', Date.now());
            }
        }, origin);

        return removed;
    }

    /**
     * Reordena una hoja moviéndola de un índice a otro de forma atómica.
     */
    public movePage(fromIndex: number, toIndex: number, origin: string = 'local'): boolean {
        if (fromIndex < 0 || fromIndex >= this.pageOrder.length || toIndex < 0 || toIndex >= this.pageOrder.length) {
            return false;
        }
        if (fromIndex === toIndex) return true;

        this.doc.transact(() => {
            const pageId = this.pageOrder.get(fromIndex);
            this.pageOrder.delete(fromIndex, 1);
            this.pageOrder.insert(toIndex, [pageId]);
            this.meta.set('updatedAt', Date.now());
        }, origin);

        return true;
    }

    /**
     * Retorna un resumen estructurado completo de toda la nota (AST y metadatos).
     */
    public toStructuredSnapshot(): {
        metadata: NoteMetadata;
        pages: Array<{ id: string; content: any }>;
    } {
        const metadata = this.getMetadata();
        const pageIds = this.getPageIds();

        const pages = pageIds.map((id) => {
            const fragment = this.getPageFragment(id);
            return {
                id,
                content: serializeXmlFragment(fragment),
            };
        });

        return { metadata, pages };
    }
}

function serializeXmlFragment(node: Y.XmlFragment | Y.XmlElement | Y.XmlText): any {
    if (node instanceof Y.XmlFragment) {
        return {
            type: 'fragment',
            children: node.toArray().map(serializeXmlFragment),
        };
    } else if (node instanceof Y.XmlElement) {
        return {
            type: 'element',
            name: node.nodeName,
            attributes: node.getAttributes(),
            children: node.toArray().map(serializeXmlFragment),
        };
    } else if (node instanceof Y.XmlText) {
        return {
            type: 'text',
            content: node.toString(),
            delta: node.toDelta(),
        };
    }
    return null;
}
