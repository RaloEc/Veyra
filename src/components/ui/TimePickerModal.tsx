import React, { useState, useEffect } from 'react';
import {
    Modal,
    Pressable,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { Clock as ClockIcon, X, Check } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { setHours, setMinutes } from 'date-fns';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraButton } from './VeyraButton';

export interface TimePickerModalProps {
    visible: boolean;
    value: Date;
    title?: string;
    onClose: () => void;
    onConfirm: (date: Date) => void;
    isDark?: boolean;
}

export function TimePickerModal({
    visible,
    value,
    title,
    onClose,
    onConfirm,
    isDark: customIsDark,
}: TimePickerModalProps) {
    const { t } = useTranslation();
    const { colors, accent, isDark: themeIsDark } = useVeyraTheme();
    const isDark = customIsDark ?? themeIsDark;

    const [tempTime, setTempTime] = useState<Date>(value);
    const [activeTimeField, setActiveTimeField] = useState<'hours' | 'minutes'>('hours');
    const [timeInputBuffer, setTimeInputBuffer] = useState('');

    useEffect(() => {
        if (visible) {
            setTempTime(new Date(value));
            setActiveTimeField('hours');
            setTimeInputBuffer('');
        }
    }, [visible, value]);

    const handleNumpadPress = (key: string) => {
        if (key === 'C') {
            setTimeInputBuffer('');
            return;
        }

        if (key === '⌫') {
            const currentStr = activeTimeField === 'hours'
                ? String(tempTime.getHours())
                : String(tempTime.getMinutes());
            const sliced = currentStr.slice(0, -1) || '0';
            const val = parseInt(sliced, 10);
            if (activeTimeField === 'hours') {
                setTempTime(setHours(tempTime, val % 24));
            } else {
                setTempTime(setMinutes(tempTime, val % 60));
            }
            setTimeInputBuffer('');
            return;
        }

        const newBuffer = timeInputBuffer + key;
        const num = parseInt(newBuffer, 10);

        if (activeTimeField === 'hours') {
            if (num >= 0 && num <= 23) {
                setTempTime(setHours(tempTime, num));
                if (newBuffer.length >= 2 || num >= 3) {
                    setActiveTimeField('minutes');
                    setTimeInputBuffer('');
                } else {
                    setTimeInputBuffer(newBuffer);
                }
            } else {
                const fallback = parseInt(key, 10);
                setTempTime(setHours(tempTime, fallback));
                setTimeInputBuffer(key);
            }
        } else {
            if (num >= 0 && num <= 59) {
                setTempTime(setMinutes(tempTime, num));
                if (newBuffer.length >= 2 || num >= 6) {
                    setTimeInputBuffer('');
                } else {
                    setTimeInputBuffer(newBuffer);
                }
            } else {
                const fallback = parseInt(key, 10);
                setTempTime(setMinutes(tempTime, fallback));
                setTimeInputBuffer(key);
            }
        }
    };

    const handleConfirm = () => {
        onConfirm(tempTime);
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
                    {/* Header */}
                    <View style={styles.modalHeader}>
                        <View style={styles.modalTitleRow}>
                            <ClockIcon size={18} color={accent.primary as any} />
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                {title || t('create.sections.time', { defaultValue: 'Seleccionar Hora' })}
                            </Text>
                        </View>
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
                            <X size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Digital Displays: [ HH ] : [ MM ] con botones +/- */}
                    <View style={styles.digitalClockRow}>
                        {/* Hours Box */}
                        <View style={styles.timeBoxContainer}>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                activeOpacity={0.6}
                                onPress={() => {
                                    const h = (tempTime.getHours() + 1) % 24;
                                    setTempTime(setHours(tempTime, h));
                                }}
                            >
                                <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>▲</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.timeDigitBox,
                                    {
                                        backgroundColor: activeTimeField === 'hours' ? (accent.primaryMuted || colors.surfaceElevated) : colors.surfaceElevated,
                                        borderColor: activeTimeField === 'hours' ? accent.primary : colors.borderSubtle,
                                    },
                                ]}
                                activeOpacity={0.8}
                                onPress={() => {
                                    setActiveTimeField('hours');
                                    setTimeInputBuffer('');
                                }}
                            >
                                <Text
                                    style={[
                                        styles.timeDigitText,
                                        { color: activeTimeField === 'hours' ? accent.primary : colors.textPrimary },
                                    ]}
                                >
                                    {String(tempTime.getHours()).padStart(2, '0')}
                                </Text>
                                <Text style={[styles.timeDigitLabel, { color: colors.textMuted }]}>
                                    {t('create.sections.hours', { defaultValue: 'HORA' })}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.stepBtn}
                                activeOpacity={0.6}
                                onPress={() => {
                                    const h = (tempTime.getHours() - 1 + 24) % 24;
                                    setTempTime(setHours(tempTime, h));
                                }}
                            >
                                <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>▼</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.colonSeparator, { color: colors.textSecondary }]}>:</Text>

                        {/* Minutes Box */}
                        <View style={styles.timeBoxContainer}>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                activeOpacity={0.6}
                                onPress={() => {
                                    const m = (tempTime.getMinutes() + 1) % 60;
                                    setTempTime(setMinutes(tempTime, m));
                                }}
                            >
                                <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>▲</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.timeDigitBox,
                                    {
                                        backgroundColor: activeTimeField === 'minutes' ? (accent.primaryMuted || colors.surfaceElevated) : colors.surfaceElevated,
                                        borderColor: activeTimeField === 'minutes' ? accent.primary : colors.borderSubtle,
                                    },
                                ]}
                                activeOpacity={0.8}
                                onPress={() => {
                                    setActiveTimeField('minutes');
                                    setTimeInputBuffer('');
                                }}
                            >
                                <Text
                                    style={[
                                        styles.timeDigitText,
                                        { color: activeTimeField === 'minutes' ? accent.primary : colors.textPrimary },
                                    ]}
                                >
                                    {String(tempTime.getMinutes()).padStart(2, '0')}
                                </Text>
                                <Text style={[styles.timeDigitLabel, { color: colors.textMuted }]}>
                                    {t('create.sections.minutes', { defaultValue: 'MIN' })}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.stepBtn}
                                activeOpacity={0.6}
                                onPress={() => {
                                    const m = (tempTime.getMinutes() - 1 + 60) % 60;
                                    setTempTime(setMinutes(tempTime, m));
                                }}
                            >
                                <Text style={[styles.stepBtnText, { color: colors.textSecondary }]}>▼</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Quick Minute Snaps (:00, :15, :30, :45) */}
                    <View style={styles.minuteSnapsRow}>
                        {[0, 15, 30, 45].map((snapMin) => {
                            const isSelected = tempTime.getMinutes() === snapMin;
                            return (
                                <TouchableOpacity
                                    key={snapMin}
                                    style={[
                                        styles.minuteSnapBtn,
                                        {
                                            backgroundColor: isSelected ? accent.primary : colors.surfaceElevated,
                                            borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                        },
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        setTempTime(setMinutes(tempTime, snapMin));
                                        setActiveTimeField('minutes');
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.minuteSnapText,
                                            { color: isSelected ? (isDark ? '#1B1B1B' : '#FFFFFF') : colors.textSecondary },
                                        ]}
                                    >
                                        :{String(snapMin).padStart(2, '0')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Numeric Pad for Rapid Input */}
                    <View style={styles.numpadGrid}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[
                                        styles.numpadKey,
                                        {
                                            backgroundColor: key === 'C' || key === '⌫' ? colors.surface : colors.surfaceElevated,
                                            borderColor: colors.borderSubtle,
                                        },
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={() => handleNumpadPress(key)}
                                >
                                    <Text
                                        style={[
                                            styles.numpadKeyText,
                                            {
                                                color: key === 'C' ? colors.textMuted : key === '⌫' ? (isDark ? '#FB7185' : '#E11D48') : colors.textPrimary,
                                            },
                                        ]}
                                    >
                                        {key}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Footer */}
                    <View style={styles.modalFooterRow}>
                        <VeyraButton
                            variant="secondary"
                            size="md"
                            style={{ flex: 1 }}
                            label={t('common.cancel', { defaultValue: 'Cancelar' })}
                            onPress={onClose}
                        />
                        <VeyraButton
                            variant="primary"
                            size="md"
                            style={{ flex: 1 }}
                            iconLeft={<Check size={16} color={isDark ? '#08090B' : '#FFFFFF'} />}
                            label={t('common.done', { defaultValue: 'Aceptar' })}
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
        maxWidth: 340,
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
    digitalClockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 4,
    },
    timeBoxContainer: {
        alignItems: 'center',
        gap: 4,
    },
    stepBtn: {
        paddingVertical: 2,
        paddingHorizontal: 16,
    },
    stepBtnText: {
        fontSize: 12,
        fontWeight: '800',
    },
    timeDigitBox: {
        width: 84,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeDigitText: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: 1,
    },
    timeDigitLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    colonSeparator: {
        fontSize: 34,
        fontWeight: '800',
        marginBottom: 8,
    },
    minuteSnapsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    minuteSnapBtn: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
    },
    minuteSnapText: {
        fontSize: 13,
        fontWeight: '700',
    },
    numpadGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 8,
        paddingVertical: 4,
    },
    numpadKey: {
        width: '31%',
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    numpadKeyText: {
        fontSize: 18,
        fontWeight: '700',
    },
    modalFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingTop: 8,
    },
});
