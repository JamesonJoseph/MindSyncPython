import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl, parseApiResponse } from '../utils/api';
import { useVault, VaultEntry, VaultEntryType } from './contexts/VaultContext';

const ENTRY_CONFIG: Record<
  VaultEntryType,
  { label: string; icon: string; accent: string; helper: string }
> = {
  password: {
    label: 'Password',
    icon: 'shield-key-outline',
    accent: '#00B894',
    helper: 'Save credentials and private secrets.',
  },
  url: {
    label: 'URL',
    icon: 'link-variant',
    accent: '#2D9CDB',
    helper: 'Store important websites and web resources.',
  },
  pdf: {
    label: 'PDF',
    icon: 'file-pdf-box',
    accent: '#E74C3C',
    helper: 'Save PDF share links or file paths.',
  },
  text: {
    label: 'Text',
    icon: 'note-text-outline',
    accent: '#9B51E0',
    helper: 'Keep private notes and text snippets.',
  },
};

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function getPreviewValue(entry: VaultEntry, revealed: boolean) {
  switch (entry.entryType) {
    case 'password':
      return revealed ? (entry.password || 'No password saved') : '********';
    case 'url':
      return entry.url || 'No URL saved';
    case 'pdf':
      return entry.fileName || entry.url || 'No PDF selected';
    case 'text':
      return entry.content || 'No text saved';
    default:
      return '';
  }
}

export default function DocsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    entries,
    isLocked,
    isLoading,
    unlockVault,
    lockVault,
    searchEntries,
    deleteEntry,
    updateEntry,
    authenticateForReveal,
  } = useVault();

  const [searchQuery, setSearchQuery] = useState('');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<VaultEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<VaultEntry | null>(null);

  useEffect(() => {
    if (isLocked) {
      unlockVault();
    }
  }, []);

  const filteredEntries = searchEntries(searchQuery);
  const groupedEntries = (Object.keys(ENTRY_CONFIG) as VaultEntryType[]).map(type => ({
    type,
    items: filteredEntries.filter(entry => entry.entryType === type),
  }));

  const handleReveal = async (entry: VaultEntry) => {
    const authenticated = await authenticateForReveal();
    if (authenticated) {
      setRevealedIds(prev => new Set(prev).add(entry.id));
    }
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Copied to clipboard');
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Entry', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteEntry(id) },
    ]);
  };

  const openEntry = async (entry: VaultEntry) => {
    if (entry.entryType === 'password' && !revealedIds.has(entry.id)) {
      const authenticated = await authenticateForReveal();
      if (!authenticated) {
        return;
      }
      setRevealedIds(prev => new Set(prev).add(entry.id));
    }
    setSelectedEntry(entry);
  };

  const handleOpenLink = async (value: string, label: string) => {
    const target = value.trim();
    if (!target) {
      Alert.alert('Missing Link', `No ${label.toLowerCase()} saved for this item.`);
      return;
    }

    if (!looksLikeUrl(target)) {
      await handleCopy(target);
      Alert.alert('Copied', `${label} is not a web link, so it was copied instead.`);
      return;
    }

    const supported = await Linking.canOpenURL(target);
    if (!supported) {
      Alert.alert('Cannot Open', `This ${label.toLowerCase()} cannot be opened on this device.`);
      return;
    }

    await Linking.openURL(target);
  };

  const handleOpenPdf = async (entry: VaultEntry) => {
    if (!entry.url) {
      Alert.alert('Missing PDF', 'No PDF file is stored for this entry.');
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user?.uid) {
        Alert.alert('Authentication Error', 'You must be logged in to open this PDF.');
        return;
      }
      const token = await user.getIdToken(false);
      const apiUrl = getApiBaseUrl();
      const safeName = (entry.fileName || `${entry.title}.pdf`).replace(/[^\w.\-]/g, '_');
      const fileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${safeName}`;
      const targetUrl = entry.url.startsWith('http')
        ? entry.url
        : `${apiUrl}${entry.url.startsWith('/') ? '' : '/'}${entry.url}`;
      await FileSystem.downloadAsync(targetUrl, fileUri, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': user.uid,
          ...(user.email ? { 'X-User-Email': user.email } : {}),
        },
      });
      await Linking.openURL(fileUri);
    } catch (error) {
      console.warn('Open PDF failed', error);
      Alert.alert('Open Failed', 'Could not open this PDF on the device.');
    }
  };

  const renderItem = (item: VaultEntry) => {
    const config = ENTRY_CONFIG[item.entryType];
    const isRevealed = revealedIds.has(item.id);
    const previewValue = getPreviewValue(item, isRevealed);
    const showReveal = item.entryType === 'password';

    return (
      <TouchableOpacity style={styles.entryCard} onPress={() => openEntry(item)} activeOpacity={0.9}>
        <View style={styles.entryLeft}>
          <View style={[styles.iconContainer, { backgroundColor: `${config.accent}18` }]}>
            <MaterialCommunityIcons name={config.icon as any} size={24} color={config.accent} />
          </View>
          <View style={styles.entryInfo}>
            <View style={styles.entryTopRow}>
              <Text style={styles.entryTitle}>{item.title}</Text>
              <View style={[styles.typeBadge, { backgroundColor: `${config.accent}18` }]}>
                <Text style={[styles.typeBadgeText, { color: config.accent }]}>{config.label}</Text>
              </View>
            </View>
            <Text style={styles.entryMeta}>{item.category || 'General'}</Text>

            {item.entryType === 'password' && !!item.username && (
              <Text style={styles.entrySecondary}>{item.username}</Text>
            )}

            {showReveal ? (
              <TouchableOpacity onPress={() => handleReveal(item)}>
                <Text style={[styles.revealText, { color: config.accent }]}>
                  {previewValue} {'\u2022'} Tap to Reveal
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.entryPreview} numberOfLines={item.entryType === 'text' ? 3 : 1}>
                {previewValue}
              </Text>
            )}

            {!!item.notes && (
              <Text style={styles.entryNotes} numberOfLines={2}>
                {item.notes}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.entryRight}>
          {item.entryType === 'password' && isRevealed && !!item.password && (
            <TouchableOpacity style={styles.actionButton} onPress={() => handleCopy(item.password || '')}>
              <Ionicons name="copy-outline" size={20} color={config.accent} />
            </TouchableOpacity>
          )}

          {item.entryType === 'pdf' && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleOpenPdf(item)}
            >
              <Ionicons name="open-outline" size={20} color={config.accent} />
            </TouchableOpacity>
          )}

          {item.entryType === 'url' && !!item.url && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleOpenLink(item.url || '', config.label)}
            >
              <Ionicons name="open-outline" size={20} color={config.accent} />
            </TouchableOpacity>
          )}

          {(item.entryType === 'url' || item.entryType === 'text') && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleCopy(item.url || item.content || '')}
            >
              <Ionicons name="copy-outline" size={20} color={config.accent} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(item.id)}>
            <Ionicons name="trash-outline" size={20} color="#ff4d4f" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#00E0C6" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Docs</Text>
        <TouchableOpacity onPress={lockVault} style={styles.lockButton}>
          <Ionicons name="lock-closed" size={24} color="#00E0C6" />
        </TouchableOpacity>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusLeft}>
          <Ionicons name="document-text-outline" size={28} color="#00E0C6" />
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>Secure Docs</Text>
            <Text style={styles.statusValue}>{isLocked ? 'Locked' : 'Unlocked'}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.unlockButton, !isLocked && styles.lockedButton]}
          onPress={() => (isLocked ? unlockVault() : lockVault())}
        >
          <Ionicons name={isLocked ? 'lock-open' : 'lock-closed'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 180 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.typeGrid}>
          {(Object.keys(ENTRY_CONFIG) as VaultEntryType[]).map(type => (
            <View key={type} style={styles.typeCard}>
              <MaterialCommunityIcons
                name={ENTRY_CONFIG[type].icon as any}
                size={24}
                color={ENTRY_CONFIG[type].accent}
              />
              <Text style={styles.typeCardTitle}>{ENTRY_CONFIG[type].label}</Text>
              <Text style={styles.typeCardHelper}>{ENTRY_CONFIG[type].helper}</Text>
            </View>
          ))}
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search docs, links, notes, passwords..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.entriesSection}>
          <Text style={styles.sectionTitle}>Stored Items</Text>
          {filteredEntries.length > 0 ? (
            <View style={styles.listContent}>
              {groupedEntries.map(group => {
                if (group.items.length === 0) {
                  return null;
                }
                const config = ENTRY_CONFIG[group.type];
                return (
                  <View key={group.type} style={styles.groupSection}>
                    <View style={styles.groupHeader}>
                      <MaterialCommunityIcons name={config.icon as any} size={18} color={config.accent} />
                      <Text style={styles.groupTitle}>{config.label}s</Text>
                      <Text style={styles.groupCount}>{group.items.length}</Text>
                    </View>
                    {group.items.map(item => (
                      <View key={item._id || item.id}>{renderItem(item)}</View>
                    ))}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No items saved yet</Text>
              <Text style={styles.emptySubtext}>
                Add a PDF, URL, password, or private text message.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 20) + 80 }]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={26} color="#888" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/journal')}>
          <Ionicons name="book-outline" size={26} color="#888" />
          <Text style={styles.navText}>Journal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/avatar')}>
          <MaterialCommunityIcons name="account-voice" size={26} color="#888" />
          <Text style={styles.navText}>Avatar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/tasks')}>
          <Ionicons name="checkbox-outline" size={26} color="#888" />
          <Text style={styles.navText}>Tasks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="documents-outline" size={26} color="#00E0C6" />
          <Text style={[styles.navText, { color: '#00E0C6' }]}>Docs</Text>
        </TouchableOpacity>
      </View>

      {showAddModal && <AddVaultEntryModal onClose={() => setShowAddModal(false)} />}
      {editingEntry && (
        <AddVaultEntryModal
          initialEntry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={async (updates) => {
            await updateEntry(editingEntry.id, updates);
            setSelectedEntry(prev => (prev?.id === editingEntry.id ? { ...prev, ...updates } : prev));
            setEditingEntry(null);
          }}
        />
      )}
      <EntryDetailModal
        entry={selectedEntry}
        isRevealed={selectedEntry ? revealedIds.has(selectedEntry.id) : false}
        onClose={() => setSelectedEntry(null)}
        onEdit={(entry) => {
          setSelectedEntry(null);
          setEditingEntry(entry);
        }}
        onDelete={(id) => {
          setSelectedEntry(null);
          handleDelete(id);
        }}
        onOpenPdf={handleOpenPdf}
        onOpenLink={handleOpenLink}
        onCopy={handleCopy}
      />
    </View>
  );
}

function EntryDetailModal({
  entry,
  isRevealed,
  onClose,
  onEdit,
  onDelete,
  onOpenPdf,
  onOpenLink,
  onCopy,
}: {
  entry: VaultEntry | null;
  isRevealed: boolean;
  onClose: () => void;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (id: string) => void;
  onOpenPdf: (entry: VaultEntry) => Promise<void>;
  onOpenLink: (value: string, label: string) => Promise<void>;
  onCopy: (text: string) => Promise<void>;
}) {
  if (!entry) {
    return null;
  }

  const config = ENTRY_CONFIG[entry.entryType];
  const primaryValue =
    entry.entryType === 'password'
      ? (isRevealed ? entry.password || 'No password saved' : 'Hidden')
      : entry.entryType === 'url'
        ? entry.url || 'No URL saved'
        : entry.entryType === 'pdf'
          ? entry.fileName || entry.url || 'No PDF saved'
          : entry.content || 'No text saved';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={[styles.detailIconWrap, { backgroundColor: `${config.accent}18` }]}>
              <MaterialCommunityIcons name={config.icon as any} size={22} color={config.accent} />
            </View>
            <View style={styles.detailHeaderText}>
              <Text style={styles.detailTitle}>{entry.title}</Text>
              <Text style={styles.detailMeta}>{config.label} {'\u2022'} {entry.category || 'General'}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#667085" />
            </TouchableOpacity>
          </View>

          {!!entry.username && entry.entryType === 'password' && (
            <>
              <Text style={styles.detailLabel}>Username / Email</Text>
              <Text style={styles.detailValue}>{entry.username}</Text>
            </>
          )}

          <Text style={styles.detailLabel}>
            {entry.entryType === 'password'
              ? 'Password'
              : entry.entryType === 'url'
                ? 'URL'
                : entry.entryType === 'pdf'
                  ? 'PDF'
                  : 'Text'}
          </Text>
          <Text style={styles.detailValue}>{primaryValue}</Text>

          {!!entry.notes && (
            <>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.detailNotes}>{entry.notes}</Text>
            </>
          )}

          <View style={styles.detailActions}>
            {entry.entryType === 'password' && !!entry.password && (
              <TouchableOpacity style={styles.detailActionButton} onPress={() => onCopy(entry.password || '')}>
                <Ionicons name="copy-outline" size={18} color="#111827" />
                <Text style={styles.detailActionText}>Copy</Text>
              </TouchableOpacity>
            )}
            {entry.entryType === 'url' && !!entry.url && (
              <>
                <TouchableOpacity style={styles.detailActionButton} onPress={() => onOpenLink(entry.url || '', 'URL')}>
                  <Ionicons name="open-outline" size={18} color="#111827" />
                  <Text style={styles.detailActionText}>Open</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailActionButton} onPress={() => onCopy(entry.url || '')}>
                  <Ionicons name="copy-outline" size={18} color="#111827" />
                  <Text style={styles.detailActionText}>Copy</Text>
                </TouchableOpacity>
              </>
            )}
            {entry.entryType === 'pdf' && (
              <TouchableOpacity style={styles.detailActionButton} onPress={() => onOpenPdf(entry)}>
                <Ionicons name="document-outline" size={18} color="#111827" />
                <Text style={styles.detailActionText}>Open PDF</Text>
              </TouchableOpacity>
            )}
            {entry.entryType === 'text' && !!entry.content && (
              <TouchableOpacity style={styles.detailActionButton} onPress={() => onCopy(entry.content || '')}>
                <Ionicons name="copy-outline" size={18} color="#111827" />
                <Text style={styles.detailActionText}>Copy</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.detailActionButton} onPress={() => onEdit(entry)}>
              <Ionicons name="create-outline" size={18} color="#111827" />
              <Text style={styles.detailActionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.detailActionButton, styles.deleteActionButton]} onPress={() => onDelete(entry.id)}>
              <Ionicons name="trash-outline" size={18} color="#B42318" />
              <Text style={[styles.detailActionText, styles.deleteActionText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddVaultEntryModal({
  onClose,
  initialEntry,
  onSave,
}: {
  onClose: () => void;
  initialEntry?: VaultEntry | null;
  onSave?: (updates: Partial<VaultEntry>) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { addEntry } = useVault();
  const isEditing = !!initialEntry;
  const [entryType, setEntryType] = useState<VaultEntryType>(initialEntry?.entryType || 'pdf');
  const [title, setTitle] = useState(initialEntry?.title || '');
  const [folder, setFolder] = useState(initialEntry?.category || 'General');
  const [username, setUsername] = useState(initialEntry?.username || '');
  const [password, setPassword] = useState(initialEntry?.password || '');
  const [url, setUrl] = useState(initialEntry?.url || '');
  const [content, setContent] = useState(initialEntry?.content || '');
  const [notes, setNotes] = useState(initialEntry?.notes || '');
  const [fileName, setFileName] = useState(initialEntry?.fileName || '');
  const [mimeType, setMimeType] = useState(initialEntry?.mimeType || 'application/pdf');
  const [fileSize, setFileSize] = useState(initialEntry?.fileSize || 0);
  const [isPickingPdf, setIsPickingPdf] = useState(false);
  const [pdfAssetUri, setPdfAssetUri] = useState('');
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [existingStoragePath, setExistingStoragePath] = useState(initialEntry?.storagePath || '');

  const pickPdf = async () => {
    setIsPickingPdf(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Picker Error', 'Could not read the selected PDF.');
        return;
      }

      const maxBytes = 6 * 1024 * 1024;
      if ((asset.size || 0) > maxBytes) {
        Alert.alert('File Too Large', 'Please select a PDF smaller than 6 MB.');
        return;
      }

      setFileName(asset.name || 'document.pdf');
      setMimeType(asset.mimeType || 'application/pdf');
      setFileSize(asset.size || 0);
      setPdfAssetUri(asset.uri);
      setContent('');
      setUrl('');
      if (!title.trim()) {
        setTitle(asset.name?.replace(/\.pdf$/i, '') || 'PDF Document');
      }
    } catch (error) {
      console.warn('PDF picker failed', error);
      Alert.alert('Picker Error', 'Could not pick the PDF file.');
    } finally {
      setIsPickingPdf(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    if (entryType === 'url' && !url.trim()) {
      Alert.alert('Error', 'Please enter a URL');
      return;
    }

    if (entryType === 'pdf' && !content.trim()) {
      if (!pdfAssetUri.trim()) {
        Alert.alert('Error', 'Please pick a PDF file first');
        return;
      }
    }

    let finalContent = content.trim();
    let finalUrl = url.trim();
    let finalStoragePath = existingStoragePath;

    if (entryType === 'pdf' && pdfAssetUri.trim()) {
      const user = auth.currentUser;
      if (!user?.uid) {
        Alert.alert('Authentication Error', 'You must be logged in to upload a PDF.');
        return;
      }

      setIsUploadingPdf(true);
      try {
        const safeName = (fileName || `${title.trim()}.pdf`).replace(/[^\w.\-]/g, '_');
        const formData = new FormData();
        formData.append('file', {
          uri: pdfAssetUri,
          name: safeName,
          type: mimeType || 'application/pdf',
        } as any);

        const { authFetch } = await import('../utils/api');
        const uploadResponse = await authFetch('/api/documents/upload-pdf', {
          method: 'POST',
          body: formData,
        });
        const uploadData: any = await parseApiResponse<any>(uploadResponse);
        if (!uploadResponse.ok) {
          throw new Error(
            typeof uploadData?.error === 'string'
              ? uploadData.error
              : typeof uploadData?.detail === 'string'
                ? uploadData.detail
                : 'PDF upload failed'
          );
        }
        finalStoragePath = String(uploadData?.storagePath || '');
        finalUrl = String(uploadData?.downloadUrl || '');
        finalContent = '';
      } catch (error) {
        console.warn('PDF upload failed', error);
        Alert.alert('Upload Error', error instanceof Error ? error.message : 'Could not upload the PDF to the backend.');
        setIsUploadingPdf(false);
        return;
      }
      setIsUploadingPdf(false);
    }

    if (entryType === 'password' && !password.trim()) {
      Alert.alert('Error', 'Please enter a password or secret');
      return;
    }

    if (entryType === 'text' && !finalContent.trim()) {
      Alert.alert('Error', 'Please enter the text you want to save');
      return;
    }

    try {
      const payload: Partial<VaultEntry> = {
        title: title.trim(),
        entryType,
        category: folder.trim() || 'General',
        username: username.trim(),
        password: password,
        url: finalUrl,
        content: finalContent,
        notes: notes.trim(),
        fileName: fileName.trim(),
        mimeType: mimeType.trim(),
        fileSize,
        storagePath: finalStoragePath,
      };
      if (isEditing && onSave) {
        await onSave(payload);
      } else {
        await addEntry(payload as any);
      }
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to save item');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Item' : 'Add Secure Item'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={styles.inputLabel}>Type</Text>
            <View style={styles.selectorRow}>
              {(Object.keys(ENTRY_CONFIG) as VaultEntryType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.selectorChip, entryType === type && styles.selectorChipActive]}
                  onPress={() => setEntryType(type)}
                  disabled={isEditing}
                >
                  <MaterialCommunityIcons
                    name={ENTRY_CONFIG[type].icon as any}
                    size={16}
                    color={entryType === type ? '#fff' : ENTRY_CONFIG[type].accent}
                  />
                  <Text style={[styles.selectorChipText, entryType === type && styles.selectorChipTextActive]}>
                    {ENTRY_CONFIG[type].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter title"
              value={title}
              onChangeText={setTitle}
              placeholderTextColor="#999"
            />

            <Text style={styles.inputLabel}>Folder</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="General, Finance, Work..."
              value={folder}
              onChangeText={setFolder}
              placeholderTextColor="#999"
            />

            {entryType === 'password' && (
              <>
                <Text style={styles.inputLabel}>Username / Email</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter username or email"
                  value={username}
                  onChangeText={setUsername}
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />

                <Text style={styles.inputLabel}>Password / Secret</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    placeholder="Enter password or secret"
                    value={password}
                    onChangeText={setPassword}
                    placeholderTextColor="#999"
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#999" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {entryType === 'url' && (
              <>
                <Text style={styles.inputLabel}>URL</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="https://..."
                  value={url}
                  onChangeText={setUrl}
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
              </>
            )}

            {entryType === 'pdf' && (
              <>
                <Text style={styles.inputLabel}>PDF File</Text>
                <TouchableOpacity style={styles.pdfPickerButton} onPress={pickPdf} disabled={isPickingPdf || isUploadingPdf}>
                  {isPickingPdf ? (
                    <ActivityIndicator color="#111827" size="small" />
                  ) : (
                    <MaterialCommunityIcons name="file-upload-outline" size={20} color="#111827" />
                  )}
                  <Text style={styles.pdfPickerButtonText}>
                    {fileName ? 'Choose Another PDF' : 'Pick PDF File'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.pdfInfoCard}>
                  <Text style={styles.pdfInfoTitle}>{fileName || 'No PDF selected yet'}</Text>
                  <Text style={styles.pdfInfoMeta}>
                    {fileSize > 0 ? `${(fileSize / 1024 / 1024).toFixed(2)} MB` : 'Select a PDF up to 6 MB'}
                  </Text>
                </View>
              </>
            )}

            {entryType === 'text' && (
              <>
                <Text style={styles.inputLabel}>Text Message</Text>
                <TextInput
                  style={[styles.modalInput, styles.multilineInput]}
                  placeholder="Store your private text here..."
                  value={content}
                  onChangeText={setContent}
                  placeholderTextColor="#999"
                  multiline
                  textAlignVertical="top"
                />
              </>
            )}

            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={[styles.modalInput, styles.multilineInput]}
              placeholder="Optional notes"
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor="#999"
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.saveButton, isUploadingPdf && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={isUploadingPdf}
            >
              {isUploadingPdf ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>{isEditing ? 'Update Item' : 'Save Item'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFCFC',
  },
  body: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  lockButton: {
    padding: 5,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusInfo: {
    marginLeft: 12,
  },
  statusTitle: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  unlockButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00E0C6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedButton: {
    backgroundColor: '#ff4d4f',
  },
  typeGrid: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eef2f4',
  },
  typeCardTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
  },
  typeCardHelper: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#667085',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  entriesSection: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 12,
  },
  groupSection: {
    marginBottom: 18,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  groupCount: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: '#667085',
    backgroundColor: '#F2F4F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  entryLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  entryInfo: {
    flex: 1,
  },
  entryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  entryTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  entryMeta: {
    fontSize: 12,
    color: '#98A2B3',
    marginTop: 4,
  },
  entrySecondary: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
  },
  revealText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: '600',
  },
  entryPreview: {
    fontSize: 14,
    color: '#475467',
    marginTop: 8,
    lineHeight: 20,
  },
  entryNotes: {
    fontSize: 13,
    color: '#98A2B3',
    marginTop: 8,
    lineHeight: 18,
  },
  entryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    padding: 20,
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  detailIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailHeaderText: {
    flex: 1,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  detailMeta: {
    fontSize: 13,
    color: '#667085',
    marginTop: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667085',
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 15,
    color: '#101828',
    lineHeight: 22,
  },
  detailNotes: {
    fontSize: 14,
    color: '#475467',
    lineHeight: 20,
  },
  detailActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  detailActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F2F4F7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailActionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteActionButton: {
    backgroundColor: '#FEF3F2',
  },
  deleteActionText: {
    color: '#B42318',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00E0C6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#00E0C6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navItemActive: {
    alignItems: 'center',
    flex: 1,
  },
  navText: {
    fontSize: 12,
    marginTop: 4,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  multilineInput: {
    minHeight: 110,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeButton: {
    padding: 10,
    marginLeft: 8,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F2F4F7',
  },
  selectorChipActive: {
    backgroundColor: '#111827',
  },
  selectorChipText: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '600',
  },
  selectorChipTextActive: {
    color: '#fff',
  },
  pdfPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E5F7F3',
    borderRadius: 12,
    paddingVertical: 14,
  },
  pdfPickerButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  pdfInfoCard: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  pdfInfoTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  pdfInfoMeta: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#00E0C6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
