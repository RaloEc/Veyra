import { Platform } from 'react-native';
import { VeyraDrivePicker } from '../../modules/veyra-drive-picker';
import { supabase } from '../lib/supabase';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_5y3OReimX6RP2Tcpl8Ailw_V52PADlk';
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '592135232115-tgbghktn14svjf2adbs880k38fuvoco1.apps.googleusercontent.com';

export interface GoogleIntegrationInfo {
  id: string;
  provider: string;
  google_sub: string;
  google_email: string | null;
  oauth_client_kind: string;
  scopes: string[];
  status: 'active' | 'needs_reauth' | 'revoked' | 'disconnected' | string;
  disconnect_requested: boolean;
  connected_at: string;
  last_refreshed_at: string | null;
  last_error_code: string | null;
  updated_at: string;
}

export interface GoogleConnectResult {
  integration_id: string;
  provider: string;
  google_email: string | null;
  status: string;
  scopes: string[];
  account_switched: boolean;
  recovered_attachments: number;
  affected_attachments: number;
}

export interface GoogleDisconnectResult {
  ok: boolean;
  disconnected: boolean;
  already_disconnected: boolean;
  integration_id: string | null;
  affected_attachments: number;
  revocation_attempted: boolean;
}

export interface DriveAttachedFile {
  id: string;
  target_type: 'note' | 'reminder' | 'event' | string;
  target_id: string;
  provider: string;
  drive_file_id: string;
  integration_id: string;
  name: string;
  mime_type: string;
  size_bytes: number | null;
  drive_md5: string | null;
  drive_modified_time: string | null;
  availability: string;
  unavailable_reason: string | null;
  last_verified_at: string | null;
  already_attached?: boolean;
}

export interface DriveAttachFileError {
  file_id: string;
  code: string;
  status: number;
  error: string;
}

export interface AttachDriveFilesResponse {
  ok: boolean;
  attachments: DriveAttachedFile[];
  errors: DriveAttachFileError[];
}

/**
 * Error lanzado cuando el usuario intenta conectar una cuenta de Google distinta
 * existiendo adjuntos activos vinculados a la cuenta previa.
 */
export class AccountSwitchConfirmationError extends Error {
  readonly currentEmail: string | null;
  readonly newEmail: string | null;
  readonly affectedAttachments: number;

  constructor(
    message: string,
    currentEmail: string | null,
    newEmail: string | null,
    affectedAttachments: number,
  ) {
    super(message);
    this.name = 'AccountSwitchConfirmationError';
    this.currentEmail = currentEmail;
    this.newEmail = newEmail;
    this.affectedAttachments = affectedAttachments;
  }
}

async function getAccessTokenOrThrow(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Inicia sesión en Veyra antes de conectar Google Drive.');
  }
  return session.access_token;
}

export async function getMyGoogleIntegration(): Promise<GoogleIntegrationInfo | null> {
  const { data, error } = await supabase.rpc('rpc_get_my_google_integration');
  if (error) {
    throw new Error(error.message || 'No se pudo consultar el estado de Google Drive.');
  }
  return Array.isArray(data) && data[0] ? (data[0] as GoogleIntegrationInfo) : null;
}

/**
 * Conecta Google Drive en Android usando el flujo nativo validado en PoC P4
 * (`VeyraDrivePicker` -> `serverAuthCode` -> Edge Function `google-connect`).
 */
export async function connectGoogleDriveNative(options?: {
  confirmAccountSwitch?: boolean;
}): Promise<
  | { cancelled: true }
  | { cancelled: false; result: GoogleConnectResult; pickedFileIds: string[] }
> {
  if (Platform.OS !== 'android') {
    throw new Error(
      'La conexión nativa de Google Drive está disponible en Android y Web.',
    );
  }

  if (!VeyraDrivePicker.isAvailable()) {
    throw new Error(
      'El módulo nativo VeyraDrivePicker no está disponible en esta compilación.',
    );
  }

  const pickerResult = await VeyraDrivePicker.openDrivePickerOAuth({
    serverClientId: GOOGLE_WEB_CLIENT_ID,
    requestOfflineAccess: true,
  });

  if (pickerResult.cancelled) {
    return { cancelled: true };
  }

  if (!pickerResult.serverAuthCode) {
    throw new Error(
      'Google no devolvió un serverAuthCode para habilitar el acceso offline de Drive.',
    );
  }

  const jwt = await getAccessTokenOrThrow();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/google-connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      client_kind: 'android_server_auth',
      serverAuthCode: pickerResult.serverAuthCode,
      redirect_uri: '',
      confirm_account_switch: Boolean(options?.confirmAccountSwitch),
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (res.status === 409 && json?.code === 'ACCOUNT_SWITCH_REQUIRES_CONFIRMATION') {
    throw new AccountSwitchConfirmationError(
      json.error || 'Cambiar de cuenta marcará tus adjuntos actuales como no disponibles.',
      json.current_email ?? null,
      json.new_email ?? null,
      Number(json.affected_attachments ?? 0),
    );
  }

  if (!res.ok) {
    throw new Error(json?.error || `No se pudo conectar Google Drive (HTTP ${res.status}).`);
  }

  return {
    cancelled: false,
    result: json as GoogleConnectResult,
    pickedFileIds: pickerResult.picked_file_ids ?? [],
  };
}

export async function disconnectGoogleDrive(): Promise<GoogleDisconnectResult> {
  const jwt = await getAccessTokenOrThrow();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/google-disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `No se pudo desconectar Google Drive (HTTP ${res.status}).`);
  }

  return json as GoogleDisconnectResult;
}

/**
 * Envía `file_ids` a la Edge Function `attach-drive-files` para verificar metadatos
 * en servidor y persistir registros en `public.attachments`.
 */
export async function attachDriveFilesToTarget(
  targetType: 'note' | 'reminder' | 'event',
  targetId: string,
  fileIds: string[],
): Promise<AttachDriveFilesResponse> {
  const jwt = await getAccessTokenOrThrow();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/attach-drive-files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      target_type: targetType,
      target_id: targetId,
      file_ids: fileIds,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (res.status !== 200 && res.status !== 422) {
    throw new Error(json?.error || `No se pudieron adjuntar los archivos (HTTP ${res.status}).`);
  }

  return {
    ok: Boolean(json?.ok),
    attachments: Array.isArray(json?.attachments) ? json.attachments : [],
    errors: Array.isArray(json?.errors) ? json.errors : [],
  };
}

/**
 * Flujo completo de Google Drive Picker en Android (Fase 7 - Parte 2):
 * 1) Abre el módulo nativo `VeyraDrivePicker` (`serverAuthCode` + `picked_file_ids`).
 * 2) Si Google devuelve `serverAuthCode`, lo intercambia en `google-connect`.
 * 3) Envía `picked_file_ids` a `attach-drive-files` y retorna los adjuntos creados.
 */
export async function pickAndAttachDriveFilesNative(
  targetType: 'note' | 'reminder' | 'event',
  targetId: string,
  options?: { confirmAccountSwitch?: boolean },
): Promise<
  | { cancelled: true }
  | {
      cancelled: false;
      emptySelection: boolean;
      attachments: DriveAttachedFile[];
      errors: DriveAttachFileError[];
    }
> {
  if (Platform.OS !== 'android') {
    throw new Error(
      'El selector nativo de Google Drive solo está disponible en Android por ahora.',
    );
  }

  if (!VeyraDrivePicker.isAvailable()) {
    throw new Error(
      'El módulo nativo VeyraDrivePicker no está disponible en esta compilación.',
    );
  }

  const pickerResult = await VeyraDrivePicker.openDrivePickerOAuth({
    serverClientId: GOOGLE_WEB_CLIENT_ID,
    requestOfflineAccess: true,
  });

  if (pickerResult.cancelled) {
    return { cancelled: true };
  }

  const jwt = await getAccessTokenOrThrow();

  if (pickerResult.serverAuthCode) {
    const connectRes = await fetch(`${SUPABASE_URL}/functions/v1/google-connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        client_kind: 'android_server_auth',
        serverAuthCode: pickerResult.serverAuthCode,
        redirect_uri: '',
        confirm_account_switch: Boolean(options?.confirmAccountSwitch),
      }),
    });

    const connectJson = await connectRes.json().catch(() => ({}));
    if (
      connectRes.status === 409 &&
      connectJson?.code === 'ACCOUNT_SWITCH_REQUIRES_CONFIRMATION'
    ) {
      throw new AccountSwitchConfirmationError(
        connectJson.error ||
          'Cambiar de cuenta marcará los adjuntos actuales como no disponibles.',
        connectJson.current_email ?? null,
        connectJson.new_email ?? null,
        Number(connectJson.affected_attachments ?? 0),
      );
    }

    if (!connectRes.ok) {
      throw new Error(
        connectJson?.error ||
          `No se pudo actualizar la autorización de Google Drive (HTTP ${connectRes.status}).`,
      );
    }
  }

  const fileIds = Array.isArray(pickerResult.picked_file_ids)
    ? pickerResult.picked_file_ids.filter(Boolean)
    : [];

  if (fileIds.length === 0) {
    return {
      cancelled: false,
      emptySelection: true,
      attachments: [],
      errors: [],
    };
  }

  const attached = await attachDriveFilesToTarget(targetType, targetId, fileIds);
  return {
    cancelled: false,
    emptySelection: false,
    attachments: attached.attachments,
    errors: attached.errors,
  };
}

export function humanizeDriveAttachError(err: DriveAttachFileError): string {
  switch (err.code) {
    case 'GOOGLE_NATIVE_FILE_NOT_SUPPORTED':
      return 'Los documentos nativos de Google (Docs/Sheets/Slides) no están soportados aún.';
    case 'FOLDER_NOT_SUPPORTED':
      return 'No se pueden adjuntar carpetas completas; elige archivos individuales.';
    case 'FILE_TRASHED':
      return 'El archivo está en la papelera de Google Drive.';
    case 'FILE_NOT_DOWNLOADABLE':
      return 'El archivo no permite descarga en Google Drive.';
    case 'FILE_NOT_ACCESSIBLE':
      return 'Sin permiso para leer el archivo desde la integración de Drive.';
    case 'FILE_NOT_FOUND':
      return 'No se encontró el archivo en Google Drive.';
    default:
      return err.error || 'No se pudo adjuntar el archivo desde Google Drive.';
  }
}
