import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { useAnimatedStyle, withTiming, useSharedValue, Easing } from 'react-native-reanimated';
import * as KeepAwake from 'expo-keep-awake';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useAudioRecorder, RecordingPresets, useAudioRecorderState, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl } from '../utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AVATAR_SIZE = SCREEN_WIDTH - 40;

type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking_happy' | 'speaking_compassionate';

interface VoiceAnalysis {
  transcript: string;
  emotion: string;
  confidence: number;
  suggestions: string | string[];
  earlyWarning: any;
}

interface AvatarConversation {
  _id: string;
  user_query: string;
  assistant_response: string;
  date: string;
  userEmail: string;
}

const SOURCES = {
  idle: require('../assets/avatar/Idle_Neutral.mp4'),
  listening: require('../assets/avatar/Listening.mp4'),
  thinking: require('../assets/avatar/Thinking.mp4'),
  speaking_happy: require('../assets/avatar/Speaking_Happy.mp4'),
  speaking_compassionate: require('../assets/avatar/Speaking_Compassionate.mp4'),
};

export default function AvatarScreen() {
  KeepAwake.useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState<VoiceAnalysis | null>(null);
  const [showResponse, setShowResponse] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  
  const [history, setHistory] = useState<AvatarConversation[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  
  const responseSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setIsHistoryLoading(true);
      const { authFetch } = await import('../utils/api');
      const response = await authFetch('/api/avatar/history');
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.log('Failed to fetch history:', error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // --- STABLE INDIVIDUAL PLAYER SYSTEM (Proven 100% Stable) ---
  const idlePlayer = useVideoPlayer(SOURCES.idle, (p) => { p.loop = true; p.muted = true; });
  const listeningPlayer = useVideoPlayer(SOURCES.listening, (p) => { p.loop = true; p.muted = true; });
  const thinkingPlayer = useVideoPlayer(SOURCES.thinking, (p) => { p.loop = true; p.muted = true; });
  const happyPlayer = useVideoPlayer(SOURCES.speaking_happy, (p) => { p.loop = true; p.muted = true; });
  const compassionatePlayer = useVideoPlayer(SOURCES.speaking_compassionate, (p) => { p.loop = true; p.muted = true; });

  const players = useMemo(() => ({
    idle: idlePlayer,
    listening: listeningPlayer,
    thinking: thinkingPlayer,
    speaking_happy: happyPlayer,
    speaking_compassionate: compassionatePlayer,
  }), [idlePlayer, listeningPlayer, thinkingPlayer, happyPlayer, compassionatePlayer]);

  const currentPlayer = players[avatarState];

  // REALISM: Attentive Zoom & Smooth Blink Opacity
  const videoOpacity = useSharedValue(0);
  const avatarScale = useSharedValue(1);

  useEffect(() => {
    // 1. Precise state mapping: Play only the active player
    // This ensures that the video shown always matches the avatarState.
    Object.entries(players).forEach(([key, p]) => {
      if (key === avatarState) {
        p.play();
      } else {
        p.pause();
      }
    });
  }, [avatarState, players]);

  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
    return () => {
      deactivateKeepAwake().catch(() => {});
    };
  }, []);

  useEffect(() => {
    // 2. Realistic Zoom (Attentive leaning-in)
    const targetScale = (avatarState === 'listening' || avatarState === 'thinking') ? 1.05 : 1.0;
    avatarScale.value = withTiming(targetScale, { duration: 800, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });

    // 3. Smooth fade-in of the new state
    videoOpacity.value = 0;
    videoOpacity.value = withTiming(1, { duration: 300 });
  }, [avatarState, players]);

  // SPEECH ENGINE: Simplified for maximum reliability
  useEffect(() => {
    const isSpeaking = avatarState.startsWith('speaking');
    const responseText = aiResponse ? (Array.isArray(aiResponse.suggestions) ? aiResponse.suggestions.join('. ') : aiResponse.suggestions) : null;

    if (isSpeaking && responseText && responseSpokenRef.current !== responseText) {
      responseSpokenRef.current = responseText;
      
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).then(() => {
        Speech.speak(responseText, {
          language: 'en-US',
          pitch: 1.0,
          rate: 0.9,
          onDone: () => setAvatarState('idle'),
          onStopped: () => setAvatarState('idle'),
          onError: () => setAvatarState('idle'),
        });
      });
    }
  }, [avatarState, aiResponse]);

  useEffect(() => {
    return () => {
      Speech.stop();
      Object.values(players).forEach(p => p.pause());
    };
  }, [players]);

  // --- AUDIO LOGIC ---
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const userId = auth.currentUser?.uid || '';
  const userEmail = auth.currentUser?.email || '';

  const checkMicrophonePermission = async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      setMicPermissionGranted(status === 'granted');
      return status === 'granted';
    } catch (error) { return false; }
  };

  const handleStartListening = async () => {
    const granted = await checkMicrophonePermission();
    if (!granted) return;

    Speech.stop();
    setIsListening(true);
    setAvatarState('listening');
    setTranscript('');
    setAiResponse(null);
    setShowResponse(false);
    responseSpokenRef.current = null;

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      setIsListening(false);
      setAvatarState('idle');
    }
  };

  const handleStopListening = async () => {
    if (!audioRecorder || !recorderState?.isRecording) return;
    setIsListening(false);
    setIsProcessing(true);
    setAvatarState('thinking');
    
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      await setAudioModeAsync({ allowsRecording: false });
      if (uri) await processVoiceRecording(uri);
      else setAvatarState('idle');
    } catch (error) { setAvatarState('idle'); }
    finally { setIsProcessing(false); }
  };

  const processVoiceRecording = async (audioUri: string) => {
    setIsProcessing(true);
    setAvatarState('thinking');
    try {
      const formData = new FormData();
      formData.append('audio', { uri: audioUri, name: 'recording.m4a', type: 'audio/m4a' } as any);
      // uid and email are already handled by authFetch's token verification on the backend, 
      // but we keep them for extra context if needed by the backend logic.
      formData.append('userId', userId || 'anonymous');
      formData.append('userEmail', userEmail || 'anonymous@example.com');

      const { authFetch } = await import('../utils/api');
      const response = await authFetch('/api/avatar/analyze-voice', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData,
      });

      if (response.ok) {
        const data: VoiceAnalysis = await response.json();
        setTranscript(data.transcript || 'No speech detected');
        setAiResponse(data);
        setShowResponse(true);
        if (data.suggestions) {
          const emotion = data.emotion?.toLowerCase() || '';
          console.log('Detected Emotion:', emotion);
          const isHappy = emotion.includes('happy') || emotion.includes('excited') || emotion.includes('joy') || emotion.includes('positive');
          const nextState = isHappy ? 'speaking_happy' : 'speaking_compassionate';
          setAvatarState(nextState as AvatarState);
        } else setAvatarState('idle');
        fetchHistory();
      } else setAvatarState('idle');
    } catch (error) { setAvatarState('idle'); }
    finally { setIsProcessing(false); }
  };

  // ANIMATED STYLES
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  const videoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: videoOpacity.value,
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MindSync AI</Text>
        <TouchableOpacity onPress={() => setShowHistoryModal(true)} style={styles.historyButton}>
          <MaterialCommunityIcons name="history" size={28} color="#00E0C6" />
        </TouchableOpacity>
      </View>

      <View style={styles.avatarWrapper}>
        <Animated.View style={[styles.avatarContainer, containerAnimatedStyle]}>
          <View style={styles.videoBackground} />
          
          <Animated.View style={[styles.videoLayer, { opacity: videoOpacity }]}>
            {/* 
                FORCED REMOUNT (key={avatarState}):
                This is the most reliable way to ensure the video switches and plays correctly.
            */}
            <VideoView 
              key={avatarState}
              player={players[avatarState]} 
              style={styles.videoView} 
              contentFit="cover" 
              nativeControls={false} 
            />
          </Animated.View>
          
          <View style={styles.stateIndicator}>
            <Text style={styles.stateText}>
              {isProcessing ? 'Thinking...' : 
               avatarState === 'listening' ? "I'm listening..." : 
               avatarState.startsWith('speaking') ? 'Responding...' : 'Always here for you'}
            </Text>
          </View>
        </Animated.View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.micContainer}>
          <TouchableOpacity
            style={[styles.micButton, isListening && styles.micButtonActive, isProcessing && styles.micButtonProcessing]}
            onPress={isListening ? handleStopListening : handleStartListening}
            disabled={isProcessing}
          >
            {isProcessing ? <ActivityIndicator size="large" color="#fff" /> : <Ionicons name={isListening ? 'stop' : 'mic'} size={32} color="#fff" />}
          </TouchableOpacity>
          <Text style={styles.micHint}>{isListening ? 'Tap to stop' : 'Tap to speak to me'}</Text>
        </View>

        {transcript ? (
          <View style={styles.transcriptContainer}>
            <Text style={styles.transcriptText}>"{transcript}"</Text>
          </View>
        ) : (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>"Talk to me, I'm listening..."</Text>
          </View>
        )}

        {showResponse && aiResponse && (
          <View style={styles.responseContainer}>
            <View style={styles.suggestionCard}>
              <Text style={styles.suggestionText}>
                {Array.isArray(aiResponse.suggestions) ? aiResponse.suggestions.join('. ') : aiResponse.suggestions}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* History Modal */}
      <Modal
        visible={showHistoryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <MaterialCommunityIcons name="history" size={24} color="#00E0C6" />
                <Text style={styles.modalTitle}>Conversation History</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={styles.closeButton}>
                <Ionicons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>

            {isHistoryLoading && history.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00E0C6" />
              </View>
            ) : (
              <FlatList
                data={history}
                inverted={true}
                keyExtractor={(item) => item._id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.historyList}
                ListEmptyComponent={
                  <View style={styles.emptyHistory}>
                    <Ionicons name="chatbubble-ellipses-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyHistoryText}>No conversations yet.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.historyItem}>
                    <View style={styles.historyDateRow}>
                      <Ionicons name="calendar-outline" size={14} color="#888" />
                      <Text style={styles.historyDate}>
                        {new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    
                    <View style={styles.userQueryBubble}>
                      <Text style={styles.userQueryText}>{item.user_query}</Text>
                    </View>
                    
                    <View style={styles.assistantResponseBubble}>
                      <View style={styles.aiBadge}>
                        <MaterialCommunityIcons name="robot" size={12} color="#00E0C6" />
                        <Text style={styles.aiBadgeText}>MindSync AI</Text>
                      </View>
                      <Text style={styles.assistantResponseText}>{item.assistant_response}</Text>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}><Ionicons name="home-outline" size={26} color="#888" /><Text style={styles.navText}>Home</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/journal')}><Ionicons name="book-outline" size={26} color="#888" /><Text style={styles.navText}>Journal</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}><MaterialCommunityIcons name="account-voice" size={26} color="#00E0C6" /><Text style={[styles.navText, { color: '#00E0C6' }]}>Avatar</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/tasks')}><Ionicons name="checkbox-outline" size={26} color="#888" /><Text style={styles.navText}>Tasks</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/docs')}><Ionicons name="documents-outline" size={26} color="#888" /><Text style={styles.navText}>Docs</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', zIndex: 100 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  avatarWrapper: { width: '100%', alignItems: 'center', marginVertical: 10 },
  avatarContainer: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: 30, overflow: 'hidden', backgroundColor: '#000', position: 'relative', elevation: 8 },
  videoBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#111' },
  videoLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  videoView: { width: '100%', height: '100%' },
  stateIndicator: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, zIndex: 999 },
  stateText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scrollContent: { paddingHorizontal: 20 },
  micContainer: { alignItems: 'center', marginVertical: 20 },
  micButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00E0C6', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  micButtonActive: { backgroundColor: '#FF4757' },
  micButtonProcessing: { backgroundColor: '#7158e2' },
  micHint: { marginTop: 12, fontSize: 15, color: '#666', fontWeight: '500' },
  transcriptContainer: { padding: 22, backgroundColor: '#f0f4f8', borderRadius: 25, marginVertical: 12 },
  transcriptText: { fontSize: 16, color: '#2d3436', textAlign: 'center', fontStyle: 'italic', lineHeight: 22 },
  placeholderBox: { padding: 20, backgroundColor: '#f8f9fa', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#dee2e6' },
  placeholderText: { fontSize: 14, color: '#999', textAlign: 'center' },
  responseContainer: { marginTop: 15 },
  suggestionCard: { backgroundColor: '#e6fcf5', borderRadius: 25, padding: 25, elevation: 2 },
  suggestionText: { fontSize: 16, color: '#2d3436', lineHeight: 24, fontWeight: '500' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  navItem: { alignItems: 'center', flex: 1 },
  navItemActive: { alignItems: 'center', flex: 1 },
  navText: { fontSize: 12, marginTop: 4, color: '#888' },
  historyButton: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '80%', paddingHorizontal: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  closeButton: { padding: 4 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  historyList: { paddingVertical: 20 },
  historyItem: { marginBottom: 25 },
  historyDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  historyDate: { fontSize: 12, color: '#888', fontWeight: '500' },
  userQueryBubble: { backgroundColor: '#f0f4f8', padding: 15, borderRadius: 20, borderTopRightRadius: 5, alignSelf: 'flex-end', maxWidth: '85%', marginBottom: 10 },
  userQueryText: { fontSize: 15, color: '#333', lineHeight: 20 },
  assistantResponseBubble: { backgroundColor: '#e6fcf5', padding: 15, borderRadius: 20, borderTopLeftRadius: 5, alignSelf: 'flex-start', maxWidth: '85%' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  aiBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#00E0C6', textTransform: 'uppercase' },
  assistantResponseText: { fontSize: 15, color: '#333', lineHeight: 22 },
  emptyHistory: { alignItems: 'center', marginTop: 100, gap: 15 },
  emptyHistoryText: { fontSize: 16, color: '#999', fontWeight: '500' },
});
