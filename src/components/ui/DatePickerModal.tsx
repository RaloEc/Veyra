import React, { useState, useEffect } from 'react';
import {
    Modal,
    Pressable,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { Calendar as CalendarIcon, X } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { InlineDatePicker } from '../InlineDatePicker';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraButton } from './VeyraButton';

export interface DatePickerModalProps {
    visible: boolean;
    value: Date;
    title?: string;
    onClose: () => void;
    onConfirm: (date: Date) => void;
    isDark?: boolean;
}

export function DatePickerModal({
    visible,
    value,
    title,
    onClose,
    onConfirm,
    isDark: customIsDark,
}: DatePickerModalProps) {
    const { t } = useTranslation();
    const { colors, accent, isDark: themeIsDark } = useVeyraTheme();
    const isDark = customIsDark ?? themeIsDark;

    const [tempDate, setTempDate] = useState<Date>(value);

    useEffect(() => {
        if (visible) {
            setTempDate(new Date(value));
        }
    }, [visible, value]);

    const handleConfirm = () => {
        onConfirm(tempDate);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.modalBackdrop} onPress={onClose}>
                <Pressable
                    style={[
                        styles.modalCard,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.borderSubtle,
                        },
                    ]}
                    onPress={e => e.stopPropagation()}
                >
                    <View style={styles.modalHeader}>
                        <View style={styles.modalTitleRow}>
                            <CalendarIcon size={18} color={accent.primary as any} />
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                {title || t('create.sections.date', { defaultValue: 'Seleccionar Fecha' })}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <InlineDatePicker
                        value={tempDate}
                        onChange={(newDate) => {
                            setTempDate(newDate);
                        }}
                        isDark={isDark}
                    />

                    <View style={styles.modalFooter}>
                        <VeyraButton
                            variant="primary"
                            size="md"
                            label={t('common.done', { defaultValue: 'Listo' })}
                            fullWidth
                            onPress={handleConfirm}
                        />
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 20,
        borderWidth: 1,
        padding: 18,
        gap: 14,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 4,
    },
    modalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    modalCloseBtn: {
        padding: 4,
    },
    modalFooter: {
        paddingTop: 8,
    },
});
