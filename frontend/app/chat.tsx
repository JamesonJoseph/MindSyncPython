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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl } from '../utils/api';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hello! I am MindSync AI. I can help you manage your tasks or reflect on your journal entries. How can I assist you today?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const userId = auth.currentUser?.uid;

  useEffect(() => {
    const fetchHistory = async () => {
      if (!userId) {
        setFetchingHistory(false);
        return;
      }

      try {
        const { authFetch, getApiBaseUrl } = await import('../utils/api');
        const apiUrl = getApiBaseUrl();
        const response = await authFetch('/api/avatar/history');
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            const historyMsgs: Message[] = [];
            data.forEach((h: any) => {
              if (h.user_query) {
                historyMsgs.push({
                  id: h._id + '_u',
                  role: 'user',
                  content: h.user_query
                });
              }
              if (h.assistant_response) {
                historyMsgs.push({
                  id: h._id + '_a',
                  role: 'assistant',
                  content: h.assistant_response
                });
              }
            });
            setMessages(historyMsgs);
          }
        }
      } catch (error) {
        console.error("Failed to fetch chat history:", error);
      } finally {
        setFetchingHistory(false);
      }
    };

    fetchHistory();
  }, [userId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    const user = auth.currentUser;
    const userId = user?.uid;
    const userEmail = user?.email;
    
    if (!userId) {
      Alert.alert("Authentication Required", "Please log in to use the AI chat.");
      return;
    }

    const newUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      const apiUrl = getApiBaseUrl();
      console.log(`Sending chat to: ${apiUrl}/api/chat for user: ${userId}`);

      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          message: newUserMsg.content,
        }),
      });

      console.log(`Chat API response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        console.log('Chat API response data:', data);
        setMessages(prev => [
          ...prev,
          { id: Date.now().toString(), role: 'assistant', content: data.content }
        ]);
      } else {
        const errData = await response.json().catch(() => ({}));
        console.error("Chat API error response:", errData, "Status:", response.status);
        setMessages(prev => [
          ...prev,
          { id: Date.now().toString(), role: 'assistant', content: 'Sorry, I encountered an error connecting to my brain.' }
        ]);
      }
    } catch (error) {
      console.error("Chat network error:", error);
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'assistant', content: 'Network error. Please try again.' }
      ]);
    } finally {
      setLoading(false);
    }
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
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.chatList}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Ask me anything or ask to create a task..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          multiline
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
  chatList: {
    paddingHorizontal: 15,
    paddingVertical: 20,
    paddingBottom: 80,
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
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 45,
    maxHeight: 120,
    fontSize: 15,
    color: '#333',
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
});
