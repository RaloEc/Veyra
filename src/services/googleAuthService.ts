import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

WebBrowser.maybeCompleteAuthSession();

interface ParsedAuthParams {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorDescription: string | null;
}

function extractAuthParams(callbackUrl: string): ParsedAuthParams {
  const url = new URL(callbackUrl);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

  const getParam = (key: string): string | null => query.get(key) || hash.get(key);

  return {
    code: getParam('code'),
    accessToken: getParam('access_token'),
    refreshToken: getParam('refresh_token'),
    error: getParam('error'),
    errorDescription: getParam('error_description'),
  };
}

/**
 * Inicia sesión o registra al usuario en Supabase Auth mediante el navegador del sistema
 * (expo-web-browser + expo-auth-session) con scopes básicos (openid/email/profile).
 * Totalmente desacoplado de Google Play Services legacy y del acceso OAuth a Google Drive.
 */
export async function signInWithGoogleNative(): Promise<{
  cancelled: boolean;
  session: any | null;
  user: any | null;
}> {
  const redirectTo = makeRedirectUri({
    scheme: 'veyra',
    path: 'auth/callback',
  });
  console.log('[GoogleAuth] redirectTo:', redirectTo);

  const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: 'openid email profile',
      queryParams: {
        prompt: 'select_account consent',
      },
    },
  });

  if (oauthError) {
    throw oauthError;
  }

  if (!data?.url) {
    throw new Error('No se pudo generar la URL de autenticación de Google.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    preferEphemeralSession: true,
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { cancelled: true, session: null, user: null };
  }

  if (result.type !== 'success' || !result.url) {
    throw new Error('La autenticación con Google no se completó.');
  }

  const { code, accessToken, refreshToken, error, errorDescription } = extractAuthParams(
    result.url,
  );

  if (error) {
    throw new Error(errorDescription || error);
  }

  let finalSession: any = null;
  let finalUser: any = null;

  if (code) {
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      throw exchangeError;
    }
    finalSession = sessionData?.session ?? null;
    finalUser = sessionData?.user ?? null;
  } else if (accessToken && refreshToken) {
    const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setSessionError) {
      throw setSessionError;
    }
    finalSession = sessionData?.session ?? null;
    finalUser = sessionData?.user ?? null;
  } else {
    throw new Error(
      'No se recibieron credenciales de sesión desde Google. Verifica que veyra://auth/callback esté registrado en Supabase Redirect URLs.',
    );
  }

  if (finalSession) {
    const store = useStore.getState();
    store.setSession(finalSession);
    store.setCloudSyncEnabled(true);

    const metaName =
      finalSession.user?.user_metadata?.full_name ||
      finalSession.user?.user_metadata?.name ||
      finalSession.user?.user_metadata?.settings?.userName;
    if (metaName && !store.userName) {
      store.setUserName(metaName);
    }

    const metaAccent =
      finalSession.user?.user_metadata?.settings?.accentTheme ||
      finalSession.user?.user_metadata?.accentTheme;
    if (metaAccent) {
      store.setAccentTheme(metaAccent);
    }

    try {
      await Promise.race([
        store.triggerSync(true),
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);
    } catch (syncErr) {
      console.warn('[GoogleAuth] Initial sync warning:', syncErr);
    }
  }

  return {
    cancelled: false,
    session: finalSession,
    user: finalUser,
  };
}
