import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Keyboard,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sparkles, Check, X, Bell, Calendar, FileText, AlertCircle } from '@tamagui/lucide-icons';
import { useAIQuickAdd } from '../../hooks/useAIQuickAdd';
import { useStore } from '../../store/useStore';
import { ReminderIntent, EventIntent, NoteIntent } from '../../lib/ai/schemas';

interface AIQuickAddProps {
  onSuccess?: () => void;
  onDismiss?: () => void;
}

export const AIQuickAdd: React.FC<AIQuickAddProps> = ({ onSuccess, onDismiss }) => {
  const { t } = useTranslation();
  const { theme } = useStore();
  const isDark = theme === 'dark';

  const [inputPrompt, setInputPrompt] = useState('');
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

  const handleSend = async () => {
    if (!inputPrompt.trim() || isLoading) return;
    Keyboard.dismiss();
    await processPrompt(inputPrompt);
  };

  const handleConfirm = async () => {
    const success = await confirmProposal();
    if (success) {
      setInputPrompt('');
      if (onSuccess) onSuccess();
    }
  };

  const handleCancel = () => {
    cancelProposal();
    clearMessages();
  };

  // Renderizado dinámico de la propuesta
  const renderProposalPreview = () => {
    if (!proposal) return null;

    let icon = <Sparkles size={18} color="#8B5CF6" />;
    let typeLabel = '';
    let details: { label: string; value: string }[] = [];

    if (proposal.action === 'create_reminder') {
      const data = proposal.data as ReminderIntent;
      icon = <Bell size={18} color="#EF4444" />;
      typeLabel = t('ai.type_reminder', 'Recordatorio');
      details = [
        { label: 'Título', value: data.title },
        { label: 'Fecha', value: data.date },
        ...(data.time ? [{ label: 'Hora', value: data.time }] : []),
        { label: 'Control', value: data.controlLevel.toUpperCase() },
        ...(data.recurrence && data.recurrence !== 'none' ? [{ label: 'Repetir', value: data.recurrence.toUpperCase() }] : []),
      ];
    } else if (proposal.action === 'create_event') {
      const data = proposal.data as EventIntent;
      icon = <Calendar size={18} color="#3B82F6" />;
      typeLabel = t('ai.type_event', 'Evento');
      details = [
        { label: 'Título', value: data.title },
        { label: 'Fecha', value: data.date },
        { label: 'Horario', value: `${data.startTime} - ${data.endTime}` },
        ...(data.location ? [{ label: 'Ubicación', value: data.location }] : []),
      ];
    } else if (proposal.action === 'create_note') {
      const data = proposal.data as NoteIntent;
      icon = <FileText size={18} color="#10B981" />;
      typeLabel = t('ai.type_note', 'Nota');
      details = [
        { label: 'Título', value: data.title || 'Sin título' },
        { label: 'Contenido', value: data.content.slice(0, 80) + (data.content.length > 80 ? '...' : '') },
      ];
    }

    return (
      <View style={[styles.proposalContainer, isDark ? styles.proposalDark : styles.proposalLight]}>
        <View style={styles.proposalHeader}>
          <View style={styles.typeBadge}>
            {icon}
            <Text style={[styles.typeText, isDark ? styles.textDark : styles.textLight]}>{typeLabel}</Text>
          </View>
        </View>

        <View style={styles.detailsList}>
          {details.map((item, idx) => (
            <View key={idx} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{item.label}:</Text>
              <Text style={[styles.detailValue, isDark ? styles.textDark : styles.textLight]}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleCancel}>
            <X size={16} color="#9CA3AF" />
            <Text style={styles.cancelButtonText}>{t('ai.cancel_action', 'Descartar')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.confirmButton]}
            onPress={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={16} color="#FFFFFF" />
                <Text style={styles.confirmButtonText}>{t('ai.confirm_action', 'Confirmar')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      {/* Barra de entrada de lenguaje natural */}
      <View style={[styles.inputRow, isDark ? styles.inputRowDark : styles.inputRowLight]}>
        <Sparkles size={20} color="#8B5CF6" style={styles.sparkleIcon} />
        <TextInput
          style={[styles.textInput, isDark ? styles.textDark : styles.textLight]}
          placeholder={t('ai.quick_add_placeholder', 'Escribe en lenguaje natural...')}
          placeholderTextColor="#9CA3AF"
          value={inputPrompt}
          onChangeText={setInputPrompt}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!isLoading && !proposal}
        />
        {isLoading ? (
          <ActivityIndicator size="small" color="#8B5CF6" style={styles.loadingSpinner} />
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, !inputPrompt.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputPrompt.trim() || !!proposal}
          >
            <Check size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Mensajes de error o advertencia */}
      {error && (
        <View style={styles.errorBox}>
          <AlertCircle size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Mensaje de éxito */}
      {successMessage && (
        <View style={styles.successBox}>
          <Check size={16} color="#10B981" />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      {/* Vista previa y confirmación */}
      {renderProposalPreview()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 16,
    marginVertical: 8,
  },
  containerDark: {
    backgroundColor: '#1E1E2E',
  },
  containerLight: {
    backgroundColor: '#F3F4F6',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  inputRowDark: {
    backgroundColor: '#161622',
    borderColor: '#374151',
  },
  inputRowLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  sparkleIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  textDark: {
    color: '#F9FAFB',
  },
  textLight: {
    color: '#111827',
  },
  sendButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    padding: 8,
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  loadingSpinner: {
    marginLeft: 8,
  },
  proposalContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  proposalDark: {
    backgroundColor: '#13131F',
    borderColor: '#2D3748',
  },
  proposalLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeText: {
    fontWeight: '700',
    fontSize: 14,
  },
  detailsList: {
    marginVertical: 6,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: '#8B5CF6',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    flex: 1,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
  },
  successText: {
    color: '#065F46',
    fontSize: 12,
    flex: 1,
  },
});
