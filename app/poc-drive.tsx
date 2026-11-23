import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Check, Copy, FolderOpen } from '@tamagui/lucide-icons';
import {
  DrivePickerOAuthResult,
  VeyraDrivePicker,
} from '../modules/veyra-drive-picker';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';

const DEFAULT_WEB_CLIENT_ID =
  '592135232115-tgbghktn14svjf2adbs880k38fuvoco1.apps.googleusercontent.com';

export default function PocDriveScreen() {
  const { isDark, colors } = useVeyraTheme();

  const [serverClientId, setServerClientId] = useState(DEFAULT_WEB_CLIENT_ID);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<DrivePickerOAuthResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const runPickerTest = async (useOfflineAccess: boolean) => {
    setLoading(true);
    setErrorText(null);
    setCopied(false);

    try {
      const response = await VeyraDrivePicker.openDrivePickerOAuth({
        serverClientId: useOfflineAccess ? serverClientId.trim() : undefined,
        requestOfflineAccess: useOfflineAccess,
      });
      setResult(response);
    } catch (err: any) {
      const message = err?.message || String(err);
      const code = err?.code ? `[${err.code}] ` : '';
      setErrorText(`${code}${message}`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyJson = async () => {
    const payload = result
      ? JSON.stringify(result, null, 2)
      : errorText || '';
    if (!payload) return;
    await Clipboard.setStringAsync(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const cardBg = isDark ? '#141923' : '#FFFFFF';
  const borderCol = isDark ? '#263042' : '#E2E8F0';
  const codeBg = isDark ? '#0A0E14' : '#F8FAFC';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: borderCol }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Volver"
        >
          <ArrowLeft size={22} color={colors.textPrimary as any} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            PoC Android Drive Picker (P4)
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Identity.getAuthorizationClient + PICKER_OAUTH_TRIGGER
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderCol }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Estado del Módulo Nativo
          </Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            Plataforma: {Platform.OS} | Disponible:{' '}
            {VeyraDrivePicker.isAvailable() ? 'Sí (VeyraDrivePicker)' : 'No'}
          </Text>

          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
            Web Client ID (serverClientId para serverAuthCode)
          </Text>
          <TextInput
            value={serverClientId}
            onChangeText={setServerClientId}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: borderCol,
                backgroundColor: codeBg,
              },
            ]}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            disabled={loading}
            onPress={() => runPickerTest(true)}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <FolderOpen size={18} color="#FFFFFF" />
            )}
            <Text style={styles.primaryBtnText}>
              1. Abrir Google Picker Nativo (con serverClientId)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              { borderColor: borderCol },
              loading && styles.btnDisabled,
            ]}
            disabled={loading}
            onPress={() => runPickerTest(false)}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
              1b. Probar sin requestOfflineAccess (solo scope + trigger)
            </Text>
          </TouchableOpacity>
        </View>

        {errorText && (
          <View
            style={[
              styles.card,
              { backgroundColor: cardBg, borderColor: '#EF4444' },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: '#EF4444' }]}>
              Error Nativo
            </Text>
            <Text style={[styles.monoText, { color: '#FCA5A5' }]}>
              {errorText}
            </Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderCol }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Resultado Crudo (P4)
            </Text>
            {(result || errorText) && (
              <TouchableOpacity onPress={handleCopyJson} style={styles.copyBtn}>
                {copied ? (
                  <Check size={15} color="#10B981" />
                ) : (
                  <Copy size={15} color={colors.textSecondary as any} />
                )}
                <Text style={[styles.copyText, { color: colors.textSecondary }]}>
                  {copied ? 'Copiado' : 'Copiar JSON'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {result && (
            <View style={styles.summaryGrid}>
              <Text style={[styles.metaText, { color: colors.textPrimary }]}>
                cancelled: {String(result.cancelled)}
              </Text>
              <Text style={[styles.metaText, { color: colors.textPrimary }]}>
                picked_file_ids ({result.picked_file_ids?.length ?? 0}):{' '}
                {result.picked_file_ids?.length
                  ? result.picked_file_ids.join(', ')
                  : '[]'}
              </Text>
              <Text style={[styles.metaText, { color: colors.textPrimary }]}>
                serverAuthCode:{' '}
                {result.serverAuthCode
                  ? `${result.serverAuthCode.slice(0, 18)}...`
                  : 'null'}
              </Text>
              <Text style={[styles.metaText, { color: colors.textPrimary }]}>
                accessToken:{' '}
                {result.accessToken
                  ? `${result.accessToken.slice(0, 18)}...`
                  : 'null'}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.codeBox,
              { backgroundColor: codeBg, borderColor: borderCol },
            ]}
          >
            <Text selectable style={[styles.monoText, { color: colors.textPrimary }]}>
              {result
                ? JSON.stringify(
                    {
                      picked_file_ids: result.picked_file_ids,
                      serverAuthCode: result.serverAuthCode,
                      accessToken: result.accessToken,
                      grantedScopes: result.grantedScopes,
                      cancelled: result.cancelled,
                      fromResolution: result.fromResolution,
                      resultCode: result.resultCode,
                      rawExtras: result.rawExtras,
                    },
                    null,
                    2,
                  )
                : 'Presiona el botón para invocar Identity.getAuthorizationClient(...) con PICKER_OAUTH_TRIGGER.'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 6 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  scroll: { padding: 16, gap: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  metaText: { fontSize: 13 },
  inputLabel: { fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600' },
  btnDisabled: { opacity: 0.55 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyText: { fontSize: 12, fontWeight: '600' },
  summaryGrid: { gap: 4 },
  codeBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  monoText: {
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
});
