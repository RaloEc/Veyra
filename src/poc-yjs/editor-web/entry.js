import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { ySyncPluginKey, yCursorPluginKey, absolutePositionToRelativePosition } from 'y-prosemirror';

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
    color: '#8B5CF6'
};

// Evitar que pérdidas temporales de foco DOM en Android borren el cursor colaborativo
const originalSetLocalStateField = awareness.setLocalStateField.bind(awareness);
awareness.setLocalStateField = function(field, value) {
    if (field === 'cursor' && value === null) {
        // En móvil no borramos el cursor por simple pérdida de foco DOM (ej. tocar toolbar o scroll)
        return;
    }
    return originalSetLocalStateField(field, value);
};

awareness.setLocalStateField('user', currentUser);

const providerMock = {
    awareness: awareness
};

let editor = null;
const FRAGMENT_NAME = 'default';

function logToNative(origin, action, sizeBytes, extra = {}) {
    sendToNative({
        type: 'YJS_LOG',
        log: {
            origin,
            action,
            fragment: FRAGMENT_NAME,
            sizeBytes: sizeBytes || 0,
            timestamp: Date.now(),
            ...extra
        }
    });
}

function initEditor() {
    const editorElement = document.getElementById('editor');
    if (!editorElement) return;

    editor = new Editor({
        element: editorElement,
        extensions: [
            StarterKit.configure({
                history: false,
                heading: {
                    levels: [1, 2, 3]
                }
            }),
            Collaboration.configure({
                document: ydoc,
                field: FRAGMENT_NAME
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
        onUpdate: () => {
            sendToNative({
                type: 'CONTENT_CHANGED',
                canUndo: editor ? editor.can().undo() : false,
                canRedo: editor ? editor.can().redo() : false,
                isBold: editor ? editor.isActive('bold') : false,
                isItalic: editor ? editor.isActive('italic') : false,
                isBulletList: editor ? editor.isActive('bulletList') : false,
                isOrderedList: editor ? editor.isActive('orderedList') : false,
            });
            updateLocalCursor();
            window.veyraBroadcastAwareness();
        },
        onSelectionUpdate: () => {
            sendToNative({
                type: 'SELECTION_CHANGED',
                canUndo: editor ? editor.can().undo() : false,
                canRedo: editor ? editor.can().redo() : false,
                isBold: editor ? editor.isActive('bold') : false,
                isItalic: editor ? editor.isActive('italic') : false,
                isBulletList: editor ? editor.isActive('bulletList') : false,
                isOrderedList: editor ? editor.isActive('orderedList') : false,
            });
            updateLocalCursor();
            window.veyraBroadcastAwareness();
        }
    });

    if (editor && editor.view && editor.view.dom) {
        editor.view.dom.addEventListener('focus', () => {
            updateLocalCursor();
            window.veyraBroadcastAwareness();
        });
        editor.view.dom.addEventListener('click', () => {
            updateLocalCursor();
            window.veyraBroadcastAwareness();
        });
        editor.view.dom.addEventListener('keyup', () => {
            updateLocalCursor();
            window.veyraBroadcastAwareness();
        });
        editor.view.dom.addEventListener('touchend', () => {
            updateLocalCursor();
            window.veyraBroadcastAwareness();
        });
    }

    setTimeout(() => {
        trySetInitialCursor(0);
    }, 200);

    sendToNative({ type: 'EDITOR_READY' });
}

// Actualiza el cursor local en awareness a partir de la selección ProseMirror real
function updateLocalCursor() {
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

// 1. Emisión de deltas locales hacia React Native (ignora origin === 'remote')
ydoc.on('update', (update, origin) => {
    if (origin !== 'remote') {
        const base64Update = uint8ArrayToBase64(update);
        logToNative('local-editor', 'update-emit', update.byteLength);
        sendToNative({
            type: 'YJS_UPDATE',
            update: base64Update
        });
    }
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

// 3. Watchdog de presencia (TTL de 35 segundos para entornos móviles)
// Si un cliente remoto no renueva su señal en más de 35 segundos, se purga localmente sin re-emitir
const clientLastSeen = new Map();

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
        if (now - lastSeen > 35000) {
            staleClients.push(clientId);
        }
    });

    if (staleClients.length > 0) {
        staleClients.forEach(cid => clientLastSeen.delete(cid));
        awarenessProtocol.removeAwarenessStates(awareness, staleClients, 'timeout-purge');
        if (editor && editor.view && !editor.isDestroyed) {
            try {
                const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
                editor.view.dispatch(tr);
            } catch (_) {}
        }
        logToNative('watchdog', 'purge-stale-carets', 0, { purgedClients: staleClients.length });
    }
}, 3000);

// Re-broadcast periódico del awareness local (cada 5s) para mantener cursores
// visibles en pares remotos incluso tras reconexiones o pérdidas de paquetes.
// Esto es especialmente importante en Android donde el WebView puede perder
// eventos internos de awareness sin que React Native se entere.
setInterval(() => {
    try {
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
    } else {
        // Renovar todos los clientes remotos registrados
        awareness.getStates().forEach((_, cid) => {
            if (cid !== ydoc.clientID) clientLastSeen.set(cid, now);
        });
    }
};

// Aplica delta remoto recibido de Supabase
window.veyraApplyUpdate = function(base64Update) {
    try {
        const update = base64ToUint8Array(base64Update);
        Y.applyUpdate(ydoc, update, 'remote');
        logToNative('remote-peer', 'apply-update-success', update.byteLength);
        sendToNative({ type: 'APPLY_UPDATE_ACK', success: true });

        // Actualizar cursor local sobre la nueva estructura y forzar refresco de cursores remotos
        updateLocalCursor();
        if (editor && editor.view && !editor.isDestroyed) {
            try {
                const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
                editor.view.dispatch(tr);
            } catch (_) {}
        }
    } catch (e) {
        console.error('Error aplicando update Yjs remoto:', e);
        logToNative('remote-peer', 'apply-update-error', 0, { error: String(e) });
    }
};

// Aplica actualización de Awareness remota recibida de Supabase
window.veyraApplyAwareness = function(base64Awareness) {
    try {
        const update = base64ToUint8Array(base64Awareness);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, 'remote');

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
                    name: state.user.name || 'Invitado',
                    color: state.user.color || '#8B5CF6',
                    hasCursor: Boolean(state.cursor),
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
        if (typeof remoteClientId === 'number') {
            awarenessProtocol.removeAwarenessStates(awareness, [remoteClientId], 'peer-left');
            clientLastSeen.delete(remoteClientId);
        } else if (remoteClientId === 'ALL' || remoteClientId === true) {
            // Solo purgar todo si explícitamente se solicita 'ALL'
            const remoteClients = [];
            awareness.getStates().forEach((_, cid) => {
                if (cid !== ydoc.clientID) remoteClients.push(cid);
            });
            if (remoteClients.length > 0) {
                awarenessProtocol.removeAwarenessStates(awareness, remoteClients, 'peer-left');
            }
            clientLastSeen.clear();
        } else if (typeof remoteClientId === 'string') {
            // Purgar clientes remotos que coincidan o el cliente remoto activo
            const remoteClients = [];
            awareness.getStates().forEach((state, cid) => {
                if (cid !== ydoc.clientID) {
                    if (!remoteClientId || remoteClientId === 'peer' || (state && state.user && (state.user.id === remoteClientId || state.user.name?.includes(remoteClientId)))) {
                        remoteClients.push(cid);
                    }
                }
            });
            if (remoteClients.length > 0) {
                awarenessProtocol.removeAwarenessStates(awareness, remoteClients, 'peer-left');
                remoteClients.forEach(cid => clientLastSeen.delete(cid));
            }
        }
        if (editor && editor.view && !editor.isDestroyed) {
            try {
                const tr = editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true });
                editor.view.dispatch(tr);
            } catch (_) {}
        }
        logToNative('provider', 'peer-removed', 0);
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
        awareness.setLocalState(null);
        logToNative('lifecycle', 'destroy-awareness-local', 0);
    } catch (e) {
        console.error('Error destruyendo awareness:', e);
    }
};

// Reactiva la presencia local cuando la app vuelve a primer plano
// IMPORTANTE: preservar el cursor existente; solo restaurar user si falta
window.veyraRestoreAwareness = function() {
    try {
        originalSetLocalStateField('user', currentUser);
        updateLocalCursor();
        window.veyraBroadcastAwareness();
        logToNative('lifecycle', 'restore-awareness-local', 0);
    } catch (e) {
        console.error('Error restaurando awareness:', e);
    }
};

// Configuración de usuario local
window.veyraSetUser = function(name, color) {
    currentUser = { name, color };
    awareness.setLocalStateField('user', currentUser);
    if (editor && editor.commands && editor.commands.updateUser) {
        editor.commands.updateUser(currentUser);
    }
    window.veyraBroadcastAwareness();
};

// Comandos de formato del editor
window.veyraToggleBold = function() {
    if (editor) {
        editor.chain().focus().toggleBold().run();
        try {
            editor.view.dispatch(editor.state.tr);
        } catch (e) {}
        sendToNative({
            type: 'CONTENT_CHANGED',
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
            isBold: editor.isActive('bold'),
            isItalic: editor.isActive('italic'),
            isBulletList: editor.isActive('bulletList'),
            isOrderedList: editor.isActive('orderedList'),
        });
    }
};

window.veyraToggleItalic = function() {
    if (editor) {
        editor.chain().focus().toggleItalic().run();
        try {
            editor.view.dispatch(editor.state.tr);
        } catch (e) {}
        sendToNative({
            type: 'CONTENT_CHANGED',
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
            isBold: editor.isActive('bold'),
            isItalic: editor.isActive('italic'),
            isBulletList: editor.isActive('bulletList'),
            isOrderedList: editor.isActive('orderedList'),
        });
    }
};

window.veyraToggleBulletList = function() {
    if (editor) editor.chain().focus().toggleBulletList().run();
};

window.veyraToggleOrderedList = function() {
    if (editor) editor.chain().focus().toggleOrderedList().run();
};

window.veyraUndo = function() {
    if (editor) editor.chain().focus().undo().run();
};

window.veyraRedo = function() {
    if (editor) editor.chain().focus().redo().run();
};

window.veyraGetHTML = function() {
    return editor ? editor.getHTML() : '';
};

window.veyraGetStateVector = function() {
    const sv = Y.encodeStateVector(ydoc);
    return uint8ArrayToBase64(sv);
};

window.veyraGetFullDocUpdate = function() {
    const update = Y.encodeStateAsUpdate(ydoc);
    return uint8ArrayToBase64(update);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
} else {
    initEditor();
}
