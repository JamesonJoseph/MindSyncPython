import Constants from 'expo-constants';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const API_PORT = '5000';
const DEFAULT_REQUEST_TIMEOUT_MS = 60000; // Increased to 60s for Render free tier cold starts
const AUTH_READY_TIMEOUT_MS = 3500;
const DEFAULT_SLOW_THRESHOLD_MS = 1200;

let authReadyPromise: Promise<void> | null = null;

export interface AuthFetchInit extends RequestInit {
  timeoutMs?: number;
  slowThresholdMs?: number;
  onSlow?: (info: { input: string; url: string; elapsedMs: number }) => void;
  timeoutMessage?: string;
}

type ApiRequestErrorCode = 'timeout' | 'network' | 'cancelled';

export class ApiRequestError extends Error {
  code: ApiRequestErrorCode;
  input: string;

  constructor(message: string, code: ApiRequestErrorCode, input: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.input = input;
  }
}

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

  return [input];
}

function isNetworkError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    /network request failed|network request timed out|failed to fetch/i.test(error.message)
  );
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    /aborted|abort/i.test(error.message)
  );
}

function mergeAbortSignals(signals: (AbortSignal | null | undefined)[]): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 0) {
    return { signal: undefined, cleanup: () => {} };
  }

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0], cleanup: () => {} };
  }

  const controller = new AbortController();
  const removers: (() => void)[] = [];

  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
    while (removers.length > 0) {
      const remove = removers.pop();
      remove?.();
    }
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }

    const onAbort = () => abortFrom(signal);
    signal.addEventListener('abort', onAbort, { once: true });
    removers.push(() => signal.removeEventListener('abort', onAbort));
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      while (removers.length > 0) {
        const remove = removers.pop();
        remove?.();
      }
    },
  };
}

async function waitForInitialAuthState(): Promise<void> {
  if (auth.currentUser) {
    return;
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      let settled = false;
      let unsubscribe = () => {};
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        unsubscribe();
        authReadyPromise = Promise.resolve();
        resolve();
      };

      timeoutId = setTimeout(finish, AUTH_READY_TIMEOUT_MS);
      const authUnsubscribe = onAuthStateChanged(auth, finish, finish);
      unsubscribe = authUnsubscribe;
      if (settled) {
        authUnsubscribe();
      }
    });
  }

  await authReadyPromise;
}

// Helper that attaches Firebase ID token (if present) and default headers
export async function authFetch(input: string, init: AuthFetchInit = {}) {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) || {}),
  };

  try {
    await waitForInitialAuthState();
    const user = auth.currentUser;
    if (user) {
      headers['X-User-Id'] = user.uid;
      if (user.email) {
        headers['X-User-Email'] = user.email;
      }

      // Use the cached token first to avoid a network round-trip on every
      // request. Firebase refreshes it only when required.
      const token = await user.getIdToken(false);
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (e) {
    // ignore token errors; proceed without auth header
    console.warn('authFetch: failed to attach token', e);
  }

  const opts: RequestInit = {
    ...init,
    headers,
  };
  const timeoutMs =
    typeof init.timeoutMs === 'number' && Number.isFinite(init.timeoutMs)
      ? Math.max(1000, init.timeoutMs)
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const slowThresholdMs =
    typeof init.slowThresholdMs === 'number' && Number.isFinite(init.slowThresholdMs)
      ? Math.max(200, init.slowThresholdMs)
      : DEFAULT_SLOW_THRESHOLD_MS;

  const retryUrls = [...new Set(buildRetryUrls(input))];
  let lastError: unknown = null;

  for (const url of retryUrls) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const mergedSignal = mergeAbortSignals([init.signal, timeoutController.signal]);
    const startedAt = Date.now();
    const slowTimerId = setTimeout(() => {
      init.onSlow?.({
        input,
        url,
        elapsedMs: Date.now() - startedAt,
      });
    }, slowThresholdMs);

    try {
      const response = await fetch(url, {
        ...opts,
        signal: mergedSignal.signal,
      });
      const contentType = response.headers.get('content-type') || '';

      // Retry alternate base URLs when the first endpoint returns a non-JSON
      // server error page or plain-text error body.
      if (!response.ok && !/application\/json/i.test(contentType) && retryUrls.length > 1) {
        lastError = new Error(`Non-JSON error response from ${url}`);
        continue;
      }

      return response;
    } catch (error) {
      const timeoutAborted = timeoutController.signal.aborted;
      const externalAborted = Boolean(init.signal?.aborted);

      if (timeoutAborted) {
        lastError = new ApiRequestError(
          init.timeoutMessage || 'The request timed out while waiting for the server.',
          'timeout',
          input
        );
      } else if (externalAborted || isAbortLikeError(error)) {
        lastError = new ApiRequestError('The request was cancelled.', 'cancelled', input);
      } else if (isNetworkError(error)) {
        lastError = new ApiRequestError('Network request failed.', 'network', input);
      } else {
        lastError = error;
      }

      if (!isNetworkError(error)) {
        if (lastError instanceof ApiRequestError && lastError.code === 'cancelled') {
          throw lastError;
        }
        throw error;
      }

      if (externalAborted) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeoutId);
      clearTimeout(slowTimerId);
      mergedSignal.cleanup();
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

export function extractApiErrorMessage(payload: any, fallback: string): string {
  return typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.detail === 'string'
      ? payload.detail
      : fallback;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'timeout':
        return 'The server is taking too long to respond. It may still be waking up.';
      case 'cancelled':
        return 'The request was cancelled.';
      default:
        return 'Could not reach the server. Check your connection and try again.';
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function parseApiResponse<T = any>(response: Response): Promise<T> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return {
      error: rawText.trim(),
      raw: rawText,
    } as T;
  }
}
