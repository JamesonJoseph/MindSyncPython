import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, parseApiResponse } from '../utils/api';

type ConversationSummary = {
  _id: string;
  title: string;
  contextType: string;
  messageCount: number;
  lastMessage: string;
  updatedAt?: string;
};

const CHAT_HISTORY_CACHE_KEY = 'mindsync_chat_history_v1';

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /network request timed out/i.test(error.message);
}
const CONVERSATION_CACHE_PREFIX = 'mindsync_conversation_';

function formatUpdatedAt(value?: string) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
}

export default function ChatHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'journal' | 'general'>('all');
  const [editingItem, setEditingItem] = useState<ConversationSummary | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [screenMessage, setScreenMessage] = useState('');

  const loadConversations = useCallback(async () => {
    try {
      const apiUrl = getApiBaseUrl();
      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/chat/conversations`);
      const data: any = await parseApiResponse<any>(response);

      if (!response.ok) {
        const message =
          typeof data?.error === 'string' ? data.error :
          typeof data?.detail === 'string' ? data.detail :
          'Failed to load saved conversations.';
        throw new Error(message);
      }

      const items = Array.isArray(data) ? data : [];
      setConversations(items);
      setScreenMessage('');
      await AsyncStorage.setItem(CHAT_HISTORY_CACHE_KEY, JSON.stringify(items));
    } catch (error) {
      if (!isTimeoutError(error)) {
        console.warn('Failed to load saved conversations', error);
      }
      if (conversations.length > 0) {
        setScreenMessage('Showing cached saved chats. Refresh when the connection is stable.');
      }
      if (conversations.length === 0) {
        setScreenMessage(error instanceof Error ? error.message : 'Failed to load saved conversations.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversations.length]);

  useEffect(() => {
    const hydrateCacheAndLoad = async () => {
      try {
        const cached = await AsyncStorage.getItem(CHAT_HISTORY_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setConversations(parsed);
            setLoading(false);
          }
        }
      } catch (error) {
        console.warn('Failed to hydrate chat history cache', error);
      }

      loadConversations();
    };

    hydrateCacheAndLoad();
  }, [loadConversations]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = conversations.filter(item => {
    const matchesFilter = activeFilter === 'all' || (item.contextType || 'general') === activeFilter;
    if (!matchesFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [
      item.title,
      item.lastMessage,
      item.contextType,
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(normalizedQuery));
  });

  const handleDelete = (item: ConversationSummary) => {
    Alert.alert(
      'Delete Conversation',
      'This will permanently remove the saved conversation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const apiUrl = getApiBaseUrl();
              const { authFetch } = await import('../utils/api');
              const response = await authFetch(`${apiUrl}/api/chat/conversations/${item._id}`, {
                method: 'DELETE',
              });
              const data = await parseApiResponse<any>(response);
              if (!response.ok) {
                const message =
                  typeof data?.error === 'string' ? data.error :
                  typeof data?.detail === 'string' ? data.detail :
                  'Failed to delete conversation.';
                throw new Error(message);
              }
              setConversations(prev => {
                const next = prev.filter(conversation => conversation._id !== item._id);
                AsyncStorage.setItem(CHAT_HISTORY_CACHE_KEY, JSON.stringify(next)).catch(() => {});
                return next;
              });
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete conversation.');
            }
          }
        }
      ]
    );
  };

  const openEditModal = (item: ConversationSummary) => {
    setEditingItem(item);
    setEditTitle(item.title || '');
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    const title = editTitle.trim();
    if (!title) {
      Alert.alert('Missing Title', 'Enter a title for the conversation.');
      return;
    }

    setSavingEdit(true);
    try {
      const apiUrl = getApiBaseUrl();
      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/chat/conversations/${editingItem._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await parseApiResponse<any>(response);
      if (!response.ok) {
        const message =
          typeof data?.error === 'string' ? data.error :
          typeof data?.detail === 'string' ? data.detail :
          'Failed to update conversation.';
        throw new Error(message);
      }

      setConversations(prev =>
        {
          const next = prev.map(conversation =>
          conversation._id === editingItem._id
            ? { ...conversation, title }
            : conversation
          );
          AsyncStorage.setItem(CHAT_HISTORY_CACHE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        }
      );
      setEditingItem(null);
      setEditTitle('');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update conversation.');
    } finally {
      setSavingEdit(false);
    }
  };

  const openConversation = async (item: ConversationSummary) => {
    try {
      const cached = await AsyncStorage.getItem(`${CONVERSATION_CACHE_PREFIX}${item._id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        const initialMessages = Array.isArray(parsed?.messages)
          ? parsed.messages
              .filter((entry: any) => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string')
              .map((entry: any, index: number) => ({
                id: `${item._id}-cached-${index}`,
                role: entry.role,
                content: entry.content,
              }))
          : [];
        router.push({
          pathname: '/chat',
          params: {
            conversationId: item._id,
            initialMessages: initialMessages.length > 0 ? JSON.stringify(initialMessages) : undefined,
            contextType: typeof parsed?.contextType === 'string' ? parsed.contextType : undefined,
            context: parsed?.context ? JSON.stringify(parsed.context) : undefined,
          },
        } as any);
        return;
      }
    } catch (error) {
      console.warn('Failed to open cached conversation', error);
    }

    router.push({ pathname: '/chat', params: { conversationId: item._id } } as any);
  };

  const renderItem = ({ item }: { item: ConversationSummary }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => openConversation(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title || 'MindSync Chat'}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.contextType || 'general'}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>{item.messageCount} messages</Text>
      <Text style={styles.cardPreview} numberOfLines={2}>
        {item.lastMessage || 'No preview available'}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardTime}>{formatUpdatedAt(item.updatedAt)}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => openEditModal(item)} style={styles.iconButton}>
            <Ionicons name="create-outline" size={18} color="#0a8f7b" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconButton}>
            <Ionicons name="trash-outline" size={18} color="#d64545" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Chats</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#777" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
          placeholder="Search saved chats"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', 'journal', 'general'] as const).map(filter => (
          <TouchableOpacity
            key={filter}
            onPress={() => setActiveFilter(filter)}
            style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>
              {filter === 'all' ? 'All' : filter === 'journal' ? 'Journal' : 'General'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!screenMessage && (
        <View style={styles.messageBanner}>
          <Text style={styles.messageBannerText}>{screenMessage}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#00E0C6" />
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={52} color="#c7c7c7" />
          <Text style={styles.emptyTitle}>
            {conversations.length === 0 ? 'No saved conversations' : 'No matching conversations'}
          </Text>
          <Text style={styles.emptyText}>
            {conversations.length === 0
              ? 'Use the Save button in chat to keep a full conversation.'
              : 'Try a different search or filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadConversations();
              }}
              colors={['#00E0C6']}
            />
          }
        />
      )}

      <Modal visible={!!editingItem} transparent animationType="fade" onRequestClose={() => setEditingItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Conversation Title</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              style={styles.modalInput}
              placeholder="Conversation title"
              placeholderTextColor="#999"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditingItem(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} style={styles.primaryButton} disabled={savingEdit}>
                {savingEdit ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFCFC',
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
    fontSize: 19,
    fontWeight: '700',
    color: '#333',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    lineHeight: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ececec',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#222',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  filterChip: {
    backgroundColor: '#f2f4f5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: '#00E0C6',
  },
  filterChipText: {
    color: '#667',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000',
  },
  messageBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#fff7e6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ffe2b8',
  },
  messageBannerText: {
    color: '#8a5a00',
    fontSize: 13,
    lineHeight: 18,
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  badge: {
    backgroundColor: '#E8FCF8',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#0a8f7b',
    fontSize: 12,
    fontWeight: '600',
  },
  cardMeta: {
    marginTop: 8,
    color: '#666',
    fontSize: 13,
  },
  cardPreview: {
    marginTop: 8,
    color: '#444',
    fontSize: 14,
    lineHeight: 20,
  },
  cardTime: {
    color: '#999',
    fontSize: 12,
  },
  cardFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e3e3e3',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  secondaryButtonText: {
    color: '#444',
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#00E0C6',
    minWidth: 72,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#000',
    fontWeight: '700',
  },
});
