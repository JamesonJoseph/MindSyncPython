import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const legacyBase64Decode = (str: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  const input = String(str || '').replace(/=/g, '');

  while (i < input.length) {
    const a = chars.indexOf(input[i++]);
    const b = chars.indexOf(input[i++]);
    const c = chars.indexOf(input[i++]);
    const d = chars.indexOf(input[i++]);

    if (a < 0 || b < 0) {
      break;
    }

    const triplet = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);

    result += String.fromCharCode((triplet >> 16) & 0xFF);
    if (c >= 0) {
      result += String.fromCharCode((triplet >> 8) & 0xFF);
    }
    if (d >= 0) {
      result += String.fromCharCode(triplet & 0xFF);
    }
  }

  return result;
};

import { parseApiResponse } from '../../utils/api';

export type VaultEntryType = 'password' | 'url' | 'pdf' | 'text';

export interface VaultEntry {
  id: string;
  _id?: string;
  title: string;
  entryType: VaultEntryType;
  username?: string;
  password?: string;
  url?: string;
  content?: string;
  notes?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string;
  category: string;
  createdAt: number;
}

interface VaultContextType {
  entries: VaultEntry[];
  isLocked: boolean;
  isLoading: boolean;
  addEntry: (entry: Omit<VaultEntry, 'id' | 'createdAt' | 'entryType'> & { entryType?: VaultEntryType }) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  updateEntry: (id: string, entry: Partial<VaultEntry>) => Promise<void>;
  unlockVault: () => Promise<boolean>;
  lockVault: () => void;
  searchEntries: (query: string) => VaultEntry[];
  authenticateForReveal: () => Promise<boolean>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

const ENCRYPTION_KEY_ID = 'mindSync_vault_key';
const STORAGE_KEY = 'mindSync_vault_entries';

function normalizeEntry(raw: any): VaultEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const inferredType: VaultEntryType =
    raw.entryType === 'password' || raw.entryType === 'url' || raw.entryType === 'pdf' || raw.entryType === 'text'
      ? raw.entryType
      : raw.password
        ? 'password'
        : raw.url
          ? 'url'
          : 'text';

  return {
    id: String(raw.id || Crypto.randomUUID()),
    _id: typeof raw._id === 'string' ? raw._id : undefined,
    title: String(raw.title || 'Untitled'),
    entryType: inferredType,
    username: String(raw.username || ''),
    password: String(raw.password || ''),
    url: String(raw.url || ''),
    content: String(raw.content || ''),
    notes: String(raw.notes || ''),
    fileName: String(raw.fileName || ''),
    mimeType: String(raw.mimeType || ''),
    fileSize: Number(raw.fileSize || 0),
    storagePath: String(raw.storagePath || ''),
    category: String(raw.category || 'General'),
    createdAt: Number(raw.createdAt || Date.now()),
  };
}

function parseStoredEntries(raw: string): VaultEntry[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeEntry).filter((entry): entry is VaultEntry => entry !== null);
    }
    const single = normalizeEntry(parsed);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [isLocked, setIsLocked] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<string>('');

  useEffect(() => {
    initializeVault();
  }, []);

  const getActiveEncryptionKey = async (): Promise<string> => {
    if (encryptionKey) {
      return encryptionKey;
    }

    let key = await AsyncStorage.getItem(ENCRYPTION_KEY_ID);
    if (!key) {
      key = Crypto.randomUUID();
      await AsyncStorage.setItem(ENCRYPTION_KEY_ID, key);
    }

    setEncryptionKey(key);
    return key;
  };

  const initializeVault = async () => {
    try {
      const key = await getActiveEncryptionKey();
      setEncryptionKey(key);
      
      // Try to load from backend
      try {
        const { authFetch } = await import('../../utils/api');
        const res = await authFetch('/api/documents');
        if (res.ok) {
          const backendDocs = await parseApiResponse<any[]>(res);
          const decryptedEntries = await Promise.all(backendDocs.map(async (doc: any) => {
            if (doc.type !== 'vault' && doc.type !== 'secure-doc') return null;
            try {
              const decryptedData = await decryptData(doc.content, key!);
              const parsedEntries = parseStoredEntries(decryptedData);
              const firstEntry = parsedEntries[0];
              return firstEntry ? { ...firstEntry, _id: doc._id } : null;
            } catch (e) {
              return null;
            }
          }));
          const validEntries = decryptedEntries.filter(e => e !== null) as VaultEntry[];
          if (validEntries.length > 0) {
            setEntries(validEntries);
            const encrypted = await encryptData(JSON.stringify(validEntries), key);
            await AsyncStorage.setItem(STORAGE_KEY, encrypted);
            return;
          }
        }
      } catch (e) {
        console.log('Backend vault fetch failed, using local');
      }

      const storedData = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedData) {
        const decrypted = await decryptData(storedData, key);
        setEntries(parseStoredEntries(decrypted));
      }
    } catch (error) {
      console.log('Error initializing vault:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const encryptData = async (data: string, key: string): Promise<string> => {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key + data
    );
    return JSON.stringify({
      version: 2,
      data,
      hash: digest,
    });
  };

  const decryptData = async (encryptedData: string, key: string): Promise<string> => {
    try {
      const trimmed = String(encryptedData || '').trim();
      if (!trimmed) {
        return '[]';
      }

      if (trimmed.startsWith('{')) {
        const parsedEnvelope = JSON.parse(trimmed);
        const data = String(parsedEnvelope?.data || '');
        const hash = String(parsedEnvelope?.hash || '');
        const verifyHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          key + data
        );
        if (verifyHash === hash) {
          return data;
        }
        return '[]';
      }

      // Backward compatibility for older stored payloads.
      const legacyDecoded = legacyBase64Decode(trimmed);
      const separatorIndex = legacyDecoded.lastIndexOf(':');
      if (separatorIndex === -1) {
        return '[]';
      }
      const data = legacyDecoded.slice(0, separatorIndex);
      const hash = legacyDecoded.slice(separatorIndex + 1);
      const verifyHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        key + data
      );
      if (verifyHash === hash) {
        return data;
      }
      return '[]';
    } catch {
      return '[]';
    }
  };

  const saveEntries = async (newEntries: VaultEntry[]) => {
    try {
      const key = await getActiveEncryptionKey();
      const encrypted = await encryptData(JSON.stringify(newEntries), key);
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);
      setEntries(newEntries);
    } catch (error) {
      console.log('Error saving entries:', error);
    }
  };

  const addEntry = async (entry: Omit<VaultEntry, 'id' | 'createdAt' | 'entryType'> & { entryType?: VaultEntryType }) => {
    const key = await getActiveEncryptionKey();
    const newEntry: VaultEntry = {
      ...entry,
      entryType: entry.entryType || 'password',
      id: Crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const updatedEntries = [newEntry, ...entries];
    setEntries(updatedEntries);

    try {
      const encryptedAll = await encryptData(JSON.stringify(updatedEntries), key);
      await AsyncStorage.setItem(STORAGE_KEY, encryptedAll);
    } catch (e) {
      console.log('Local vault save failed', e);
    }
    
    try {
      const encryptedContent = await encryptData(JSON.stringify(newEntry), key);
      const { authFetch } = await import('../../utils/api');
      const res = await authFetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEntry.title,
          content: encryptedContent,
          type: 'secure-doc'
        })
      });
      if (res.ok) {
        const saved = await parseApiResponse<any>(res);
        const syncedEntries = updatedEntries.map(e => e.id === newEntry.id ? { ...e, _id: saved._id } : e);
        setEntries(syncedEntries);
        const encryptedSynced = await encryptData(JSON.stringify(syncedEntries), key);
        await AsyncStorage.setItem(STORAGE_KEY, encryptedSynced);
      }
    } catch (e) {
      console.log('Sync to backend failed', e);
    }
  };

  const deleteEntry = async (id: string) => {
    const entryToDelete = entries.find(e => e.id === id);
    const updatedEntries = entries.filter(e => e.id !== id);
    setEntries(updatedEntries);
    try {
      const key = await getActiveEncryptionKey();
      if (entryToDelete?.entryType === 'pdf' && entryToDelete.storagePath) {
        const { authFetch } = await import('../../utils/api');
        await authFetch(`/api/documents/file?path=${encodeURIComponent(entryToDelete.storagePath)}`, {
          method: 'DELETE'
        });
      }
      if (entryToDelete?._id) {
        const { authFetch } = await import('../../utils/api');
        await authFetch(`/api/documents/${entryToDelete._id}`, {
          method: 'DELETE'
        });
      }
      const encrypted = await encryptData(JSON.stringify(updatedEntries), key);
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);
    } catch (e) {
      console.log('Delete from backend failed', e);
    }
  };

  const updateEntry = async (id: string, updates: Partial<VaultEntry>) => {
    const existingEntry = entries.find(e => e.id === id);
    const newEntries = entries.map(e => e.id === id ? { ...e, ...updates } : e);
    await saveEntries(newEntries);

    const updatedEntry = newEntries.find(e => e.id === id);
    if (!existingEntry?._id || !updatedEntry) {
      return;
    }

    try {
      const key = await getActiveEncryptionKey();
      const encryptedContent = await encryptData(JSON.stringify(updatedEntry), key);
      const { authFetch } = await import('../../utils/api');
      await authFetch(`/api/documents/${existingEntry._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updatedEntry.title,
          content: encryptedContent,
          type: 'secure-doc',
        }),
      });
    } catch (error) {
      console.log('Update backend sync failed', error);
    }
  };

  const unlockVault = async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (hasHardware) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to unlock vault',
        fallbackLabel: 'Use PIN',
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
    }
    setIsLocked(false);
    return true;
  };

  const lockVault = () => {
    setIsLocked(true);
  };

  const searchEntries = (query: string): VaultEntry[] => {
    if (!query.trim()) return entries;
    const lowerQuery = query.toLowerCase();
    return entries.filter(e => 
      e.title.toLowerCase().includes(lowerQuery) ||
      e.category.toLowerCase().includes(lowerQuery) ||
      String(e.username || '').toLowerCase().includes(lowerQuery) ||
      String(e.url || '').toLowerCase().includes(lowerQuery) ||
      String(e.content || '').toLowerCase().includes(lowerQuery) ||
      String(e.notes || '').toLowerCase().includes(lowerQuery) ||
      String(e.fileName || '').toLowerCase().includes(lowerQuery) ||
      e.entryType.toLowerCase().includes(lowerQuery)
    );
  };

  const authenticateForReveal = async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (hasHardware) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to reveal password',
        fallbackLabel: 'Use PIN',
      });
      return result.success;
    }
    return true;
  };

  return (
    <VaultContext.Provider value={{
      entries,
      isLocked,
      isLoading,
      addEntry,
      deleteEntry,
      updateEntry,
      unlockVault,
      lockVault,
      searchEntries,
      authenticateForReveal,
    }}>
      {children}
    </VaultContext.Provider>
  );
}

export default VaultProvider;

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within VaultProvider');
  }
  return context;
}
