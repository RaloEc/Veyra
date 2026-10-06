import { reminderToolDefinitions, executeReminderTool } from './reminders';
import { eventToolDefinitions, executeEventTool } from './events';
import { noteToolDefinitions, executeNoteTool } from './notes';
import { ToolDefinition } from '../providers/provider';

export const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  ...reminderToolDefinitions,
  ...eventToolDefinitions,
  ...noteToolDefinitions,
];

export interface ToolResult {
  success: boolean;
  data?: unknown;
  requiresConfirmation?: boolean;
  message?: string;
}

/**
 * Orquestador central de despacho de tools
 * Enruta la ejecución a la suite correspondiente aplicando validaciones de negocio.
 */
export async function dispatchToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (toolName === 'batch_update') {
    const targetType = args.targetType || 'reminder';
    if (targetType === 'event') {
      return executeEventTool('batch_update_events', args);
    }
    return executeReminderTool('batch_update_reminders', args);
  }

  if (toolName === 'delete_filtered') {
    const targetType = args.targetType || 'reminder';
    if (targetType === 'event') {
      return executeEventTool('delete_filtered_events', args);
    }
    if (targetType === 'note') {
      return executeNoteTool('delete_filtered_notes', args);
    }
    return executeReminderTool('delete_filtered_reminders', args);
  }

  if (toolName.includes('reminder')) {
    return executeReminderTool(toolName, args);
  }

  if (toolName.includes('event')) {
    return executeEventTool(toolName, args);
  }

  if (toolName.includes('note')) {
    return executeNoteTool(toolName, args);
  }

  throw new Error(`No se encontró un ejecutor registrado para la herramienta '${toolName}'.`);
}
