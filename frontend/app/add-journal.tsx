import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import {
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { auth } from "../firebaseConfig";
import { getApiBaseUrl } from "../utils/api";

export default function AddJournalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  const existingId = params.id as string;
  const [content, setContent] = useState((params.content as string) || "");
  const [analysis, setAnalysis] = useState((params.analysis as string) || ""); 
  
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false); 
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const today = new Date();
  const dateString = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const dayString = today.toLocaleDateString("en-US", { weekday: "long" });

  const isTimeoutError = (error: unknown) =>
    error instanceof Error && /network request timed out/i.test(error.message);

  useEffect(() => {
    const checkMicrophonePermission = async () => {
      try {
        const { status } = await requestRecordingPermissionsAsync();
        setMicPermissionGranted(status === "granted");
      } catch (error) {
        console.warn("Microphone permission check failed", error);
      }
    };

    checkMicrophonePermission();
  }, []);

  const appendTranscriptToJournal = (transcript: string) => {
    const cleanedTranscript = transcript.trim();
    if (!cleanedTranscript) {
      Alert.alert("No Speech Detected", "Try speaking a little closer to the microphone.");
      return;
    }

    setContent((current) => (current.trim() ? `${current.trim()}\n${cleanedTranscript}` : cleanedTranscript));
  };

  const transcribeRecording = async (audioUri: string) => {
    setIsTranscribing(true);

    try {
      const filename = "journal-recording.m4a";
      const formData = new FormData();
      formData.append("audio", {
        uri: audioUri,
        name: filename,
        type: "audio/m4a",
      } as any);

      const { authFetch } = await import("../utils/api");
      const response = await authFetch("/api/avatar/analyze-voice", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error :
          typeof data?.detail === "string" ? data.detail :
          "Could not convert your speech to text.";
        Alert.alert("Transcription Error", message);
        return;
      }

      appendTranscriptToJournal(String(data?.transcript || ""));
    } catch (error) {
      console.warn("Journal transcription failed", error);
      Alert.alert("Network Error", "Could not reach the voice transcription service.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleStartDictation = async () => {
    try {
      let hasPermission = micPermissionGranted;
      if (!hasPermission) {
        const { status } = await requestRecordingPermissionsAsync();
        hasPermission = status === "granted";
        setMicPermissionGranted(hasPermission);
      }

      if (!hasPermission) {
        Alert.alert("Permission Required", "Microphone access is needed to dictate your journal.");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsDictating(true);
    } catch (error) {
      console.warn("Journal recording failed to start", error);
      Alert.alert("Recording Error", "Could not start microphone recording.");
      setIsDictating(false);
    }
  };

  const handleStopDictation = async () => {
    if (!recorderState?.isRecording) {
      setIsDictating(false);
      return;
    }

    try {
      await audioRecorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
      });
      setIsDictating(false);

      const audioUri = audioRecorder.uri;
      if (!audioUri) {
        Alert.alert("Recording Error", "No audio was captured. Please try again.");
        return;
      }

      await transcribeRecording(audioUri);
    } catch (error) {
      console.warn("Journal recording failed to stop", error);
      Alert.alert("Recording Error", "Could not finish microphone recording.");
      setIsDictating(false);
    }
  };

  const handleToggleDictation = async () => {
    if (isTranscribing || isAnalyzing || isSaving) {
      return;
    }

    if (isDictating) {
      await handleStopDictation();
      return;
    }

    await handleStartDictation();
  };

  // --- AI ANALYSIS FUNCTION ---
  const handleAnalyze = async () => {
    if (!content.trim()) {
      Alert.alert("Empty Journal", "Please write your journal entry first before analyzing!");
      return;
    }

    setIsAnalyzing(true);
    try {
      const apiUrl = getApiBaseUrl();
      const { authFetch } = await import('../utils/api');

      let response: Response | null = null;
      let data: any = {};
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await authFetch(`${apiUrl}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: content }),
          });
          data = await response.json().catch(() => ({}));
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }
      }

      if (lastError) {
        throw lastError;
      }
      
      if (response?.ok) {
        setAnalysis(data.analysis); 
      } else {
        const message =
          typeof data?.error === "string" ? data.error :
          typeof data?.detail === "string" ? data.detail :
          "Could not analyze the journal.";
        Alert.alert("Error", message);
      }
    } catch (error) {
      if (!isTimeoutError(error)) {
        console.warn("Analyze journal failed", error);
      }
      Alert.alert(
        "Network Error",
        isTimeoutError(error)
          ? "The analysis request timed out. Please try again in a moment."
          : "Check your connection to the server."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- SAVE FUNCTION ---
  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert("Wait a second", "Please write something about your day first!");
      return;
    }

    // 1. Get current Firebase user
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Authentication Error", "You must be logged in to save a journal.");
      return;
    }

    setIsSaving(true);
    
    try {
      const apiUrl = getApiBaseUrl();
      const method = existingId ? "PUT" : "POST";
      const endpoint = existingId ? `${apiUrl}/api/journals/${existingId}` : `${apiUrl}/api/journals`;

      // 2. Prepare payload including email and title
      const { authFetch } = await import('../utils/api');
      const response = await authFetch(endpoint, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid, 
          userEmail: user.email, // <--- Added email here
          title: `Entry for ${dateString}`, // <--- Added title here
          content: content,
          aiAnalysis: analysis, 
        }),
      });

      if (response.ok) {
        Alert.alert("Success!", existingId ? "Journal updated!" : "Journal saved!");
        router.replace("/journal" as any); 
      } else {
        Alert.alert("Error", "Failed to save to database.");
      }
    } catch (error) {
      console.warn("Save journal failed", error);
      Alert.alert("Network Error", "Check your server connection.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinueChat = () => {
    if (!content.trim()) {
      Alert.alert("Empty Journal", "Write a journal entry first so the chat has context.");
      return;
    }

    if (!analysis.trim()) {
      Alert.alert("Analyze First", "Generate AI insights first, then continue the conversation.");
      return;
    }

    const seededMessages = [
      {
        id: `journal-${Date.now()}`,
        role: "user",
        content: `This is my journal entry for today:\n\n${content.trim()}`,
      },
      {
        id: `insight-${Date.now() + 1}`,
        role: "assistant",
        content: analysis.trim(),
      },
      {
        id: `continue-${Date.now() + 2}`,
        role: "user",
        content:
          "Continue chatting with me about this journal entry. Help me reflect on what I am feeling, what might be causing it, and what I can do next.",
      },
    ];

    router.push({
      pathname: "/chat",
      params: {
        initialMessages: JSON.stringify(seededMessages),
        autoSend: "1",
        contextType: "journal",
        context: JSON.stringify({
          title: `Entry for ${dateString}`,
          journalContent: content.trim(),
          journalAnalysis: analysis.trim(),
          source: "add-journal",
        }),
      },
    } as any);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled" 
        >
          <View style={styles.header}>
            <Ionicons name="calendar-outline" size={26} color="#333" />
            <View style={styles.headerDateContainer}>
              <Text style={styles.headerDate}>{dateString}</Text>
              <Text style={styles.headerDay}>{dayString}</Text>
            </View>
            <Ionicons name="person-circle-outline" size={32} color="#00E0C6" />
          </View>

          <Text style={styles.sectionTitle}>{existingId ? "Edit Journal" : "New Journal"}</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder={"How was your day? Start writing here...\nToday I felt very productive because....."}
              placeholderTextColor="#999"
              multiline
              textAlignVertical="top"
              maxLength={500}
              value={content}
              onChangeText={setContent}
            />
            <Text style={styles.charCount}>{content.length}/500</Text>
          </View>

          <View style={styles.voiceToolbar}>
            <TouchableOpacity
              style={[
                styles.voiceButton,
                isDictating && styles.voiceButtonActive,
                (isTranscribing || isAnalyzing || isSaving) && styles.voiceButtonDisabled,
              ]}
              onPress={handleToggleDictation}
              disabled={isTranscribing || isAnalyzing || isSaving}
            >
              {isTranscribing ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Ionicons
                  name={isDictating ? "stop-circle" : "mic"}
                  size={18}
                  color="#000"
                />
              )}
              <Text style={styles.voiceButtonText}>
                {isTranscribing ? "Transcribing..." : isDictating ? "Stop Recording" : "Speak to Write"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.voiceStatusText}>
              {isDictating
                ? "Recording... tap again to insert your speech."
                : "Tap the mic to add text with your voice."}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.outlineButton} onPress={() => router.back()}>
              <Text style={styles.outlineButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.solidButton} onPress={handleSave} disabled={isSaving}>
              <Text style={styles.solidButtonText}>{isSaving ? "Saving..." : "Done"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[styles.analyseButton, isAnalyzing && { opacity: 0.7 }]} 
            onPress={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <MaterialCommunityIcons name="magic-staff" size={20} color="#000" />
            )}
            <Text style={styles.analyseButtonText}>
              {isAnalyzing ? "Analyzing..." : "Analyse this Journal"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>AI Insights</Text>
          
          <View style={[styles.aiInsightsCard, analysis ? {borderColor: '#00E0C6', backgroundColor: '#e8fdfa'} : null]}>
            {analysis ? (
              <Text style={styles.analysisResultText}>{analysis}</Text>
            ) : (
              <>
                <MaterialCommunityIcons name="head-cog-outline" size={32} color="#A7F3D0" />
                <Text style={styles.aiInsightsText}>
                  Your insights will appear here after you analyze your journal entry.
                </Text>
              </>
            )}
          </View>
          
          <View style={styles.chatActionsRow}>
            <TouchableOpacity
              style={styles.previousChatButton}
              onPress={() => router.push('/chat' as any)}
            >
              <Text style={styles.previousChatText}>Previous Chats</Text>
              <Ionicons name="time-outline" size={16} color="#333" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.continueChatButton, !analysis.trim() && styles.continueChatButtonDisabled]}
              onPress={handleContinueChat}
              disabled={!analysis.trim()}
            >
              <Text style={styles.continueChatText}>Continue Chat</Text>
              <Ionicons name="chatbubble-ellipses" size={16} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFCFC" },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 25 },
  headerDateContainer: { alignItems: "center" },
  headerDate: { fontSize: 18, fontWeight: "bold", color: "#111" },
  headerDay: { fontSize: 14, color: "#777" },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#111", marginBottom: 10, marginTop: 15 },
  inputContainer: { borderWidth: 1.5, borderColor: "#A7F3D0", borderRadius: 16, backgroundColor: "#fff", height: 180, padding: 15 },
  textInput: { flex: 1, fontSize: 16, color: "#333" },
  charCount: { textAlign: "right", color: "#bbb", fontSize: 12, marginTop: 5 },
  voiceToolbar: { marginTop: 12, gap: 8 },
  voiceButton: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 8, backgroundColor: "#dff8f1", borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 },
  voiceButtonActive: { backgroundColor: "#34E0A1" },
  voiceButtonDisabled: { opacity: 0.6 },
  voiceButtonText: { color: "#000", fontWeight: "700" },
  voiceStatusText: { color: "#5f6c72", fontSize: 13 },
  actionRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 15 },
  outlineButton: { flex: 1, borderWidth: 1, borderColor: "#E0E0E0", borderRadius: 12, paddingVertical: 14, marginRight: 10, alignItems: "center", backgroundColor: "#fff" },
  outlineButtonText: { color: "#555", fontWeight: "600" },
  solidButton: { flex: 1, backgroundColor: "#00E0C6", borderRadius: 12, paddingVertical: 14, marginLeft: 10, alignItems: "center" },
  solidButtonText: { color: "#000", fontWeight: "600", fontSize: 16 },
  analyseButton: { flexDirection: "row", backgroundColor: "#34E0A1", borderRadius: 12, paddingVertical: 14, justifyContent: "center", alignItems: "center", marginTop: 15, gap: 8 },
  analyseButtonText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  aiInsightsCard: { borderWidth: 1.5, borderColor: "#A7F3D0", borderRadius: 16, backgroundColor: "#fff", padding: 25, alignItems: "center", marginTop: 15 },
  aiInsightsText: { color: "#888", textAlign: "center", marginTop: 10, lineHeight: 22 },
  analysisResultText: { color: "#2d3436", fontSize: 15, lineHeight: 24, textAlign: "left" },
  chatActionsRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 15 },
  previousChatButton: { flexDirection: "row", backgroundColor: "#f1f3f4", borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18, alignItems: "center", gap: 8 },
  previousChatText: { color: "#333", fontWeight: "600" },
  continueChatButton: { flexDirection: "row", backgroundColor: "#00E0C6", borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, alignItems: "center", gap: 8 },
  continueChatButtonDisabled: { opacity: 0.5 },
  continueChatText: { color: "#000", fontWeight: "bold" },
});
