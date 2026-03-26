import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { useAnimatedStyle, withTiming, useSharedValue } from 'react-native-reanimated';
import { activateKeepAwakeAsync, deactivateKeepAwakeAsync } from 'expo-keep-awake';

import { useAudioRecorder, RecordingPresets, useAudioRecorderState, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl } from '../utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AVATAR_HEIGHT = 350;

type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking_happy' | 'speaking_compassionate';

interface VoiceAnalysis {
  transcript: string;
  emotion: string;
  confidence: number;
  suggestions: string | string[];
  earlyWarning: any;
}

const SOURCES = {
  idle: require('../assets/avatar/Idle_Neutral.mp4'),
  listening: require('../assets/avatar/Listening.mp4'),
  thinking: require('../assets/avatar/Thinking.mp4'),
  speaking_happy: require('../assets/avatar/Speaking_Happy.mp4'),
  speaking_compassionate: require('../assets/avatar/Speaking_Compassionate.mp4'),
};

export default function AvatarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState<VoiceAnalysis | null>(null);
  const [showResponse, setShowResponse] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);

  // --- High-Efficiency 2-Layer System ---
  // To avoid hardware decoder limits (which cause black screens), we only use 2 players.
  // We alternate which player is active.
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');
  const [sourceA, setSourceA] = useState(SOURCES.idle);
  const [sourceB, setSourceB] = useState(SOURCES.idle);
  
  const playerA = useVideoPlayer(sourceA);
  const playerB = useVideoPlayer(sourceB);

  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);

  // Transition Logic
  useEffect(() => {
    const nextSource = SOURCES[avatarState];
    
    if (activeLayer === 'A') {
      // Check if source actually changed
      if (sourceA === nextSource) {
        playerA.play();
        return;
      }
      // Prepare B
      setSourceB(nextSource);
      setActiveLayer('B');
      opacityB.value = withTiming(1, { duration: 500 });
      opacityA.value = withTiming(0, { duration: 500 });
      playerB.play();
      // Pause A after transition
      const t = setTimeout(() => playerA.pause(), 600);
      return () => clearTimeout(t);
    } else {
      if (sourceB === nextSource) {
        playerB.play();
        return;
      }
      // Prepare A
      setSourceA(nextSource);
      setActiveLayer('A');
      opacityA.value = withTiming(1, { duration: 500 });
      opacityB.value = withTiming(0, { duration: 500 });
      playerA.play();
      // Pause B after transition
      const t = setTimeout(() => playerB.pause(), 600);
      return () => clearTimeout(t);
    }
  }, [avatarState]);

  // Player Config
  useEffect(() => {
    [playerA, playerB].forEach(p => {
      if (p) {
        p.loop = true;
        p.muted = true;
      }
    });
    playerA.play();
    let isMounted = true;
    activateKeepAwakeAsync().catch(() => {});
    return () => {
      isMounted = false;
      deactivateKeepAwakeAsync().catch(() => {});
    };
  }, [playerA, playerB]);

  const animatedStyleA = useAnimatedStyle(() => ({
    opacity: opacityA.value,
    zIndex: activeLayer === 'A' ? 2 : 1,
  }));

  const animatedStyleB = useAnimatedStyle(() => ({
    opacity: opacityB.value,
    zIndex: activeLayer === 'B' ? 2 : 1,
  }));

  // --- Audio / Logic ---
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const userId = auth.currentUser?.uid || '';
  const userEmail = auth.currentUser?.email || '';

  useEffect(() => {
    checkMicrophonePermission();
    return () => Speech.stop();
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const { status } = await requestRecordingPermissionsAsync();
      setMicPermissionGranted(status === 'granted');
    } catch (error) { console.log('[Audio] Permission error:', error); }
  };

  const handleStartListening = async () => {
    if (!micPermissionGranted) {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permission is needed.');
        return;
      }
      setMicPermissionGranted(true);
    }

    Speech.stop();
    setIsListening(true);
    setAvatarState('listening');
    setTranscript('');
    setAiResponse(null);
    setShowResponse(false);

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
      formData.append('userId', userId || 'anonymous');
      formData.append('userEmail', userEmail || 'anonymous@example.com');

      const apiUrl = getApiBaseUrl();
      const response = await fetch(`${apiUrl}/api/avatar/analyze-voice`, {
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
          const emotion = data.emotion?.toLowerCase();
          setAvatarState((emotion === 'happy' || emotion === 'excited') ? 'speaking_happy' : 'speaking_compassionate');
          const speechText = Array.isArray(data.suggestions) ? data.suggestions.join('. ') : data.suggestions;
          await Speech.speak(speechText, {
            language: 'en-US',
            onDone: () => setAvatarState('idle'),
            onError: () => setAvatarState('idle'),
          });
        } else setAvatarState('idle');
      } else setAvatarState('idle');
    } catch (error) { setAvatarState('idle'); }
    finally { setIsProcessing(false); }
  };

  const getWarningColor = (warning: any) => {
    if (!warning) return '#22C55E';
    let warningText = typeof warning === 'string' ? warning : (warning[0]?.reason || '');
    return warningText.toLowerCase().includes('urgent') ? '#EF4444' : (warningText.toLowerCase().includes('consider') ? '#F97316' : '#22C55E');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MindSync AI</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false} // Important for native views in scroll
      >
        {/* Avatar Container - Stable Layout */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatarContainer}>
            <Animated.View style={[styles.videoLayer, animatedStyleA]}>
              <VideoView player={playerA} style={styles.videoView} contentFit="cover" nativeControls={false} />
            </Animated.View>
            <Animated.View style={[styles.videoLayer, animatedStyleB]}>
              <VideoView player={playerB} style={styles.videoView} contentFit="cover" nativeControls={false} />
            </Animated.View>

            {/* State Overlay */}
            <View style={styles.stateIndicator}>
              <Text style={styles.stateText}>
                {isProcessing ? 'Thinking...' : 
                 avatarState === 'listening' ? 'I\'m listening...' : 
                 avatarState.startsWith('speaking') ? 'Responding...' : 'Always here for you'}
              </Text>
            </View>
          </View>
        </View>

        {/* Controls */}
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

        {/* Display Info */}
        {transcript ? <View style={styles.transcriptContainer}><Text style={styles.transcriptText}>"{transcript}"</Text></View> : null}

        {showResponse && aiResponse ? (
          <View style={styles.responseContainer}>
            <View style={styles.suggestionCard}>
              <Text style={styles.suggestionText}>{Array.isArray(aiResponse.suggestions) ? aiResponse.suggestions.join('. ') : aiResponse.suggestions}</Text>
            </View>
            {aiResponse.earlyWarning ? (
              <View style={[styles.warningCard, { borderColor: getWarningColor(aiResponse.earlyWarning) }]}>
                <View style={styles.warningHeader}>
                  <Ionicons name="heart-outline" size={18} color={getWarningColor(aiResponse.earlyWarning)} />
                  <Text style={[styles.warningTitle, { color: getWarningColor(aiResponse.earlyWarning) }]}>MindSync Note</Text>
                </View>
                <Text style={styles.warningText}>{typeof aiResponse.earlyWarning === 'string' ? aiResponse.earlyWarning : (Array.isArray(aiResponse.earlyWarning) ? aiResponse.earlyWarning.map((w: any) => w.reason).join('\n') : 'I care about your well-being.')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Navigation */}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', zIndex: 1000 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10 },
  avatarWrapper: { width: '100%', height: AVATAR_HEIGHT, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarContainer: { width: '100%', height: '100%', borderRadius: 30, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  videoLayer: { position: 'absolute', width: '100%', height: '100%' },
  videoView: { width: '100%', height: '100%' },
  stateIndicator: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, zIndex: 999 },
  stateText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  micContainer: { alignItems: 'center', marginTop: 20, marginBottom: 20 },
  micButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00E0C6', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#00E0C6', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  micButtonActive: { backgroundColor: '#FF4757', shadowColor: '#FF4757' },
  micButtonProcessing: { backgroundColor: '#7158e2' },
  micHint: { marginTop: 12, fontSize: 15, color: '#666', fontWeight: '500' },
  transcriptContainer: { padding: 20, backgroundColor: '#f8f9fa', borderRadius: 20, marginVertical: 10 },
  transcriptText: { fontSize: 16, color: '#444', textAlign: 'center', fontStyle: 'italic' },
  responseContainer: { marginTop: 10 },
  suggestionCard: { backgroundColor: '#E8F8F5', borderRadius: 20, padding: 20, marginBottom: 15 },
  suggestionText: { fontSize: 16, color: '#2D3436', lineHeight: 24 },
  warningCard: { backgroundColor: '#FFF5F5', borderRadius: 20, padding: 20, borderLeftWidth: 5 },
  warningHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  warningTitle: { fontSize: 15, fontWeight: 'bold' },
  warningText: { fontSize: 14, color: '#636E72', lineHeight: 20 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0', zIndex: 1000 },
  navItem: { alignItems: 'center', flex: 1 },
  navItemActive: { alignItems: 'center', flex: 1 },
  navText: { fontSize: 12, marginTop: 4, color: '#888' },
});
