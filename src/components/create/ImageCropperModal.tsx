/**
 * ImageCropperModal — Rediseño One UI 6 / Samsung Notes
 *
 * BottomSheet moderno con desenfoque tipo Glassmorphism.
 * Soporta modo claro/oscuro, color de acento personalizado,
 * atajos de recorte y filtros (scanner, b&w, warm, cool).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Modal,
    StyleSheet,
    TouchableOpacity,
    View,
    Image,
    ActivityIndicator,
    ScrollView,
    Dimensions,
    Platform,
} from 'react-native';
import { Text } from 'tamagui';
import { ImageEditor } from 'expo-dynamic-image-crop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    RotateCcw, FlipHorizontal, FlipVertical, X, Check, Undo2, Redo2,
    Crop, Sliders, ChevronLeft,
} from '@tamagui/lucide-icons';
import { manipulateAsync, FlipType, SaveFormat } from 'expo-image-manipulator';
import { BlurView } from 'expo-blur';
import WebView from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import Svg, { Image as SvgImage, Filter, FeColorMatrix, Defs } from 'react-native-svg';

// ─── SVG Color Matrices for live filter preview ─────────────────────────────
const FILTER_MATRICES: Record<string, string> = {
    original: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
    bw: '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0',
    scanner: '0.32 1.08 0.11 0 -0.24  0.32 1.08 0.11 0 -0.24  0.32 1.08 0.11 0 -0.24  0 0 0 1 0',
    warm: '1.15 0.05 0 0 0.02  0.02 1.0 0 0 0  0 0 0.8 0 0  0 0 0 1 0',
    cool: '0.88 0 0 0 0  0 0.93 0.05 0 0  0.05 0.1 1.18 0 0  0 0 0 1 0',
};

// CSS filters for WebView canvas processing (actual pixel manipulation)
const FILTER_CSS: Record<string, string> = {
    original: 'none',
    bw: 'grayscale(1)',
    scanner: 'grayscale(1) contrast(1.7) brightness(1.1)',
    warm: 'saturate(1.4) hue-rotate(-20deg) brightness(1.05)',
    cool: 'saturate(0.85) hue-rotate(25deg) brightness(1.02)',
};

// Minimal HTML page that applies a CSS filter via canvas and returns base64
const FILTER_HTML = `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000;">
<canvas id="c" style="display:none;"></canvas>
<script>
function process(dataUrl, cssFilter) {
  var img = new Image();
  img.onload = function() {
    var c = document.getElementById('c');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.filter = cssFilter;
    ctx.drawImage(img, 0, 0);
    var out = c.toDataURL('image/jpeg', 0.88);
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, data: out }));
  };
  img.onerror = function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false }));
  };
  img.src = dataUrl;
}
function recv(raw) {
  try {
    var d = JSON.parse(raw);
    if (d.type === 'FILTER') process(d.dataUrl, d.cssFilter);
  } catch(e) {}
}
document.addEventListener('message', function(e){ recv(e.data); });
window.addEventListener('message', function(e){ recv(e.data); });
</script>
</body></html>`;

// ─── Crop aspect ratio shortcuts ─────────────────────────────────────────────
type CropRatioOption = { label: string; ratio: number | null };
const CROP_RATIOS: CropRatioOption[] = [
    { label: 'Libre', ratio: null },
    { label: '1:1',  ratio: 1 },
    { label: '4:3',  ratio: 4 / 3 },
    { label: '3:4',  ratio: 3 / 4 },
    { label: '16:9', ratio: 16 / 9 },
    { label: '9:16', ratio: 9 / 16 },
];

type FilterType = 'original' | 'bw' | 'scanner' | 'warm' | 'cool';
const FILTER_LABELS: Record<FilterType, string> = {
    original: 'Original',
    scanner: 'Escáner',
    bw: 'B&N',
    warm: 'Cálido',
    cool: 'Frío',
};

type Phase = 'main' | 'crop';

interface ImageCropperModalProps {
    isVisible: boolean;
    imageUri: string | null;
    onClose: () => void;
    onEditingComplete: (result: { uri: string }) => void;
    isDark?: boolean; // kept for backward compat, ignored (uses useVeyraTheme internally)
}

// ─── FilterThumb: small preview tile with SVG color matrix ──────────────────
function FilterThumb({
    uri, filterType, label, isActive, onPress, accentColor, isDark,
}: {
    uri: string;
    filterType: FilterType;
    label: string;
    isActive: boolean;
    onPress: () => void;
    accentColor: string;
    isDark: boolean;
}) {
    const SIZE = 56;
    const matrix = FILTER_MATRICES[filterType];

    return (
        <TouchableOpacity onPress={onPress} style={styles.filterThumb} activeOpacity={0.75}>
            <View style={[
                styles.filterThumbBorder,
                isActive && { borderColor: accentColor, borderWidth: 2.5 },
            ]}>
                {matrix ? (
                    <Svg width={SIZE} height={SIZE}>
                        <Defs>
                            <Filter id={`f-${filterType}`}>
                                <FeColorMatrix type="matrix" values={matrix} />
                            </Filter>
                        </Defs>
                        <SvgImage
                            href={uri}
                            x={0} y={0}
                            width={SIZE} height={SIZE}
                            preserveAspectRatio="xMidYMid slice"
                            filter={`url(#f-${filterType})`}
                        />
                    </Svg>
                ) : (
                    <Image source={{ uri }} style={{ width: SIZE, height: SIZE }} resizeMode="cover" />
                )}
            </View>
            <Text style={[styles.filterLabel, { color: isActive ? accentColor : (isDark ? '#C4C4C4' : '#555') }]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function ImageCropperModal({
    isVisible,
    imageUri,
    onClose,
    onEditingComplete,
}: ImageCropperModalProps) {
    const { isDark, accent, colors } = useVeyraTheme();
    const insets = useSafeAreaInsets();
    const accentColor = accent.primary;

    // History
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const currentUri = historyIndex >= 0 ? history[historyIndex] : null;
    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    // Phase & processing
    const [phase, setPhase] = useState<Phase>('main');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Crop
    const [cropKey, setCropKey] = useState(0);
    const [cropRatio, setCropRatio] = useState<number | null>(null);
    const cropActionsRef = useRef<any>(null);

    // Filters
    const [showFilters, setShowFilters] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState<FilterType>('original');
    const filterResolveRef = useRef<((uri: string) => void) | null>(null);
    const filterWebViewRef = useRef<WebView>(null);

    // Colors
    const bg = isDark ? '#0D0D0D' : '#FAFAFA';
    const sheetBg = isDark ? 'rgba(24, 27, 35, 0.94)' : 'rgba(255, 255, 255, 0.96)';
    const headerBg = isDark ? 'rgba(20, 22, 28, 0.90)' : 'rgba(255, 255, 255, 0.92)';
    const borderColor = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)';
    const iconColor = isDark ? '#F1F5F9' : '#0F172A';
    const subtleColor = isDark ? '#52525B' : '#CBD5E1';
    const labelColor = isDark ? '#94A3B8' : '#64748B';

    // ── Init / reset when modal opens ──────────────────────────────────────
    useEffect(() => {
        if (imageUri && isVisible) {
            setHistory([imageUri]);
            setHistoryIndex(0);
            setPhase('main');
            setShowFilters(false);
            setSelectedFilter('original');
            setCropRatio(null);
        }
    }, [imageUri, isVisible]);

    // ── History helpers ─────────────────────────────────────────────────────
    const pushToHistory = useCallback((uri: string) => {
        setHistory(prev => {
            const newH = prev.slice(0, historyIndex + 1);
            newH.push(uri);
            setHistoryIndex(newH.length - 1);
            return newH;
        });
    }, [historyIndex]);

    // ── Transforms (rotate, flip) ───────────────────────────────────────────
    const applyTransform = async (transforms: any[]) => {
        if (!currentUri || isProcessing) return;
        setIsProcessing(true);
        try {
            const result = await manipulateAsync(currentUri, transforms, {
                compress: 1,
                format: SaveFormat.JPEG,
            });
            setHistory(prev => {
                const newH = prev.slice(0, historyIndex + 1);
                newH.push(result.uri);
                setHistoryIndex(newH.length - 1);
                return newH;
            });
        } catch (e) {
            console.error('Transform error:', e);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Bake filter via WebView canvas helper (only when finalizing or cropping) ──
    const bakeFilterAsync = useCallback(async (uri: string, filterType: FilterType): Promise<string> => {
        if (filterType === 'original') return uri;
        return new Promise(async (resolve, reject) => {
            filterResolveRef.current = resolve;
            try {
                const compressed = await manipulateAsync(
                    uri,
                    [{ resize: { width: 1400 } }],
                    { compress: 0.9, format: SaveFormat.JPEG, base64: true }
                );
                const dataUrl = `data:image/jpeg;base64,${compressed.base64}`;
                const cssFilter = FILTER_CSS[filterType] ?? 'none';
                const msg = JSON.stringify({ type: 'FILTER', dataUrl, cssFilter });
                filterWebViewRef.current?.injectJavaScript?.(`recv(${JSON.stringify(msg)}); true;`);
            } catch (err) {
                filterResolveRef.current = null;
                reject(err);
            }
        });
    }, []);

    // ── WebView filter message handler ──────────────────────────────────────
    const handleFilterMessage = useCallback(async (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.ok && data.data) {
                const base64Only = data.data.replace(/^data:image\/\w+;base64,/, '');
                const tempUri = `${FileSystem.cacheDirectory}veyra_filter_${Date.now()}.jpg`;
                await FileSystem.writeAsStringAsync(tempUri, base64Only, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                if (filterResolveRef.current) {
                    filterResolveRef.current(tempUri);
                    filterResolveRef.current = null;
                }
            } else {
                if (filterResolveRef.current) {
                    filterResolveRef.current(currentUri || '');
                    filterResolveRef.current = null;
                }
            }
        } catch (e) {
            console.error('Filter processing error:', e);
            if (filterResolveRef.current) {
                filterResolveRef.current(currentUri || '');
                filterResolveRef.current = null;
            }
        }
    }, [currentUri]);

    // ── Instant live filter preview (zero flicker via SVG shader) ───────────
    const applyFilter = (filterType: FilterType) => {
        setSelectedFilter(filterType);
    };

    // ── Crop phase ──────────────────────────────────────────────────────────
    const handleOpenCrop = async () => {
        if (!currentUri) return;
        if (selectedFilter !== 'original') {
            setIsProcessing(true);
            try {
                const baked = await bakeFilterAsync(currentUri, selectedFilter);
                pushToHistory(baked);
                setSelectedFilter('original');
            } catch (e) {
                console.error('Error baking filter for crop:', e);
            } finally {
                setIsProcessing(false);
            }
        }
        cropActionsRef.current = null;
        setCropKey(k => k + 1);
        setPhase('crop');
    };

    // ── Done: save and close ────────────────────────────────────────────────
    const handleDone = async () => {
        if (!currentUri || isSaving || isProcessing) return;
        setIsSaving(true);
        try {
            let finalUri = currentUri;
            if (selectedFilter !== 'original') {
                finalUri = await bakeFilterAsync(currentUri, selectedFilter);
            }
            onClose();
            await onEditingComplete({ uri: finalUri });
        } catch (e) {
            console.error('Save error:', e);
            onClose();
            await onEditingComplete({ uri: currentUri });
        } finally {
            setIsSaving(false);
        }
    };

    // ── Crop control bar bridge (connects actions without broken internal layout) ──
    const cropControlBar = useCallback((actions: any) => {
        cropActionsRef.current = actions;
        // Auto-save when crop is processed
        if (actions.isEdit) {
            setTimeout(() => actions.onSave(), 50);
        }
        return null;
    }, []);

    if (!currentUri) return null;

    const { width: W, height: H } = Dimensions.get('window');

    return (
        <Modal
            visible={isVisible}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => {
                if (phase === 'crop') setPhase('main');
                else onClose();
            }}
        >
            <View style={[styles.root, { backgroundColor: bg }]}>

                {/* ── MAIN PHASE ─────────────────────────────────────────── */}
                {phase === 'main' && (
                    <>
                        {/* Full-screen image preview (blurred background, uses initial image to avoid flash during edits) */}
                        <Image
                            source={{ uri: history[0] ?? currentUri }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                            blurRadius={Platform.OS === 'ios' ? 28 : 14}
                        />
                        {/* Scrim */}
                        <View style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.35)' },
                        ]} />

                        {/* ── Floating header ─────────────────────────────── */}
                        <View
                            style={[
                                styles.header,
                                {
                                    paddingTop: insets.top + 8,
                                    borderBottomColor: borderColor,
                                    backgroundColor: headerBg,
                                },
                            ]}
                        >
                            <BlurView
                                intensity={isDark ? 70 : 60}
                                tint={isDark ? 'dark' : 'light'}
                                style={StyleSheet.absoluteFill}
                            />
                            {/* Cancel */}
                            <TouchableOpacity onPress={onClose} style={styles.headerAction} activeOpacity={0.7}>
                                <View style={[styles.pillBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)' }]}>
                                    <X size={16} color={iconColor} />
                                </View>
                                <Text style={[styles.headerActionLabel, { color: labelColor }]}>Cancelar</Text>
                            </TouchableOpacity>

                            <Text style={[styles.headerTitle, { color: iconColor }]}>Editar imagen</Text>

                            {/* Done */}
                            <TouchableOpacity
                                onPress={handleDone}
                                disabled={isSaving || isProcessing}
                                style={styles.headerAction}
                                activeOpacity={0.7}
                            >
                                {isSaving
                                    ? <ActivityIndicator size="small" color={accentColor} style={styles.pillBtn} />
                                    : (
                                        <View style={[styles.pillBtn, { backgroundColor: accentColor }]}>
                                            <Check size={16} color="#fff" />
                                        </View>
                                    )
                                }
                                <Text style={[styles.headerActionLabel, { color: isSaving ? subtleColor : accentColor }]}>
                                    {isSaving ? 'Guardando…' : 'Listo'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* ── Image preview (center) ───────────────────────── */}
                        <View
                            style={[
                                styles.preview,
                                {
                                    paddingTop: insets.top + 64,
                                    paddingBottom: insets.bottom + (showFilters ? 220 : 130),
                                    paddingHorizontal: 16,
                                },
                            ]}
                            pointerEvents="none"
                        >
                            <Svg width={W - 32} height="100%">
                                <Defs>
                                    <Filter id="main-filter">
                                        <FeColorMatrix
                                            type="matrix"
                                            values={FILTER_MATRICES[selectedFilter] || FILTER_MATRICES.original}
                                        />
                                    </Filter>
                                </Defs>
                                <SvgImage
                                    href={currentUri}
                                    x={0}
                                    y={0}
                                    width="100%"
                                    height="100%"
                                    preserveAspectRatio="xMidYMid meet"
                                    filter="url(#main-filter)"
                                />
                            </Svg>
                        </View>

                        {/* ── Bottom sheet ────────────────────────────────── */}
                        <View
                            style={[
                                styles.bottomSheet,
                                {
                                    paddingBottom: Math.max(insets.bottom, 14),
                                    borderTopColor: borderColor,
                                    backgroundColor: sheetBg,
                                },
                            ]}
                        >
                            <BlurView
                                intensity={isDark ? 80 : 70}
                                tint={isDark ? 'dark' : 'light'}
                                style={StyleSheet.absoluteFill}
                            />
                            {/* Handle */}
                            <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)' }]} />

                            {/* Filter chips row (animated show/hide) */}
                            {showFilters && (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.filterRow}
                                    style={styles.filterRowScroll}
                                >
                                    {(Object.keys(FILTER_LABELS) as FilterType[]).map(fType => (
                                        <FilterThumb
                                            key={fType}
                                            uri={history[0] ?? currentUri} // always preview on original
                                            filterType={fType}
                                            label={FILTER_LABELS[fType]}
                                            isActive={selectedFilter === fType}
                                            onPress={() => applyFilter(fType)}
                                            accentColor={accentColor}
                                            isDark={isDark}
                                        />
                                    ))}
                                </ScrollView>
                            )}

                            {/* Tool row */}
                            <View style={styles.toolRow}>
                                <ToolButton
                                    icon={<RotateCcw size={22} color={isProcessing ? subtleColor : iconColor} />}
                                    label="Rotar"
                                    onPress={() => applyTransform([{ rotate: 90 }])}
                                    disabled={isProcessing}
                                    labelColor={isProcessing ? subtleColor : labelColor}
                                />
                                <ToolButton
                                    icon={<FlipHorizontal size={22} color={isProcessing ? subtleColor : iconColor} />}
                                    label="Voltear"
                                    onPress={() => applyTransform([{ flip: FlipType.Horizontal }])}
                                    disabled={isProcessing}
                                    labelColor={isProcessing ? subtleColor : labelColor}
                                />
                                <ToolButton
                                    icon={<FlipVertical size={22} color={isProcessing ? subtleColor : iconColor} />}
                                    label="Espejo"
                                    onPress={() => applyTransform([{ flip: FlipType.Vertical }])}
                                    disabled={isProcessing}
                                    labelColor={isProcessing ? subtleColor : labelColor}
                                />
                                <ToolButton
                                    icon={<Crop size={22} color={(isProcessing ? subtleColor : accentColor) as any} />}
                                    label="Recortar"
                                    onPress={handleOpenCrop}
                                    disabled={isProcessing}
                                    labelColor={isProcessing ? subtleColor : accentColor}
                                />
                                <ToolButton
                                    icon={<Sliders size={22} color={(showFilters ? accentColor : (isProcessing ? subtleColor : iconColor)) as any} />}
                                    label="Filtros"
                                    onPress={() => setShowFilters(v => !v)}
                                    disabled={isProcessing}
                                    labelColor={showFilters ? accentColor : (isProcessing ? subtleColor : labelColor)}
                                    active={showFilters}
                                    accentColor={accentColor}
                                    isDark={isDark}
                                />
                            </View>

                            {/* Undo / Redo bar */}
                            <View style={[styles.undoBar, { borderTopColor: borderColor }]}>
                                <TouchableOpacity
                                    onPress={() => setHistoryIndex(i => i - 1)}
                                    disabled={!canUndo || isProcessing}
                                    style={styles.undoBtn}
                                    activeOpacity={0.7}
                                >
                                    <Undo2 size={16} color={canUndo && !isProcessing ? iconColor : subtleColor} />
                                    <Text style={[styles.undoLabel, { color: canUndo && !isProcessing ? iconColor : subtleColor }]}>
                                        Deshacer
                                    </Text>
                                </TouchableOpacity>

                                <Text style={[styles.stepCount, { color: labelColor }]}>
                                    {historyIndex + 1} / {history.length}
                                </Text>

                                <TouchableOpacity
                                    onPress={() => setHistoryIndex(i => i + 1)}
                                    disabled={!canRedo || isProcessing}
                                    style={styles.undoBtn}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.undoLabel, { color: canRedo && !isProcessing ? iconColor : subtleColor }]}>
                                        Rehacer
                                    </Text>
                                    <Redo2 size={16} color={canRedo && !isProcessing ? iconColor : subtleColor} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </>
                )}

                {/* ── CROP PHASE ──────────────────────────────────────────── */}
                {phase === 'crop' && currentUri && (
                    <View style={StyleSheet.absoluteFill}>
                        {/* Editor window: leaves space at bottom so crop frame is centered above toolbar */}
                        <View style={[styles.cropEditorContainer, { paddingBottom: Math.max(insets.bottom, 14) + 124 }]}>
                            <ImageEditor
                                key={cropKey}
                                useModal={false}
                                imageUri={currentUri}
                                onEditingComplete={(result) => {
                                    setHistory(prev => {
                                        const newH = prev.slice(0, historyIndex + 1);
                                        newH.push(result.uri);
                                        setHistoryIndex(newH.length - 1);
                                        return newH;
                                    });
                                    setPhase('main');
                                }}
                                onEditingCancel={() => setPhase('main')}
                                dynamicCrop={cropRatio === null}
                                fixedAspectRatio={cropRatio ?? undefined}
                                customControlBar={cropControlBar}
                                editorOptions={{ backgroundColor: bg }}
                            />
                        </View>

                        {/* ── Docked bottom crop bar pinned to full screen bottom ── */}
                        <View
                            style={[
                                styles.cropControlBar,
                                {
                                    backgroundColor: sheetBg,
                                    borderTopColor: borderColor,
                                    paddingBottom: Math.max(insets.bottom, 14),
                                },
                            ]}
                        >
                            <BlurView
                                intensity={isDark ? 80 : 70}
                                tint={isDark ? 'dark' : 'light'}
                                style={StyleSheet.absoluteFill}
                            />
                            {/* Handle */}
                            <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)' }]} />

                            {/* Aspect ratio chips */}
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.ratioPills}
                                style={styles.ratioRow}
                            >
                                {CROP_RATIOS.map(opt => {
                                    const isActive = cropRatio === opt.ratio;
                                    return (
                                        <TouchableOpacity
                                            key={opt.label}
                                            onPress={() => {
                                                setCropRatio(opt.ratio);
                                                setCropKey(k => k + 1);
                                            }}
                                            style={[
                                                styles.ratioPill,
                                                { borderColor: isActive ? accentColor : borderColor },
                                                isActive && { backgroundColor: accentColor },
                                            ]}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={[
                                                styles.ratioPillText,
                                                { color: isActive ? '#fff' : labelColor },
                                            ]}>
                                                {opt.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            {/* Controls row */}
                            <View style={styles.cropControls}>
                                <TouchableOpacity
                                    onPress={() => {
                                        cropActionsRef.current?.onCancel?.();
                                        setPhase('main');
                                    }}
                                    style={styles.cropBtn}
                                    activeOpacity={0.7}
                                >
                                    <ChevronLeft size={20} color={iconColor} />
                                    <Text style={[styles.cropBtnLabel, { color: iconColor }]}>Atrás</Text>
                                </TouchableOpacity>

                                <Text style={[styles.cropTitle, { color: iconColor }]}>Recortar</Text>

                                <TouchableOpacity
                                    onPress={async () => {
                                        if (cropActionsRef.current?.onCrop) {
                                            await cropActionsRef.current.onCrop();
                                        }
                                    }}
                                    disabled={isProcessing}
                                    style={styles.cropBtn}
                                    activeOpacity={0.7}
                                >
                                    <Check size={20} color={(isProcessing ? subtleColor : accentColor) as any} />
                                    <Text style={[styles.cropBtnLabel, { color: isProcessing ? subtleColor : accentColor }]}>
                                        Aplicar
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* ── Hidden WebView for filter processing ──────────────── */}
                <WebView
                    ref={filterWebViewRef}
                    source={{ html: FILTER_HTML }}
                    style={styles.hiddenWebView}
                    onMessage={handleFilterMessage}
                    javaScriptEnabled
                    domStorageEnabled
                    scrollEnabled={false}
                />
            </View>
        </Modal>
    );
}

// ─── ToolButton helper ────────────────────────────────────────────────────────
function ToolButton({
    icon, label, onPress, disabled, labelColor, active, accentColor, isDark,
}: {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    labelColor: string;
    active?: boolean;
    accentColor?: string;
    isDark?: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={[
                styles.toolBtn,
                active && accentColor && { backgroundColor: `${accentColor}22` },
            ]}
            activeOpacity={0.65}
        >
            {icon}
            <Text style={[styles.toolLabel, { color: labelColor }]}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: {
        flex: 1,
        overflow: 'hidden',
    },
    // ── Header
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        zIndex: 100,
        elevation: 20,
        overflow: 'hidden',
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    headerAction: {
        alignItems: 'center',
        gap: 4,
        minWidth: 60,
    },
    headerActionLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
    pillBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // ── Preview
    preview: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    // ── Bottom Sheet
    bottomSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
        paddingTop: 8,
        zIndex: 100,
        elevation: 20,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 10,
    },
    // ── Filter chips
    filterRowScroll: {
        marginBottom: 10,
    },
    filterRow: {
        paddingHorizontal: 16,
        gap: 10,
    },
    filterThumb: {
        alignItems: 'center',
        gap: 4,
    },
    filterThumbBorder: {
        width: 56,
        height: 56,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    filterLabel: {
        fontSize: 10,
        fontWeight: '600',
    },
    // ── Tool row
    toolRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    toolBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 10,
        borderRadius: 12,
    },
    toolLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
    // ── Undo bar
    undoBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    undoBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    undoLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    stepCount: {
        fontSize: 11,
        fontWeight: '500',
    },
    // ── Crop control bar
    cropEditorContainer: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    cropControlBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        paddingTop: 8,
        zIndex: 100,
        elevation: 20,
    },
    ratioRow: {
        paddingTop: 10,
    },
    ratioPills: {
        paddingHorizontal: 16,
        gap: 8,
        alignItems: 'center',
    },
    ratioPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1.5,
    },
    ratioPillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    cropControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    cropBtn: {
        alignItems: 'center',
        gap: 2,
        minWidth: 64,
    },
    cropBtnLabel: {
        fontSize: 10,
        fontWeight: '600',
    },
    cropTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    // ── Hidden WebView
    hiddenWebView: {
        position: 'absolute',
        width: 1,
        height: 1,
        top: -100,
        left: -100,
        opacity: 0,
    },
});
