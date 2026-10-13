import { create } from 'zustand';
import { CalendarEvent, Reminder } from '../types/db';

export interface ShareEventsCallbacks {
    onClose?: () => void;
    onSuccess?: () => void;
}

export interface ShareEventsStoreState {
    isOpen: boolean;
    events: CalendarEvent[];
    reminders: Reminder[];
    onCloseCallback?: () => void;
    onSuccessCallback?: () => void;
    openShare: (
        events?: CalendarEvent[],
        remindersOrCallbacks?: Reminder[] | ShareEventsCallbacks,
        callbacks?: ShareEventsCallbacks
    ) => void;
    closeShare: () => void;
    notifySuccess: () => void;
}

export const useShareEventsStore = create<ShareEventsStoreState>((set, get) => ({
    isOpen: false,
    events: [],
    reminders: [],
    onCloseCallback: undefined,
    onSuccessCallback: undefined,
    openShare: (events = [], remindersOrCallbacks, callbacks) => {
        let rems: Reminder[] = [];
        let cbs: ShareEventsCallbacks | undefined = callbacks;

        if (Array.isArray(remindersOrCallbacks)) {
            rems = remindersOrCallbacks;
        } else if (remindersOrCallbacks && typeof remindersOrCallbacks === 'object') {
            cbs = remindersOrCallbacks as ShareEventsCallbacks;
        }

        set({
            isOpen: true,
            events: events || [],
            reminders: rems,
            onCloseCallback: cbs?.onClose,
            onSuccessCallback: cbs?.onSuccess,
        });
    },
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
            reminders: [],
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
            reminders: [],
            onCloseCallback: undefined,
            onSuccessCallback: undefined,
        });
    },
}));
