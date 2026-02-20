import { View, Text, YStack, XStack, Button, H2, H4, Paragraph, Separator, Card, Theme, Spinner, AnimatePresence, Portal } from 'tamagui';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import { useEffect, useMemo, useState, useRef } from 'react';
import { ScrollView, TouchableOpacity, useWindowDimensions, StyleSheet, Image, FlatList, Animated, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isToday, isPast, formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, AlertCircle, Zap, TrendingUp, Plus, ChevronRight, ChevronLeft, Activity, History, Check, Edit3, FileText, Image as ImageIcon, Link as LinkIcon, X, Trash2 } from '@tamagui/lucide-icons';
import { Reminder } from '../src/types/db';
import RenderHTML from 'react-native-render-html';
import { BlurView } from 'expo-blur';
import { FlashList } from '@shopify/flash-list';
import ImageViewing from "react-native-image-viewing";
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';


export default function HomeScreen() {
    const router = useRouter();
    const { reminders, loadReminders, markAsCompleted, snoozeReminder, deleteReminder, theme, history, loadHistory, onboardingCompleted, isHydrated, detailReminder, setDetailReminder } = useStore();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [now, setNow] = useState(Date.now());
    const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);
    const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);

    // --- LÓGICA DE ANIMACIÓN NATIVA (Guía del Usuario) ---
    const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;
    const scaleAnim = useRef(new Animated.Value(0.95)).current;

    useEffect(() => {
        if (detailReminder) {
            setActiveReminder(detailReminder);
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }),
                Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 20, duration: 250, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 0.95, duration: 250, useNativeDriver: true })
            ]).start(() => {
                setActiveReminder(null);
            });
        }
    }, [detailReminder]);

    // --- PALETA SEMÁNTICA (Focus & Alarm) ---
    const colors = {
        bg: theme === 'dark' ? '#0a0a0a' : '#F8FAFC',
        surface: theme === 'dark' ? '#171717' : '#FFFFFF',
        textPrimary: theme === 'dark' ? '#EDEDED' : '#0c0a09',
        textSecondary: theme === 'dark' ? '#A1A1A1' : '#64748B',
        textMuted: theme === 'dark' ? '#525252' : '#94A3B8',
        border: theme === 'dark' ? '#262626' : '#E2E8F0',
        brand: theme === 'dark' ? '#A1A1A1' : '#64748B',
        normal: theme === 'dark' ? '#22c55e' : '#10B981',
        strict: theme === 'dark' ? '#eab308' : '#F59E0B',
        critical: theme === 'dark' ? '#ef4444' : '#E11D48',
    };

    useEffect(() => {
        if (isHydrated && !onboardingCompleted) {
            router.replace('/onboarding');
        }
    }, [isHydrated, onboardingCompleted]);

    useEffect(() => {
        loadReminders();
        loadHistory();
        const interval = setInterval(() => {
            loadReminders();
            setNow(Date.now());
        }, 1000 * 30);
        return () => clearInterval(interval);
    }, []);

    const sortedReminders = useMemo(() => {
        return [...reminders].sort((a, b) => a.due_date_ms - b.due_date_ms);
    }, [reminders]);

    const nextNow = useMemo(() => {
        // El más urgente (vencido o para hoy) que no esté completado
        return sortedReminders.find(r => r.status === 'pending') || null;
    }, [sortedReminders]);

    // Modificación para FlashList: Creamos una lista plana de items con tipos
    const listData = useMemo(() => {
        const data: any[] = [];
        const remainingReminders = sortedReminders.filter(r => r.id !== nextNow?.id && r.status === 'pending');

        const overdue = remainingReminders.filter(r => isPast(r.due_date_ms));
        const today = remainingReminders.filter(r => isToday(r.due_date_ms) && !isPast(r.due_date_ms));
        const upcoming = remainingReminders.filter(r => !isToday(r.due_date_ms) && !isPast(r.due_date_ms));

        if (overdue.length > 0) {
            data.push({ type: 'header', title: 'URGENTE', color: colors.critical });
            overdue.forEach(r => data.push({ type: 'reminder', item: r }));
        }

        if (today.length > 0) {
            data.push({ type: 'header', title: 'HOY', color: colors.brand });
            today.forEach(r => data.push({ type: 'reminder', item: r }));
        }

        if (upcoming.length > 0) {
            data.push({ type: 'header', title: 'PRÓXIMOS', color: colors.textMuted });
            upcoming.forEach(r => data.push({ type: 'reminder', item: r }));
        }

        // Stats para el header
        const completedToday = history.filter(h => isToday(h.last_modified_ms) && h.status === 'completed').length;
        const overdueCount = overdue.length;

        return { data, stats: { completedToday, overdueCount }, overdueCount }; // Return overdueCount separately for easy access
    }, [sortedReminders, nextNow, now, history]);

    const hasCriticalActive = useMemo(() => reminders.some(r => r.control_level === 'critical' && r.status === 'pending'), [reminders]);

    // Eliminamos stats memoizado anterior ya que ahora está integrado en listData

    const getRiskInfo = (dueDate: number) => {
        const diff = differenceInMinutes(dueDate, now);
        const absDiff = Math.abs(diff);

        let shortText = '';
        if (absDiff < 60) {
            shortText = `${absDiff}m`;
        } else if (absDiff < 1440) {
            const h = Math.floor(absDiff / 60);
            const m = absDiff % 60;
            // Si hay minutos los mostramos, si no solo la hora
            shortText = m > 0 ? `${h}h ${m}m` : `${h}h`;
        } else {
            const d = Math.floor(absDiff / 1440);
            shortText = `${d}d`;
        }

        if (diff < 0) return {
            text: shortText,
            color: colors.critical,
            full: `Vencido hace ${shortText}`,
            isOverdue: true
        };

        const color = diff <= 60 ? colors.strict : colors.textSecondary;
        return {
            text: shortText,
            color: color,
            full: `En ${shortText}`,
            isOverdue: false
        };
    };

    const ReminderCard = ({ item }: { item: Reminder }) => {
        const risk = getRiskInfo(item.due_date_ms);
        const level = item.control_level;

        // Estilo basado en nivel de presión
        const isCritical = level === 'critical';
        const isStrict = level === 'strict';

        const cardBg = isCritical ? colors.critical : colors.surface;
        const textColor = isCritical ? '#FFFFFF' : colors.textPrimary;
        const subTextColor = isCritical ? 'rgba(255,255,255,0.8)' : colors.textSecondary;
        const borderColor = isCritical ? colors.critical : (isStrict ? colors.strict : colors.border);
        const borderWidth = isStrict ? 2 : 1;

        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/create', params: { id: item.id } })}
            >
                <XStack
                    backgroundColor={cardBg}
                    borderColor={borderColor}
                    borderWidth={borderWidth}
                    borderRadius="$4"
                    padding="$3"
                    mb="$2"
                    alignItems="center"
                    elevation={isCritical ? 4 : 0}
                >
                    <YStack width={55} justifyContent="center" alignItems="center" mr="$3" borderRightWidth={1} borderRightColor={isCritical ? 'rgba(255,255,255,0.2)' : colors.border}>
                        <Text color={isCritical ? '#FFFFFF' : risk.color} fontSize="$4" fontWeight="900" fontFamily="$mono">
                            {risk.text}
                        </Text>
                    </YStack>

                    <YStack flex={1} gap="$1">
                        <Text color={textColor} fontSize="$4" fontWeight="700" numberOfLines={1}>
                            {item.title}
                        </Text>
                        <Text color={subTextColor} fontSize="$1" fontWeight="600" textTransform="uppercase">
                            {level} • {risk.full}
                        </Text>
                    </YStack>
                </XStack>
            </TouchableOpacity>
        );
    };

    const HeroCard = ({ item }: { item: Reminder }) => {
        const risk = getRiskInfo(item.due_date_ms);
        const isCritical = item.control_level === 'critical';
        const isStrict = item.control_level === 'strict';

        // Definir color de fondo del header basado en nivel
        const headerBg = isCritical ? colors.critical : (isStrict ? colors.strict : colors.brand);
        const headerTextColor = (isCritical || isStrict || theme === 'dark') ? 'white' : 'white'; // Forzar blanco en headers de color para contraste

        return (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setDetailReminder(item)}>
                <YStack
                    mb="$6"
                    mt="$2"
                    backgroundColor={colors.surface}
                    borderRadius="$6"
                    borderWidth={2}
                    borderColor={headerBg}
                    elevation={8}
                    overflow="hidden"
                >
                    {/* Header de la Tarjeta con el Color del Tipo */}
                    <XStack
                        paddingHorizontal="$4"
                        paddingVertical="$2"
                        backgroundColor={headerBg}
                        justifyContent="space-between"
                        alignItems="center"
                    >
                        <XStack alignItems="center" gap="$2">
                            <Text
                                fontSize="$1"
                                fontWeight="900"
                                color="white"
                                textTransform="uppercase"
                                letterSpacing={1}
                            >
                                {item.control_level}
                            </Text>
                        </XStack>

                        <XStack alignItems="center" gap="$1.5">
                            <Clock size={12} color="white" />
                            <Text
                                fontSize="$1"
                                fontWeight="800"
                                color="white"
                                fontFamily="$mono"
                            >
                                {risk.isOverdue ? 'VENCIDO ' : 'FALTAN '}
                                {risk.text}
                            </Text>
                        </XStack>
                    </XStack>

                    {/* Contenido Principal (Blanco o Negro según tema) */}
                    <YStack padding="$4" pt="$3">
                        <Text
                            fontSize="$2"
                            fontWeight="900"
                            color={headerBg}
                            textTransform="uppercase"
                            letterSpacing={2}
                            mb="$1"
                        >
                            PRÓXIMO OBJETIVO
                        </Text>
                        <H2
                            color={colors.textPrimary}
                            fontWeight="900"
                            fontSize="$7"
                            lineHeight="$8"
                        >
                            {item.title}
                        </H2>
                    </YStack>
                </YStack>
            </TouchableOpacity>
        );
    };

    const ListHeader = () => (
        <YStack>
            <XStack justifyContent="space-between" alignItems="flex-end" mb="$5">
                <XStack gap="$4">
                    <Text fontSize="$2" color={colors.textSecondary} fontWeight="600">{listData.stats.completedToday} completados</Text>
                    {listData.stats.overdueCount > 0 && <Text fontSize="$2" color={colors.critical} fontWeight="800">{listData.stats.overdueCount} vencidos</Text>}
                </XStack>
                <TouchableOpacity onPress={() => router.push('/history')}>
                    <History size={20} color={colors.textSecondary} />
                </TouchableOpacity>
            </XStack>

            {nextNow ? <HeroCard item={nextNow} /> : (
                <YStack mb="$6" padding="$6" backgroundColor={colors.surface} borderRadius="$6" borderStyle="dashed" borderWidth={2} borderColor={colors.border} alignItems="center">
                    <Activity size={32} color={colors.textMuted} mb="$2" />
                    <Text fontSize="$3" fontWeight="800" color={colors.textSecondary} textTransform="uppercase" letterSpacing={1}>
                        EN CALMA
                    </Text>
                </YStack>
            )}
        </YStack>
    );

    const renderItem = ({ item }: any) => {
        if (item.type === 'header') {
            return (
                <View mb="$4" mt="$2">
                    <XStack alignItems="center" mb="$2" gap="$2">
                        <View width={8} height={8} borderRadius={4} backgroundColor={item.color} />
                        <Text fontSize="$2" fontWeight="900" color={colors.textSecondary} textTransform="uppercase" letterSpacing={1}>{item.title}</Text>
                    </XStack>
                </View>
            );
        }
        return <ReminderCard item={item.item} />;
    };

    const ListEmptyComponent = () => (
        <YStack flex={1} justifyContent="center" alignItems="center" py="$10" opacity={0.6}>
            <Paragraph color={colors.textSecondary} textAlign="center">No hay nada que requiera tu atención inmediata.</Paragraph>
        </YStack>
    );

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            {hasCriticalActive && (
                <View height={3} backgroundColor={colors.critical} width="100%" />
            )}

            <View style={{ flex: 1, paddingHorizontal: 20 }}>
                <FlashList
                    data={listData.data}
                    renderItem={renderItem}
                    estimatedItemSize={100}
                    ListHeaderComponent={ListHeader}
                    ListEmptyComponent={listData.data.length === 0 && !nextNow ? ListEmptyComponent : null}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
                />
            </View>

            {/* Quick Action para posponer vencidos */}
            {listData.overdueCount > 0 && (
                <XStack
                    position="absolute"
                    bottom={insets.bottom + 95}
                    alignSelf="center"
                    zIndex={900}
                >
                    <Button
                        size="$2"
                        backgroundColor={theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(225, 29, 72, 0.08)'}
                        borderColor={colors.critical}
                        borderWidth={1}
                        borderRadius="$10"
                        onPress={async () => {
                            const overdue = reminders.filter(r => isPast(r.due_date_ms) && r.status === 'pending');
                            for (const r of overdue) await snoozeReminder(r.id, 10, true);
                        }}
                        icon={<Zap size={14} color={colors.critical} />}
                        pressStyle={{ scale: 0.95, opacity: 0.8 }}
                    >
                        <Text color={colors.critical} fontWeight="700" fontSize="$1" letterSpacing={0.5}>
                            POSPONER VENCIDOS (10m)
                        </Text>
                    </Button>
                </XStack>
            )}

            {/* Modal de Detalle con Animación Nativa Directa (Siguiendo tu Guía) */}
            <AnimatePresence>
                {activeReminder && (
                    <Portal key="native-modal-portal">
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                { zIndex: 10000, opacity: fadeAnim }
                            ]}
                        >
                            <BlurView
                                tint={theme === 'dark' ? 'dark' : 'light'}
                                intensity={0.2}
                                experimentalBlurMethod="dimezisBlurView"
                                style={StyleSheet.absoluteFill}
                            />
                            {/* Overlay de color */}
                            <YStack
                                backgroundColor={theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.2)'}
                                {...StyleSheet.absoluteFillObject}
                            />

                            <TouchableOpacity
                                activeOpacity={1}
                                style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}
                                onPress={() => setDetailReminder(null)}
                            >
                                <Animated.View
                                    style={{
                                        width: '100%',
                                        maxWidth: 340,
                                        transform: [
                                            { translateY: slideAnim },
                                            { scale: scaleAnim }
                                        ]
                                    }}
                                >
                                    <YStack
                                        onPress={(e) => e.stopPropagation()}
                                        width="100%"
                                        backgroundColor={colors.surface}
                                        borderRadius="$5"
                                        padding="$5"
                                        gap="$4"
                                        elevation={15}
                                    >
                                        {/* Cabecera del Modal */}
                                        <YStack gap="$1">
                                            <XStack justifyContent="space-between" alignItems="flex-start">
                                                <View
                                                    backgroundColor={
                                                        activeReminder.control_level === 'critical' ? colors.critical :
                                                            activeReminder.control_level === 'strict' ? colors.strict :
                                                                colors.brand
                                                    }
                                                    paddingHorizontal="$2"
                                                    paddingVertical="$0.5"
                                                    borderRadius="$2"
                                                >
                                                    <Text color="white" fontSize="$1" fontWeight="800" textTransform="uppercase">
                                                        {activeReminder.control_level}
                                                    </Text>
                                                </View>
                                                <XStack gap="$2">
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            const id = activeReminder.id;
                                                            setDetailReminder(null);
                                                            router.push({ pathname: '/create', params: { id } });
                                                        }}
                                                        style={{
                                                            backgroundColor: theme === 'dark' ? '$gray3' : '$gray4',
                                                            padding: 8,
                                                            borderRadius: 20
                                                        }}
                                                    >
                                                        <Edit3 size={18} color={colors.textSecondary} />
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        onPress={() => setIsDeleteConfirmVisible(true)}
                                                        style={{
                                                            backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                                                            padding: 8,
                                                            borderRadius: 20
                                                        }}
                                                    >
                                                        <Trash2 size={18} color={colors.critical} />
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        onPress={() => setDetailReminder(null)}
                                                        style={{
                                                            backgroundColor: theme === 'dark' ? '$gray3' : '$gray4',
                                                            padding: 8,
                                                            borderRadius: 20
                                                        }}
                                                    >
                                                        <X size={18} color={colors.textSecondary} />
                                                    </TouchableOpacity>
                                                </XStack>
                                            </XStack>

                                            <H2 fontSize="$7" fontWeight="900" color={colors.textPrimary} mt="$2">
                                                {activeReminder.title}
                                            </H2>

                                            {activeReminder.description ? (
                                                <YStack maxHeight={150} overflow="hidden" mt="$1">
                                                    <RenderHTML
                                                        contentWidth={300}
                                                        source={{ html: activeReminder.description }}
                                                        baseStyle={{
                                                            color: colors.textSecondary,
                                                            fontSize: 14,
                                                            lineHeight: 18
                                                        }}
                                                        tagsStyles={{
                                                            img: {
                                                                maxWidth: '100%',
                                                                height: 'auto',
                                                                borderRadius: 8,
                                                                marginTop: 10,
                                                                marginBottom: 10,
                                                            }
                                                        }}
                                                    />
                                                </YStack>
                                            ) : null}
                                        </YStack>

                                        {/* Sección de Adjuntos en el Modal */}
                                        {activeReminder.attachments && JSON.parse(activeReminder.attachments).length > 0 && (() => {
                                            const allAttachments = JSON.parse(activeReminder.attachments!);
                                            const images = allAttachments.filter((item: any) => {
                                                const uri = typeof item === 'string' ? item : item.uri;
                                                return uri.toLowerCase().includes('imagepicker') ||
                                                    uri.toLowerCase().endsWith('.jpg') ||
                                                    uri.toLowerCase().endsWith('.png') ||
                                                    uri.toLowerCase().endsWith('.jpeg') ||
                                                    uri.startsWith('data:image');
                                            });
                                            const otherFiles = allAttachments.filter((item: any) => !images.includes(item));

                                            const openAttachment = async (uri: string) => {
                                                try {
                                                    if (Platform.OS === 'android') {
                                                        const cUri = await FileSystem.getContentUriAsync(uri);
                                                        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                                                            data: cUri,
                                                            flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
                                                        });
                                                    } else {
                                                        if (await Sharing.isAvailableAsync()) {
                                                            await Sharing.shareAsync(uri);
                                                        }
                                                    }
                                                } catch (error) {
                                                    console.error('Error al abrir archivo:', error);
                                                    // Fallback al menú de compartir si falla el intent directo
                                                    if (await Sharing.isAvailableAsync()) {
                                                        await Sharing.shareAsync(uri);
                                                    }
                                                }
                                            };

                                            return (
                                                <YStack gap="$2" mt="$1">
                                                    {/* Carrusel de Imágenes */}
                                                    {images.length > 0 && (
                                                        <View position="relative">
                                                            <ScrollView
                                                                horizontal
                                                                showsHorizontalScrollIndicator={false}
                                                                onScroll={(e) => {
                                                                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                                                                    setShowLeftArrow(contentOffset.x > 10);
                                                                    setShowRightArrow(contentOffset.x + layoutMeasurement.width < contentSize.width - 10);
                                                                }}
                                                                scrollEventThrottle={16}
                                                                onContentSizeChange={(w, h) => {
                                                                    // Si el contenido es más ancho que el espacio disponible, mostrar flecha
                                                                    setShowRightArrow(w > 300); // 300 es el ancho aprox del contenedor modal
                                                                }}
                                                                contentContainerStyle={{ gap: 8, paddingRight: 20 }}
                                                            >
                                                                {images.map((item: any, idx: number) => {
                                                                    const uri = typeof item === 'string' ? item : item.uri;
                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={idx}
                                                                            onPress={() => {
                                                                                setGalleryImages(images.map((img: any) => ({ uri: typeof img === 'string' ? img : img.uri })));
                                                                                setGalleryIndex(idx);
                                                                                setGalleryVisible(true);
                                                                            }}
                                                                        >
                                                                            <View
                                                                                width={100}
                                                                                height={100}
                                                                                borderRadius="$4"
                                                                                overflow="hidden"
                                                                                backgroundColor={theme === 'dark' ? '$gray2' : '$gray3'}
                                                                                borderColor={colors.border}
                                                                                borderWidth={1}
                                                                                elevation={5}
                                                                            >
                                                                                <Image
                                                                                    source={{ uri }}
                                                                                    style={{ width: '100%', height: '100%' }}
                                                                                    resizeMode="cover"
                                                                                />
                                                                            </View>
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                            </ScrollView>

                                                            {/* Indicadores de Scroll */}
                                                            {
                                                                showLeftArrow && (
                                                                    <View position="absolute" left={-8} top="35%" zIndex={10} backgroundColor={colors.surface} borderRadius={20} padding={4} elevation={5} borderColor={colors.border} borderWidth={1}>
                                                                        <ChevronLeft size={16} color={colors.textPrimary} />
                                                                    </View>
                                                                )
                                                            }
                                                            {
                                                                showRightArrow && (
                                                                    <View position="absolute" right={12} top="35%" zIndex={10} backgroundColor={colors.surface} borderRadius={20} padding={4} elevation={5} borderColor={colors.border} borderWidth={1}>
                                                                        <ChevronRight size={16} color={colors.textPrimary} />
                                                                    </View>
                                                                )
                                                            }
                                                        </View>
                                                    )
                                                    }

                                                    {/* Otros Archivos */}
                                                    {otherFiles.length > 0 && (
                                                        <XStack gap="$2" flexWrap="wrap">
                                                            {otherFiles.map((item: any, idx: number) => {
                                                                const uri = typeof item === 'string' ? item : item.uri;
                                                                const name = typeof item === 'string' ? `Archivo ${idx + 1}` : item.name;
                                                                return (
                                                                    <TouchableOpacity key={idx} onPress={() => openAttachment(uri)}>
                                                                        <XStack backgroundColor={theme === 'dark' ? '$gray2' : '$gray3'} padding="$1.5" paddingHorizontal="$2.5" borderRadius="$10" gap="$1.5" alignItems="center">
                                                                            <FileText size={12} color={colors.textSecondary} />
                                                                            <Text fontSize="$1" fontWeight="700" color={colors.textSecondary}>{name}</Text>
                                                                        </XStack>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </XStack>
                                                    )}
                                                </YStack>
                                            );
                                        })()}

                                        {/* Información de Tiempo */}
                                        <XStack gap="$2" alignItems="center">
                                            <Clock size={16} color={getRiskInfo(activeReminder.due_date_ms).color} />
                                            <Text color={getRiskInfo(activeReminder.due_date_ms).color} fontWeight="800" fontSize="$4">
                                                {getRiskInfo(activeReminder.due_date_ms).full}
                                            </Text>
                                        </XStack>

                                        {/* Acciones */}
                                        <XStack gap="$3" mt="$4">
                                            <Button
                                                flex={2}
                                                height={48}
                                                backgroundColor={colors.textPrimary}
                                                borderRadius="$10"
                                                pressStyle={{ scale: 0.97, opacity: 0.9 }}
                                                onPress={async () => {
                                                    await markAsCompleted(activeReminder.id);
                                                    setDetailReminder(null);
                                                }}
                                                icon={<Check size={18} color={colors.surface} strokeWidth={3} />}
                                            >
                                                <Text
                                                    color={colors.surface}
                                                    fontWeight="800"
                                                    fontSize="$3"
                                                    letterSpacing={0.5}
                                                    textTransform="uppercase"
                                                >
                                                    Listo
                                                </Text>
                                            </Button>

                                            <Button
                                                flex={1}
                                                height={48}
                                                backgroundColor="transparent"
                                                borderColor={colors.border}
                                                borderWidth={1}
                                                borderRadius="$10"
                                                pressStyle={{ scale: 0.97, backgroundColor: colors.border }}
                                                onPress={async () => {
                                                    await snoozeReminder(activeReminder.id, 5);
                                                    setDetailReminder(null);
                                                }}
                                                icon={<Zap size={16} color={colors.textSecondary} />}
                                            >
                                                <Text color={colors.textSecondary} fontWeight="600" fontSize="$2">5m</Text>
                                            </Button>
                                        </XStack>

                                        {/* Overlay de Confirmación de Eliminación */}
                                        <AnimatePresence>
                                            {isDeleteConfirmVisible && (
                                                <View
                                                    key="delete-confirm-overlay"
                                                    {...StyleSheet.absoluteFillObject}
                                                    backgroundColor={colors.surface}
                                                    borderRadius="$5"
                                                    zIndex={100}
                                                    padding="$5"
                                                    justifyContent="center"
                                                    alignItems="center"
                                                    enterStyle={{ opacity: 0, scale: 0.9 }}
                                                    exitStyle={{ opacity: 0, scale: 0.9 }}
                                                    animation="quick"
                                                >
                                                    <YStack alignItems="center" gap="$4" width="100%">
                                                        <View
                                                            backgroundColor={theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)'}
                                                            padding="$4"
                                                            borderRadius={50}
                                                        >
                                                            <Trash2 size={32} color={colors.critical} />
                                                        </View>

                                                        <YStack alignItems="center" gap="$2">
                                                            <Text fontSize="$6" fontWeight="900" color={colors.textPrimary} textAlign="center">
                                                                ¿Eliminar recordatorio?
                                                            </Text>
                                                            <Text fontSize="$3" color={colors.textSecondary} textAlign="center">
                                                                Esta acción no se puede deshacer.
                                                            </Text>
                                                        </YStack>

                                                        <XStack gap="$3" width="100%" mt="$2">
                                                            <Button
                                                                flex={1}
                                                                height={45}
                                                                backgroundColor="transparent"
                                                                borderColor={colors.border}
                                                                borderWidth={1}
                                                                borderRadius="$10"
                                                                onPress={() => setIsDeleteConfirmVisible(false)}
                                                            >
                                                                <Text color={colors.textSecondary} fontWeight="700">Cancelar</Text>
                                                            </Button>
                                                            <Button
                                                                flex={1}
                                                                height={45}
                                                                backgroundColor={colors.critical}
                                                                borderRadius="$10"
                                                                onPress={async () => {
                                                                    await deleteReminder(activeReminder.id);
                                                                    setIsDeleteConfirmVisible(false);
                                                                    setDetailReminder(null);
                                                                }}
                                                            >
                                                                <Text color="white" fontWeight="900">ELIMINAR</Text>
                                                            </Button>
                                                        </XStack>
                                                    </YStack>
                                                </View>
                                            )}
                                        </AnimatePresence>
                                    </YStack>
                                </Animated.View>
                            </TouchableOpacity>
                        </Animated.View>
                    </Portal>
                )}
            </AnimatePresence>

            <ImageViewing
                images={galleryImages}
                imageIndex={galleryIndex}
                visible={galleryVisible}
                onRequestClose={() => setGalleryVisible(false)}
                swipeToCloseEnabled={true}
                doubleTapToZoomEnabled={true}
                FooterComponent={({ imageIndex }) => (
                    <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", alignItems: "center", justifyContent: "center", paddingBottom: 40, paddingTop: 20 }}>
                        <Text color="white" fontWeight="800" fontSize="$4">
                            {galleryImages.length > 0 ? `${imageIndex + 1} / ${galleryImages.length}` : ''}
                        </Text>
                    </View>
                )}
            />
        </View >
    );
}
