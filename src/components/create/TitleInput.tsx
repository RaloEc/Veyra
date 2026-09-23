import React, { useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraDivider } from '../ui/VeyraDivider';

interface TitleInputProps {
    title: string;
    setTitle: (text: string) => void;
    isEditing: boolean;
    isDark?: boolean;
    flat?: boolean;
    onSubmit?: () => void;
    placeholder?: string;
    style?: any;
    inputStyle?: any;
}

/**
 * TitleInput — Campo de título minimalista con tipografía de alto impacto
 */
export function TitleInput({
    title,
    setTitle,
    isEditing,
    flat,
    onSubmit,
    placeholder,
    style,
    inputStyle,
}: TitleInputProps) {
    const { t } = useTranslation();
    const { colors, typography } = useVeyraTheme();
    const titleInputRef = useRef<TextInput | null>(null);

    useEffect(() => {
        if (!isEditing && !flat) {
            const timeout = setTimeout(() => {
                titleInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [isEditing, flat]);

    return (
        <View style={[styles.container, style]}>
            <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={setTitle}
                placeholder={placeholder || t('create.placeholder_title')}
                placeholderTextColor={colors.textMuted}
                style={[
                    styles.input,
                    {
                        color: colors.textPrimary,
                        fontSize: flat ? 28 : 24,
                        lineHeight: flat ? 34 : 30,
                    },
                    inputStyle,
                ]}
                returnKeyType={onSubmit ? 'next' : 'done'}
                onSubmitEditing={onSubmit}
                blurOnSubmit={!onSubmit}
                selectionColor={colors.textPrimary}
            />
            {!flat && <VeyraDivider style={{ marginTop: 8 }} />}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    input: {
        padding: 0,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
});
