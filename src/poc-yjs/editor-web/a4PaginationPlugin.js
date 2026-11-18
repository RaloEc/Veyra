import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';

export const a4PaginationPluginKey = new PluginKey('a4PaginationPlugin');

/**
 * Crea el elemento DOM del salto de página virtual.
 * Configurado como inline-block con vertical-align top para evitar bloques anónimos en Chromium/WebKit.
 */
export function createVirtualBreakDOM(spec) {
    const spacer = document.createElement('div');
    spacer.className = 'a4-virtual-page-break';
    spacer.setAttribute('data-sheet-index', String(spec.sheetIndex));
    spacer.setAttribute('data-spacer-height', String(spec.spacerHeight));
    spacer.style.display = 'inline-block';
    spacer.style.verticalAlign = 'top';
    spacer.style.width = '100%';
    spacer.style.height = `${spec.spacerHeight}px`;
    spacer.style.pointerEvents = 'none';
    spacer.style.userSelect = 'none';
    spacer.style.background = 'transparent';
    spacer.contentEditable = 'false';
    return spacer;
}

function buildDecorationSet(doc, breaks, enabled) {
    if (!enabled || !breaks || breaks.length === 0) {
        return DecorationSet.empty;
    }
    const decorations = [];
    const docSize = doc.content.size;
    for (const b of breaks) {
        if (b.pos > 0 && b.pos < docSize) {
            decorations.push(
                Decoration.widget(
                    b.pos,
                    () => createVirtualBreakDOM(b),
                    {
                        side: -1,
                        key: `a4-vbreak-${b.sheetIndex}-${b.pos}`,
                        marks: [],
                    }
                )
            );
        }
    }
    return DecorationSet.create(doc, decorations);
}

export function getLiveVirtualBreaks(state) {
    const pluginState = a4PaginationPluginKey.getState(state);
    return pluginState?.breaks ?? [];
}

/**
 * Plugin ProseMirror para paginación A4 virtual móvil.
 * Opera en la capa de decoraciones sin alterar Yjs ni el documento persistente.
 */
export function createA4PaginationPlugin(options = {}) {
    return new Plugin({
        key: a4PaginationPluginKey,
        state: {
            init() {
                const enabled = options.enabled ?? true;
                return {
                    breaks: [],
                    enabled,
                    decorations: DecorationSet.empty,
                };
            },
            apply(tr, prevState, _, newState) {
                const meta = tr.getMeta(a4PaginationPluginKey);
                if (meta && typeof meta === 'object') {
                    const nextEnabled = typeof meta.enabled === 'boolean' ? meta.enabled : prevState.enabled;
                    const nextBreaks = Array.isArray(meta.breaks) ? meta.breaks : prevState.breaks;
                    const nextDecorations = buildDecorationSet(newState.doc, nextBreaks, nextEnabled);
                    return {
                        breaks: nextBreaks,
                        enabled: nextEnabled,
                        decorations: nextDecorations,
                    };
                }

                if (tr.docChanged && prevState.enabled) {
                    const mappedDecorations = prevState.decorations !== DecorationSet.empty
                        ? prevState.decorations.map(tr.mapping, newState.doc)
                        : DecorationSet.empty;

                    const mappedBreaks = prevState.breaks.map((b) => ({
                        ...b,
                        pos: tr.mapping.map(b.pos, -1),
                    }));

                    return {
                        ...prevState,
                        breaks: mappedBreaks,
                        decorations: mappedDecorations,
                    };
                }

                return prevState;
            },
        },
        props: {
            decorations(state) {
                const pluginState = a4PaginationPluginKey.getState(state);
                if (!pluginState || !pluginState.enabled) {
                    return DecorationSet.empty;
                }
                return pluginState.decorations;
            },
            handleKeyDown(view, event) {
                const pluginState = a4PaginationPluginKey.getState(view.state);
                if (!pluginState || !pluginState.enabled || pluginState.breaks.length === 0) {
                    return false;
                }

                const { selection } = view.state;
                if (!(selection instanceof TextSelection) || !selection.empty) {
                    return false;
                }

                const head = selection.head;

                for (const b of pluginState.breaks) {
                    if (Math.abs(head - b.pos) > 4) {
                        continue;
                    }
                    const from = Math.min(head, b.pos);
                    const to = Math.max(head, b.pos);
                    const textBetween = view.state.doc.textBetween(from, to);
                    const isOnlyWhitespace = /^\s*$/.test(textBetween);

                    if (event.key === 'ArrowDown' && head < b.pos && isOnlyWhitespace) {
                        const nextPos = Math.min(view.state.doc.content.size - 1, b.pos);
                        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPos)));
                        return true;
                    }

                    if (event.key === 'ArrowUp' && head >= b.pos && isOnlyWhitespace) {
                        const prevPos = Math.max(1, b.pos - 1);
                        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, prevPos)));
                        return true;
                    }

                    if (event.key === 'ArrowRight' && head < b.pos && isOnlyWhitespace) {
                        const nextPos = Math.min(view.state.doc.content.size - 1, b.pos);
                        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPos)));
                        return true;
                    }

                    if (event.key === 'ArrowLeft' && head >= b.pos && isOnlyWhitespace) {
                        const prevPos = Math.max(1, b.pos - 1);
                        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, prevPos)));
                        return true;
                    }
                }

                if (event.key === 'Backspace') {
                    for (const b of pluginState.breaks) {
                        if (head === b.pos) {
                            return false;
                        }
                    }
                }

                return false;
            },
        },
    });
}
