import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from '@tamagui/lucide-icons';
import { useStore } from '../../store/useStore';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraButton } from '../ui/VeyraButton';
import { GoogleBrandIcon } from '../ui/GoogleBrandIcon';
import {
  AccountSwitchConfirmationError,
  connectGoogleDriveNative,
  disconnectGoogleDrive,
  getMyGoogleIntegration,
  type GoogleIntegrationInfo,
} from '../../services/googleDriveIntegrationService';

export const GoogleDriveIntegrationsCard: React.FC = () => {
  const router = useRouter();
  const { colors, accent, isDark } = useVeyraTheme();
  const session = useStore((state) => state.session);

  const [integration, setIntegration] = useState<GoogleIntegrationInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<'connect' | 'disconnect' | null>(null);

  const loadIntegration = useCallback(async () => {
    if (!session?.user) {
      setIntegration(null);
      return;
    }
    setLoading(true);
    try {
      const info = await getMyGoogleIntegration();
      setIntegration(info);
    } catch (err: any) {
      console.warn('[GoogleDriveIntegrationsCard] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const handleConnect = async (confirmAccountSwitch = false) => {
    setBusyAction('connect');
    try {
      const res = await connectGoogleDriveNative({ confirmAccountSwitch });
      if (res.cancelled) return;
      await loadIntegration();

      const emailText = res.result.google_email ? ` (${res.result.google_email})` : '';
      const recoveredText =
        res.result.recovered_attachments > 0
          ? ` Se restauraron ${res.result.recovered_attachments} adjunto(s).`
          : '';
      Alert.alert(
        'Google Drive conectado',
        `Tu cuenta de Google Drive${emailText} quedó vinculada.${recoveredText}`,
      );
    } catch (err: any) {
      if (err instanceof AccountSwitchConfirmationError) {
        Alert.alert(
          '¿Cambiar de cuenta de Google Drive?',
          `Tienes ${err.affectedAttachments} adjunto(s) vinculados a ${err.currentEmail || 'tu cuenta anterior'}. Si cambias a ${err.newEmail || 'la nueva cuenta'}, esos adjuntos pasarán a estado no disponible.`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Confirmar cambio',
              style: 'destructive',
              onPress: () => handleConnect(true),
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Error al conectar Drive',
        err?.message || 'No se pudo completar la autorización de Google Drive.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const confirmAndDisconnect = () => {
    Alert.alert(
      'Desconectar Google Drive',
      'Se revocará el acceso y los adjuntos referenciados desde Drive dejarán de estar disponibles hasta reconectar la misma cuenta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            setBusyAction('disconnect');
            try {
              const res = await disconnectGoogleDrive();
              await loadIntegration();
              Alert.alert(
                'Google Drive desconectado',
                res.affected_attachments > 0
                  ? `Se desconectó Drive y ${res.affected_attachments} adjunto(s) quedaron marcados como no disponibles.`
                  : 'Se desconectó Google Drive correctamente.',
              );
            } catch (err: any) {
              Alert.alert(
                'Error al desconectar',
                err?.message || 'No se pudo desconectar Google Drive.',
              );
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  };

  const cardStyle = {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  };

  if (!session?.user) {
    return (
      <View style={[styles.card, cardStyle]}>
        <View style={styles.headerRow}>
          <View style={[styles.iconBox, { backgroundColor: colors.surfaceElevated }]}>
            <GoogleBrandIcon size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Google Drive</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Inicia sesión en Veyra para conectar tu almacenamiento externo de Google Drive.
            </Text>
          </View>
        </View>
        <VeyraButton
          variant="primary"
          size="md"
          label="Iniciar sesión"
          onPress={() => router.push('/login' as any)}
        />
      </View>
    );
  }

  const isConnected = integration?.status === 'active';
  const needsReauth =
    integration?.status === 'needs_reauth' || integration?.status === 'revoked';

  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.headerRow}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <GoogleBrandIcon size={22} />
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.titleBadgeRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Google Drive</Text>
            {loading ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : isConnected ? (
              <View style={[styles.statusBadge, styles.badgeActive]}>
                <CheckCircle2 size={12} color="#10B981" />
                <Text style={[styles.statusText, { color: '#10B981' }]}>Conectado</Text>
              </View>
            ) : needsReauth ? (
              <View style={[styles.statusBadge, styles.badgeWarn]}>
                <AlertTriangle size={12} color="#F59E0B" />
                <Text style={[styles.statusText, { color: '#F59E0B' }]}>Reconectar</Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[styles.statusText, { color: colors.textMuted }]}>Desconectado</Text>
              </View>
            )}
          </View>

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {isConnected || needsReauth
              ? integration?.google_email || 'Cuenta de Google autorizada'
              : 'Adjunta archivos por referencia con permiso mínimo drive.file sin usar cuota de Veyra.'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={loadIntegration}
          disabled={loading || busyAction !== null}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.refreshBtn}
        >
          <RefreshCw
            size={16}
            color={(loading ? accent.primary : colors.textMuted) as any}
          />
        </TouchableOpacity>
      </View>

      {!loading && isConnected && integration && (
        <View style={styles.sectionStack}>
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
              CUENTA VINCULADA
            </Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {integration.google_email || integration.google_sub}
            </Text>
            <View style={styles.securityRow}>
              <ShieldCheck size={14} color="#10B981" />
              <Text style={[styles.securityText, { color: colors.textSecondary }]}>
                Token cifrado en servidor (Vault) · alcance drive.file
              </Text>
            </View>
          </View>

          <VeyraButton
            variant="danger"
            size="md"
            label="Desconectar Drive"
            iconLeft={<Unlink size={16} color="#E11D48" />}
            loading={busyAction === 'disconnect'}
            disabled={busyAction !== null}
            onPress={confirmAndDisconnect}
          />
        </View>
      )}

      {!loading && needsReauth && (
        <View style={styles.sectionStack}>
          <View style={styles.warnBox}>
            <AlertTriangle size={16} color="#F59E0B" />
            <Text style={[styles.warnText, { color: colors.textPrimary }]}>
              La autorización con Google Drive expiró o fue revocada. Reconecta para restaurar tus
              adjuntos.
            </Text>
          </View>

          <View style={styles.actionRow}>
            {Platform.OS === 'android' && (
              <VeyraButton
                variant="primary"
                size="md"
                style={{ flex: 1 }}
                label="Reconectar Drive"
                loading={busyAction === 'connect'}
                disabled={busyAction !== null}
                onPress={() => handleConnect(false)}
              />
            )}
            <VeyraButton
              variant="danger"
              size="md"
              label="Desconectar"
              loading={busyAction === 'disconnect'}
              disabled={busyAction !== null}
              onPress={confirmAndDisconnect}
            />
          </View>
        </View>
      )}

      {!loading && (!integration || integration.status === 'disconnected') && (
        <View style={styles.sectionStack}>
          {Platform.OS === 'android' ? (
            <VeyraButton
              variant="primary"
              size="md"
              label="Conectar Google Drive"
              iconLeft={<HardDrive size={17} color={(isDark ? '#1B1B1B' : '#FFFFFF') as any} />}
              loading={busyAction === 'connect'}
              disabled={busyAction !== null}
              onPress={() => handleConnect(false)}
            />
          ) : (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              La conexión nativa por referencia de Google Drive está disponible en Android y en la
              aplicación Web.
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
  },
  badgeWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  refreshBtn: {
    padding: 6,
  },
  sectionStack: {
    gap: 12,
    paddingTop: 2,
  },
  infoBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  securityText: {
    fontSize: 11.5,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.30)',
  },
  warnText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
