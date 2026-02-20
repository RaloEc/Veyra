import { themes } from './themes'
import { defaultConfig } from '@tamagui/config/v5'
import { createTamagui } from 'tamagui'

export const config = createTamagui({
    ...defaultConfig,
    themes,
})

export default config

export type Conf = typeof config

declare module 'tamagui' {
    interface TamaguiCustomConfig extends Conf { }
}
