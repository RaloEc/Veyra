import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ChevronLeft,
    Hash,
    Edit3,
    Trash2,
    Calendar as CalendarIcon,
    CheckSquare,
    Check,
    X,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../../src/components/ui';
import { TagService } from '../../src/services/TagService';
import { Tag, CalendarEvent, Reminder } from '../../src/types/db';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function TagDetailScreen() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const router = useRouter();
    const { t } = useTranslation();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();

    const [isLoading, setIsLoading] = useState(true);
    const [tag, setTag] = useState<Tag | null>(null);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [reminders, setReminders] = useState<Reminder[]>([]);

    const [isRenaming, setIsRenaming] = useState(false);
    const [newTagName, setNewTagName] = useState('');

    const loadData = useCallback(async () => {
        if (!slug) return;
        setIsLoading(true);
        try {
            const data = await TagService.getItemsByTag(slug);
            setTag(data.tag);
            setEvents(data.events);
            setReminders(data.reminders);
            if (data.tag) {
                setNewTagName(data.tag.name);
            }
        } catch (err) {
            console.error('[TagDetailScreen] Error cargando tag:', err);
        } finally {
            setIsLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRename = async () => {
        if (!slug || !newTagName.trim()) return;
        try {
            const updated = await TagService.renameTag(slug, newTagName.trim());
            if (updated) {
                setIsRenaming(false);
                // Si el slug cambió, navegar al nuevo slug
                if (updated.slug !== slug) {
                    router.replace(`/tag/${updated.slug}`);
                } else {
                    setTag(updated);
                }
            }
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'No se pudo renombrar la etiqueta.');
        }
    };

    const handleDeleteTag = () => {
        Alert.alert(
            'Eliminar etiqueta',
            `¿Deseas eliminar la etiqueta #${tag?.name || slug}? Los eventos y recordatorios no se borrarán.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        if (slug) {
                            await TagService.deleteTag(slug);
                            router.back();
                        }
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />

                <View style={styles.headerTitleBox}>
                    {isRenaming ? (
                        <View style={styles.renameInputRow}>
                            <TextInput
                                value={newTagName}
                                onChangeText={setNewTagName}
                                style={[styles.renameInput, { color: colors.textPrimary, borderColor: accent.primary }]}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={handleRename}
                            />
                            <TouchableOpacity onPress={handleRename} style={styles.renameActionBtn}>
                                <Check size={16} color={accent.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setIsRenaming(false)} style={styles.renameActionBtn}>
                                <X size={16} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.headerTagDisplay}>
                            <Hash size={18} color={accent.primary} strokeWidth={2.5} />
                            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                {tag?.name || slug}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.headerActions}>
                    {!isRenaming && (
                        <>
                            <VeyraIconButton
                                variant="ghost"
                                size="sm"
                                icon={<Edit3 size={17} color={colors.textSecondary} />}
                                onPress={() => setIsRenaming(true)}
                            />
                            <VeyraIconButton
                                variant="danger"
                                size="sm"
                                icon={<Trash2 size={17} color={isDark ? '#FB7185' : '#E11D48'} />}
                                onPress={handleDeleteTag}
                            />
                        </>
                    )}
                </View>
            </View>

            {isLoading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={accent.primary} />
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Contador general */}
                    <View style={styles.metaRow}>
                        <Text style={[styles.metaText, { color: colors.textMuted }]}>
                            {events.length} {events.length === 1 ? 'evento' : 'eventos'} · {reminders.length} {reminders.length === 1 ? 'recordatorio' : 'recordatorios'}
                        </Text>
                    </View>

                    {/* Sección Eventos */}
                    <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                            <CalendarIcon size={16} color={accent.primary} />
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                                EVENTOS
                            </Text>
                        </View>

                        {events.length > 0 ? (
                            <View style={styles.itemsList}>
                                {events.map((ev) => (
                                    <TouchableOpacity
                                        key={ev.id}
                                        activeOpacity={0.7}
                                        onPress={() => router.push({ pathname: '/events/[id]', params: { id: ev.id } })}
                                        style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>
                                                {ev.is_birthday_like ? '🎂 ' : ''}{ev.title}
                                            </Text>
                                            <Text style={[styles.itemSub, { color: colors.textMuted }]}>
                                                {ev.is_all_day ? `Todo el día (${ev.all_day_date || ''})` : format(new Date(ev.start_time_ms), "d 'de' MMMM, HH:mm", { locale: es })}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <Text style={[styles.emptySectionText, { color: colors.textMuted }]}>
                                No hay eventos vinculados a esta etiqueta.
                            </Text>
                        )}
                    </View>

                    {/* Sección Recordatorios */}
                    <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                            <CheckSquare size={16} color={accent.primary} />
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                                RECORDATORIOS
                            </Text>
                        </View>

                        {reminders.length > 0 ? (
                            <View style={styles.itemsList}>
                                {reminders.map((rem) => (
                                    <TouchableOpacity
                                        key={rem.id}
                                        activeOpacity={0.7}
                                        onPress={() => router.push({ pathname: '/reminder/[id]', params: { id: rem.id } })}
                                        style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>
                                                {rem.title}
                                            </Text>
                                            <Text style={[styles.itemSub, { color: colors.textMuted }]}>
                                                {format(new Date(rem.due_date_ms), "d 'de' MMMM, HH:mm", { locale: es })} · Nivel: {rem.control_level}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <Text style={[styles.emptySectionText, { color: colors.textMuted }]}>
                                No hay recordatorios vinculados a esta etiqueta.
                            </Text>
                        )}
                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    headerTitleBox: {
        flex: 1,
        marginHorizontal: 12,
    },
    headerTagDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    renameInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    renameInput: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderRadius: 8,
    },
    renameActionBtn: {
        padding: 4,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    metaRow: {
        marginBottom: 16,
    },
    metaText: {
        fontSize: 13,
        fontWeight: '500',
    },
    sectionBlock: {
        marginBottom: 24,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    itemsList: {
        gap: 8,
    },
    itemCard: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    itemSub: {
        fontSize: 12,
        marginTop: 3,
    },
    emptySectionText: {
        fontSize: 13,
        fontStyle: 'italic',
        marginTop: 4,
    },
});

