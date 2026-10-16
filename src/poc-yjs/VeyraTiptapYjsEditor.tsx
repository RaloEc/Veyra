import React, { useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { getTiptapHtml } from './editor-web/htmlTemplate';

export interface VeyraTiptapEditorRef {
    applyRemoteUpdate: (base64Update: string) => void;
    applyRemoteAwareness: (base64Awareness: string, senderClientId?: string) => void;
    requestSyncStep1: () => void;
    handleSyncStep1: (base64RemoteSv: string, correlationId?: string, isReturnHandshake?: boolean) => void;
    removePeer: (remoteClientId?: number | string) => void;
    touchPeer: (remoteClientId?: number | string) => void;
    broadcastAwareness: () => void;
    destroyAwareness: () => void;
    restoreAwareness: () => void;
    setUser: (name: string, color: string) => void;
    toggleBold: () => void;
    toggleItalic: () => void;
    toggleBulletList: () => void;
    toggleOrderedList: () => void;
    undo: () => void;
    redo: () => void;
}

export interface EditorToolbarState {
    canUndo: boolean;
    canRedo: boolean;
    isBold: boolean;
    isItalic: boolean;
    isBulletList: boolean;
    isOrderedList: boolean;
}

interface VeyraTiptapYjsEditorProps {
    isDark?: boolean;
    accentColor?: string;
    userName?: string;
    userColor?: string;
    onYjsUpdate?: (base64Update: string) => void;
    onAwarenessUpdate?: (base64Awareness: string) => void;
    onSyncStep1?: (base64Sv: string, correlationId?: string | null, isReturnHandshake?: boolean) => void;
    onSyncStep2?: (base64Update: string, correlationId?: string | null) => void;
    onToolbarStateChange?: (state: EditorToolbarState) => void;
    onYjsLog?: (log: any) => void;
    onApplyUpdateAck?: (success: boolean) => void;
    onReady?: () => void;
    onAwarenessPeersChanged?: (peers: Array<{ clientId: number; name: string; color: string; hasCursor: boolean }>) => void;
}

export const VeyraTiptapYjsEditor = forwardRef<VeyraTiptapEditorRef, VeyraTiptapYjsEditorProps>(
    (
        {
            isDark = true,
            accentColor = '#8B5CF6',
            userName = 'Usuario Móvil',
            userColor = '#8B5CF6',
            onYjsUpdate,
            onAwarenessUpdate,
            onSyncStep1,
            onSyncStep2,
            onToolbarStateChange,
            onYjsLog,
            onApplyUpdateAck,
            onReady,
            onAwarenessPeersChanged,
        },
        ref
    ) => {
        const webViewRef = useRef<WebView>(null);
        const html = React.useMemo(
            () => getTiptapHtml({ isDark, accentColor }),
            [isDark, accentColor]
        );

        const executeInWebView = useCallback((code: string) => {
            if (webViewRef.current) {
                webViewRef.current.injectJavaScript(`${code}; true;`);
            }
        }, []);

        useImperativeHandle(ref, () => ({
            applyRemoteUpdate: (base64Update: string) => {
                executeInWebView(`window.veyraApplyUpdate && window.veyraApplyUpdate(${JSON.stringify(base64Update)})`);
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
            setUser: (name: string, color: string) => {
                executeInWebView(`window.veyraSetUser && window.veyraSetUser(${JSON.stringify(name)}, ${JSON.stringify(color)})`);
            },
            toggleBold: () => {
                executeInWebView(`window.veyraToggleBold && window.veyraToggleBold()`);
            },
            toggleItalic: () => {
                executeInWebView(`window.veyraToggleItalic && window.veyraToggleItalic()`);
            },
            toggleBulletList: () => {
                executeInWebView(`window.veyraToggleBulletList && window.veyraToggleBulletList()`);
            },
            toggleOrderedList: () => {
                executeInWebView(`window.veyraToggleOrderedList && window.veyraToggleOrderedList()`);
            },
            undo: () => {
                executeInWebView(`window.veyraUndo && window.veyraUndo()`);
            },
            redo: () => {
                executeInWebView(`window.veyraRedo && window.veyraRedo()`);
            },
        }));

        const handleMessage = useCallback(
            (event: WebViewMessageEvent) => {
                try {
                    const data = JSON.parse(event.nativeEvent.data);
                    switch (data.type) {
                        case 'EDITOR_READY':
                            executeInWebView(`window.veyraSetUser(${JSON.stringify(userName)}, ${JSON.stringify(userColor)})`);
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
                        case 'APPLY_UPDATE_ACK':
                            onApplyUpdateAck?.(data.success);
                            break;
                        case 'CONTENT_CHANGED':
                        case 'SELECTION_CHANGED':
                            onToolbarStateChange?.({
                                canUndo: data.canUndo,
                                canRedo: data.canRedo,
                                isBold: data.isBold,
                                isItalic: data.isItalic,
                                isBulletList: data.isBulletList,
                                isOrderedList: data.isOrderedList,
                            });
                            break;
                        case 'AWARENESS_PEERS_CHANGED':
                            onAwarenessPeersChanged?.(data.peers || []);
                            break;
                    }
                } catch (e) {
                    // Ignorar mensajes no JSON
                }
            },
            [userName, userColor, onReady, onYjsUpdate, onAwarenessUpdate, onSyncStep1, onSyncStep2, onToolbarStateChange, onYjsLog, onApplyUpdateAck, onAwarenessPeersChanged, executeInWebView]
        );

        // Sincronizar cambios de nombre o color hacia el WebView en tiempo real
        useEffect(() => {
            executeInWebView(`window.veyraSetUser && window.veyraSetUser(${JSON.stringify(userName)}, ${JSON.stringify(userColor)})`);
        }, [userName, userColor, executeInWebView]);

        return (
            <View style={styles.container}>
                <WebView
                    ref={webViewRef}
                    source={{ html }}
                    originWhitelist={['*']}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    textZoom={100}
                    overScrollMode="never"
                    nestedScrollEnabled={true}
                    keyboardDisplayRequiresUserAction={false}
                    hideKeyboardAccessoryView={true}
                    showsVerticalScrollIndicator={false}
                    onMessage={handleMessage}
                    style={styles.webView}
                    containerStyle={styles.webViewContainer}
                    androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
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
        backgroundColor: 'transparent',
    },
    webView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
