import { create } from 'zustand';

export interface CardRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CardTransitionData {
    originRect: CardRect | null;
    transitionType: 'note' | 'reminder' | null;
    id: string | null;
    color?: string;
}

interface CardTransitionState extends CardTransitionData {
    setOrigin: (rect: CardRect, type: 'note' | 'reminder', id: string, color?: string) => void;
    clearOrigin: () => void;
}

export const useCardTransitionStore = create<CardTransitionState>((set) => ({
    originRect: null,
    transitionType: null,
    id: null,
    color: undefined,

    setOrigin: (originRect, transitionType, id, color) => {
        set({ originRect, transitionType, id, color });
    },

    clearOrigin: () => {
        set({ originRect: null, transitionType: null, id: null, color: undefined });
    },
}));
