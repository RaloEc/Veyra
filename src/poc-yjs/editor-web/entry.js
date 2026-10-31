import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { ySyncPluginKey, yCursorPluginKey, absolutePositionToRelativePosition } from 'y-prosemirror';
import { DOMSerializer } from 'prosemirror-model';

// Conversión binaria Uint8Array <-> Base64
function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToUint8Array(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Inicialización de Yjs Doc y Awareness dentro del WebView
const ydoc = new Y.Doc();
const awareness = new awarenessProtocol.Awareness(ydoc);

let currentUser = {
    name: 'Usuario ' + Math.floor(Math.random() * 1000),
    color: '#8B5CF6',
    isEditing: false
};

let isAwarenessDestroyed = false;
let areCursorsVisible = true;
let lastClickedImagePos = null;

const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => {
                    if (!attributes.style) return {};
                    return { style: attributes.style };
                }
            }
        };
    }
}).configure({
    inline: false
});

// Reglas CSS dinámicas para ocultar cursores en modo visualización
if (typeof document !== 'undefined') {
    const styleId = 'veyra-cursor-visibility-styles';
    if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            .veyra-no-cursors .collaboration-cursor__caret,
            .veyra-no-cursors .collaboration-cursor__label,
            .veyra-no-cursors .ProseMirror-yjs-cursor {
                display: none !important;
                visibility: hidden !important;
            }

            .veyra-no-cursors .ProseMirror-yjs-selection,
            .veyra-no-cursors .collaboration-cursor__selection {
                background-color: transparent !important;
                background: transparent !important;
                border-color: transparent !important;
                /* NO usar display: none, NO usar visibility: hidden */
            }
        `;
        (document.head || document.documentElement).appendChild(styleEl);
    }
}

// Evitar que Tiptap/ProseMirror bloquee el gesto nativo de pinch-to-zoom
if (typeof document !== 'undefined') {
    document.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 1) {
            e.stopPropagation(); // Deja que el navegador maneje el pinch-to-zoom
        }
    }, { passive: false });
}

// Evitar que pérdidas temporales de foco DOM en Android borren el cursor colaborativo
const originalSetLocalStateField = awareness.setLocalStateField.bind(awareness);
awareness.setLocalStateField = function(field, value) {
    if (isAwarenessDestroyed) return;
    if (field === 'cursor' && !areCursorsVisible) {
        return originalSetLocalStateField('cursor', null);
    }
    if (field === 'cursor' && value === null) {
        // En móvil no borramos el cursor por simple pérdida de foco DOM (ej. tocar toolbar o scroll)
        return;
    }
    // Si el estado local era null y no está destruido, inicializar con user
    if (awareness.getLocalState() === null) {
        awareness.setLocalState({
            user: currentUser,
            [field]: value
        });
        return;
    }
    return originalSetLocalStateField(field, value);
};

awareness.setLocalStateField('user', currentUser);

const providerMock = {
    awareness: awareness
};

let editor = null;
let currentFragmentName = (typeof window !== 'undefined' && window.VEYRA_INITIAL_PAGE_ID) ? window.VEYRA_INITIAL_PAGE_ID : 'default';

function logToNative(origin, action, sizeBytes, extra = {}) {
    sendToNative({
        type: 'YJS_LOG',
        log: {
            origin,
            action,
            fragment: currentFragmentName,
            sizeBytes: sizeBytes || 0,
            timestamp: Date.now(),
            ...extra
        }
    });
}

let toolbarStateTimer = null;
function getToolbarState() {
    if (!editor) return null;
    const isTaskList = editor.isActive('taskList');
    const isOrderedList = !isTaskList && editor.isActive('orderedList');
    const isBulletList = !isTaskList && !isOrderedList && editor.isActive('bulletList');
    return {
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
        isBold: editor.isActive('bold'),
        isItalic: editor.isActive('italic'),
        isUnderline: editor.isActive('underline'),
        isStrike: editor.isActive('strike'),
        isH1: editor.isActive('heading', { level: 1 }),
        isH2: editor.isActive('heading', { level: 2 }),
        isBlockquote: editor.isActive('blockquote'),
        isBulletList,
        isOrderedList,
        isTaskList,
        textAlign: editor.isActive({ textAlign: 'center' })
            ? 'center'
            : editor.isActive({ textAlign: 'right' })
            ? 'right'
            : editor.isActive({ textAlign: 'justify' })
            ? 'justify'
            : 'left',
        textColor: (editor.getAttributes('textStyle') && editor.getAttributes('textStyle').color) || null,
        highlightColor: (editor.getAttributes('highlight') && editor.getAttributes('highlight').color) || (editor.isActive('highlight') ? 'rgba(250, 204, 21, 0.35)' : null),
        fontFamily: (editor.getAttributes('textStyle') && editor.getAttributes('textStyle').fontFamily) || null,
    };
}

function notifyToolbarStateChanged() {
    if (toolbarStateTimer) clearTimeout(toolbarStateTimer);
    toolbarStateTimer = setTimeout(() => {
        const state = getToolbarState();
        if (state) {
            sendToNative({
                type: 'TOOLBAR_STATE_CHANGED',
                ...state
            });
        }
    }, 100);
}

function initEditor(fragmentName) {
    if (typeof window !== 'undefined' && window.VEYRA_INITIAL_THEME && typeof window.veyraSetTheme === 'function') {
        window.veyraSetTheme(window.VEYRA_INITIAL_THEME);
    }
    const editorElement = document.getElementById('editor');
    if (!editorElement) return;

    if (typeof fragmentName === 'string' && fragmentName.trim() !== '') {
        currentFragmentName = fragmentName.trim();
    }

    const pageIdActivo = currentFragmentName;
    const fragmentLength = ydoc.getXmlFragment(pageIdActivo).length;
    console.log('[YJS-DIAG] estado inicial doc', { pageIdActivo, fragmentLength });
    sendToNative({
        type: 'DIAG_LOG',
        message: '[YJS-DIAG] estado inicial doc',
        payload: { pageIdActivo, fragmentLength }
    });
    sendToNative({
        type: 'DIAG_LOG_REMOTE',
        event: 'editor_mount',
        payload: { pageIdActivo, fragmentLength }
    });

    if (editor) {
        try {
            editor.destroy();
        } catch (_) {}
        editor = null;
    }

    editor = new Editor({
        element: editorElement,
        extensions: [
            StarterKit.configure({
                history: false,
                heading: {
                    levels: [1, 2, 3]
                }
            }),
            Underline,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            FontFamily,
            TextAlign.configure({
                types: ['heading', 'paragraph', 'image']
            }),
            CustomImage,
            TaskList,
            TaskItem.configure({
                nested: true,
                onReadOnlyChecked: () => true
            }),
            Collaboration.configure({
                document: ydoc,
                field: currentFragmentName
            }),
            CollaborationCursor.configure({
                provider: providerMock,
                user: currentUser,
                render: (user) => {
                    const cursor = document.createElement('span');
                    cursor.classList.add('collaboration-cursor__caret');
                    cursor.setAttribute('style', `border-left-color: ${user.color || '#8B5CF6'} !important; border-color: ${user.color || '#8B5CF6'} !important;`);

                    const label = document.createElement('div');
                    label.classList.add('collaboration-cursor__label');
                    label.setAttribute('style', `background-color: ${user.color || '#8B5CF6'} !important;`);
                    label.insertBefore(document.createTextNode(user.name || 'Invitado'), null);

                    const space1 = document.createTextNode('\u2060');
                    const space2 = document.createTextNode('\u2060');
                    cursor.insertBefore(space1, null);
                    cursor.insertBefore(label, null);
                    cursor.insertBefore(space2, null);

                    return cursor;
                }
            })
        ],
        onTransaction: () => {
            notifyToolbarStateChanged();
        },
        onUpdate: () => {
            const isTaskList = editor ? editor.isActive('taskList') : false;
            const isOrderedList = !isTaskList && editor ? editor.isActive('orderedList') : false;
            const isBulletList = !isTaskList && !isOrderedList && editor ? editor.isActive('bulletList') : false;
            sendToNative({
                type: 'CONTENT_CHANGED',
                canUndo: editor ? editor.can().undo() : false,
                canRedo: editor ? editor.can().redo() : false,
                isBold: editor ? editor.isActive('bold') : false,
                isItalic: editor ? editor.isActive('italic') : false,
                isBulletList,
                isOrderedList,
                isTaskList,
            });
            notifyToolbarStateChanged();
            if (areCursorsVisible) {
                updateLocalCursor();
            }
            window.veyraBroadcastAwareness();
        },
        onSelectionUpdate: () => {
            const isTaskList = editor ? editor.isActive('taskList') : false;
            const isOrderedList = !isTaskList && editor ? editor.isActive('orderedList') : false;
            const isBulletList = !isTaskList && !isOrderedList && editor ? editor.isActive('bulletList') : false;
            sendToNative({
                type: 'SELECTION_CHANGED',
                canUndo: editor ? editor.can().undo() : false,
                canRedo: editor ? editor.can().redo() : false,
                isBold: editor ? editor.isActive('bold') : false,
                isItalic: editor ? editor.isActive('italic') : false,
                isBulletList,
                isOrderedList,
                isTaskList,
            });
            notifyToolbarStateChanged();
            if (areCursorsVisible) {
                updateLocalCursor();
            }
            window.veyraBroadcastAwareness();

            // Gestión de selección de texto y coordenadas para menú flotante (Tooltip)
            try {
                if (editor && editor.state && editor.state.selection) {
                    const { from, to } = editor.state.selection;
                    if (from !== to) {
                        const fromCoords = editor.view.coordsAtPos(from);
                        const toCoords = editor.view.coordsAtPos(to);
                        const topY = Math.min(fromCoords.top, toCoords.top);
                        const bottomY = Math.max(fromCoords.bottom, toCoords.bottom);
                        const leftX = Math.min(fromCoords.left, toCoords.left);
                        const rightX = Math.max(fromCoords.right, toCoords.right);
                        const width = Math.max(1, Math.abs(rightX - leftX));
                        const height = Math.max(1, Math.abs(bottomY - topY));
                        const centerX = leftX + (width / 2);
                        const selectedText = editor.state.doc.textBetween(from, to, ' ');

                        sendToNative({
                            type: 'TEXT_SELECTED',
                            rect: { x: centerX, y: topY, width, height, top: topY, bottom: bottomY, left: leftX, right: rightX },
                            text: selectedText,
                            hasText: true,
                        });
                    } else {
                        sendToNative({ type: 'TEXT_SELECTED', hasText: false });
                    }
                }
            } catch (selErr) {
                console.warn('[YJS-SELECTION] error calculando coords:', selErr);
            }
        }
    });

    if (editor && editor.view && editor.view.dom) {
        editor.view.dom.addEventListener('scroll', () => {
            sendToNative({ type: 'TEXT_SELECTED', hasText: false });
            sendToNative({ type: 'IMAGE_DISMISSED' });
        }, { passive: true });
        editor.view.dom.addEventListener('focus', () => {
            if (areCursorsVisible) {
                updateLocalCursor();
                window.veyraBroadcastAwareness();
            }
        });
        editor.view.dom.addEventListener('click', (e) => {
            if (areCursorsVisible) {
                updateLocalCursor();
                window.veyraBroadcastAwareness();
            }

            const target = e.target;

            // Interacción con click en imagen: abrir visor / menú tooltip en React Native
            if (target && target.tagName === 'IMG') {
                try {
                    const pos = editor.view.posAtDOM(target, 0);
                    lastClickedImagePos = pos;
                    if (typeof pos === 'number' && pos >= 0 && editor.isEditable) {
                        editor.chain().setNodeSelection(pos).run();
                    }
                } catch (_) {}
                let rect = null;
                try {
                    const r = target.getBoundingClientRect();
                    rect = {
                        x: r.left + (r.width / 2),
                        y: r.top,
                        width: r.width,
                        height: r.height,
                        top: r.top,
                        bottom: r.bottom,
                        left: r.left,
                        right: r.right,
                    };
                } catch (_) {}
                sendToNative({ type: 'IMAGE_CLICKED', url: target.src, rect });
            } else {
                sendToNative({ type: 'IMAGE_DISMISSED' });
            }

            // Manejo táctil de Checklist / TaskItem (tanto en modo edición como en modo lectura)
            const label = target && target.closest ? target.closest('li[data-type="taskItem"] > label, li[data-type="task-item"] > label') : null;
            if (label) {
                const isReadOnly = !editor.isEditable || (editor.view && editor.view.dom && editor.view.dom.getAttribute('contenteditable') === 'false');
                const input = label.querySelector('input[type="checkbox"]');
                const isHiddenInput = input && (getComputedStyle(input).display === 'none' || input.style.display === 'none');

                if (isReadOnly || isHiddenInput) {
                    e.preventDefault();
                    e.stopPropagation();
                    const li = label.closest('li');
                    if (li) {
                        try {
                            const pos = editor.view.posAtDOM(li, 0);
                            let targetPos = pos;
                            let node = editor.state.doc.nodeAt(pos);
                            if (!node || (node.type.name !== 'taskItem' && node.type.name !== 'task_item')) {
                                const $pos = editor.state.doc.resolve(pos);
                                for (let d = $pos.depth; d > 0; d--) {
                                    const parent = $pos.node(d);
                                    if (parent && (parent.type.name === 'taskItem' || parent.type.name === 'task_item')) {
                                        node = parent;
                                        targetPos = $pos.before(d);
                                        break;
                                    }
                                }
                            }
                            if (node && (node.type.name === 'taskItem' || node.type.name === 'task_item')) {
                                const nextChecked = !node.attrs.checked;
                                const tr = editor.state.tr.setNodeMarkup(targetPos, undefined, {
                                    ...node.attrs,
                                    checked: nextChecked,
                                });
                                editor.view.dispatch(tr);
                                notifyToolbarStateChanged();
                            }
                        } catch (err) {
                            console.warn('Error al alternar taskItem:', err);
                        }
                    }
                }
            }
        });
        editor.view.dom.addEventListener('keyup', () => {
            if (areCursorsVisible) {
                updateLocalCursor();
                window.veyraBroadcastAwareness();
            }
        });
        editor.view.dom.addEventListener('touchend', () => {
            if (areCursorsVisible) {
                updateLocalCursor();
                window.veyraBroadcastAwareness();
            }
        });
    }

    setTimeout(() => {
        trySetInitialCursor(0);
    }, 200);

    let contentRenderedTimer = null;
    let hasSentContentRendered = false;

    const measureAndNotify = () => {
        if (!hasSentContentRendered) {
            hasSentContentRendered = true;
            // Esperar a que Chromium pinte el DOM en el siguiente frame
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    sendToNative({ type: 'CONTENT_RENDERED', timestamp: Date.now() });
                    try {
                        const pEl = document.querySelector('.ProseMirror p');
                        if (pEl) {
                            const rect = pEl.getBoundingClientRect();
                            sendToNative({
                                type: 'WIDTH_MEASURE',
                                width: rect.width,
                                fontSize: getComputedStyle(pEl).fontSize,
                                lineHeight: getComputedStyle(pEl).lineHeight,
                            });
                        }
                    } catch (_) {}
                });
            });
        }
    };

    editor.on('update', () => {
        if (contentRenderedTimer) clearTimeout(contentRenderedTimer);
        contentRenderedTimer = setTimeout(() => {
            measureAndNotify();
        }, 400);
    });

    // También emitir después del primer render si no hay updates (nota sin cambios pendientes)
    setTimeout(() => {
        measureAndNotify();
    }, 1500);

    sendToNative({ type: 'EDITOR_READY' });
}

// Actualiza el cursor local en awareness a partir de la selección ProseMirror real
function updateLocalCursor() {
    if (!areCursorsVisible) return false;
    try {
        if (!editor || !editor.view) return false;
        const ystate = ySyncPluginKey.getState(editor.view.state);
        if (!ystate || !ystate.binding || !ystate.type) return false;

        const mapping = ystate.binding.mapping || new Map();
        const sel = editor.state.selection;
        const docSize = editor.view.state.doc.content.size;

        let anchorPos = 1;
        let headPos = 1;

        if (sel && typeof sel.anchor === 'number' && typeof sel.head === 'number') {
            anchorPos = Math.max(1, Math.min(docSize - 1, sel.anchor));
            headPos = Math.max(1, Math.min(docSize - 1, sel.head));
        } else {
            anchorPos = Math.max(1, Math.min(docSize - 1, 1));
            headPos = anchorPos;
        }

        const anchor = absolutePositionToRelativePosition(anchorPos, ystate.type, mapping);
        const head = absolutePositionToRelativePosition(headPos, ystate.type, mapping);

        if (anchor && head) {
            originalSetLocalStateField('cursor', { anchor, head });
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// Reintenta fijar el cursor inicial y emite awareness cuando esté listo
function trySetInitialCursor(attempt = 0) {
    if (!areCursorsVisible) {
        originalSetLocalStateField('cursor', null);
        window.veyraBroadcastAwareness();
        return;
    }
    const success = updateLocalCursor();
    if (!success && attempt < 10) {
        setTimeout(() => trySetInitialCursor(attempt + 1), 300);
    } else {
        window.veyraBroadcastAwareness();
    }
}

function sendToNative(data) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
}

// 1. Emisión de deltas locales hacia React Native (filtra orígenes de servidor)
ydoc.on('update', (update, origin) => {
    // 1. PREVIEW_UPDATE para TODOS los origins (local + remoto)
    try {
        const preview = derivePreviewTextFromYDoc(ydoc);
        sendToNative({ type: 'PREVIEW_UPDATE', preview, origin: String(origin || 'local') });
    } catch (e) {
        console.warn('[YJS-PREVIEW] error derivando preview:', e);
    }

    // 2. Filtro por origin SOLO para YJS_UPDATE y ACTIVITY_SNIPPET (evitar eco)
    const isRemote =
        origin === 'remote-replay-load' ||
        origin === 'remote-broadcast' ||
        origin === 'remote' ||
        origin === 'sqlite-load' ||
        origin === 'repair-replay' ||
        (typeof origin === 'string' && (origin.startsWith('remote') || origin.startsWith('sqlite')));

    if (isRemote) {
        // viene del servidor, caché o replay, NO re-emitir
        return;
    }

    // 2.1 Emisión de ACTIVITY_SNIPPET con texto contextual alrededor de la selección actual (solo local)
    try {
        if (editor && editor.state) {
            const { from, to } = editor.state.selection || { from: 0, to: 0 };
            let contextualText = '';
            if (editor.state.doc && typeof editor.state.doc.textBetween === 'function') {
                const docSize = editor.state.doc.content ? editor.state.doc.content.size : 0;
                const startPos = Math.max(0, from - 50);
                const endPos = Math.min(docSize, to + 50);
                if (startPos < endPos) {
                    contextualText = editor.state.doc.textBetween(startPos, endPos, ' ');
                }
            }
            if (!contextualText && typeof editor.getText === 'function') {
                const fullText = editor.getText();
                const startIdx = Math.max(0, from - 50);
                const endIdx = Math.min(fullText.length, to + 50);
                contextualText = fullText.substring(startIdx, endIdx);
            }
            if (contextualText && contextualText.trim()) {
                sendToNative({ type: 'ACTIVITY_SNIPPET', snippet: contextualText.trim() });
            }

            // 2.2 Emisión de ACTIVITY_SNIPPET_HTML con HTML contextual del bloque actual
            const $from = editor.state.doc.resolve(from);
            const currentNode = $from.parent;
            if (currentNode && (currentNode.textContent.trim() || currentNode.childCount > 0)) {
                const serializer = DOMSerializer.fromSchema(editor.schema);
                const domNode = serializer.serializeNode(currentNode);
                const container = document.createElement('div');
                container.appendChild(domNode);
                let snippetHtml = container.innerHTML || '';
                snippetHtml = snippetHtml.replace(/\s+/g, ' ').trim();
                if (snippetHtml.length > 300) {
                    snippetHtml = snippetHtml.substring(0, 300);
                }
                if (snippetHtml) {
                    sendToNative({ type: 'ACTIVITY_SNIPPET_HTML', snippetHtml });
                }
            }
        }
    } catch (err) {
        console.warn('[YJS-SNIPPET] error extrayendo fragmento contextual:', err);
    }

    // 3. YJS_UPDATE solo para origins locales
    const base64Update = uint8ArrayToBase64(update);
    logToNative('local-editor', 'update-emit', update.byteLength);
    sendToNative({
        type: 'YJS_UPDATE',
        update: base64Update
    });
});

// 2. Emisión de Awareness local hacia React Native
// Solo emitimos si el cambio es de origen local y afecta a nuestro propio clientID
// NUNCA re-transmitimos purgas de pares remotos ('timeout-purge', 'peer-left', 'remote')
awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin !== 'remote' && origin !== 'timeout-purge' && origin !== 'peer-left') {
        const affectsSelf = added.includes(ydoc.clientID) || updated.includes(ydoc.clientID) || removed.includes(ydoc.clientID);
        if (affectsSelf) {
            const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(awareness, [ydoc.clientID]);
            sendToNative({
                type: 'AWARENESS_UPDATE',
                update: uint8ArrayToBase64(awarenessUpdate)
            });
        }
    }
});

// 3. Watchdog de presencia (TTL de 5 segundos para entornos móviles)
// Si un cliente remoto no renueva su señal en más de 5 segundos, se purga localmente sin re-emitir
const clientLastSeen = new Map();
const peerSenderMap = new Map(); // senderClientId -> Set of Yjs clientIds
const clientToSenderMap = new Map(); // Yjs clientId -> senderClientId

awareness.on('change', () => {
    const now = Date.now();
    awareness.getStates().forEach((state, clientId) => {
        if (clientId !== ydoc.clientID) {
            clientLastSeen.set(clientId, now);
        }
    });
});

setInterval(() => {
    const now = Date.now();
    const staleClients = [];
    clientLastSeen.forEach((lastSeen, clientId) => {
        if (now - lastSeen > 5000) {
            staleClients.push(clientId);
        }
    });

    if (staleClients.length > 0) {
        staleClients.forEach(cid => {
            clientLastSeen.delete(cid);
            clientToSenderMap.delete(cid);
        });
        awarenessProtocol.removeAwarenessStates(awareness, staleClients, 'timeout-purge');
        if (editor && editor.view && !editor.isDestroyed) {
            try {
                const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
                editor.view.dispatch(tr);
            } catch (_) {}
        }
        logToNative('watchdog', 'purge-stale-carets', 0, { purgedClients: staleClients.length });
    }
}, 1500);

// Re-broadcast periódico del awareness local (cada 5s) para mantener cursores
// visibles en pares remotos incluso tras reconexiones o pérdidas de paquetes.
setInterval(() => {
    try {
        if (isAwarenessDestroyed) return;
        const localState = awareness.getLocalState();
        if (localState && localState.user) {
            const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(awareness, [ydoc.clientID]);
            sendToNative({
                type: 'AWARENESS_UPDATE',
                update: uint8ArrayToBase64(awarenessUpdate)
            });
        }
    } catch (_) {}
}, 5000);

// =========================================================================
// APIs expuestas a React Native para el Puente con Supabase Realtime
// =========================================================================

// Emite el estado de Awareness local para mantener cursores visibles
window.veyraBroadcastAwareness = function() {
    try {
        if (isAwarenessDestroyed || awareness.getLocalState() === null) return;
        updateLocalCursor();
        const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(awareness, [ydoc.clientID]);
        sendToNative({
            type: 'AWARENESS_UPDATE',
            update: uint8ArrayToBase64(awarenessUpdate)
        });
    } catch (e) {
        console.error('Error emitiendo broadcast awareness:', e);
    }
};

// Renueva la marca de tiempo de actividad de un par remoto recibido por Heartbeat
window.veyraTouchPeer = function(remoteClientId) {
    const now = Date.now();
    if (typeof remoteClientId === 'number') {
        clientLastSeen.set(remoteClientId, now);
    } else if (typeof remoteClientId === 'string' && peerSenderMap.has(remoteClientId)) {
        const peerSet = peerSenderMap.get(remoteClientId);
        peerSet.forEach(cid => clientLastSeen.set(cid, now));
    } else {
        // Renovar todos los clientes remotos registrados
        awareness.getStates().forEach((_, cid) => {
            if (cid !== ydoc.clientID) clientLastSeen.set(cid, now);
        });
    }
};

// Aplica delta remoto recibido de Supabase (individual o batch)
window.veyraApplyUpdate = function(base64Payload, customOrigin) {
    try {
        const originRemoto = customOrigin || 'remote-broadcast';
        let payload = base64Payload;
        if (typeof base64Payload === 'string' && base64Payload.startsWith('[')) {
            payload = JSON.parse(base64Payload);
        }

        let totalBytes = 0;
        if (Array.isArray(payload)) {
            const updates = payload.map(b64 => base64ToUint8Array(b64));
            totalBytes = updates.reduce((acc, u) => acc + (u?.byteLength ?? 0), 0);
            console.log('[YJS-DIAG] aplicando update remoto', { origin: originRemoto, bytes: totalBytes, count: updates.length });
            sendToNative({
                type: 'DIAG_LOG',
                message: '[YJS-DIAG] aplicando update remoto',
                payload: { origin: originRemoto, bytes: totalBytes, count: updates.length }
            });
            ydoc.transact(() => {
                for (const u of updates) {
                    Y.applyUpdate(ydoc, u, originRemoto);
                }
            }, originRemoto);
        } else {
            const update = base64ToUint8Array(payload);
            totalBytes = update?.byteLength ?? update?.length ?? 0;
            console.log('[YJS-DIAG] aplicando update remoto', { origin: originRemoto, bytes: totalBytes });
            sendToNative({
                type: 'DIAG_LOG',
                message: '[YJS-DIAG] aplicando update remoto',
                payload: { origin: originRemoto, bytes: totalBytes }
            });
            Y.applyUpdate(ydoc, update, originRemoto);
        }

        logToNative('remote-peer', 'apply-update-success', totalBytes);
        sendToNative({ type: 'APPLY_UPDATE_ACK', success: true });

        // Si el fragmento actual es 'default', pero el documento tiene pageOrder definido
        // y no se ha fijado explícitamente otra página, sincronizar a la primera página de la nota
        const pageOrder = ydoc.getArray('pageOrder');
        if (currentFragmentName === 'default' && pageOrder.length > 0 && !(typeof window !== 'undefined' && window.VEYRA_EXPLICIT_PAGE_SET)) {
            const firstPageId = pageOrder.get(0);
            if (firstPageId && firstPageId !== currentFragmentName) {
                initEditor(firstPageId);
                return;
            }
        }

        // Actualizar cursor local sobre la nueva estructura y forzar refresco de cursores remotos
        updateLocalCursor();
        if (editor && editor.view && !editor.isDestroyed) {
            try {
                const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
                editor.view.dispatch(tr);
            } catch (_) {}
        }

        const pageIdActivo = currentFragmentName;
        sendToNative({
            type: 'DIAG_LOG_REMOTE',
            event: 'after_initial_load',
            payload: {
                pageIdActivo,
                fragmentLength: ydoc.getXmlFragment(pageIdActivo).length,
                docXml: ydoc.getXmlFragment(pageIdActivo).toString().slice(0, 300)
            }
        });
    } catch (e) {
        console.error('Error aplicando update Yjs remoto:', e);
        logToNative('remote-peer', 'apply-update-error', 0, { error: String(e) });
    }
};

window.veyraSetPage = function(pageId) {
    if (!pageId || typeof pageId !== 'string' || pageId === currentFragmentName) return;
    if (typeof window !== 'undefined') {
        window.VEYRA_EXPLICIT_PAGE_SET = true;
    }
    initEditor(pageId);
    logToNative('local-editor', 'switch-page', 0, { pageId });
};

window.veyraGetActivePage = function() {
    return currentFragmentName;
};

// Aplica actualización de Awareness remota recibida de Supabase
window.veyraApplyAwareness = function(base64Awareness, senderClientId) {
    try {
        const update = base64ToUint8Array(base64Awareness);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, 'remote');

        if (senderClientId) {
            let peerSet = peerSenderMap.get(senderClientId);
            if (!peerSet) {
                peerSet = new Set();
                peerSenderMap.set(senderClientId, peerSet);
            }
            awareness.getStates().forEach((state, cid) => {
                if (cid !== ydoc.clientID && state) {
                    peerSet.add(cid);
                    clientToSenderMap.set(cid, senderClientId);
                }
            });
        }

        // Forzar inmediatamente re-evaluación del yCursorPlugin de ProseMirror
        if (editor && editor.view && !editor.isDestroyed) {
            try {
                const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
                editor.view.dispatch(tr);
            } catch (_) {}
        }

        // Notificar a React Native sobre los pares remotos activos
        const peers = [];
        awareness.getStates().forEach((state, cid) => {
            if (cid !== ydoc.clientID && state && state.user) {
                peers.push({
                    clientId: cid,
                    userId: state.user.id || state.user.userId || null,
                    name: state.user.name || 'Invitado',
                    color: state.user.color || '#8B5CF6',
                    hasCursor: Boolean(state.cursor),
                    isEditing: Boolean(state.user.isEditing ?? state.isEditing),
                });
            }
        });
        sendToNative({
            type: 'AWARENESS_PEERS_CHANGED',
            peers
        });
    } catch (e) {
        console.error('Error aplicando Awareness remoto:', e);
    }
};

// Elimina inmediatamente un par específico por su client ID o retiro voluntario
window.veyraRemovePeer = function(remoteClientId) {
    try {
        const toRemove = [];
        if (typeof remoteClientId === 'number') {
            toRemove.push(remoteClientId);
        } else if (typeof remoteClientId === 'string' && peerSenderMap.has(remoteClientId)) {
            const peerSet = peerSenderMap.get(remoteClientId);
            peerSet.forEach(cid => toRemove.push(cid));
            peerSenderMap.delete(remoteClientId);
        } else {
            awareness.getStates().forEach((state, cid) => {
                if (cid !== ydoc.clientID) {
                    if (
                        remoteClientId === 'ALL' ||
                        remoteClientId === true ||
                        !remoteClientId ||
                        remoteClientId === 'peer' ||
                        (state && state.user && (state.user.id === remoteClientId || state.user.name?.includes(remoteClientId))) ||
                        clientToSenderMap.get(cid) === remoteClientId
                    ) {
                        toRemove.push(cid);
                    }
                }
            });
            // Si no encontró coincidencia exacta pero se recibió un remoteClientId y existen clientes remotos,
            // purgar los clientes remotos registrados
            if (toRemove.length === 0 && remoteClientId) {
                awareness.getStates().forEach((_, cid) => {
                    if (cid !== ydoc.clientID) toRemove.push(cid);
                });
            }
        }

        if (toRemove.length > 0) {
            toRemove.forEach(cid => {
                clientLastSeen.delete(cid);
                clientToSenderMap.delete(cid);
            });
            awarenessProtocol.removeAwarenessStates(awareness, toRemove, 'peer-left');
        }

        if (editor && editor.view && !editor.isDestroyed) {
            try {
                const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
                editor.view.dispatch(tr);
            } catch (_) {}
        }

        // Notificar cambio de lista de pares a React Native
        const peers = [];
        awareness.getStates().forEach((state, cid) => {
            if (cid !== ydoc.clientID && state && state.user) {
                peers.push({
                    clientId: cid,
                    userId: state.user.id || state.user.userId || null,
                    name: state.user.name || 'Invitado',
                    color: state.user.color || '#8B5CF6',
                    hasCursor: Boolean(state.cursor),
                    isEditing: Boolean(state.user.isEditing ?? state.isEditing),
                });
            }
        });
        sendToNative({
            type: 'AWARENESS_PEERS_CHANGED',
            peers
        });

        logToNative('provider', 'peer-removed', 0, { removedCount: toRemove.length });
    } catch (e) {
        console.error('Error en veyraRemovePeer:', e);
    }
};

// Solicita a este WebView generar su StateVector para el Handshake inicial (SYNC_STEP_1)
window.veyraRequestSyncStep1 = function(correlationId) {
    try {
        const sv = Y.encodeStateVector(ydoc);
        logToNative('handshake', 'generate-sync-step-1', sv.byteLength);
        sendToNative({
            type: 'YJS_SYNC_STEP_1',
            sv: uint8ArrayToBase64(sv),
            correlationId: correlationId || null
        });
        window.veyraBroadcastAwareness();
    } catch (e) {
        console.error('Error generando SYNC_STEP_1:', e);
    }
};

// Recibe el StateVector de un colaborador remoto:
// 1. Calcula la diferencia exacta que le falta al par (SYNC_STEP_2)
// 2. Y también genera su propio StateVector para que el otro par responda con lo que falta (Bidireccional)
window.veyraHandleSyncStep1 = function(base64RemoteSv, correlationId, isReturnHandshake = false) {
    try {
        const remoteSv = base64ToUint8Array(base64RemoteSv);
        const diffUpdate = Y.encodeStateAsUpdate(ydoc, remoteSv);
        logToNative('handshake', 'generate-sync-step-2', diffUpdate.byteLength, { isReturnHandshake });

        sendToNative({
            type: 'YJS_SYNC_STEP_2',
            update: uint8ArrayToBase64(diffUpdate),
            correlationId: correlationId || null
        });

        // Enviar también awareness local para que el par remoto vea inmediatamente nuestro cursor
        window.veyraBroadcastAwareness();

        // Si este handshake fue iniciado por el otro par (no es un retorno), enviamos también nuestro StateVector
        // para garantizar que la reconciliación sea MUTUA y BIDIRECCIONAL.
        if (!isReturnHandshake) {
            const localSv = Y.encodeStateVector(ydoc);
            sendToNative({
                type: 'YJS_SYNC_STEP_1',
                sv: uint8ArrayToBase64(localSv),
                correlationId: correlationId || null,
                isReturnHandshake: true
            });
        }
    } catch (e) {
        console.error('Error procesando SYNC_STEP_1:', e);
    }
};

// Destruye o limpia el estado de Awareness al desconectar o pasar a segundo plano
window.veyraDestroyAwareness = function() {
    try {
        isAwarenessDestroyed = true;
        awareness.setLocalState(null);
        logToNative('lifecycle', 'destroy-awareness-local', 0);
    } catch (e) {
        console.error('Error destruyendo awareness:', e);
    }
};

// Reactiva la presencia local cuando la app vuelve a primer plano
window.veyraRestoreAwareness = function() {
    try {
        isAwarenessDestroyed = false;
        awareness.setLocalState({
            user: currentUser
        });
        updateLocalCursor();
        window.veyraBroadcastAwareness();
        logToNative('lifecycle', 'restore-awareness-local', 0);
    } catch (e) {
        console.error('Error restaurando awareness:', e);
    }
};

// Configuración de usuario local
window.veyraSetUser = function(name, color, isEditing, userId) {
    currentUser = {
        id: userId || (currentUser ? currentUser.id : null),
        name,
        color,
        isEditing: typeof isEditing === 'boolean' ? isEditing : (currentUser ? Boolean(currentUser.isEditing) : false)
    };
    awareness.setLocalStateField('user', currentUser);
    if (editor && editor.commands && editor.commands.updateUser) {
        editor.commands.updateUser(currentUser);
    }
    window.veyraBroadcastAwareness();
};

window.veyraSetEditing = function(isEditing) {
    if (currentUser) {
        currentUser.isEditing = Boolean(isEditing);
    }
    awareness.setLocalStateField('user', currentUser);
    window.veyraBroadcastAwareness();
};

// Control de visibilidad de cursores según modo (visualización vs edición)
window.veyraSetCursorVisible = function(visible) {
    areCursorsVisible = Boolean(visible);

    if (areCursorsVisible) {
        updateLocalCursor();
        window.veyraBroadcastAwareness();
    } else {
        originalSetLocalStateField('cursor', null);
        window.veyraBroadcastAwareness();
    }

    if (editor && editor.view && !editor.isDestroyed) {
        try {
            const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
            editor.view.dispatch(tr);
        } catch (_) {}
    }
};

// Comandos de formato del editor
window.veyraToggleBold = function() {
    if (editor) {
        editor.chain().focus().toggleBold().run();
        notifyToolbarStateChanged();
    }
};

window.veyraToggleItalic = function() {
    if (editor) {
        editor.chain().focus().toggleItalic().run();
        notifyToolbarStateChanged();
    }
};

window.veyraToggleUnderline = function() {
    if (editor) {
        editor.chain().focus().toggleUnderline().run();
        notifyToolbarStateChanged();
    }
};

window.veyraToggleStrike = function() {
    if (editor) {
        editor.chain().focus().toggleStrike().run();
        notifyToolbarStateChanged();
    }
};

window.veyraSetHeading = function(level) {
    if (!editor) return;
    const lvl = Number(level);
    if (lvl === 1 || lvl === 2 || lvl === 3) {
        editor.chain().focus().toggleHeading({ level: lvl }).run();
    } else {
        editor.chain().focus().setParagraph().run();
    }
    notifyToolbarStateChanged();
};

window.veyraToggleBlockquote = function() {
    if (editor) {
        editor.chain().focus().toggleBlockquote().run();
        notifyToolbarStateChanged();
    }
};

window.veyraToggleBulletList = function() {
    if (editor) {
        if (editor.isActive('bulletList')) {
            editor.chain().focus().toggleBulletList().run();
        } else {
            if (editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run();
            if (editor.isActive('taskList')) editor.chain().focus().toggleTaskList().run();
            editor.chain().focus().toggleBulletList().run();
        }
        notifyToolbarStateChanged();
    }
};

window.veyraToggleOrderedList = function() {
    if (editor) {
        if (editor.isActive('orderedList')) {
            editor.chain().focus().toggleOrderedList().run();
        } else {
            if (editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
            if (editor.isActive('taskList')) editor.chain().focus().toggleTaskList().run();
            editor.chain().focus().toggleOrderedList().run();
        }
        notifyToolbarStateChanged();
    }
};

window.veyraToggleTaskList = function() {
    if (editor) {
        if (editor.isActive('taskList')) {
            editor.chain().focus().toggleTaskList().run();
        } else {
            if (editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
            if (editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run();
            editor.chain().focus().toggleTaskList().run();
        }
        notifyToolbarStateChanged();
    }
};

window.veyraSetAlign = function(align) {
    if (editor && align) {
        if (!editor.isActive('image') && lastClickedImagePos !== null) {
            try {
                editor.chain().focus().setNodeSelection(lastClickedImagePos).setTextAlign(align).run();
            } catch (_) {
                editor.chain().focus().setTextAlign(align).run();
            }
        } else {
            editor.chain().focus().setTextAlign(align).run();
        }
        notifyToolbarStateChanged();
    }
};

window.veyraInsertImage = function(url) {
    if (editor && url) {
        editor.chain().focus().setImage({ src: url }).run();
        notifyToolbarStateChanged();
    }
};

window.veyraReplaceImageSrc = function(oldLocalUri, newRemoteUrl) {
    if (!editor || !oldLocalUri || !newRemoteUrl) return;
    try {
        let replaced = false;
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs && node.attrs.src === oldLocalUri) {
                editor.chain().focus().setNodeSelection(pos).updateAttributes('image', { src: newRemoteUrl }).run();
                replaced = true;
            }
        });
        if (replaced) {
            notifyToolbarStateChanged();
        }
    } catch (e) {
        console.error('Error en veyraReplaceImageSrc:', e);
    }
};

window.veyraSetImageSize = function(percentage) {
    if (!editor) return;
    if (editor.isActive('image')) {
        editor.chain().focus().updateAttributes('image', { style: `width: ${percentage}%; height: auto;` }).run();
    } else if (lastClickedImagePos !== null) {
        try {
            editor.chain().focus().setNodeSelection(lastClickedImagePos).updateAttributes('image', { style: `width: ${percentage}%; height: auto;` }).run();
        } catch (_) {}
    }
    notifyToolbarStateChanged();
};

window.veyraSetColor = function(color) {
    if (!editor) return;
    if (!color || color === 'default') {
        editor.chain().focus().unsetColor().run();
    } else {
        editor.chain().focus().setColor(color).run();
    }
    notifyToolbarStateChanged();
};

window.veyraSetHighlight = function(color) {
    if (!editor) return;
    if (!color || color === 'transparent') {
        const textStyle = editor.getAttributes('textStyle');
        editor.chain().focus().unsetHighlight().run();
        // Limpieza de seguridad: si previamente se había inyectado #111111 mediante setColor
        if (textStyle && textStyle.color === '#111111') {
            editor.chain().focus().unsetColor().run();
        }
    } else {
        // Aplicar el resaltado atómicamente; el contraste oscuro (#111111) es gobernado directamente por CSS
        editor.chain().focus().setHighlight({ color }).run();
        // Si el texto tenía un color residual #111111 previo, limpiarlo para evitar desajustes al desresaltar
        const textStyle = editor.getAttributes('textStyle');
        if (textStyle && textStyle.color === '#111111') {
            editor.chain().focus().unsetColor().run();
        }
    }
    notifyToolbarStateChanged();
};

window.veyraSetFont = function(fontFamily) {
    if (!editor) return;
    if (!fontFamily || fontFamily === 'default' || fontFamily === 'inherit') {
        editor.chain().focus().unsetFontFamily().run();
    } else {
        editor.chain().focus().setFontFamily(fontFamily).run();
    }
    notifyToolbarStateChanged();
};

window.veyraUnsetFormat = function() {
    if (!editor) return;
    editor.chain().focus()
        .unsetAllMarks()
        .clearNodes()
        .setTextAlign('left')
        .unsetColor()
        .unsetHighlight()
        .unsetFontFamily()
        .run();
    notifyToolbarStateChanged();
};

window.veyraUndo = function() {
    if (editor) {
        editor.chain().focus().undo().run();
        notifyToolbarStateChanged();
    }
};

window.veyraRedo = function() {
    if (editor) {
        editor.chain().focus().redo().run();
        notifyToolbarStateChanged();
    }
};

window.veyraFocus = function() {
    if (editor) {
        editor.commands.focus('end');
    }
};

window.veyraCopy = function(text) {
    try {
        if (text && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            return;
        }
        document.execCommand('copy');
    } catch (_) {
        try {
            document.execCommand('copy');
        } catch (_) {}
    }
};

window.veyraGetHTML = function() {
    return editor ? editor.getHTML() : '';
};

window.veyraSetTheme = function(theme) {
    const isAmoled = theme === 'amoled';
    const isDark = theme === 'dark' || isAmoled;
    const root = document.documentElement;
    if (root) {
        root.classList.remove('light', 'dark', 'amoled');
        if (isAmoled) {
            root.classList.add('dark', 'amoled');
        } else if (isDark) {
            root.classList.add('dark');
        } else {
            root.classList.add('light');
        }
        root.style.setProperty('--bg-color', isAmoled ? '#000000' : (isDark ? '#121212' : '#FFFFFF'));
        root.style.setProperty('--text-color', isDark ? '#F4F4F5' : '#18181B');
        root.style.setProperty('--text-bold', isDark ? '#FFFFFF' : '#000000');
        root.style.setProperty('--text-italic', isDark ? '#F4F4F5' : '#18181B');
        root.style.setProperty('--heading-1', isDark ? '#F4F4F5' : '#09090B');
        root.style.setProperty('--heading-2', isDark ? '#E4E4E7' : '#18181B');
        root.style.setProperty('--placeholder', isDark ? '#71717A' : '#A1A1AA');
        root.style.setProperty('--text-secondary', isDark ? '#A1A1AA' : '#71717A');
        root.style.setProperty('--selection', isDark ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.3)');
    }
    if (document.body) {
        document.body.classList.remove('light', 'dark', 'amoled');
        if (isAmoled) {
            document.body.classList.add('dark', 'amoled');
        } else if (isDark) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.add('light');
        }
    }
};

window.veyraGetStateVector = function() {
    const sv = Y.encodeStateVector(ydoc);
    return uint8ArrayToBase64(sv);
};

window.veyraGetFullDocUpdate = function() {
    const update = Y.encodeStateAsUpdate(ydoc);
    return uint8ArrayToBase64(update);
};

// Deriva el texto plano para la vista previa de la nota desde el Y.Doc autoritativo del WebView
function derivePreviewTextFromYDoc(doc) {
    if (!doc) return '';
    try {
        const pageOrder = doc.getArray('pageOrder');
        const pageIds = pageOrder && pageOrder.length > 0 
            ? pageOrder.toArray().map(String) 
            : ['default'];

        const allParagraphs = [];

        function extractTextFromNode(node, currentInline) {
            if (!node) return;

            if (node instanceof Y.XmlText) {
                let pureText = '';
                if (typeof node.toDelta === 'function') {
                    const delta = node.toDelta();
                    pureText = delta.map(d => (typeof d.insert === 'string' ? d.insert : '')).join('');
                } else {
                    pureText = node.toString();
                }
                pureText = pureText.replace(/<[^>]*>/g, '');
                if (pureText) currentInline.push(pureText);
                return;
            }

            if (node instanceof Y.XmlElement) {
                const name = (node.nodeName || '').toLowerCase();
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
                    const inline = [];
                    for (let i = 0; i < node.length; i++) {
                        extractTextFromNode(node.get(i), inline);
                    }
                    const text = inline.join(' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                    if (text) {
                        allParagraphs.push(text);
                    }
                } else {
                    for (let i = 0; i < node.length; i++) {
                        extractTextFromNode(node.get(i), currentInline);
                    }
                }
                return;
            }

            if (node instanceof Y.XmlFragment) {
                for (let i = 0; i < node.length; i++) {
                    const child = node.get(i);
                    if (child instanceof Y.XmlElement) {
                        extractTextFromNode(child, []);
                    } else if (child instanceof Y.XmlText) {
                        let pureText = '';
                        if (typeof child.toDelta === 'function') {
                            const delta = child.toDelta();
                            pureText = delta.map(d => (typeof d.insert === 'string' ? d.insert : '')).join('');
                        } else {
                            pureText = child.toString();
                        }
                        pureText = pureText.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                        if (pureText) allParagraphs.push(pureText);
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

        let raw = allParagraphs.join('\n');
        raw = raw.replace(/<[^>]*>/g, '');
        raw = raw
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>');
        raw = raw.replace(/[ \t]+/g, ' ').trim();
        if (raw.length > 200) {
            return raw.slice(0, 200).trim();
        }
        return raw;
    } catch (err) {
        console.warn('Error en veyraGetPreview:', err);
        return '';
    }
}

window.veyraGetPreview = function() {
    return derivePreviewTextFromYDoc(ydoc);
};

window.veyraRequestPreview = function() {
    const preview = window.veyraGetPreview();
    sendToNative({ type: 'PREVIEW_RESULT', preview });
};

// Receptor de mensajes nativos desde React Native
function handleNativeIncomingMessage(data) {
    if (!data || typeof data !== 'object') return;
    switch (data.type) {
        case 'GET_HTML':
            sendToNative({ type: 'HTML_RESULT', html: editor ? editor.getHTML() : '' });
            break;
    }
}

if (typeof window !== 'undefined') {
    window.handleNativeMessage = handleNativeIncomingMessage;
    window.addEventListener('message', (event) => {
        try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            handleNativeIncomingMessage(data);
        } catch (_) {}
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('message', (event) => {
        try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            handleNativeIncomingMessage(data);
        } catch (_) {}
    });
}

if (typeof document !== 'undefined') {
    document.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('scroll', () => {
        sendToNative({ type: 'TEXT_SELECTED', hasText: false });
    }, { passive: true });
}

if (typeof window !== 'undefined') {
    window.addEventListener('scroll', () => {
        sendToNative({ type: 'TEXT_SELECTED', hasText: false });
        sendToNative({ type: 'IMAGE_DISMISSED' });
    }, { passive: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initEditor());
} else {
    initEditor();
}
