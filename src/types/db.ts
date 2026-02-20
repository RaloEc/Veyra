export type ControlLevel = 'normal' | 'strict' | 'critical';
export type ReminderStatus = 'pending' | 'completed' | 'failed' | 'snoozed';

export interface User {
    id: string; // UUID
    email?: string;
    created_at: number;
    last_modified_ms: number;
    is_premium: number; // 0 | 1
    revenuecat_id?: string;
}

export interface Device {
    id: string; // UUID
    user_id: string;
    push_token?: string;
    last_modified_ms: number;
    last_sync_success_ms: number;
}

export interface Reminder {
    id: string; // UUID
    user_id: string;
    title: string;
    description?: string;
    due_date_ms: number;
    snooze_until_ms?: number;
    repeat_rule?: string; // JSON
    control_level: ControlLevel;
    priority: number; // Derived from control_level
    status: ReminderStatus;
    next_attempt_ms: number;
    retry_count: number;
    max_retries: number;
    last_modified_ms: number;
    deleted: number; // 0 | 1
    deleted_at_ms?: number;
    notification_ids?: string; // JSON array of strings
    attachments?: string; // JSON array of strings (local paths or URIs)
    links?: string; // JSON array of links
}

export interface ComplianceEvent {
    id: string; // UUID
    reminder_id: string;
    event_type: 'completed' | 'failed' | 'snoozed';
    timestamp_ms: number;
    synced: number; // 0 | 1
}

export interface NotificationAttempt {
    id: string; // UUID
    reminder_id: string;
    attempt_time_ms: number;
    status: 'sent' | 'failed';
}

export interface Note {
    id: string; // UUID
    title?: string;
    content?: string; // HTML/RichText
    created_at_ms: number;
    updated_at_ms: number;
    is_pinned: number; // 0 | 1
    attachments?: string; // JSON array of strings
    links?: string; // JSON array of strings
    deleted?: number; // 0 | 1
}
