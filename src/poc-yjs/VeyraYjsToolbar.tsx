import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Bold, Italic, List, ListOrdered, Undo, Redo } from '@tamagui/lucide-icons';
import { EditorToolbarState } from './VeyraTiptapYjsEditor';

interface VeyraYjsToolbarProps {
    state: EditorToolbarState;
    onToggleBold: () => void;
    onToggleItalic: () => void;
    onToggleBulletList: () => void;
    onToggleOrderedList: () => void;
    onUndo: () => void;
    onRedo: () => void;
    accentColor?: string;
    isDark?: boolean;
}

export function VeyraYjsToolbar({
    state,
    onToggleBold,
    onToggleItalic,
    onToggleBulletList,
    onToggleOrderedList,
    onUndo,
    onRedo,
    accentColor = '#8B5CF6',
    isDark = true,
}: VeyraYjsToolbarProps) {
    const bg = isDark ? '#1C1C20' : '#F4F4F5';
    const border = isDark ? '#2E2E34' : '#E4E4E7';
    const iconColor = isDark ? '#A1A1AA' : '#52525B';
    const activeBg = isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)';

    return (
        <View style={[styles.toolbar, { backgroundColor: bg, borderColor: border }]}>
            {/* Undo */}
            <TouchableOpacity
                onPress={onUndo}
                disabled={!state.canUndo}
                style={[styles.btn, !state.canUndo && styles.disabled]}
            >
                <Undo size={18} color={(state.canUndo ? iconColor : isDark ? '#3F3F46' : '#D4D4D8') as any} />
            </TouchableOpacity>

            {/* Redo */}
            <TouchableOpacity
                onPress={onRedo}
                disabled={!state.canRedo}
                style={[styles.btn, !state.canRedo && styles.disabled]}
            >
                <Redo size={18} color={(state.canRedo ? iconColor : isDark ? '#3F3F46' : '#D4D4D8') as any} />
            </TouchableOpacity>

            <View style={[styles.separator, { backgroundColor: border }]} />

            {/* Bold */}
            <TouchableOpacity
                onPress={onToggleBold}
                style={[
                    styles.btn,
                    state.isBold && { backgroundColor: activeBg, borderColor: accentColor },
                ]}
            >
                <Bold size={18} color={(state.isBold ? accentColor : iconColor) as any} />
            </TouchableOpacity>

            {/* Italic */}
            <TouchableOpacity
                onPress={onToggleItalic}
                style={[
                    styles.btn,
                    state.isItalic && { backgroundColor: activeBg, borderColor: accentColor },
                ]}
            >
                <Italic size={18} color={(state.isItalic ? accentColor : iconColor) as any} />
            </TouchableOpacity>

            <View style={[styles.separator, { backgroundColor: border }]} />

            {/* Bullet List */}
            <TouchableOpacity
                onPress={onToggleBulletList}
                style={[
                    styles.btn,
                    state.isBulletList && { backgroundColor: activeBg, borderColor: accentColor },
                ]}
            >
                <List size={18} color={(state.isBulletList ? accentColor : iconColor) as any} />
            </TouchableOpacity>

            {/* Ordered List */}
            <TouchableOpacity
                onPress={onToggleOrderedList}
                style={[
                    styles.btn,
                    state.isOrderedList && { backgroundColor: activeBg, borderColor: accentColor },
                ]}
            >
                <ListOrdered size={18} color={(state.isOrderedList ? accentColor : iconColor) as any} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
        gap: 6,
        marginHorizontal: 16,
        marginBottom: 8,
    },
    btn: {
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabled: {
        opacity: 0.4,
    },
    separator: {
        width: 1,
        height: 20,
        marginHorizontal: 4,
    },
});
