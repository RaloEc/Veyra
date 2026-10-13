import { create } from 'zustand';
import { CalendarEvent } from '../types/db';
import { EventService, CreateEventInput } from '../services/eventService';
import { NotificationService } from '../services/notificationService';
import { useStore } from './useStore';
import { WidgetService } from '../services/widgetService';

interface EventsState {
    events: CalendarEvent[];
    eventsForSelectedDate: CalendarEvent[];
    selectedDate: Date;
    isEventsDirty: boolean;
    markEventsDirty: (dirty: boolean) => void;
    isLoading: boolean;
    loadAllEvents: () => Promise<void>;
    loadEventsForDate: (date: Date) => Promise<void>;
    setSelectedDate: (date: Date) => void;
    createEvent: (input: CreateEventInput) => Promise<CalendarEvent | null>;
    updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
    deleteEvent: (id: string) => Promise<void>;
    deleteEventOccurrence: (id: string, occurrenceDate: Date, mode: 'this' | 'following' | 'all') => Promise<void>;
    linkNoteToEvent: (eventId: string, noteId: string) => Promise<void>;
    unlinkNoteFromEvent: (eventId: string) => Promise<void>;
}

export const useEventsStore = create<EventsState>((set, get) => ({
    events: [],
    eventsForSelectedDate: [],
    selectedDate: new Date(),
    isEventsDirty: true,
    markEventsDirty: (dirty: boolean) => set({ isEventsDirty: dirty }),
    isLoading: false,

    setSelectedDate: (date: Date) => {
        set({ selectedDate: date });
        get().loadEventsForDate(date);
    },

    loadAllEvents: async () => {
        if (get().events.length === 0) {
            set({ isLoading: true });
        }
        try {
            const events = await EventService.getAllEvents(false);
            set({ events, isEventsDirty: false, isLoading: false });
            WidgetService.syncAgenda(undefined, events).catch(() => {});
            WidgetService.syncSchedule().catch(() => {});
        } catch (error) {
            console.error('[useEventsStore] Failed to load all events:', error);
            set({ isLoading: false });
        }
    },

    loadEventsForDate: async (date: Date) => {
        try {
            const eventsForSelectedDate = await EventService.getEventsForDate(date);
            set({ eventsForSelectedDate });
        } catch (error) {
            console.error('[useEventsStore] Failed to load events for date:', error);
        }
    },

    createEvent: async (input: CreateEventInput) => {
        try {
            const userId = useStore.getState().session?.user?.id || undefined;
            const newEvent = await EventService.createEvent({
                ...input,
                userId: input.userId || userId,
            });

            // Programar notificación
            const notifIds = await NotificationService.scheduleEventNotification(newEvent);
            if (notifIds.length > 0) {
                await EventService.updateEvent(newEvent.id, {
                    notification_ids: JSON.stringify(notifIds),
                });
                newEvent.notification_ids = JSON.stringify(notifIds);
            }

            // Recargar eventos
            await get().loadAllEvents();
            await get().loadEventsForDate(get().selectedDate);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }

            return newEvent;
        } catch (error) {
            console.error('[useEventsStore] Failed to create event:', error);
            return null;
        }
    },

    updateEvent: async (id: string, updates: Partial<CalendarEvent>) => {
        try {
            const currentEvent = get().events.find(e => e.id === id);
            if (currentEvent?.notification_ids) {
                await NotificationService.cancelEventNotifications(currentEvent.notification_ids);
            }

            if (currentEvent && (currentEvent.is_shared === 1 || currentEvent.shared_owner_id)) {
                import('../services/collaborationService').then(({ CollaborationService }) => {
                    CollaborationService.notifyChange({
                        targetType: 'event',
                        targetId: currentEvent.id,
                        action: 'edited',
                        itemTitle: updates.title || currentEvent.title || 'Evento',
                    }).catch(() => {});
                }).catch(() => {});
            }

            await EventService.updateEvent(id, updates);
            const updated = await EventService.getEventById(id);

            if (updated) {
                const notifIds = await NotificationService.scheduleEventNotification(updated);
                if (notifIds.length > 0) {
                    await EventService.updateEvent(id, {
                        notification_ids: JSON.stringify(notifIds),
                    });
                }
            }

            await get().loadAllEvents();
            await get().loadEventsForDate(get().selectedDate);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('[useEventsStore] Failed to update event:', error);
        }
    },

    deleteEvent: async (id: string) => {
        try {
            const event = get().events.find(e => e.id === id);
            if (event?.notification_ids) {
                await NotificationService.cancelEventNotifications(event.notification_ids);
            }

            if (event && (event.is_shared === 1 || event.shared_owner_id)) {
                import('../services/collaborationService').then(({ CollaborationService }) => {
                    CollaborationService.notifyChange({
                        targetType: 'event',
                        targetId: event.id,
                        action: 'deleted',
                        itemTitle: event.title || 'Evento',
                    }).catch(() => {});
                }).catch(() => {});
            }

            await EventService.deleteEvent(id);
            await get().loadAllEvents();
            await get().loadEventsForDate(get().selectedDate);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('[useEventsStore] Failed to delete event:', error);
        }
    },

    deleteEventOccurrence: async (id: string, occurrenceDate: Date, mode: 'this' | 'following' | 'all') => {
        try {
            await EventService.deleteEventOccurrence(id, occurrenceDate, mode);
            await get().loadAllEvents();
            await get().loadEventsForDate(get().selectedDate);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('[useEventsStore] Failed to delete event occurrence:', error);
        }
    },

    linkNoteToEvent: async (eventId: string, noteId: string) => {
        try {
            await EventService.linkNoteToEvent(eventId, noteId);
            await get().loadAllEvents();
            await get().loadEventsForDate(get().selectedDate);
            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('[useEventsStore] Failed to link note to event:', error);
        }
    },

    unlinkNoteFromEvent: async (eventId: string) => {
        try {
            await EventService.unlinkNoteFromEvent(eventId);
            await get().loadAllEvents();
            await get().loadEventsForDate(get().selectedDate);
            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('[useEventsStore] Failed to unlink note from event:', error);
        }
    }
}));
