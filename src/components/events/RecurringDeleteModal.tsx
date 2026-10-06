import React from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    Repeat,
    Calendar as CalendarIcon,
    Layers,
    Trash2,
    ChevronRight,
} from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useStore } from '../../store/useStore';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraButton } from '../ui/VeyraButton';

export interface RecurringDeleteModalProps {
    visible: boolean;
    eventTitle?: string;
    occurrenceDate?: Date;
    onClose: () => void;
    onConfirm: (mode: 'this' | 'following' | 'all') => void;
}

export const RecurringDeleteModal: React.FC<RecurringDeleteModalProps> = ({
    visible,
    eventTitle,
    occurrenceDate,
    onClose,
    onConfirm,
}) => {
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const language = useStore(state => state.language);
    const locale = language === 'es' ? es : enUS;

    const formattedDate = occurrenceDate
        ? format(occurrenceDate, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale })
        : null;

    return (
        <Modal
            transparent
            animationType="fade"
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <TouchableOpacity
                    style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackdrop || 'rgba(0,0,0,0.6)' }]}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <VeyraSurface
                    level={2}
                    radius="xl"
                    style={[
                        styles.modalCard,
                        { borderColor: colors.borderSubtle }
                    ]}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                            <Repeat size={20} color={accent.primary as any} strokeWidth={2.4} />
                        </View>
                        <View style={styles.headerTextWrap}>
                            <Text style={[styles.title, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                {language === 'es' ? '¿Eliminar evento recurrente?' : 'Delete recurring event?'}
                            </Text>
                            {eventTitle ? (
                                <Text style={[styles.eventTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {eventTitle}
                                </Text>
                            ) : null}
                            {formattedDate ? (
                                <Text style={[styles.dateText, { color: accent.primary }]}>
                                    {language === 'es' ? `Repetición: ${formattedDate}` : `Occurrence: ${formattedDate}`}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <Text style={[styles.instruction, { color: colors.textSecondary }]}>
                        {language === 'es'
                            ? 'Este evento se repite periódicamente. Elige qué deseas eliminar:'
                            : 'This event repeats periodically. Choose what you want to remove:'}
                    </Text>

                    {/* Opciones */}
                    <View style={styles.optionsList}>
                        {/* Opción 1: Solo este evento */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[
                                styles.optionItem,
                                {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            onPress={() => onConfirm('this')}
                        >
                            <View style={[styles.optionIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                <CalendarIcon size={17} color={accent.primary as any} strokeWidth={2.2} />
                            </View>
                            <View style={styles.optionContent}>
                                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Solo este evento' : 'This event only'}
                                </Text>
                                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                                    {language === 'es'
                                        ? 'Elimina únicamente la repetición de este día.'
                                        : 'Only this occurrence will be removed.'}
                                </Text>
                            </View>
                            <ChevronRight size={15} color={colors.textMuted as any} />
                        </TouchableOpacity>

                        {/* Opción 2: Este y los siguientes */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[
                                styles.optionItem,
                                {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            onPress={() => onConfirm('following')}
                        >
                            <View style={[styles.optionIconBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
                                <Layers size={17} color={"#F59E0B" as any} strokeWidth={2.2} />
                            </View>
                            <View style={styles.optionContent}>
                                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Este y los siguientes' : 'This and following events'}
                                </Text>
                                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                                    {language === 'es'
                                        ? 'Elimina esta repetición y las posteriores.'
                                        : 'Removes this and future occurrences.'}
                                </Text>
                            </View>
                            <ChevronRight size={15} color={colors.textMuted as any} />
                        </TouchableOpacity>

                        {/* Opción 3: Todos los eventos */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[
                                styles.optionItem,
                                {
                                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                                    borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                                },
                            ]}
                            onPress={() => onConfirm('all')}
                        >
                            <View style={[styles.optionIconBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)' }]}>
                                <Trash2 size={17} color={(isDark ? '#FB7185' : '#E11D48') as any} strokeWidth={2.2} />
                            </View>
                            <View style={styles.optionContent}>
                                <Text style={[styles.optionTitle, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                                    {language === 'es' ? 'Todos los eventos de la serie' : 'All events in series'}
                                </Text>
                                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                                    {language === 'es'
                                        ? 'Elimina la serie completa (pasados y futuros).'
                                        : 'Removes all occurrences completely.'}
                                </Text>
                            </View>
                            <ChevronRight size={15} color={colors.textMuted as any} />
                        </TouchableOpacity>
                    </View>

                    {/* Botón Cancelar */}
                    <View style={styles.footer}>
                        <VeyraButton
                            variant="secondary"
                            size="md"
                            style={{ width: '100%' }}
                            label={language === 'es' ? 'Cancelar' : 'Cancel'}
                            onPress={onClose}
                        />
                    </View>
                </VeyraSurface>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 380,
        padding: 20,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    iconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerTextWrap: {
        flex: 1,
    },
    title: {
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    eventTitle: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 2,
    },
    dateText: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
        textTransform: 'capitalize',
    },
    instruction: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 16,
    },
    optionsList: {
        gap: 10,
        marginBottom: 18,
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
    },
    optionIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    optionContent: {
        flex: 1,
        paddingRight: 6,
    },
    optionTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
    },
    optionSubtitle: {
        fontSize: 11.5,
        lineHeight: 15,
    },
    footer: {
        marginTop: 2,
    },
});
