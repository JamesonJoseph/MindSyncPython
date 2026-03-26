import Constants from 'expo-constants';
import { auth } from '../firebaseConfig';

const API_PORT = '5000';

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, '');
}

function getExpoHostApiBaseUrl(): string | null {
  const expoHostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as typeof Constants & {
      manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
      manifest?: { debuggerHost?: string };
    }).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as typeof Constants & {
      manifest?: { debuggerHost?: string };
    }).manifest?.debuggerHost ||
    '';

  const host = String(expoHostUri).split(':')[0].trim();
  if (!host) {
    return null;
  }

  return `http://${host}:${API_PORT}`;
}

export function getApiBaseUrlCandidates(): string[] {
  const candidates = [
    normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL),
    getExpoHostApiBaseUrl(),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

export function getApiBaseUrl(): string {
  const [primaryUrl] = getApiBaseUrlCandidates();
  if (!primaryUrl) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is missing and no Expo host could be detected. Set EXPO_PUBLIC_API_URL, e.g. EXPO_PUBLIC_API_URL=http://192.168.1.7:5000'
    );
  }
  return primaryUrl;
}

function buildUrl(baseUrl: string, input: string): string {
  return input.startsWith('http')
    ? input
    : `${baseUrl.replace(/\/$/, '')}${input.startsWith('/') ? '' : '/'}${input}`;
}

function buildRetryUrls(input: string): string[] {
  const baseCandidates = getApiBaseUrlCandidates();

  if (!input.startsWith('http')) {
    return baseCandidates.map((baseUrl) => buildUrl(baseUrl, input));
  }

  try {
    const parsed = new URL(input);
    const pathWithQuery = `${parsed.pathname}${parsed.search}`;
    return [input, ...baseCandidates.map((baseUrl) => `${baseUrl}${pathWithQuery}`)];
  } catch {
    return [input];
  }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof Error && /network request failed|network request timed out|failed to fetch/i.test(error.message);
}

// Helper that attaches Firebase ID token (if present) and default headers
export async function authFetch(input: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) || {}),
  };

  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      headers['X-User-Id'] = user.uid;
      if (user.email) {
        headers['X-User-Email'] = user.email;
      }
    }
  } catch (e) {
    // ignore token errors; proceed without auth header
    console.warn('authFetch: failed to attach token', e);
  }

  const opts: RequestInit = {
    ...init,
    headers,
  };

  const retryUrls = [...new Set(buildRetryUrls(input))];
  let lastError: unknown = null;

  for (const url of retryUrls) {
    try {
      return await fetch(url, opts);
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}
