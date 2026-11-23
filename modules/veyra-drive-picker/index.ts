import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export interface DrivePickerOAuthOptions {
  /**
   * Web Client ID (OAuth 2.0 Web Application) del proyecto Google Cloud (`veyra-poc-515220`).
   * Necesario para solicitar `serverAuthCode` mediante `requestOfflineAccess(...)`.
   */
  serverClientId?: string;
  /**
   * Fuerza `requestOfflineAccess(serverClientId)`. Por defecto `true` si se pasa `serverClientId`.
   */
  requestOfflineAccess?: boolean;
}

export interface DrivePickerOAuthResult {
  cancelled: boolean;
  resultCode?: number;
  fromResolution?: boolean;
  picked_file_ids: string[];
  serverAuthCode: string | null;
  accessToken: string | null;
  grantedScopes: string[];
  rawExtras: Record<string, string>;
}

interface VeyraDrivePickerNativeModule {
  openDrivePickerOAuth(options: DrivePickerOAuthOptions): Promise<DrivePickerOAuthResult>;
}

const NativePicker = requireOptionalNativeModule<VeyraDrivePickerNativeModule>('VeyraDrivePicker');

/**
 * Enlace TypeScript para el PoC P4 de Android (Expo Modules API).
 * Invoca Identity.getAuthorizationClient(...) con PICKER_OAUTH_TRIGGER y scope drive.file.
 */
export const VeyraDrivePicker = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && NativePicker != null;
  },

  async openDrivePickerOAuth(
    options: DrivePickerOAuthOptions = {},
  ): Promise<DrivePickerOAuthResult> {
    if (Platform.OS !== 'android') {
      throw new Error('VeyraDrivePicker solo está disponible en Android.');
    }
    if (!NativePicker) {
      throw new Error(
        'Módulo nativo VeyraDrivePicker no encontrado. Compila e instala el APK Debug con Gradle antes de probar.',
      );
    }
    return await NativePicker.openDrivePickerOAuth(options);
  },
};
