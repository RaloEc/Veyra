import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://zyqavlkksiikivpwuuem.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5cWF2bGtrc2lpa2l2cHd1dWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTA5MDcsImV4cCI6MjA4NTk4NjkwN30.oS2kQsSdW2mzIhULRZ4zaUxg8oSloRXSwj1DO3ZN46Q';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
