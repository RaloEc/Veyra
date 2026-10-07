import { create } from 'zustand';
import { CalendarEvent } from '../types/db';

export interface ShareEventsCallbacks {
    onClose?: () => void;
    onSuccess?: () => void;
}

export interface ShareEventsStoreState {
    isOpen: boolean;
    events: CalendarEvent[];
    onCloseCallback?: () => void;
    onSuccessCallback?: () => void;
    openShare: (events: CalendarEvent[], callbacks?: ShareEventsCallbacks) => void;
    closeShare: () => void;
    notifySuccess: () => void;
}

export const useShareEventsStore = create<ShareEventsStoreState>((set, get) => ({
    isOpen: false,
    events: [],
    onCloseCallback: undefined,
    onSuccessCallback: undefined,
    openShare: (events, callbacks) =>
        set({
            isOpen: true,
            events,
            onCloseCallback: callbacks?.onClose,
            onSuccessCallback: callbacks?.onSuccess,
        }),
    closeShare: () => {
        const { onCloseCallback } = get();
        if (onCloseCallback) {
            try {
                onCloseCallback();
            } catch {}
        }
        set({
            isOpen: false,
            events: [],
            onCloseCallback: undefined,
            onSuccessCallback: undefined,
        });
    },
    notifySuccess: () => {
        const { onSuccessCallback } = get();
        if (onSuccessCallback) {
            try {
                onSuccessCallback();
            } catch {}
        }
        set({
            isOpen: false,
            events: [],
            onCloseCallback: undefined,
            onSuccessCallback: undefined,
        });
    },
}));
