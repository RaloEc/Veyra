import React from 'react';
import { ViewStyle } from 'react-native';
import { ScreenTransition, TabId } from './ScreenTransition';

export interface TabTransitionViewProps {
    children: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    tabId?: TabId;
}

/**
 * TabTransitionView: Envoltorio para el cuerpo de las pantallas principales (Recordatorios, Notas).
 * Aplica transición de fundido/desvanecimiento suave al cambiar entre pestañas.
 */
export function TabTransitionView({ children, style, tabId }: TabTransitionViewProps) {
    return (
        <ScreenTransition tabId={tabId} style={style}>
            {children}
        </ScreenTransition>
    );
}
