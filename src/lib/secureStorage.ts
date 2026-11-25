import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHUNK_SIZE = 1800;

function sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

async function clearChunks(baseKey: string, count: number): Promise<void> {
    await Promise.all(
        Array.from({ length: count }, (_, idx) =>
            SecureStore.deleteItemAsync(`${baseKey}_c${idx}`, STORE_OPTIONS).catch(() => {})
        )
    );
    await SecureStore.deleteItemAsync(`${baseKey}_count`, STORE_OPTIONS).catch(() => {});
}

async function writeSecureValue(baseKey: string, value: string): Promise<void> {
    const prevCountRaw = await SecureStore.getItemAsync(`${baseKey}_count`, STORE_OPTIONS).catch(() => null);
    const prevCount = prevCountRaw ? Number.parseInt(prevCountRaw, 10) : 0;

    if (value.length <= CHUNK_SIZE) {
        if (prevCount > 0) await clearChunks(baseKey, prevCount);
        await SecureStore.setItemAsync(baseKey, value, STORE_OPTIONS);
        return;
    }

    const totalChunks = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.deleteItemAsync(baseKey, STORE_OPTIONS).catch(() => {});
    for (let idx = 0; idx < totalChunks; idx++) {
        const slice = value.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
        await SecureStore.setItemAsync(`${baseKey}_c${idx}`, slice, STORE_OPTIONS);
    }
    if (prevCount > totalChunks) {
        for (let idx = totalChunks; idx < prevCount; idx++) {
            await SecureStore.deleteItemAsync(`${baseKey}_c${idx}`, STORE_OPTIONS).catch(() => {});
        }
    }
    await SecureStore.setItemAsync(`${baseKey}_count`, String(totalChunks), STORE_OPTIONS);
}

/**
 * Chunked expo-secure-store adapter compatible with Supabase Auth storage.
 * Automatically migrates any legacy plaintext session from AsyncStorage on first read.
 */
export const SecureStorageAdapter = {
    async getItem(key: string): Promise<string | null> {
        const baseKey = sanitizeKey(key);
        const countRaw = await SecureStore.getItemAsync(`${baseKey}_count`, STORE_OPTIONS);
        if (countRaw) {
            const count = Number.parseInt(countRaw, 10);
            if (Number.isFinite(count) && count > 0) {
                const parts: string[] = [];
                for (let idx = 0; idx < count; idx++) {
                    const part = await SecureStore.getItemAsync(`${baseKey}_c${idx}`, STORE_OPTIONS);
                    if (part === null) return null;
                    parts.push(part);
                }
                return parts.join('');
            }
        }

        const direct = await SecureStore.getItemAsync(baseKey, STORE_OPTIONS);
        if (direct !== null) {
            return direct;
        }

        // One-time transparent migration from legacy AsyncStorage
        const legacy = await AsyncStorage.getItem(key);
        if (legacy !== null) {
            await writeSecureValue(baseKey, legacy);
            await AsyncStorage.removeItem(key).catch(() => {});
            return legacy;
        }
        return null;
    },

    async setItem(key: string, value: string): Promise<void> {
        const baseKey = sanitizeKey(key);
        await writeSecureValue(baseKey, value);
        await AsyncStorage.removeItem(key).catch(() => {});
    },

    async removeItem(key: string): Promise<void> {
        const baseKey = sanitizeKey(key);
        const countRaw = await SecureStore.getItemAsync(`${baseKey}_count`, STORE_OPTIONS).catch(() => null);
        const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
        if (count > 0) {
            await clearChunks(baseKey, count);
        }
        await SecureStore.deleteItemAsync(baseKey, STORE_OPTIONS).catch(() => {});
        await AsyncStorage.removeItem(key).catch(() => {});
    },
};
