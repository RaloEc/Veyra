import { supabase } from '../lib/supabase';

export const DEVICE_ID = 'T2-expo';

export function diagLog(event: string, payload?: any) {
    try {
        Promise.resolve(
            supabase.from('yjs_diagnostics').insert({
                device_id: DEVICE_ID,
                event,
                payload: payload ?? null,
            })
        )
            .then(() => {})
            .catch(() => {});
    } catch (_) {}
}
