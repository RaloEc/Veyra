import { create } from 'zustand';
import React from 'react';

export interface SelectionActionItem {
    id: string;
    label: string;
    icon: (color: string) => React.ReactNode;
    onPress: () => void;
    color?: string;
    bg?: string;
}

export interface SelectionBarState {
    active: boolean;
    title: string;
    isAllSelected: boolean;
    selectAllText?: string;
    onToggleSelectAll?: () => void;
    onClose?: () => void;
    actions: SelectionActionItem[];
    setSelection: (config: {
        title: string;
        isAllSelected: boolean;
        selectAllText?: string;
        onToggleSelectAll?: () => void;
        onClose?: () => void;
        actions: SelectionActionItem[];
    }) => void;
    clearSelection: () => void;
}

export const useSelectionStore = create<SelectionBarState>((set) => ({
    active: false,
    title: '',
    isAllSelected: false,
    selectAllText: undefined,
    onToggleSelectAll: undefined,
    onClose: undefined,
    actions: [],
    setSelection: (config) =>
        set({
            active: true,
            title: config.title,
            isAllSelected: config.isAllSelected,
            selectAllText: config.selectAllText,
            onToggleSelectAll: config.onToggleSelectAll,
            onClose: config.onClose,
            actions: config.actions,
        }),
    clearSelection: () =>
        set({
            active: false,
            title: '',
            isAllSelected: false,
            selectAllText: undefined,
            onToggleSelectAll: undefined,
            onClose: undefined,
            actions: [],
        }),
}));
