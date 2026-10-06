import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Check,
  X,
  Bell,
  Calendar as CalendarIcon,
  Notebook,
  Mic,
  MicOff,
  AlertCircle,
  ArrowRight,
} from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { useAIQuickAdd } from '../../hooks/useAIQuickAdd';
import { useStore } from '../../store/useStore';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { ReminderIntent, EventIntent, NoteIntent } from '../../lib/ai/schemas';

interface GlobalCreateModalProps {
  visible: boolean;
  onClose: () => void;
}

export const GlobalCreateModal: React.FC<GlobalCreateModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDark, accent, colors } = useVeyraTheme();
  const language = useStore((state) => state.language);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const {
    isLoading,
    proposal,
    error,
    successMessage,
    processPrompt,
    confirmProposal,
    cancelProposal,
    clearMessages,
  } = useAIQuickAdd();

  const handleClose = () => {
    setInputPrompt('');
    cancelProposal();
    clearMessages();
    onClose();
  };

  const handleSendPrompt = async () => {
    if (!inputPrompt.trim() || isLoading) return;
    Keyboard.dismiss();
    await processPrompt(inputPrompt);
  };

  const handleConfirm = async () => {
    const success = await confirmProposal();
    if (success) {
      setTimeout(() => {
        handleClose();
      }, 700);
    }
  };

  // Simulación de interacción por voz integrada (Speech-to-Text mock / ready)
  const handleToggleVoice = () => {
    if (isRecording) {
      setIsRecording(false);
      if (inputPrompt.trim()) {
        handleSendPrompt();
      }
    } else {
      setIsRecording(true);
      // Simula captura o preparación de dictado
    }
  };

  const navigateManual = (route: string) => {
    handleClose();
    router.push(route as any);
  };

  // Renderizar la tarjeta de previsualización estructurada devuelta por la IA
  const renderPreviewCard = () => {
    if (!proposal) return null;

    let icon = <Sparkles size={18} color="#8B5CF6" />;
    let typeLabel = '';
    let details: { label: string; value: string }[] = [];

    if (proposal.action === 'create_reminder') {
      const data = proposal.data as ReminderIntent;
      icon = <Bell size={18} color="#EF4444" />;
      typeLabel = language === 'es' ? 'Recordatorio' : 'Reminder';
      details = [
        { label: language === 'es' ? 'Título' : 'Title', value: data.title },
        { label: language === 'es' ? 'Fecha' : 'Date', value: data.date },
        ...(data.time ? [{ label: language === 'es' ? 'Hora' : 'Time', value: data.time }] : []),
        { label: language === 'es' ? 'Prioridad' : 'Priority', value: data.controlLevel.toUpperCase() },
      ];
    } else if (proposal.action === 'create_event') {
      const data = proposal.data as EventIntent;
      icon = <CalendarIcon size={18} color="#3B82F6" />;
      typeLabel = language === 'es' ? 'Evento' : 'Event';
      details = [
        { label: language === 'es' ? 'Título' : 'Title', value: data.title },
        { label: language === 'es' ? 'Fecha' : 'Date', value: data.date },
        { label: language === 'es' ? 'Horario' : 'Time', value: `${data.startTime} - ${data.endTime}` },
        ...(data.location ? [{ label: language === 'es' ? 'Lugar' : 'Location', value: data.location }] : []),
      ];
    } else if (proposal.action === 'create_note') {
      const data = proposal.data as NoteIntent;
      icon = <Notebook size={18} color="#10B981" />;
      typeLabel = language === 'es' ? 'Nota' : 'Note';
      details = [
        { label: language === 'es' ? 'Título' : 'Title', value: data.title || 'Sin título' },
        { label: language === 'es' ? 'Contenido' : 'Content', value: data.content },
      ];
    }

    return (
      <View style={[styles.previewCard, isDark ? styles.previewDark : styles.previewLight]}>
        <View style={styles.previewHeader}>
          <View style={styles.badgeRow}>
            {icon}
            <Text style={[styles.badgeText, { color: colors.textPrimary }]}>{typeLabel}</Text>
          </View>
          <Text style={styles.confidenceText}>✨ IA Veyra</Text>
        </View>

        <View style={styles.detailsBox}>
          {details.map((d, i) => (
            <View key={i} style={styles.detailRow}>
              <Text style={styles.detailKey}>{d.label}:</Text>
              <Text style={[styles.detailVal, { color: colors.textPrimary }]}>{d.value}</Text>
            </View>
          ))}
        </View>

        {Boolean((proposal as any)?.data?.contextExplanation) && (
          <View style={[styles.contextBanner, { backgroundColor: `${accent.primary}18`, borderColor: `${accent.primary}38` }]}>
            <Sparkles size={13} color={accent.primary as any} strokeWidth={2.4} />
            <Text style={[styles.contextBannerText, { color: colors.textPrimary }]}>
              {(proposal as any).data.contextExplanation}
            </Text>
          </View>
        )}

        <View style={styles.previewButtonsRow}>
          <TouchableOpacity style={styles.btnDiscard} onPress={cancelProposal} disabled={isLoading}>
            <X size={15} color="#9CA3AF" />
            <Text style={styles.btnDiscardText}>{language === 'es' ? 'Descartar' : 'Discard'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnConfirm, { backgroundColor: accent.primary }]}
            onPress={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={16} color="#FFFFFF" strokeWidth={3} />
                <Text style={styles.btnConfirmText}>{language === 'es' ? 'Confirmar' : 'Confirm'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={[styles.sheetContainer, isDark ? styles.sheetDark : styles.sheetLight]}>
              {/* Header con indicador de agarre */}
              <View style={styles.handleBar} />

              <View style={styles.sheetTopRow}>
                <View style={styles.titleWithIcon}>
                  <Sparkles size={20} color={accent.primary as any} />
                  <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                    {language === 'es' ? 'Crear con Veyra' : 'Create with Veyra'}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={20} color={colors.textMuted as any} />
                </TouchableOpacity>
              </View>

              {/* Barra Inteligente de Entrada Natural */}
              <View style={[styles.inputBox, isDark ? styles.inputDark : styles.inputLight]}>
                <TextInput
                  style={[styles.textInput, { color: colors.textPrimary }]}
                  placeholder={
                    language === 'es'
                      ? 'Escribe o di qué quieres agendar...'
                      : 'Type or speak what to schedule...'
                  }
                  placeholderTextColor={colors.textMuted}
                  value={inputPrompt}
                  onChangeText={setInputPrompt}
                  onSubmitEditing={handleSendPrompt}
                  returnKeyType="send"
                  multiline={false}
                  editable={!isLoading && !proposal}
                />

                {/* Botón de Voz */}
                <TouchableOpacity
                  style={[styles.iconButton, isRecording && styles.iconButtonRecording]}
                  onPress={handleToggleVoice}
                  disabled={isLoading || !!proposal}
                >
                  {isRecording ? (
                    <MicOff size={18} color="#EF4444" />
                  ) : (
                    <Mic size={18} color={accent.primary as any} />
                  )}
                </TouchableOpacity>

                {/* Botón de Enviar */}
                {isLoading ? (
                  <ActivityIndicator size="small" color={accent.primary} style={styles.spinner} />
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      { backgroundColor: accent.primary },
                      !inputPrompt.trim() && styles.sendDisabled,
                    ]}
                    onPress={handleSendPrompt}
                    disabled={!inputPrompt.trim() || !!proposal}
                  >
                    <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.8} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Estado de error */}
              {error && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={15} color="#EF4444" />
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              )}

              {/* Estado de éxito */}
              {successMessage && (
                <View style={styles.successBanner}>
                  <Check size={15} color="#10B981" />
                  <Text style={styles.successBannerText}>{successMessage}</Text>
                </View>
              )}

              {/* Vista previa estructurada */}
              {renderPreviewCard()}

              {/* Separador estilizado */}
              {!proposal && (
                <>
                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.borderSubtle }]} />
                    <Text style={[styles.dividerLabel, { color: colors.textMuted }]}>
                      {language === 'es' ? 'O CREAR MANUALMENTE' : 'OR CREATE MANUALLY'}
                    </Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.borderSubtle }]} />
                  </View>

                  {/* Botones de creación rápida directa */}
                  <View style={styles.manualOptionsGrid}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[styles.manualOptionCard, isDark ? styles.optionCardDark : styles.optionCardLight]}
                      onPress={() => navigateManual('/create')}
                    >
                      <View style={[styles.manualIconBox, { backgroundColor: '#EF444418' }]}>
                        <Bell size={18} color="#EF4444" />
                      </View>
                      <Text style={[styles.manualOptionTitle, { color: colors.textPrimary }]}>
                        {language === 'es' ? 'Recordatorio' : 'Reminder'}
                      </Text>
                      <Text style={[styles.manualOptionDesc, { color: colors.textMuted }]}>
                        {language === 'es' ? 'Alarmas y tareas' : 'Alarms & tasks'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[styles.manualOptionCard, isDark ? styles.optionCardDark : styles.optionCardLight]}
                      onPress={() => navigateManual('/events/create')}
                    >
                      <View style={[styles.manualIconBox, { backgroundColor: '#3B82F618' }]}>
                        <CalendarIcon size={18} color="#3B82F6" />
                      </View>
                      <Text style={[styles.manualOptionTitle, { color: colors.textPrimary }]}>
                        {language === 'es' ? 'Evento' : 'Event'}
                      </Text>
                      <Text style={[styles.manualOptionDesc, { color: colors.textMuted }]}>
                        {language === 'es' ? 'Citas y horarios' : 'Calendar events'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[styles.manualOptionCard, isDark ? styles.optionCardDark : styles.optionCardLight]}
                      onPress={() => navigateManual('/notes/create')}
                    >
                      <View style={[styles.manualIconBox, { backgroundColor: '#10B98118' }]}>
                        <Notebook size={18} color="#10B981" />
                      </View>
                      <Text style={[styles.manualOptionTitle, { color: colors.textPrimary }]}>
                        {language === 'es' ? 'Nota' : 'Note'}
                      </Text>
                      <Text style={[styles.manualOptionDesc, { color: colors.textMuted }]}>
                        {language === 'es' ? 'Texto e ideas' : 'Rich text & ideas'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetDark: {
    backgroundColor: '#1A1C22',
  },
  sheetLight: {
    backgroundColor: '#FFFFFF',
  },
  handleBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(156, 163, 175, 0.4)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 6,
    height: 44,
    borderWidth: 1,
  },
  inputDark: {
    backgroundColor: '#23262E',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
    paddingHorizontal: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
  },
  iconButtonRecording: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  sendButton: {
    padding: 8,
    borderRadius: 10,
    marginLeft: 6,
  },
  sendDisabled: {
    opacity: 0.35,
  },
  spinner: {
    marginLeft: 6,
    marginRight: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: 12.5,
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
  },
  successBannerText: {
    color: '#065F46',
    fontSize: 12.5,
    flex: 1,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  manualOptionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  manualOptionCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionCardDark: {
    backgroundColor: '#21242C',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  optionCardLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  manualIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  manualOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  manualOptionDesc: {
    fontSize: 11,
    textAlign: 'center',
  },
  previewCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewDark: {
    backgroundColor: '#16181E',
    borderColor: '#2A2E39',
  },
  previewLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confidenceText: {
    fontSize: 12,
    color: '#8B5CF6',
    fontWeight: '600',
  },
  detailsBox: {
    gap: 5,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailKey: {
    fontSize: 12.5,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  detailVal: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  contextBannerText: {
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  previewButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  btnDiscard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 4,
  },
  btnDiscardText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  btnConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  btnConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
