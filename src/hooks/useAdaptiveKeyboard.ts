import { useState, useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * useAdaptiveKeyboard — Hook adaptativo universal para posicionar la barra de herramientas
 * exactamente sobre el teclado en cualquier dispositivo móvil (Android e iOS).
 *
 * Funcionamiento:
 * - En iOS: El sistema operativo mide el teclado desde el borde físico inferior (incluye home bar).
 *   Por lo tanto, lift = keyboardHeight para empujar la barra al ras del teclado.
 * - En Android: Con pantallas edge-to-edge, la vista llega al fondo de la pantalla y la barra
 *   de navegación del sistema (3 botones o barra de gestos, insets.bottom) queda abajo. El teclado
 *   se abre por encima de dicha barra de navegación. Por lo tanto, la distancia real desde el fondo
 *   de la vista hasta la parte superior del teclado es: keyboardHeight + insets.bottom.
 */
export function useAdaptiveKeyboard(bottomInset: number = 0) {
    const insets = useSafeAreaInsets();
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            const kh = Math.round(e.endCoordinates.height);
            setKeyboardHeight(kh);
            setIsKeyboardVisible(true);
        });

        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
            setIsKeyboardVisible(false);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Altura del inset de navegación inferior del sistema (ej: 48dp en barra de 3 botones de Android)
    const navBarHeight = insets.bottom > 0 ? insets.bottom : (bottomInset > 0 ? bottomInset : 0);

    // Elevación exacta: en Android suma la barra de navegación del sistema para que la barra
    // de herramientas descanse perfectamente sobre el teclado.
    const lift = isKeyboardVisible
        ? (Platform.OS === 'ios' ? keyboardHeight : keyboardHeight + navBarHeight)
        : 0;

    return {
        keyboardHeight,
        lift,
        isKeyboardVisible,
    };
}
