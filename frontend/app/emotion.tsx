import { Ionicons } from '@expo/vector-icons';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl, parseApiResponse } from '../utils/api';

interface EmotionResult {
  emotion: string;
  confidence?: number;
  details?: string;
}

const EMOTION_EMOJI: Record<string, string> = {
  happy: ':)',
  sad: ':(',
  angry: '>:(',
  surprise: ':O',
  fear: ':|',
  disgust: ':/',
  neutral: ':]',
};

export default function EmotionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [facing] = useState<CameraType>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!permission) {
    return <View style={styles.centered} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={64} color="#8E9CCF" />
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Pressable style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        void uploadPhoto(photo.uri);
      }
    } catch {
      setError('Capture failed.');
    }
  };

  const uploadPhoto = async (uri: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const user = auth.currentUser;
      const apiUrl = getApiBaseUrl();
      const formData = new FormData();
      formData.append('image', { uri, name: 'selfie.jpg', type: 'image/jpeg' } as any);
      formData.append('userId', user?.uid || '');
      formData.append('userEmail', user?.email || '');

      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/emotion`, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
        timeoutMs: 60000,
      });

      const data = await parseApiResponse<any>(response);
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.detail === 'string'
              ? data.detail
              : 'Detection failed.'
        );
      }

      setResult({
        emotion: String(data?.emotion || 'neutral'),
        confidence:
          typeof data?.confidence === 'number' && Number.isFinite(data.confidence)
            ? data.confidence
            : undefined,
        details: String(data?.details || ''),
      });
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  if (photoUri) {
    const emotionKey = String(result?.emotion || '').toLowerCase();
    const emoji = result ? EMOTION_EMOJI[emotionKey] || ':?' : '';
    const detailsText = String(result?.details || '');
    const errorText = String(error || '');
    const emotionLabel = String(result?.emotion || 'neutral').toUpperCase();
    const showConfidence = typeof result?.confidence === 'number';

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="white" />
          </Pressable>
          <Text style={styles.headerTitle}>Analysis Result</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Image source={{ uri: photoUri }} style={styles.preview} />

        <View style={styles.resultArea}>
          {loading ? <ActivityIndicator size="large" color="#00C896" /> : null}

          {result && !loading ? (
            <View style={styles.resultCard}>
              <Text style={styles.emoji}>{emoji}</Text>
              <Text style={styles.emotionLabel}>{emotionLabel}</Text>
              {showConfidence ? (
                <Text style={styles.confidenceText}>{`${result.confidence}% confidence`}</Text>
              ) : null}
              <View style={styles.scrollWrapper}>
                <ScrollView showsVerticalScrollIndicator nestedScrollEnabled>
                  <Text style={styles.detailsText}>{detailsText}</Text>
                </ScrollView>
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{errorText}</Text> : null}
        </View>

        <Pressable
          style={styles.retakeBtn}
          onPress={() => {
            setPhotoUri(null);
            setResult(null);
            setError(null);
          }}
        >
          <Ionicons name="camera-reverse-outline" size={20} color="white" />
          <Text style={styles.retakeBtnText}>Retake</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
      <View style={styles.shutterArea}>
        <Pressable onPress={handleCapture} style={styles.shutterOuter}>
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A2E' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A2E' },
  permTitle: { color: 'white', fontSize: 20, marginTop: 20 },
  grantBtn: { marginTop: 20, backgroundColor: '#00C896', padding: 15, borderRadius: 25 },
  grantBtnText: { color: 'white', fontWeight: 'bold' },
  cameraContainer: { flex: 1, backgroundColor: 'black' },
  camera: { flex: 1 },
  shutterArea: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
  shutterOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: { width: 55, height: 55, borderRadius: 27.5, backgroundColor: 'white' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerSpacer: { width: 26 },
  preview: { width: '100%', height: 300, resizeMode: 'cover' },
  resultArea: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  resultCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 25,
    borderRadius: 20,
    width: '100%',
    height: 320,
  },
  emoji: { fontSize: 34 },
  emotionLabel: { color: '#00C896', fontSize: 28, fontWeight: 'bold', marginTop: 10 },
  confidenceText: { color: '#8E9CCF', fontSize: 14, marginTop: 5 },
  scrollWrapper: {
    height: 110,
    width: '100%',
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 10,
  },
  detailsText: { color: '#E2E8F0', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  errorText: { color: '#FF6B6B', marginTop: 10 },
  retakeBtn: {
    flexDirection: 'row',
    backgroundColor: '#00C896',
    margin: 30,
    padding: 15,
    borderRadius: 25,
    justifyContent: 'center',
  },
  retakeBtnText: { color: 'white', marginLeft: 10, fontWeight: 'bold' },
});
