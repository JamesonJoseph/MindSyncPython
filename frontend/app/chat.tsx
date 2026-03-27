import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl, parseApiResponse } from '../utils/api';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ConversationSummary = {
  _id: string;
  title: string;
  contextType: string;
  messageCount: number;
  lastMessage: string;
  updatedAt?: string;
};

type JournalSummary = {
  _id: string;
  title: string;
  content: string;
  aiAnalysis?: string;
  date?: string;
};

const RECENT_CHATS_CACHE_KEY = 'mindsync_recent_chats_v1';
const RECENT_JOURNALS_CACHE_KEY = 'mindsync_recent_journals_v1';
const CONVERSATION_CACHE_PREFIX = 'mindsync_conversation_';

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /network request timed out/i.test(error.message);
}

function parseContext(rawContext: string | string[] | undefined): Record<string, unknown> | undefined {
  const serialized = Array.isArray(rawContext) ? rawContext[0] : rawContext;
  if (typeof serialized !== 'string' || !serialized.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(serialized);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn('Failed to parse chat context', error);
  }
  return undefined;
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const hasAutoSentRef = useRef(false);
  const rawConversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;
  const rawContextType = Array.isArray(params.contextType) ? params.contextType[0] : params.contextType;
  const rawContext = Array.isArray(params.context) ? params.context[0] : params.context;
  const [messages, setMessages] = useState<Message[]>(() => {
    const rawInitialMessages = params.initialMessages;
    const serialized = Array.isArray(rawInitialMessages) ? rawInitialMessages[0] : rawInitialMessages;

    if (typeof serialized === 'string' && serialized.trim()) {
      try {
        const parsed = JSON.parse(serialized);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .filter(
              (item): item is Message =>
                !!item &&
                typeof item.id === 'string' &&
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.content === 'string'
            );
        }
      } catch (error) {
        console.warn('Failed to parse initial chat messages', error);
      }
    }

    return [
      {
        id: '1',
        role: 'assistant',
        content: 'Hello! I am MindSync AI. I can help you manage your tasks or reflect on your journal entries. How can I assist you today?'
      }
    ];
  });
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingRecentChats, setLoadingRecentChats] = useState(false);
  const [loadingRecentJournals, setLoadingRecentJournals] = useState(false);
  const [savingConversation, setSavingConversation] = useState(false);
  const [screenError, setScreenError] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [recentConversations, setRecentConversations] = useState<ConversationSummary[]>([]);
  const [recentJournals, setRecentJournals] = useState<JournalSummary[]>([]);
  const [conversationId, setConversationId] = useState(
    typeof rawConversationId === 'string' ? rawConversationId : ''
  );
  const flatListRef = useRef<FlatList>(null);
  const initialMessagesParam = Array.isArray(params.initialMessages) ? params.initialMessages[0] : params.initialMessages;
  const context = parseContext(rawContext);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  useEffect(() => {
    const shouldShowRecent = !conversationId && !(typeof initialMessagesParam === 'string' && initialMessagesParam.trim());
    if (!shouldShowRecent) {
      return;
    }

    const hydrateRecentCache = async () => {
      try {
        const [cachedChats, cachedJournals] = await Promise.all([
          AsyncStorage.getItem(RECENT_CHATS_CACHE_KEY),
          AsyncStorage.getItem(RECENT_JOURNALS_CACHE_KEY),
        ]);

        if (cachedChats) {
          const parsedChats = JSON.parse(cachedChats);
          if (Array.isArray(parsedChats)) {
            setRecentConversations(parsedChats);
          }
        }

        if (cachedJournals) {
          const parsedJournals = JSON.parse(cachedJournals);
          if (Array.isArray(parsedJournals)) {
            setRecentJournals(parsedJournals);
          }
        }
      } catch (error) {
        console.warn('Failed to hydrate recent chat cache', error);
      }
    };

    const loadRecentConversations = async () => {
      setLoadingRecentChats(true);
      try {
        const apiUrl = getApiBaseUrl();
        const { authFetch } = await import('../utils/api');
        const response = await authFetch(`${apiUrl}/api/chat/conversations?limit=5`);
        const data: any = await parseApiResponse<any>(response);
        if (!response.ok) {
          throw new Error(
            typeof data?.error === 'string'
              ? data.error
              : typeof data?.detail === 'string'
                ? data.detail
                : 'Failed to load previous chats.'
          );
        }
        const items = Array.isArray(data) ? data : [];
        setRecentConversations(items);
        await AsyncStorage.setItem(RECENT_CHATS_CACHE_KEY, JSON.stringify(items));
      } catch (error) {
        if (!isTimeoutError(error)) {
          console.warn('Failed to load recent chats', error);
        }
      } finally {
        setLoadingRecentChats(false);
      }
    };

    const loadRecentJournals = async () => {
      setLoadingRecentJournals(true);
      try {
        const apiUrl = getApiBaseUrl();
        const { authFetch } = await import('../utils/api');
        const response = await authFetch(`${apiUrl}/api/journals/search?limit=5&sort=desc`);
        const data: any = await parseApiResponse<any>(response);
        if (!response.ok) {
          throw new Error(
            typeof data?.error === 'string'
              ? data.error
              : typeof data?.detail === 'string'
                ? data.detail
                : 'Failed to load previous journals.'
          );
        }
        const items = Array.isArray(data) ? data : [];
        setRecentJournals(items);
        await AsyncStorage.setItem(RECENT_JOURNALS_CACHE_KEY, JSON.stringify(items));
      } catch (error) {
        if (!isTimeoutError(error)) {
          console.warn('Failed to load recent journals', error);
        }
      } finally {
        setLoadingRecentJournals(false);
      }
    };

    hydrateRecentCache();
    loadRecentConversations();
    loadRecentJournals();
  }, [conversationId, initialMessagesParam]);

  useEffect(() => {
    const loadConversation = async () => {
      if (!conversationId || (typeof initialMessagesParam === 'string' && initialMessagesParam.trim())) {
        return;
      }

      setLoadingConversation(true);
      try {
        setScreenError('');
        const cachedConversation = await AsyncStorage.getItem(`${CONVERSATION_CACHE_PREFIX}${conversationId}`);
        if (cachedConversation) {
          const parsed = JSON.parse(cachedConversation);
          const cachedMessages = Array.isArray(parsed?.messages)
            ? parsed.messages
                .filter(
                  (item: any): item is Message =>
                    !!item &&
                    (item.role === 'user' || item.role === 'assistant') &&
                    typeof item.content === 'string'
                )
                .map((item: Message, index: number) => ({
                  id: `${conversationId}-cached-${index}`,
                  role: item.role,
                  content: item.content,
                }))
            : [];
          if (cachedMessages.length > 0) {
            setMessages(cachedMessages);
            setLoadingConversation(false);
          }
        }

        const apiUrl = getApiBaseUrl();
        const { authFetch } = await import('../utils/api');
        const response = await authFetch(`${apiUrl}/api/chat/conversations/${conversationId}`);
        const data = await parseApiResponse<any>(response);

        if (!response.ok) {
          const message =
            typeof data?.error === 'string' ? data.error :
            typeof data?.detail === 'string' ? data.detail :
            'Failed to load conversation.';
          throw new Error(message);
        }

        const loadedMessages = Array.isArray(data?.messages)
          ? data.messages
              .filter(
                (item: any): item is Message =>
                  !!item &&
                  (item.role === 'user' || item.role === 'assistant') &&
                  typeof item.content === 'string'
              )
              .map((item: Message, index: number) => ({
                id: `${conversationId}-${index}`,
                role: item.role,
                content: item.content,
              }))
          : [];

        if (loadedMessages.length > 0) {
          setMessages(loadedMessages);
        }
        await AsyncStorage.setItem(`${CONVERSATION_CACHE_PREFIX}${conversationId}`, JSON.stringify(data));
      } catch (error) {
        if (!isTimeoutError(error)) {
          console.warn('Failed to load saved conversation', error);
        }
        const message = error instanceof Error ? error.message : 'Failed to load conversation.';
        const cachedConversation = await AsyncStorage.getItem(`${CONVERSATION_CACHE_PREFIX}${conversationId}`);
        if (cachedConversation) {
          setScreenError('Showing cached conversation. Live refresh failed.');
        } else {
          setScreenError(message);
        }
      } finally {
        setLoadingConversation(false);
      }
    };

    loadConversation();
  }, [conversationId, initialMessagesParam]);

  const requestAssistantReply = async (messageList: Message[]) => {
    const user = auth.currentUser;
    const activeUserId = user?.uid;

    if (!activeUserId) {
      Alert.alert("Authentication Required", "Please log in to use the AI chat.");
      return;
    }

    setLoading(true);

    try {
      const apiMessages = messageList.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const apiUrl = getApiBaseUrl();
      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeUserId,
          messages: apiMessages,
        }),
      });

      const data = await parseApiResponse<any>(response);

      if (!response.ok) {
        const message =
          typeof data?.error === 'string' ? data.error :
          typeof data?.detail === 'string' ? data.detail :
          'Sorry, I encountered an error connecting to my brain.';
        throw new Error(message);
      }

      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: typeof data?.content === 'string' && data.content.trim()
            ? data.content
            : 'I am here with you. Tell me more about how this day felt for you.'
        }
      ]);
    } catch (error) {
      if (!isTimeoutError(error)) {
        console.warn("Chat network error:", error);
      }
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-assistant-error`,
          role: 'assistant',
          content: error instanceof Error && error.message
            ? error.message
            : 'Network error. Please try again.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const autoSendRaw = Array.isArray(params.autoSend) ? params.autoSend[0] : params.autoSend;
    const shouldAutoSend = autoSendRaw === '1';

    if (!shouldAutoSend || hasAutoSentRef.current || messages.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== 'user') {
      return;
    }

    hasAutoSentRef.current = true;
    requestAssistantReply(messages);
  }, [messages, params.autoSend]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setInputText('');
    requestAssistantReply(updatedMessages);
  };

  const saveConversation = async () => {
    if (messages.length === 0) {
      Alert.alert('Nothing to Save', 'Start a conversation first.');
      return;
    }

    const user = auth.currentUser;
    if (!user?.uid) {
      Alert.alert('Authentication Required', 'Please log in to save the chat.');
      return;
    }

    setSavingConversation(true);
    try {
      const apiUrl = getApiBaseUrl();
      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          contextType: typeof rawContextType === 'string' ? rawContextType : undefined,
          context,
          messages: messages.map(message => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });
      const data = await parseApiResponse<any>(response);

      if (!response.ok) {
        const message =
          typeof data?.error === 'string' ? data.error :
          typeof data?.detail === 'string' ? data.detail :
          'Failed to save conversation.';
        throw new Error(message);
      }

      if (typeof data?._id === 'string' && data._id.trim()) {
        setConversationId(data._id);
      }
      const savedConversationId = typeof data?._id === 'string' && data._id.trim() ? data._id : conversationId;
      if (savedConversationId) {
        await AsyncStorage.setItem(
          `${CONVERSATION_CACHE_PREFIX}${savedConversationId}`,
          JSON.stringify({
            _id: savedConversationId,
            title: typeof data?.title === 'string' ? data.title : 'MindSync Chat',
            contextType: typeof data?.contextType === 'string' ? data.contextType : (typeof rawContextType === 'string' ? rawContextType : 'general'),
            context,
            messages: messages.map(message => ({
              role: message.role,
              content: message.content,
            })),
            updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
          })
        );
      }
      try {
        const cachedChats = await AsyncStorage.getItem(RECENT_CHATS_CACHE_KEY);
        const parsedChats = cachedChats ? JSON.parse(cachedChats) : [];
        const nextChats = Array.isArray(parsedChats) ? parsedChats : [];
        const savedPreview: ConversationSummary = {
          _id: typeof data?._id === 'string' ? data._id : conversationId,
          title: typeof data?.title === 'string' ? data.title : 'MindSync Chat',
          contextType: typeof data?.contextType === 'string' ? data.contextType : (typeof rawContextType === 'string' ? rawContextType : 'general'),
          messageCount: Array.isArray(data?.messages) ? data.messages.length : messages.length,
          lastMessage: messages[messages.length - 1]?.content || '',
          updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
        };
        const deduped = [savedPreview, ...nextChats.filter((item: ConversationSummary) => item?._id !== savedPreview._id)].slice(0, 5);
        setRecentConversations(deduped);
        await AsyncStorage.setItem(RECENT_CHATS_CACHE_KEY, JSON.stringify(deduped));
      } catch (error) {
        console.warn('Failed to update recent chats cache after save', error);
      }
      Alert.alert('Saved', 'The full conversation has been saved.');
    } catch (error) {
      if (!isTimeoutError(error)) {
        console.warn('Failed to save conversation', error);
      }
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save conversation.');
    } finally {
      setSavingConversation(false);
    }
  };

  const renameConversation = async () => {
    if (!conversationId) {
      Alert.alert('Save First', 'Save the conversation before editing its title.');
      return;
    }
    const title = titleDraft.trim();
    if (!title) {
      Alert.alert('Missing Title', 'Enter a conversation title.');
      return;
    }

    setSavingConversation(true);
    try {
      const apiUrl = getApiBaseUrl();
      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/chat/conversations/${conversationId}`, {
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
      setEditingTitle(false);
      Alert.alert('Updated', 'Conversation title updated.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update conversation.');
    } finally {
      setSavingConversation(false);
    }
  };

  const deleteConversation = () => {
    if (!conversationId) {
      Alert.alert('Nothing to Delete', 'This conversation is not saved yet.');
      return;
    }
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
              const response = await authFetch(`${apiUrl}/api/chat/conversations/${conversationId}`, {
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
              await AsyncStorage.removeItem(`${CONVERSATION_CACHE_PREFIX}${conversationId}`);
              setConversationId('');
              router.replace('/chat-history');
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete conversation.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageWrapper, isUser ? styles.messageWrapperUser : styles.messageWrapperAssistant]}>
        {!isUser && (
          <View style={styles.assistantAvatar}>
            <Ionicons name="sparkles" size={16} color="#fff" />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant]}>
          <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAssistant]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const continueFromJournal = (journal: JournalSummary) => {
    const trimmedContent = String(journal.content || '').trim();
    const trimmedAnalysis = String(journal.aiAnalysis || '').trim();

    if (!trimmedContent) {
      Alert.alert('Empty Journal', 'This journal has no content to continue from.');
      return;
    }

    if (!trimmedAnalysis) {
      Alert.alert('Analyze First', 'Open this journal and generate AI insights before continuing the chat.');
      return;
    }

    const seededMessages = [
      {
        id: `journal-${journal._id}`,
        role: 'user' as const,
        content: `This is my previous journal entry:\n\n${trimmedContent}`,
      },
      {
        id: `insight-${journal._id}`,
        role: 'assistant' as const,
        content: trimmedAnalysis,
      },
      {
        id: `continue-${journal._id}`,
        role: 'user' as const,
        content: 'Continue chatting with me about this journal entry and help me reflect on it.',
      },
    ];

    router.push({
      pathname: '/chat',
      params: {
        initialMessages: JSON.stringify(seededMessages),
        autoSend: '1',
        contextType: 'journal',
        context: JSON.stringify({
          title: journal.title || 'Previous Journal',
          journalId: journal._id,
          journalContent: trimmedContent,
          journalAnalysis: trimmedAnalysis,
          source: 'chat-previous-journal',
        }),
      },
    } as any);
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MindSync AI</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/chat-history')} style={styles.headerIconButton}>
            <Ionicons name="time-outline" size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setTitleDraft('');
              setEditingTitle(true);
            }}
            style={[styles.headerIconButton, !conversationId && styles.disabledIconButton]}
            disabled={!conversationId}
          >
            <Ionicons name="create-outline" size={20} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={deleteConversation}
            style={[styles.headerIconButton, !conversationId && styles.disabledIconButton]}
            disabled={!conversationId}
          >
            <Ionicons name="trash-outline" size={20} color="#d64545" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={saveConversation}
            style={[styles.saveHeaderButton, savingConversation && { opacity: 0.6 }]}
            disabled={savingConversation}
          >
            {savingConversation ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Ionicons name="save-outline" size={18} color="#000" />
            )}
            <Text style={styles.saveHeaderText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loadingConversation ? (
        <View style={styles.loadingConversationContainer}>
          <ActivityIndicator size="large" color="#00E0C6" />
          <Text style={styles.loadingConversationText}>Loading conversation...</Text>
        </View>
      ) : screenError ? (
        <View style={styles.loadingConversationContainer}>
          <Ionicons name="alert-circle-outline" size={34} color="#ff7675" />
          <Text style={styles.loadingConversationText}>{screenError}</Text>
        </View>
      ) : (
        <View style={styles.chatBody}>
          {!conversationId && !(typeof initialMessagesParam === 'string' && initialMessagesParam.trim()) && (
            <View style={styles.discoverySection}>
              <View style={styles.previousChatsHeader}>
                <Text style={styles.previousChatsTitle}>Previous Chats</Text>
                <TouchableOpacity onPress={() => router.push('/chat-history')}>
                  <Text style={styles.previousChatsLink}>View all</Text>
                </TouchableOpacity>
              </View>

              {loadingRecentChats ? (
                <ActivityIndicator color="#00E0C6" size="small" />
              ) : recentConversations.length > 0 ? (
                recentConversations.map(item => (
                  <TouchableOpacity
                    key={item._id}
                    style={styles.previousChatCard}
                    onPress={() => {
                      setScreenError('');
                      setConversationId(item._id);
                    }}
                  >
                    <View style={styles.previousChatTextWrap}>
                      <Text style={styles.previousChatTitle} numberOfLines={1}>
                        {item.title || 'MindSync Chat'}
                      </Text>
                      <Text style={styles.previousChatPreview} numberOfLines={2}>
                        {item.lastMessage || 'Continue this conversation'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#999" />
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.previousChatsEmpty}>No saved chats yet.</Text>
              )}

              <View style={[styles.previousChatsHeader, { marginTop: 14 }]}>
                <Text style={styles.previousChatsTitle}>Previous Journals</Text>
                <TouchableOpacity onPress={() => router.push('/journal')}>
                  <Text style={styles.previousChatsLink}>View all</Text>
                </TouchableOpacity>
              </View>

              {loadingRecentJournals ? (
                <ActivityIndicator color="#00E0C6" size="small" />
              ) : recentJournals.length > 0 ? (
                recentJournals.map(item => (
                  <View key={item._id} style={styles.previousJournalCard}>
                    <View style={styles.previousChatTextWrap}>
                      <Text style={styles.previousChatTitle} numberOfLines={1}>
                        {item.title || 'Journal Entry'}
                      </Text>
                      <Text style={styles.previousChatPreview} numberOfLines={2}>
                        {item.content || 'Open this journal entry'}
                      </Text>
                    </View>
                    <View style={styles.previousJournalActions}>
                      <TouchableOpacity
                        style={styles.previousJournalButton}
                        onPress={() => router.push({
                          pathname: '/add-journal',
                          params: {
                            id: item._id,
                            title: item.title || '',
                            content: item.content || '',
                            analysis: item.aiAnalysis || '',
                          },
                        } as any)}
                      >
                        <Text style={styles.previousJournalButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.previousJournalButton, styles.previousJournalButtonPrimary]}
                        onPress={() => continueFromJournal(item)}
                      >
                        <Text style={styles.previousJournalButtonPrimaryText}>Continue</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.previousChatsEmpty}>No previous journals yet.</Text>
              )}
            </View>
          )}

          <FlatList
            ref={flatListRef}
            data={[...messages].reverse()}
            inverted={true}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.chatList}
          />
        </View>
      )}

      <View style={[styles.inputContainer, { marginBottom: Math.max(insets.bottom, 10) + 64 }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Type your message to MindSync AI..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity 
          style={[styles.sendButton, !inputText.trim() && { opacity: 0.5 }]} 
          onPress={sendMessage}
          disabled={!inputText.trim() || loading}
        >
          {loading ? (
             <ActivityIndicator color="#fff" size="small" />
          ) : (
             <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom Navigation */}
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
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="documents-outline" size={26} color="#888" />
          <Text style={styles.navText}>Docs</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={editingTitle} transparent animationType="fade" onRequestClose={() => setEditingTitle(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Conversation Title</Text>
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              style={styles.modalInput}
              placeholder="Conversation title"
              placeholderTextColor="#999"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditingTitle(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={renameConversation} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    padding: 4,
  },
  disabledIconButton: {
    opacity: 0.4,
  },
  saveHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00E0C6',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
  },
  saveHeaderText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 13,
  },
  chatList: {
    paddingHorizontal: 15,
    paddingVertical: 20,
    paddingBottom: 80,
  },
  chatBody: {
    flex: 1,
  },
  discoverySection: {
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: '#FAFCFC',
  },
  previousChatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  previousChatsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  previousChatsLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00a892',
  },
  previousChatCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ededed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previousChatTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  previousChatTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
  },
  previousChatPreview: {
    marginTop: 4,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  previousChatsEmpty: {
    color: '#777',
    fontSize: 14,
    marginBottom: 10,
  },
  previousJournalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ededed',
  },
  previousJournalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  previousJournalButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f1f3f4',
  },
  previousJournalButtonText: {
    color: '#444',
    fontSize: 13,
    fontWeight: '600',
  },
  previousJournalButtonPrimary: {
    backgroundColor: '#00E0C6',
  },
  previousJournalButtonPrimaryText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingConversationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingConversationText: {
    color: '#666',
    fontSize: 15,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 15,
    alignItems: 'flex-end',
  },
  messageWrapperUser: {
    justifyContent: 'flex-end',
  },
  messageWrapperAssistant: {
    justifyContent: 'flex-start',
  },
  assistantAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#9D4EDD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 15,
    borderRadius: 20,
  },
  messageBubbleUser: {
    backgroundColor: '#00E0C6',
    borderBottomRightRadius: 5,
  },
  messageBubbleAssistant: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextUser: {
    color: '#000',
  },
  messageTextAssistant: {
    color: '#333',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 56,
    maxHeight: 140,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#00E0C6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
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
  navText: {
    fontSize: 12,
    marginTop: 4,
    color: '#888',
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
