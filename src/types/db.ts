export type ControlLevel = 'normal' | 'strict' | 'critical';
export type ReminderStatus = 'pending' | 'completed' | 'failed' | 'snoozed';

export interface Subtask {
    id: string;
    title: string;
    completed: boolean;
}

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
    subtasks?: string; // JSON array of Subtask
    is_shared?: number; // 0 | 1
    shared_owner_id?: string;
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

export interface Folder {
    id: string; // UUID
    user_id?: string;
    parent_id?: string | null; // UUID de la carpeta contenedora (NULL si es carpeta raíz)
    name: string;
    icon?: string; // Nombre del icono de Lucide (ej: 'folder', 'briefcase', 'lightbulb')
    color?: string; // Color HEX o clave de acento
    is_pinned?: number; // 0 | 1 (Acceso rápido)
    created_at_ms: number;
    updated_at_ms: number;
    last_modified_ms?: number;
    deleted?: number; // 0 | 1
    is_shared?: number; // 0 | 1
    shared_owner_id?: string;
}

export interface Note {
    id: string; // UUID
    user_id?: string;
    folder_id?: string | null; // UUID de la carpeta a la que pertenece
    event_id?: string | null; // UUID del evento al que está vinculada la nota
    title?: string;
    content?: string; // HTML/RichText
    created_at_ms: number;
    updated_at_ms: number;
    is_pinned: number; // 0 | 1
    attachments?: string; // JSON array of strings
    links?: string; // JSON array of strings
    deleted?: number; // 0 | 1
    last_modified_ms?: number;
    is_shared?: number; // 0 | 1
    shared_owner_id?: string;
}

export interface CalendarEvent {
    id: string; // UUID
    user_id?: string;
    title: string;
    description?: string;
    start_time_ms: number;
    end_time_ms: number;
    repeat_rule?: string; // JSON: { type: 'none' | 'weekly', days?: number[] }
    location?: string;
    color?: string; // Color HEX
    notification_offset_min?: number; // Minutos antes de iniciar (ej. 0, 5, 10, 15, 30, 60, o null)
    notification_offsets?: string; // JSON array of numbers, e.g. "[5, 15, 1440]"
    notification_ids?: string; // JSON array of string notification IDs
    note_id?: string | null; // UUID de la nota vinculada
    tags?: string; // JSON array of string tags, e.g. '["clase", "universidad"]'
    created_at_ms: number;
    updated_at_ms: number;
    last_modified_ms?: number;
    deleted: number; // 0 | 1
    is_shared?: number; // 0 | 1
    shared_owner_id?: string;
}

// ─── Tipos para Colaboración y Recursos Compartidos ───────────

export type CollabTargetType = 'folder' | 'reminder' | 'note' | 'event';
export type CollabRole = 'viewer' | 'editor';

export interface ShareInvitation {
    id: string; // UUID
    invite_code: string;
    owner_id: string;
    target_type: CollabTargetType;
    target_id: string;
    target_name?: string;
    role: CollabRole;
    is_public_members?: boolean;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    created_at: string;
    expires_at: string;
}

export interface Collaboration {
    id: string; // UUID
    target_type: CollabTargetType;
    target_id: string;
    owner_id: string;
    member_id: string;
    role: CollabRole;
    is_public_members?: boolean;
    joined_at: string;
}

export interface CollaboratorMember {
    collaboration_id: string;
    member_id: string;
    email?: string;
    name?: string;
    full_name?: string;
    role: CollabRole;
    joined_at: string;
    is_owner?: boolean;
    is_public_members?: boolean;
}

export interface CollaborationActivity {
    id: string; // UUID
    target_type: CollabTargetType;
    target_id: string;
    actor_id: string;
    actor_name?: string;
    action: 'completed' | 'uncompleted' | 'edited' | 'added' | 'deleted';
    item_title?: string;
    details?: string;
    created_at: string;
}

