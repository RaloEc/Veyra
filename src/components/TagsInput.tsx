import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Keyboard,
    Platform,
} from 'react-native';
import { Hash, X, Plus } from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../theme/useVeyraTheme';
import { TagService } from '../services/TagService';
import { Tag } from '../types/db';
import { normalizeTagSlug } from '../utils/hashtagParser';

interface TagsInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    flat?: boolean;
}

export function TagsInput({
    value = [],
    onChange,
    placeholder = 'Añadir etiqueta (#trabajo, #familia)...',
    flat = false,
}: TagsInputProps) {
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<Tag[]>([]);
    const [isFocused, setIsFocused] = useState(false);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Búsqueda con debounce (200ms) de sugerencias
    const fetchSuggestions = useCallback((text: string) => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(async () => {
            try {
                const results = await TagService.suggestTags(text, 6);
                // Filtrar los que ya están seleccionados
                const filtered = results.filter(
                    t => !value.some(selected => normalizeTagSlug(selected) === t.slug)
                );
                setSuggestions(filtered);
            } catch {
                setSuggestions([]);
            }
        }, 200);
    }, [value]);

    useEffect(() => {
        if (isFocused) {
            fetchSuggestions(inputValue);
        } else {
            setSuggestions([]);
        }
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [inputValue, isFocused, fetchSuggestions]);

    const addTag = (rawName: string) => {
        const clean = rawName.trim().replace(/^#+/, '');
        const slug = normalizeTagSlug(clean);
        if (!slug) return;

        // Verificar duplicados por slug
        const alreadyExists = value.some(t => normalizeTagSlug(t) === slug);
        if (!alreadyExists) {
            onChange([...value, clean]);
        }
        setInputValue('');
        setSuggestions([]);
    };

    const removeTag = (indexToRemove: number) => {
        onChange(value.filter((_, idx) => idx !== indexToRemove));
    };

    const handleTextChange = (text: string) => {
        // Si el usuario escribe espacio o coma, convertir palabra en tag inmediatamente
        if (text.endsWith(' ') || text.endsWith(',')) {
            const potentialTag = text.slice(0, -1).trim();
            if (potentialTag) {
                addTag(potentialTag);
                return;
            }
        }
        setInputValue(text);
    };

    const handleInputSubmit = () => {
        if (inputValue.trim()) {
            addTag(inputValue);
        }
    };

    return (
        <View style={[styles.container, flat && styles.flatContainer]}>
            {/* Chips de tags seleccionados */}
            <View style={styles.chipsRow}>
                {value.map((tag, index) => (
                    <View
                        key={`${tag}-${index}`}
                        style={[
                            styles.chip,
                            {
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        <Hash size={11} color={accent.primary} strokeWidth={2.5} style={styles.hashIcon} />
                        <Text style={[styles.chipText, { color: colors.textPrimary }]}>
                            {tag}
                        </Text>
                        <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => removeTag(index)}
                            activeOpacity={0.7}
                            style={styles.chipRemoveBtn}
                        >
                            <X size={12} color={colors.textMuted} />
                        </TouchableOpacity>
                    </View>
                ))}
            </View>

            {/* Input para escribir tags */}
            <View
                style={[
                    styles.inputWrapper,
                    {
                        backgroundColor: flat ? 'transparent' : colors.surfaceElevated,
                        borderColor: isFocused ? accent.primary : colors.borderSubtle,
                    },
                ]}
            >
                <Hash size={14} color={isFocused ? accent.primary : colors.textMuted} />
                <TextInput
                    value={inputValue}
                    onChangeText={handleTextChange}
                    onSubmitEditing={handleInputSubmit}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        // Al desenfocar, si hay texto pendiente, añadirlo
                        if (inputValue.trim()) {
                            addTag(inputValue);
                        }
                        // Delay para permitir tocar sugerencias antes de cerrar
                        setTimeout(() => setIsFocused(false), 200);
                    }}
                    placeholder={value.length === 0 ? placeholder : 'Añadir más...'}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { color: colors.textPrimary }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                />
                {inputValue.trim().length > 0 && (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleInputSubmit}
                        style={[styles.addInlineBtn, { backgroundColor: accent.primary }]}
                    >
                        <Plus size={13} color={isDark ? '#121212' : '#FFFFFF'} strokeWidth={3} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Sugerencias desplegables */}
            {isFocused && suggestions.length > 0 && (
                <View
                    style={[
                        styles.suggestionsContainer,
                        {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.borderSubtle,
                        },
                    ]}
                >
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.suggestionsScroll}
                    >
                        {suggestions.map((suggestion) => (
                            <TouchableOpacity
                                key={suggestion.id}
                                activeOpacity={0.7}
                                onPress={() => addTag(suggestion.name)}
                                style={[
                                    styles.suggestionPill,
                                    {
                                        backgroundColor: suggestion.color
                                            ? `${suggestion.color}20`
                                            : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                                        borderColor: suggestion.color || colors.borderSubtle,
                                    },
                                ]}
                            >
                                <Hash
                                    size={10}
                                    color={suggestion.color || accent.primary}
                                    strokeWidth={2.5}
                                />
                                <Text
                                    style={[
                                        styles.suggestionText,
                                        { color: suggestion.color || colors.textPrimary },
                                    ]}
                                >
                                    {suggestion.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    flatContainer: {
        backgroundColor: 'transparent',
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    hashIcon: {
        marginRight: 3,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    chipRemoveBtn: {
        marginLeft: 6,
        padding: 2,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: 1,
        gap: 6,
    },
    textInput: {
        flex: 1,
        fontSize: 13,
        paddingVertical: 0,
    },
    addInlineBtn: {
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    suggestionsContainer: {
        marginTop: 6,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 10,
        borderWidth: 1,
    },
    suggestionsScroll: {
        flexDirection: 'row',
        gap: 6,
    },
    suggestionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
    },
    suggestionText: {
        fontSize: 11,
        fontWeight: '600',
    },
});

