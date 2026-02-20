import { createV5Theme, defaultChildrenThemes } from '@tamagui/config/v5'
import { v5ComponentThemes } from '@tamagui/themes/v5'
import { yellow, yellowDark, red, redDark, green, greenDark } from '@tamagui/colors'

const darkPalette = ['hsla(0, 15%, 1%, 1)', 'hsla(0, 15%, 6%, 1)', 'hsla(0, 15%, 12%, 1)', 'hsla(0, 15%, 17%, 1)', 'hsla(0, 15%, 23%, 1)', 'hsla(0, 15%, 28%, 1)', 'hsla(0, 15%, 34%, 1)', 'hsla(0, 15%, 39%, 1)', 'hsla(0, 15%, 45%, 1)', 'hsla(0, 15%, 50%, 1)', 'hsla(0, 15%, 93%, 1)', 'hsla(0, 15%, 99%, 1)']
const lightPalette = ['hsla(0, 15%, 99%, 1)', 'hsla(0, 15%, 94%, 1)', 'hsla(0, 15%, 88%, 1)', 'hsla(0, 15%, 83%, 1)', 'hsla(0, 15%, 77%, 1)', 'hsla(0, 15%, 72%, 1)', 'hsla(0, 15%, 66%, 1)', 'hsla(0, 15%, 61%, 1)', 'hsla(0, 15%, 55%, 1)', 'hsla(0, 15%, 50%, 1)', 'hsla(0, 15%, 15%, 1)', 'hsla(0, 15%, 1%, 1)']

// Your custom accent color theme
const accentLight = {
    "accent1": "hsla(180, 49%, 33%, 1)",
    "accent2": "hsla(180, 49%, 37%, 1)",
    "accent3": "hsla(180, 49%, 40%, 1)",
    "accent4": "hsla(180, 49%, 44%, 1)",
    "accent5": "hsla(180, 49%, 47%, 1)",
    "accent6": "hsla(180, 49%, 51%, 1)",
    "accent7": "hsla(180, 49%, 54%, 1)",
    "accent8": "hsla(180, 49%, 58%, 1)",
    "accent9": "hsla(180, 49%, 61%, 1)",
    "accent10": "hsla(180, 49%, 65%, 1)",
    "accent11": "hsla(250, 50%, 95%, 1)",
    "accent12": "hsla(250, 50%, 95%, 1)"
}

const accentDark = {
    "accent1": "hsla(180, 49%, 15%, 1)",
    "accent2": "hsla(180, 49%, 20%, 1)",
    "accent3": "hsla(180, 49%, 25%, 1)",
    "accent4": "hsla(180, 49%, 30%, 1)",
    "accent5": "hsla(180, 49%, 35%, 1)",
    "accent6": "hsla(180, 49%, 40%, 1)",
    "accent7": "hsla(180, 49%, 45%, 1)",
    "accent8": "hsla(180, 49%, 50%, 1)",
    "accent9": "hsla(180, 49%, 55%, 1)",
    "accent10": "hsla(180, 49%, 60%, 1)",
    "accent11": "hsla(250, 50%, 90%, 1)",
    "accent12": "hsla(250, 50%, 95%, 1)"
}

const builtThemes = createV5Theme({
    darkPalette,
    lightPalette,
    componentThemes: v5ComponentThemes,
    childrenThemes: {
        // Include default color themes (blue, red, green, yellow, etc.)
        ...defaultChildrenThemes,

        // Your custom accent color
        accent: {
            light: accentLight,
            dark: accentDark,
        },

        // Semantic color themes for warnings, errors, and success states
        warning: {
            light: yellow,
            dark: yellowDark,
        },
        error: {
            light: red,
            dark: redDark,
        },
        success: {
            light: green,
            dark: greenDark,
        },
    },
})

export type Themes = typeof builtThemes

export const themes: Themes =
    process.env.TAMAGUI_ENVIRONMENT === 'client' &&
        process.env.NODE_ENV === 'production'
        ? ({} as any)
        : (builtThemes as any)
