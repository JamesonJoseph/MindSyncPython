import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

// Simple base64 encoding/decoding for React Native
const base64Encode = (str: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    
    const triplet = (a << 16) | (b << 8) | c;
    
    result += chars[(triplet >> 18) & 0x3F];
    result += chars[(triplet >> 12) & 0x3F];
    result += i > str.length + 1 ? '=' : chars[(triplet >> 6) & 0x3F];
    result += i > str.length ? '=' : chars[triplet & 0x3F];
  }
  
  return result;
};

const base64Decode = (str: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  
  str = str.replace(/=/g, '');
  
  while (i < str.length) {
    const a = chars.indexOf(str[i++]);
    const b = chars.indexOf(str[i++]);
    const c = chars.indexOf(str[i++]);
    const d = chars.indexOf(str[i++]);
    
    const triplet = (a << 18) | (b << 12) | (c << 6) | d;
    
    result += String.fromCharCode((triplet >> 16) & 0xFF);
    if (c !== -1) {
      result += String.fromCharCode((triplet >> 8) & 0xFF);
    }
    if (d !== -1) {
      result += String.fromCharCode(triplet & 0xFF);
    }
  }
  
  return result;
};

import { getApiBaseUrl } from '../../utils/api';

export interface VaultEntry {
  id: string;
  _id?: string;
  title: string;
  username: string;
  password: string;
  category: string;
  createdAt: number;
}

interface VaultContextType {
  entries: VaultEntry[];
  isLocked: boolean;
  isLoading: boolean;
  addEntry: (entry: Omit<VaultEntry, 'id' | 'createdAt'>) => Promise<void>;
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

export function VaultProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [isLocked, setIsLocked] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<string>('');

  useEffect(() => {
    initializeVault();
  }, []);

  const initializeVault = async () => {
    try {
      let key = await AsyncStorage.getItem(ENCRYPTION_KEY_ID);
      if (!key) {
        key = Crypto.randomUUID();
        await AsyncStorage.setItem(ENCRYPTION_KEY_ID, key);
      }
      setEncryptionKey(key);
      
      // Try to load from backend
      try {
        const { authFetch } = await import('../../utils/api');
        const res = await authFetch(`${getApiBaseUrl()}/api/documents`);
        if (res.ok) {
          const backendDocs = await res.json();
          const decryptedEntries = await Promise.all(backendDocs.map(async (doc: any) => {
            if (doc.type !== 'vault') return null;
            try {
              const decryptedData = await decryptData(doc.content, key!);
              const parsed = JSON.parse(decryptedData);
              return { ...parsed, _id: doc._id };
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
        setEntries(JSON.parse(decrypted));
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
    return base64Encode(data + ':' + digest);
  };

  const decryptData = async (encryptedData: string, key: string): Promise<string> => {
    try {
      const decoded = base64Decode(encryptedData);
      const [data, hash] = decoded.split(':');
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
      const encrypted = await encryptData(JSON.stringify(newEntries), encryptionKey);
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);
      setEntries(newEntries);
    } catch (error) {
      console.log('Error saving entries:', error);
    }
  };

  const addEntry = async (entry: Omit<VaultEntry, 'id' | 'createdAt'>) => {
    const newEntry: VaultEntry = {
      ...entry,
      id: Crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const updatedEntries = [newEntry, ...entries];
    setEntries(updatedEntries);
    
    try {
      const encryptedContent = await encryptData(JSON.stringify(newEntry), encryptionKey);
      const { authFetch } = await import('../../utils/api');
      const res = await authFetch(`${getApiBaseUrl()}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEntry.title,
          content: encryptedContent,
          type: 'vault'
        })
      });
      if (res.ok) {
        const saved = await res.json();
        setEntries(prev => prev.map(e => e.id === newEntry.id ? { ...e, _id: saved._id } : e));
      }
      const encryptedAll = await encryptData(JSON.stringify(updatedEntries), encryptionKey);
      await AsyncStorage.setItem(STORAGE_KEY, encryptedAll);
    } catch (e) {
      console.log('Sync to backend failed', e);
    }
  };

  const deleteEntry = async (id: string) => {
    const entryToDelete = entries.find(e => e.id === id);
    const updatedEntries = entries.filter(e => e.id !== id);
    setEntries(updatedEntries);
    try {
      if (entryToDelete?._id) {
        const { authFetch } = await import('../../utils/api');
        await authFetch(`${getApiBaseUrl()}/api/documents/${entryToDelete._id}`, {
          method: 'DELETE'
        });
      }
      const encrypted = await encryptData(JSON.stringify(updatedEntries), encryptionKey);
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);
    } catch (e) {
      console.log('Delete from backend failed', e);
    }
  };

  const updateEntry = async (id: string, updates: Partial<VaultEntry>) => {
    const newEntries = entries.map(e => e.id === id ? { ...e, ...updates } : e);
    await saveEntries(newEntries);
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
      e.username.toLowerCase().includes(lowerQuery) ||
      e.category.toLowerCase().includes(lowerQuery)
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
