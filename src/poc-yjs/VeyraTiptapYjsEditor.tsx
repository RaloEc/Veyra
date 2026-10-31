import React, { useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { getTiptapHtml } from './editor-web/htmlTemplate';
import { diagLog } from './diagLog';

export interface VeyraTiptapEditorRef {
    applyRemoteUpdate: (base64Update: string, origin?: string) => void;
    applyRemoteAwareness: (base64Awareness: string, senderClientId?: string) => void;
    requestSyncStep1: () => void;
    handleSyncStep1: (base64RemoteSv: string, correlationId?: string, isReturnHandshake?: boolean) => void;
    removePeer: (remoteClientId?: number | string) => void;
    touchPeer: (remoteClientId?: number | string) => void;
    broadcastAwareness: () => void;
    destroyAwareness: () => void;
    restoreAwareness: () => void;
    setUser: (name: string, color: string, isEditing?: boolean, userId?: string) => void;
    setEditing: (isEditing: boolean) => void;
    toggleBold: () => void;
    toggleItalic: () => void;
    toggleUnderline: () => void;
    toggleStrike: () => void;
    setHeading: (level: number) => void;
    toggleBlockquote: () => void;
    toggleBulletList: () => void;
    toggleOrderedList: () => void;
    toggleTaskList: () => void;
    setAlign: (align: 'left' | 'center' | 'right' | 'justify') => void;
    setColor: (color: string) => void;
    setHighlight: (color: string) => void;
    setFont: (fontFamily: string) => void;
    unsetFormat: () => void;
    undo: () => void;
    redo: () => void;
    insertImage: (url: string) => void;
    replaceImageSrc: (oldLocalUri: string, newRemoteUrl: string) => void;
    setImageSize: (percentage: number) => void;
    setPageId: (pageId: string) => void;
    setCursorVisible: (visible: boolean) => void;
    getPreviewFromWebView: () => Promise<string>;
    getCurrentHtml: () => Promise<string>;
    setTheme: (theme: 'dark' | 'light' | 'amoled') => void;
    focus: () => void;
    copy: (text?: string) => void;
    sendAction: (action: string, type?: string, data?: any) => void;
    registerToolbar: (listener: (items: any[]) => void) => void;
}

export interface EditorToolbarState {
    canUndo: boolean;
    canRedo: boolean;
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    isStrike: boolean;
    isH1: boolean;
    isH2: boolean;
    isBlockquote: boolean;
    isBulletList: boolean;
    isOrderedList: boolean;
    isTaskList: boolean;
    textAlign: 'left' | 'center' | 'right' | 'justify';
    textColor: string | null;
    highlightColor: string | null;
    fontFamily: string | null;
}

interface VeyraTiptapYjsEditorProps {
    isDark?: boolean;
    isAmoled?: boolean;
    accentColor?: string;
    userId?: string;
    userName?: string;
    userColor?: string;
    activePageId?: string;
    isEditing?: boolean;
    onYjsUpdate?: (base64Update: string) => void;
    onAwarenessUpdate?: (base64Awareness: string) => void;
    onSyncStep1?: (base64Sv: string, correlationId?: string | null, isReturnHandshake?: boolean) => void;
    onSyncStep2?: (base64Update: string, correlationId?: string | null) => void;
    onToolbarStateChange?: (state: EditorToolbarState) => void;
    onYjsLog?: (log: any) => void;
    onApplyUpdateAck?: (success: boolean) => void;
    onReady?: () => void;
    onAwarenessPeersChanged?: (peers: Array<{ clientId: number; userId?: string | null; name: string; color: string; hasCursor: boolean; isEditing?: boolean }>) => void;
    onPreviewUpdate?: (preview: string, origin?: string) => void;
    onActivitySnippet?: (snippet: string) => void;
    onActivitySnippetHtml?: (snippetHtml: string) => void;
    onContentRendered?: () => void;
    onImageClicked?: (url: string, rect?: { x: number; y: number; width: number; height: number; top?: number; bottom?: number; left?: number; right?: number }) => void;
    onImageDismissed?: () => void;
    onTextSelected?: (data: { hasText: boolean; rect?: { x: number; y: number; width: number; height: number }; text?: string }) => void;
    showSkeleton?: boolean;
}

export const VeyraTiptapYjsEditor = forwardRef<VeyraTiptapEditorRef, VeyraTiptapYjsEditorProps>(
    (
        {
            isDark = true,
            isAmoled = false,
            accentColor = '#8B5CF6',
            userId,
            userName = 'Usuario Móvil',
            userColor = '#8B5CF6',
            activePageId,
            isEditing = false,
            onYjsUpdate,
            onAwarenessUpdate,
            onSyncStep1,
            onSyncStep2,
            onToolbarStateChange,
            onYjsLog,
            onApplyUpdateAck,
            onReady,
            onAwarenessPeersChanged,
            onPreviewUpdate,
            onActivitySnippet,
            onActivitySnippetHtml,
            onContentRendered,
            onImageClicked,
            onImageDismissed,
            onTextSelected,
        },
        ref
    ) => {
        const webViewRef = useRef<WebView>(null);
        const initialPageIdRef = useRef(activePageId);
        const initialIsDarkRef = useRef(isDark);
        const initialIsAmoledRef = useRef(isAmoled);
        const previewCallbacksRef = useRef<Array<(preview: string) => void>>([]);
        const htmlCallbacksRef = useRef<Array<(html: string) => void>>([]);
        const toolbarListenersRef = useRef<Array<(items: any[]) => void>>([]);
        const html = React.useMemo(
            () =>
                getTiptapHtml({
                    isDark: initialIsDarkRef.current,
                    isAmoled: initialIsAmoledRef.current,
                    accentColor,
                    activePageId: initialPageIdRef.current,
                }),
            [accentColor]
        );

        const executeInWebView = useCallback((code: string) => {
            if (webViewRef.current) {
                webViewRef.current.injectJavaScript(`${code}; true;`);
            }
        }, []);

        const sendAction = useCallback((action: string, _type?: string, data?: any) => {
            switch (action) {
                case 'bold':
                    executeInWebView('window.veyraToggleBold && window.veyraToggleBold()');
                    break;
                case 'italic':
                    executeInWebView('window.veyraToggleItalic && window.veyraToggleItalic()');
                    break;
                case 'underline':
                    executeInWebView('window.veyraToggleUnderline && window.veyraToggleUnderline()');
                    break;
                case 'strikeThrough':
                    executeInWebView('window.veyraToggleStrike && window.veyraToggleStrike()');
                    break;
                case 'heading1':
                    executeInWebView('window.veyraSetHeading && window.veyraSetHeading(1)');
                    break;
                case 'heading2':
                    executeInWebView('window.veyraSetHeading && window.veyraSetHeading(2)');
                    break;
                case 'setParagraph':
                    executeInWebView('window.veyraSetHeading && window.veyraSetHeading(0)');
                    break;
                case 'blockquote':
                case 'quote':
                case 'cita':
                    executeInWebView('window.veyraToggleBlockquote && window.veyraToggleBlockquote()');
                    break;
                case 'unorderedList':
                    executeInWebView('window.veyraToggleBulletList && window.veyraToggleBulletList()');
                    break;
                case 'orderedList':
                    executeInWebView('window.veyraToggleOrderedList && window.veyraToggleOrderedList()');
                    break;
                case 'checkboxList':
                    executeInWebView('window.veyraToggleTaskList && window.veyraToggleTaskList()');
                    break;
                case 'justifyLeft':
                    executeInWebView('window.veyraSetAlign && window.veyraSetAlign("left")');
                    break;
                case 'justifyCenter':
                    executeInWebView('window.veyraSetAlign && window.veyraSetAlign("center")');
                    break;
                case 'justifyRight':
                    executeInWebView('window.veyraSetAlign && window.veyraSetAlign("right")');
                    break;
                case 'justifyFull':
                    executeInWebView('window.veyraSetAlign && window.veyraSetAlign("justify")');
                    break;
                case 'foreColor':
                    executeInWebView(`window.veyraSetColor && window.veyraSetColor(${JSON.stringify(data)})`);
                    break;
                case 'hiliteColor':
                    executeInWebView(`window.veyraSetHighlight && window.veyraSetHighlight(${JSON.stringify(data)})`);
                    break;
                case 'removeFormat':
                    executeInWebView('window.veyraUnsetFormat && window.veyraUnsetFormat()');
                    break;
                case 'undo':
                    executeInWebView('window.veyraUndo && window.veyraUndo()');
                    break;
                case 'redo':
                    executeInWebView('window.veyraRedo && window.veyraRedo()');
                    break;
                case 'insertImage':
                    if (data) executeInWebView(`window.veyraInsertImage && window.veyraInsertImage(${JSON.stringify(data)})`);
                    break;
                case 'replaceImageSrc':
                    if (data?.oldLocalUri && data?.newRemoteUrl) {
                        executeInWebView(`window.veyraReplaceImageSrc && window.veyraReplaceImageSrc(${JSON.stringify(data.oldLocalUri)}, ${JSON.stringify(data.newRemoteUrl)})`);
                    }
                    break;
                default:
                    break;
            }
        }, [executeInWebView]);

        useImperativeHandle(ref, () => ({
            applyRemoteUpdate: (base64Update: string, origin = 'remote-broadcast') => {
                executeInWebView(`window.veyraApplyUpdate && window.veyraApplyUpdate(${JSON.stringify(base64Update)}, ${JSON.stringify(origin)})`);
            },
            applyRemoteAwareness: (base64Awareness: string, senderClientId?: string) => {
                const escapedSender = senderClientId ? JSON.stringify(senderClientId) : 'null';
                executeInWebView(`window.veyraApplyAwareness && window.veyraApplyAwareness(${JSON.stringify(base64Awareness)}, ${escapedSender})`);
            },
            requestSyncStep1: () => {
                executeInWebView(`window.veyraRequestSyncStep1 && window.veyraRequestSyncStep1()`);
            },
            handleSyncStep1: (base64RemoteSv: string, correlationId?: string, isReturnHandshake = false) => {
                const escapedCorr = correlationId ? JSON.stringify(correlationId) : 'null';
                executeInWebView(`window.veyraHandleSyncStep1 && window.veyraHandleSyncStep1(${JSON.stringify(base64RemoteSv)}, ${escapedCorr}, ${isReturnHandshake})`);
            },
            removePeer: (remoteClientId?: number | string) => {
                const arg = typeof remoteClientId === 'number' ? remoteClientId : (remoteClientId ? JSON.stringify(remoteClientId) : '');
                executeInWebView(`window.veyraRemovePeer && window.veyraRemovePeer(${arg})`);
            },
            touchPeer: (remoteClientId?: number | string) => {
                const arg = typeof remoteClientId === 'number' ? remoteClientId : (remoteClientId ? JSON.stringify(remoteClientId) : '');
                executeInWebView(`window.veyraTouchPeer && window.veyraTouchPeer(${arg})`);
            },
            broadcastAwareness: () => {
                executeInWebView(`window.veyraBroadcastAwareness && window.veyraBroadcastAwareness()`);
            },
            destroyAwareness: () => {
                executeInWebView(`window.veyraDestroyAwareness && window.veyraDestroyAwareness()`);
            },
            restoreAwareness: () => {
                executeInWebView(`window.veyraRestoreAwareness && window.veyraRestoreAwareness()`);
            },
            setUser: (name: string, color: string, isEditing?: boolean, uid?: string) => {
                executeInWebView(`window.veyraSetUser && window.veyraSetUser(${JSON.stringify(name)}, ${JSON.stringify(color)}, ${typeof isEditing === 'boolean' ? isEditing : 'undefined'}, ${JSON.stringify(uid || userId || null)})`);
            },
            setEditing: (editing: boolean) => {
                executeInWebView(`window.veyraSetEditing && window.veyraSetEditing(${Boolean(editing)})`);
            },
            toggleBold: () => {
                executeInWebView(`window.veyraToggleBold && window.veyraToggleBold()`);
            },
            toggleItalic: () => {
                executeInWebView(`window.veyraToggleItalic && window.veyraToggleItalic()`);
            },
            toggleUnderline: () => {
                executeInWebView(`window.veyraToggleUnderline && window.veyraToggleUnderline()`);
            },
            toggleStrike: () => {
                executeInWebView(`window.veyraToggleStrike && window.veyraToggleStrike()`);
            },
            setHeading: (level: number) => {
                executeInWebView(`window.veyraSetHeading && window.veyraSetHeading(${Number(level)})`);
            },
            toggleBlockquote: () => {
                executeInWebView(`window.veyraToggleBlockquote && window.veyraToggleBlockquote()`);
            },
            toggleBulletList: () => {
                executeInWebView(`window.veyraToggleBulletList && window.veyraToggleBulletList()`);
            },
            toggleOrderedList: () => {
                executeInWebView(`window.veyraToggleOrderedList && window.veyraToggleOrderedList()`);
            },
            toggleTaskList: () => {
                executeInWebView(`window.veyraToggleTaskList && window.veyraToggleTaskList()`);
            },
            setAlign: (align: 'left' | 'center' | 'right' | 'justify') => {
                executeInWebView(`window.veyraSetAlign && window.veyraSetAlign(${JSON.stringify(align)})`);
            },
            setColor: (color: string) => {
                executeInWebView(`window.veyraSetColor && window.veyraSetColor(${JSON.stringify(color)})`);
            },
            setHighlight: (color: string) => {
                executeInWebView(`window.veyraSetHighlight && window.veyraSetHighlight(${JSON.stringify(color)})`);
            },
            setFont: (fontFamily: string) => {
                executeInWebView(`window.veyraSetFont && window.veyraSetFont(${JSON.stringify(fontFamily)})`);
            },
            unsetFormat: () => {
                executeInWebView(`window.veyraUnsetFormat && window.veyraUnsetFormat()`);
            },
            undo: () => {
                executeInWebView(`window.veyraUndo && window.veyraUndo()`);
            },
            redo: () => {
                executeInWebView(`window.veyraRedo && window.veyraRedo()`);
            },
            insertImage: (url: string) => {
                executeInWebView(`window.veyraInsertImage && window.veyraInsertImage(${JSON.stringify(url)})`);
            },
            replaceImageSrc: (oldLocalUri: string, newRemoteUrl: string) => {
                executeInWebView(`window.veyraReplaceImageSrc && window.veyraReplaceImageSrc(${JSON.stringify(oldLocalUri)}, ${JSON.stringify(newRemoteUrl)})`);
            },
            setImageSize: (percentage: number) => {
                executeInWebView(`window.veyraSetImageSize && window.veyraSetImageSize(${Number(percentage)})`);
            },
            sendAction,
            registerToolbar: (listener: (items: any[]) => void) => {
                toolbarListenersRef.current.push(listener);
            },
            setPageId: (pageId: string) => {
                if (typeof pageId === 'string' && pageId.trim() !== '') {
                    executeInWebView(`window.veyraSetPage && window.veyraSetPage(${JSON.stringify(pageId)})`);
                }
            },
            setCursorVisible: (visible: boolean) => {
                executeInWebView(`window.veyraSetCursorVisible && window.veyraSetCursorVisible(${Boolean(visible)})`);
            },
            getPreviewFromWebView: (): Promise<string> => {
                return new Promise((resolve) => {
                    let settled = false;
                    const timer = setTimeout(() => {
                        if (!settled) {
                            settled = true;
                            resolve('');
                        }
                    }, 200);

                    const cb = (preview: string) => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            resolve(preview);
                        }
                    };

                    previewCallbacksRef.current.push(cb);

                    executeInWebView(`
                        try {
                            if (window.veyraRequestPreview) {
                                window.veyraRequestPreview();
                            } else {
                                const preview = window.veyraGetPreview ? window.veyraGetPreview() : '';
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PREVIEW_RESULT', preview }));
                            }
                        } catch (e) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PREVIEW_RESULT', preview: '' }));
                        }
                    `);
                });
            },
            getCurrentHtml: (): Promise<string> => {
                return new Promise((resolve) => {
                    let settled = false;
                    const timer = setTimeout(() => {
                        if (!settled) {
                            settled = true;
                            resolve('');
                        }
                    }, 500);

                    const cb = (html: string) => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            resolve(html);
                        }
                    };

                    htmlCallbacksRef.current.push(cb);

                    try {
                        webViewRef.current?.postMessage(JSON.stringify({ type: 'GET_HTML' }));
                    } catch (_) {}

                    executeInWebView(`
                        try {
                            if (typeof handleNativeMessage === 'function') {
                                handleNativeMessage({ type: 'GET_HTML' });
                            } else {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'HTML_RESULT',
                                    html: (typeof editor !== 'undefined' && editor) ? editor.getHTML() : (window.veyraGetHTML ? window.veyraGetHTML() : '')
                                }));
                            }
                        } catch (e) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'HTML_RESULT', html: '' }));
                        }
                    `);
                });
            },
            setTheme: (theme: 'dark' | 'light' | 'amoled') => {
                executeInWebView(`
                    try {
                        if (window.veyraSetTheme) {
                            window.veyraSetTheme('${theme}');
                        } else {
                            const isAm = '${theme}' === 'amoled';
                            const isDk = '${theme}' === 'dark' || isAm;
                            document.documentElement.className = isAm ? 'dark amoled' : (isDk ? 'dark' : 'light');
                            document.body.className = isAm ? 'dark amoled' : (isDk ? 'dark' : 'light');
                            document.documentElement.style.setProperty('--bg-color', isAm ? '#000000' : (isDk ? '#121212' : '#FFFFFF'));
                        }
                    } catch (e) {}
                `);
            },
            focus: () => {
                executeInWebView(`
                    try {
                        if (window.veyraFocus) {
                            window.veyraFocus();
                        } else if (window.editor) {
                            window.editor.commands.focus('end');
                        }
                    } catch (e) {}
                `);
            },
            copy: (text?: string) => {
                executeInWebView(`window.veyraCopy && window.veyraCopy(${JSON.stringify(text || '')})`);
            },
        }));

        useEffect(() => {
            executeInWebView(`window.veyraSetCursorVisible && window.veyraSetCursorVisible(${Boolean(isEditing)})`);
            executeInWebView(`window.veyraSetEditing && window.veyraSetEditing(${Boolean(isEditing)})`);
            executeInWebView(`
                try {
                    var el = document.querySelector('.ProseMirror');
                    if (el) el.setAttribute('contenteditable', '${Boolean(isEditing)}');
                } catch (e) {}
            `);
        }, [isEditing, executeInWebView]);

        const handleMessage = useCallback(
            (event: WebViewMessageEvent) => {
                try {
                    const data = JSON.parse(event.nativeEvent.data);
                    switch (data.type) {
                        case 'HTML_RESULT':
                            const htmlCbs = htmlCallbacksRef.current;
                            htmlCallbacksRef.current = [];
                            htmlCbs.forEach(cb => cb(data.html || ''));
                            break;
                        case 'PREVIEW_RESULT':
                            const cbs = previewCallbacksRef.current;
                            previewCallbacksRef.current = [];
                            cbs.forEach(cb => cb(data.preview || ''));
                            break;
                        case 'EDITOR_READY':
                            executeInWebView(`window.veyraSetUser(${JSON.stringify(userName)}, ${JSON.stringify(userColor)}, ${Boolean(isEditing)}, ${JSON.stringify(userId || null)})`);
                            executeInWebView(`window.veyraSetCursorVisible && window.veyraSetCursorVisible(${Boolean(isEditing)})`);
                            executeInWebView(`window.veyraSetEditing && window.veyraSetEditing(${Boolean(isEditing)})`);
                            executeInWebView(`
                                try {
                                    if (window.veyraSetTheme) {
                                        window.veyraSetTheme('${isDark ? 'dark' : 'light'}');
                                    } else {
                                        document.documentElement.className = '${isDark ? 'dark' : 'light'}';
                                        document.body.className = '${isDark ? 'dark' : 'light'}';
                                    }
                                    var el = document.querySelector('.ProseMirror');
                                    if (el) el.setAttribute('contenteditable', '${Boolean(isEditing)}');
                                } catch (e) {}
                            `);
                            onReady?.();
                            break;
                        case 'YJS_UPDATE':
                            onYjsUpdate?.(data.update);
                            break;
                        case 'AWARENESS_UPDATE':
                            onAwarenessUpdate?.(data.update);
                            break;
                        case 'YJS_SYNC_STEP_1':
                            onSyncStep1?.(data.sv, data.correlationId, data.isReturnHandshake);
                            break;
                        case 'YJS_SYNC_STEP_2':
                            onSyncStep2?.(data.update, data.correlationId);
                            break;
                        case 'YJS_LOG':
                            onYjsLog?.(data.log);
                            break;
                        case 'DIAG_LOG':
                            console.log(data.message, data.payload);
                            break;
                        case 'DIAG_LOG_REMOTE':
                            diagLog(data.event, data.payload);
                            break;
                        case 'APPLY_UPDATE_ACK':
                            onApplyUpdateAck?.(data.success);
                            break;
                        case 'IMAGE_CLICKED':
                            if (data.url) {
                                onImageClicked?.(data.url, data.rect);
                            }
                            break;
                        case 'IMAGE_DISMISSED':
                            onImageDismissed?.();
                            break;
                        case 'TOOLBAR_STATE_CHANGED': {
                            const fullState: EditorToolbarState = {
                                canUndo: Boolean(data.canUndo),
                                canRedo: Boolean(data.canRedo),
                                isBold: Boolean(data.isBold),
                                isItalic: Boolean(data.isItalic),
                                isUnderline: Boolean(data.isUnderline),
                                isStrike: Boolean(data.isStrike),
                                isH1: Boolean(data.isH1),
                                isH2: Boolean(data.isH2),
                                isBlockquote: Boolean(data.isBlockquote),
                                isBulletList: Boolean(data.isBulletList),
                                isOrderedList: Boolean(data.isOrderedList),
                                isTaskList: Boolean(data.isTaskList),
                                textAlign: data.textAlign || 'left',
                                textColor: data.textColor || null,
                                highlightColor: data.highlightColor || null,
                                fontFamily: data.fontFamily || null,
                            };
                            onToolbarStateChange?.(fullState);

                            const items: any[] = [];
                            if (fullState.isBold) items.push('bold');
                            if (fullState.isItalic) items.push('italic');
                            if (fullState.isUnderline) items.push('underline');
                            if (fullState.isStrike) items.push('strikeThrough');
                            if (fullState.isH1) items.push('heading1');
                            if (fullState.isH2) items.push('heading2');
                            if (fullState.isBlockquote) {
                                items.push('blockquote');
                                items.push('quote');
                            }
                            if (fullState.isBulletList) items.push('unorderedList');
                            if (fullState.isOrderedList) items.push('orderedList');
                            if (fullState.isTaskList) items.push('checkboxList');
                            if (fullState.textAlign === 'center') items.push('justifyCenter');
                            else if (fullState.textAlign === 'right') items.push('justifyRight');
                            else if (fullState.textAlign === 'justify') items.push('justifyFull');
                            else items.push('justifyLeft');
                            if (fullState.textColor) items.push({ type: 'foreColor', value: fullState.textColor });
                            if (fullState.highlightColor) items.push({ type: 'hiliteColor', value: fullState.highlightColor });
                            toolbarListenersRef.current.forEach(cb => {
                                try { cb(items); } catch (_) {}
                            });
                            break;
                        }
                        case 'CONTENT_CHANGED':
                        case 'SELECTION_CHANGED':
                            onToolbarStateChange?.({
                                canUndo: Boolean(data.canUndo),
                                canRedo: Boolean(data.canRedo),
                                isBold: Boolean(data.isBold),
                                isItalic: Boolean(data.isItalic),
                                isUnderline: Boolean(data.isUnderline),
                                isStrike: Boolean(data.isStrike),
                                isH1: Boolean(data.isH1),
                                isH2: Boolean(data.isH2),
                                isBlockquote: Boolean(data.isBlockquote),
                                isBulletList: Boolean(data.isBulletList),
                                isOrderedList: Boolean(data.isOrderedList),
                                isTaskList: Boolean(data.isTaskList),
                                textAlign: data.textAlign || 'left',
                                textColor: data.textColor || null,
                                highlightColor: data.highlightColor || null,
                                fontFamily: data.fontFamily || null,
                            });
                            break;
                        case 'PREVIEW_UPDATE':
                            onPreviewUpdate?.(data.preview || '', data.origin || 'local');
                            break;
                        case 'ACTIVITY_SNIPPET':
                            onActivitySnippet?.(data.snippet || '');
                            break;
                        case 'ACTIVITY_SNIPPET_HTML':
                            onActivitySnippetHtml?.(data.snippetHtml || '');
                            break;
                        case 'AWARENESS_PEERS_CHANGED':
                            onAwarenessPeersChanged?.(data.peers || []);
                            break;
                        case 'CONTENT_RENDERED':
                            console.log('[WebView-CONTENT_RENDERED] Señal recibida de WebView');
                            onContentRendered?.();
                            break;
                        case 'WIDTH_MEASURE':
                            console.log('[WebView-WIDTH_MEASURE]', data);
                            break;
                        case 'TEXT_SELECTED':
                            onTextSelected?.(data);
                            break;
                    }
                } catch (e) {
                    // Ignorar mensajes no JSON
                }
            },
            [userName, userColor, onReady, onYjsUpdate, onAwarenessUpdate, onSyncStep1, onSyncStep2, onToolbarStateChange, onYjsLog, onApplyUpdateAck, onAwarenessPeersChanged, onPreviewUpdate, onActivitySnippet, onActivitySnippetHtml, onContentRendered, onTextSelected, executeInWebView]
        );

        // Sincronizar cambios de nombre o color hacia el WebView en tiempo real
        useEffect(() => {
            executeInWebView(`window.veyraSetUser && window.veyraSetUser(${JSON.stringify(userName)}, ${JSON.stringify(userColor)})`);
        }, [userName, userColor, executeInWebView]);

        // Registro de montaje inicial del editor
        useEffect(() => {
            diagLog('editor_mount', { activePageId: initialPageIdRef.current || 'default' });
        }, []);

        // Binding exclusivo al fragmento activo de la página (sin recrear el editor ni el canal)
        useEffect(() => {
            if (activePageId) {
                executeInWebView(`window.veyraSetPage && window.veyraSetPage(${JSON.stringify(activePageId)})`);
            }
        }, [activePageId, executeInWebView]);

        // Sincronizar dinámicamente cambio de modo oscuro / claro / amoled sin recargar el WebView
        useEffect(() => {
            const themeClass = isAmoled ? 'amoled' : (isDark ? 'dark' : 'light');
            executeInWebView(`
                try {
                    if (window.veyraSetTheme) {
                        window.veyraSetTheme('${themeClass}');
                    } else {
                        const isAm = '${themeClass}' === 'amoled';
                        const isDk = '${themeClass}' === 'dark' || isAm;
                        document.documentElement.className = isAm ? 'dark amoled' : (isDk ? 'dark' : 'light');
                        document.body.className = isAm ? 'dark amoled' : (isDk ? 'dark' : 'light');
                        document.documentElement.style.setProperty('--bg-color', isAm ? '#000000' : (isDk ? '#121212' : '#FFFFFF'));
                    }
                } catch (e) {}
            `);
        }, [isDark, isAmoled, executeInWebView]);

        return (
            <View style={styles.container}>
                <WebView
                    ref={webViewRef}
                    source={{ html }}
                    originWhitelist={['*']}
                    allowFileAccess={true}
                    allowUniversalAccessFromFileURLs={true}
                    allowFileAccessFromFileURLs={true}
                    mixedContentMode="always"
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    textZoom={100}
                    overScrollMode="never"
                    nestedScrollEnabled={true}
                    keyboardDisplayRequiresUserAction={false}
                    hideKeyboardAccessoryView={true}
                    contextMenuHidden={true}
                    showsVerticalScrollIndicator={false}
                    onLoadEnd={() => {
                        const themeClass = isAmoled ? 'amoled' : (isDark ? 'dark' : 'light');
                        executeInWebView(`
                            try {
                                if (window.veyraSetTheme) {
                                    window.veyraSetTheme('${themeClass}');
                                } else {
                                    const isAm = '${themeClass}' === 'amoled';
                                    const isDk = '${themeClass}' === 'dark' || isAm;
                                    document.documentElement.className = isAm ? 'dark amoled' : (isDk ? 'dark' : 'light');
                                    document.body.className = isAm ? 'dark amoled' : (isDk ? 'dark' : 'light');
                                    document.documentElement.style.setProperty('--bg-color', isAm ? '#000000' : (isDk ? '#121212' : '#FFFFFF'));
                                }
                            } catch (e) {}
                        `);
                    }}
                    onMessage={handleMessage}
                    style={{ backgroundColor: 'transparent', width: '100%', height: '100%' }}
                    containerStyle={styles.webViewContainer}
                    androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
                    scrollEnabled={true}
                    setBuiltInZoomControls={true}
                    setDisplayZoomControls={false}
                    bounces={true}
                    {...({
                        setSupportZoom: true,
                        maximumZoomScale: 5.0,
                        minimumZoomScale: 1.0,
                        bouncesZoom: true,
                    } as any)}
                />
            </View>
        );
    }
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: 'transparent',
    },
    webViewContainer: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    webView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
