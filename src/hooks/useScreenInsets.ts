import { useSafeAreaInsets } from 'react-native-safe-area-context';

let globalRootBottomInset = 0;

export function setGlobalRootBottomInset(val: number) {
    if (val > globalRootBottomInset) {
        globalRootBottomInset = val;
    }
}

export function getGlobalRootBottomInset() {
    return globalRootBottomInset;
}

/**
 * useScreenInsets — Hook centralizado y reutilizable para el manejo uniforme
 * de Safe Areas y System Insets en iOS y Android.
 *
 * Resuelve de forma multiplataforma:
 * - Android 3-button navigation (48-72px) y Gesture bar (16-24px)
 * - iOS Home Indicator (34px) y Notch / Dynamic Island (44-59px)
 */
export function useScreenInsets() {
    const insets = useSafeAreaInsets();
    if (insets.bottom > 0) {
        setGlobalRootBottomInset(insets.bottom);
    }
    const resolvedBottom = insets.bottom || globalRootBottomInset;

    /**
     * Calcula el paddingBottom óptimo para ScrollViews y FlatLists.
     * Garantiza que el último elemento sea 100% visible y accesible.
     */
    const getScrollBottomPadding = (extraPadding = 32) => {
        return resolvedBottom + extraPadding;
    };

    /**
     * Calcula el paddingBottom para bottom sheets, modales y barras inferiores fijas.
     * Asegura un mínimo cómodo incluso en dispositivos sin inset físico.
     */
    const getBottomBarPadding = (extraPadding = 12) => {
        return Math.max(resolvedBottom, 8) + extraPadding;
    };

    /**
     * Calcula la posición bottom para elementos flotantes (FAB, pills, toolbars).
     */
    const getFloatingBottom = (offset = 16) => {
        return resolvedBottom + offset;
    };

    return {
        insets,
        top: insets.top,
        bottom: resolvedBottom,
        left: insets.left,
        right: insets.right,
        getScrollBottomPadding,
        getBottomBarPadding,
        getFloatingBottom,
    };
}
