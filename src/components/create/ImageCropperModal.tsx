import React, { useState, useEffect, useRef } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View, Image, ActivityIndicator } from 'react-native';
import { ImageEditor } from 'expo-dynamic-image-crop';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'tamagui';
import { RotateCcw, FlipHorizontal, FlipVertical, X, Check, Scissors, Undo2, Redo2 } from '@tamagui/lucide-icons';
import { manipulateAsync, FlipType, SaveFormat } from 'expo-image-manipulator';

interface ImageCropperModalProps {
    isVisible: boolean;
    imageUri: string | null;
    onClose: () => void;
    onEditingComplete: (result: { uri: string }) => void;
    isDark?: boolean;
}

type Phase = 'main' | 'crop';

export function ImageCropperModal({
    isVisible,
    imageUri,
    onClose,
    onEditingComplete,
    isDark
}: ImageCropperModalProps) {
    const [phase, setPhase] = useState<Phase>('main');
    // Historial de URIs para deshacer/rehacer
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [cropKey, setCropKey] = useState(0);

    const currentUri = historyIndex >= 0 ? history[historyIndex] : null;
    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    // Inicializar historial al abrir
    useEffect(() => {
        if (imageUri && isVisible) {
            setHistory([imageUri]);
            setHistoryIndex(0);
            setPhase('main');
        }
    }, [imageUri, isVisible]);

    const bg = isDark ? '#0a0a0a' : '#fff';
    const toolbarBg = isDark ? '#111' : '#f2f2f2';
    const borderColor = isDark ? '#222' : '#e0e0e0';
    const iconColor = isDark ? '#fff' : '#111';
    const subtleColor = isDark ? '#444' : '#ccc';

    // Agrega una nueva URI al historial (descarta el "futuro" si había)
    const pushToHistory = (uri: string) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(uri);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const handleUndo = () => {
        if (canUndo) setHistoryIndex(i => i - 1);
    };

    const handleRedo = () => {
        if (canRedo) setHistoryIndex(i => i + 1);
    };

    const applyTransform = async (transforms: any[]) => {
        if (!currentUri || isProcessing) return;
        setIsProcessing(true);
        try {
            const result = await manipulateAsync(currentUri, transforms, {
                compress: 1,
                format: SaveFormat.JPEG,
            });
            pushToHistory(result.uri);
        } catch (e) {
            console.error('Error en transformación:', e);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenCrop = () => {
        setCropKey(k => k + 1); // Nuevo key sin parpadeo de fase
        setPhase('crop');
    };

    // Barra del editor de recorte: Atrás | título | Aplicar
    // Cuando isEdit=true significa que el crop ya se procesó y imageData está listo
    const cropControlBar = (actions: any) => {
        // Auto-guardar cuando el crop termina (isEdit pasa a true)
        if (actions.isEdit) {
            // Pequeño timeout para que el store termine de actualizarse
            setTimeout(() => actions.onSave(), 50);
        }

        return (
            <View style={[styles.header, { backgroundColor: toolbarBg, borderBottomColor: borderColor }]}>
                <TouchableOpacity
                    onPress={() => { actions.onCancel(); setPhase('main'); }}
                    style={styles.headerBtn}
                >
                    <X size={20} color={iconColor} />
                    <Text style={[styles.headerBtnLabel, { color: iconColor }]}>Atrás</Text>
                </TouchableOpacity>

                <Text style={[styles.headerTitle, { color: iconColor }]}>Recortar</Text>

                <TouchableOpacity
                    style={styles.headerBtn}
                    onPress={actions.onCrop}
                    disabled={actions.isEdit}
                >
                    <Check size={20} color={actions.isEdit ? subtleColor : '#6366f1'} />
                    <Text style={[styles.headerBtnLabel, { color: actions.isEdit ? subtleColor : '#6366f1' }]}>
                        Aplicar
                    </Text>
                </TouchableOpacity>
            </View>
        );
    };

    if (!currentUri) return null;

    return (
        <Modal
            visible={isVisible}
            animationType="slide"
            transparent={false}
            onRequestClose={() => {
                if (phase === 'crop') {
                    setPhase('main');
                } else {
                    onClose();
                }
            }}
        >
            <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>

                {/* ── PANTALLA PRINCIPAL ── */}
                {phase === 'main' && (
                    <View style={styles.container}>
                        {/* Header: Cancelar | título | Listo */}
                        <View style={[styles.header, { backgroundColor: toolbarBg, borderBottomColor: borderColor }]}>
                            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
                                <X size={20} color={iconColor} />
                                <Text style={[styles.headerBtnLabel, { color: iconColor }]}>Cancelar</Text>
                            </TouchableOpacity>

                            <Text style={[styles.headerTitle, { color: iconColor }]}>Editar imagen</Text>

                            <TouchableOpacity
                                onPress={async () => {
                                    if (isSaving || isProcessing) return;
                                    setIsSaving(true);
                                    onClose(); // Cerrar modal primero
                                    await onEditingComplete({ uri: currentUri });
                                    setIsSaving(false);
                                }}
                                style={styles.headerBtn}
                                disabled={isProcessing || isSaving}
                            >
                                {isSaving
                                    ? <ActivityIndicator size="small" color="#6366f1" />
                                    : <Check size={20} color={isProcessing ? subtleColor : '#6366f1'} />
                                }
                                <Text style={[styles.headerBtnLabel, { color: isProcessing ? subtleColor : '#6366f1' }]}>
                                    {isSaving ? 'Guardando...' : 'Listo'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Deshacer / Rehacer */}
                        <View style={[styles.undoBar, { borderBottomColor: borderColor }]}>
                            <TouchableOpacity
                                onPress={handleUndo}
                                disabled={!canUndo || isProcessing}
                                style={styles.undoBtn}
                            >
                                <Undo2 size={18} color={canUndo && !isProcessing ? iconColor : subtleColor} />
                                <Text style={[styles.undoLabel, { color: canUndo && !isProcessing ? iconColor : subtleColor }]}>
                                    Deshacer
                                </Text>
                            </TouchableOpacity>

                            <Text style={[styles.historyCount, { color: subtleColor }]}>
                                {historyIndex + 1} / {history.length}
                            </Text>

                            <TouchableOpacity
                                onPress={handleRedo}
                                disabled={!canRedo || isProcessing}
                                style={styles.undoBtn}
                            >
                                <Text style={[styles.undoLabel, { color: canRedo && !isProcessing ? iconColor : subtleColor }]}>
                                    Rehacer
                                </Text>
                                <Redo2 size={18} color={canRedo && !isProcessing ? iconColor : subtleColor} />
                            </TouchableOpacity>
                        </View>

                        {/* Vista previa */}
                        <View style={styles.preview}>
                            {isProcessing ? (
                                <ActivityIndicator size="large" color="#6366f1" />
                            ) : (
                                <Image
                                    source={{ uri: currentUri }}
                                    style={styles.previewImage}
                                    resizeMode="contain"
                                />
                            )}
                        </View>

                        {/* Barra inferior: Rotar | Voltear H | Voltear V | Recortar */}
                        <View style={[styles.bottomBar, { backgroundColor: toolbarBg, borderTopColor: borderColor }]}>
                            <TouchableOpacity
                                onPress={() => applyTransform([{ rotate: 90 }])}
                                style={styles.tool}
                                disabled={isProcessing}
                            >
                                <RotateCcw size={24} color={isProcessing ? subtleColor : iconColor} />
                                <Text style={[styles.toolLabel, { color: isProcessing ? subtleColor : iconColor }]}>Rotar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => applyTransform([{ flip: FlipType.Horizontal }])}
                                style={styles.tool}
                                disabled={isProcessing}
                            >
                                <FlipHorizontal size={24} color={isProcessing ? subtleColor : iconColor} />
                                <Text style={[styles.toolLabel, { color: isProcessing ? subtleColor : iconColor }]}>Voltear H</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => applyTransform([{ flip: FlipType.Vertical }])}
                                style={styles.tool}
                                disabled={isProcessing}
                            >
                                <FlipVertical size={24} color={isProcessing ? subtleColor : iconColor} />
                                <Text style={[styles.toolLabel, { color: isProcessing ? subtleColor : iconColor }]}>Voltear V</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleOpenCrop}
                                style={styles.tool}
                                disabled={isProcessing}
                            >
                                <Scissors size={24} color={isProcessing ? subtleColor : '#6366f1'} />
                                <Text style={[styles.toolLabel, { color: isProcessing ? subtleColor : '#6366f1' }]}>Recortar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* ── EDITOR DE RECORTE ── */}
                {phase === 'crop' && (
                    <ImageEditor
                        key={cropKey}
                        useModal={false}
                        imageUri={currentUri}
                        onEditingComplete={(result) => {
                            pushToHistory(result.uri);
                            setPhase('main');
                        }}
                        onEditingCancel={() => setPhase('main')}
                        dynamicCrop={true}
                        customControlBar={cropControlBar}
                        editorOptions={{ backgroundColor: bg }}
                    />
                )}

            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    headerBtn: {
        alignItems: 'center',
        gap: 2,
        minWidth: 56,
    },
    headerBtnLabel: {
        fontSize: 10,
        fontWeight: '600',
    },
    undoBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    undoBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    undoLabel: {
        fontSize: 13,
        fontWeight: '500',
    },
    historyCount: {
        fontSize: 12,
    },
    preview: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        paddingVertical: 16,
        paddingHorizontal: 8,
        borderTopWidth: 1,
    },
    tool: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 6,
    },
    toolLabel: {
        fontSize: 11,
        fontWeight: '600',
    },
});
