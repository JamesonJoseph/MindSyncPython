import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEnvelope<T> = {
  savedAt: number;
  data: T;
};

export async function readViewCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheEnvelope<T> | null;
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function writeViewCache<T>(key: string, data: T): Promise<void> {
  try {
    const payload: CacheEnvelope<T> = {
      savedAt: Date.now(),
      data,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}
