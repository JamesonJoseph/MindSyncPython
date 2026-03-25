import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Alert
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { auth } from "../firebaseConfig";
import { getApiBaseUrl } from "../utils/api";

// --- Mock Heatmap Functions ---
const generateMockHeatmapData = () => {
  const weeks = [];
  for (let w = 0; w < 16; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const rand = Math.random();
      days.push(rand > 0.85 ? 4 : rand > 0.7 ? 3 : rand > 0.5 ? 2 : rand > 0.3 ? 1 : 0);
    }
    weeks.push(days);
  }
  return weeks;
};

const getColorForIntensity = (intensity: number) => {
  switch (intensity) {
    case 1: return "#C2F0E8";
    case 2: return "#85E0D0";
    case 3: return "#48D1BB";
    case 4: return "#00b894";
    default: return "#ECECEC";
  }
};

export default function JournalScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [textExpandedIds, setTextExpandedIds] = useState<Record<string, boolean>>({}); 
  const [journals, setJournals] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const heatmapData = useMemo(() => generateMockHeatmapData(), []);
  const screenWidth = Dimensions.get('window').width;
  const squareSize = (screenWidth - 80) / 17; 

  const fetchJournals = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.log("No user is logged in!");
        setLoading(false);
        return;
      }

      const apiUrl = getApiBaseUrl();
      const { authFetch } = await import('../utils/api');
      const response = await authFetch(`${apiUrl}/api/journals?userId=${user.uid}`);
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error("Fetched data is not an array:", data);
        setJournals([]);
        return;
      }
      
      const formattedData = data.map((item: any) => {
        const dateObj = new Date(item.date);
        return {
          id: item._id,
          date: `${dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()} • ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          title: item.title,
          content: item.content,
          analysis: item.aiAnalysis,
        };
      });
      setJournals(formattedData);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchJournals(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchJournals(); }, []);

  // DELETE FUNCTION
  const handleDelete = (id: string) => {
    Alert.alert("Delete Journal", "Are you sure you want to delete this entry?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => {
          try {
            const apiUrl = getApiBaseUrl();
            const { authFetch } = await import('../utils/api');
            await authFetch(`${apiUrl}/api/journals/${id}`, { method: "DELETE" });
            fetchJournals(); 
          } catch (error) {
            Alert.alert("Error", "Could not delete journal.");
          }
        } 
      }
    ]);
  };

  // SIGN OUT FUNCTION
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
          } catch (error) {
            Alert.alert("Error", "Failed to sign out.");
          }
        } 
      }
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} /> 

      <View style={styles.contentWrapper}>
        
        {/* Custom Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => router.replace('/')} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
              <Ionicons name="arrow-back" size={26} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Journals</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 15 }}>
            <Ionicons name="search" size={24} color="#00b894" />
            
            {/* SIGN OUT BUTTON */}
            <TouchableOpacity onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={24} color="#ff7675" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabs}>
          <Text style={styles.activeTab}>All entries</Text>
          <Text style={styles.inactiveTab}>Favorites</Text>
          <Text style={styles.inactiveTab}>Mood map</Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color="#00b894" /></View>
        ) : (
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={{ paddingBottom: 180 }} 
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00b894"]} />}
          >
            {journals.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>No journals yet. Click + to add one!</Text>
            ) : (
              journals.map((item) => {
                const isExpanded = expandedId === item.id;
                const isTextExpanded = textExpandedIds[item.id];

                return (
                  <View key={item.id} style={[styles.card, isExpanded && styles.activeCard]}>
                    <Text style={styles.date}>{item.date}</Text>
                    
                    <View style={styles.cardHeader}>
                      <Text style={styles.title}>{item.title}</Text>
                      
                      <View style={{ flexDirection: "row", gap: 15 }}>
                        <TouchableOpacity
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          onPress={() => router.push({ 
                            pathname: '/add-journal', 
                            params: { id: item.id, content: item.content, title: item.title, analysis: item.analysis } 
                          } as any)}>
                          <MaterialCommunityIcons name="pencil-outline" size={22} color="#00b894" />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          onPress={() => handleDelete(item.id)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={22} color="#ff7675" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={styles.content} numberOfLines={isTextExpanded ? undefined : 3}>
                      {item.content}
                    </Text>
                    {item.content.length > 100 && ( 
                      <TouchableOpacity onPress={() => setTextExpandedIds(prev => ({ ...prev, [item.id]: !isTextExpanded }))}>
                        <Text style={styles.readMore}>{isTextExpanded ? "Show less" : "Read more"}</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={[styles.analysisButton, isExpanded && styles.analysisButtonActive]} onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                      <Text style={[styles.analysisText, isExpanded && { color: "#fff" }]}>View AI Analysis</Text>
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={isExpanded ? "#fff" : "#555"} />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.analysisBox}>
                        <View style={styles.sentimentRow}>
                          <Ionicons name="happy-outline" size={20} color="#00b894" />
                          <Text style={styles.sentimentTitle}>AI Insights</Text>
                        </View>
                        <Text style={styles.analysisContent}>
                          {item.analysis ? item.analysis : "No AI insights generated for this entry. Edit this journal to analyze it!"}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* CONSISTENCY HEATMAP */}
            <View style={styles.consistencyContainer}>
              <Text style={styles.consistencyTitle}>Consistency</Text>
              <Text style={styles.consistencySubtitle}>{journals.length} entries recorded</Text>
              <View style={styles.heatmapWrapper}>
                <View style={styles.dayLabelsColumn}>
                  <View style={{ height: 20 }} /><Text style={styles.heatmapLabel}>Mon</Text>
                  <View style={{ height: squareSize + 4 }} /><Text style={styles.heatmapLabel}>Wed</Text>
                  <View style={{ height: squareSize + 4 }} /><Text style={styles.heatmapLabel}>Fri</Text>
                </View>
                <View>
                  <View style={styles.monthLabelsRow}>
                    <Text style={[styles.heatmapLabel, {flex: 4}]}>Jan</Text><Text style={[styles.heatmapLabel, {flex: 4}]}>Feb</Text><Text style={[styles.heatmapLabel, {flex: 5}]}>Mar</Text><Text style={[styles.heatmapLabel, {flex: 3}]}>Apr</Text>
                  </View>
                  <View style={styles.heatmapGrid}>
                    {heatmapData.map((week, weekIndex) => (
                      <View key={weekIndex} style={styles.heatmapWeekColumn}>
                        {week.map((dayIntensity, dayIndex) => (
                          <View key={dayIndex} style={[styles.heatmapSquare, { backgroundColor: getColorForIntensity(dayIntensity), width: squareSize, height: squareSize }]} />
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      <TouchableOpacity style={[styles.floatingButton, { bottom: 90 + insets.bottom }]} onPress={() => router.push('/add-journal' as any)}>
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={26} color="#888" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="book-outline" size={26} color="#00E0C6" />
          <Text style={[styles.navText, { color: '#00E0C6' }]}>Journal</Text>
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
  container: { flex: 1, backgroundColor: "#f4f6f8" },
  contentWrapper: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 20 },
  headerTitle: { fontSize: 24, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: 20, marginBottom: 15 },
  activeTab: { fontWeight: "600", color: "#00b894", borderBottomWidth: 2, borderBottomColor: "#00b894", paddingBottom: 5 },
  inactiveTab: { color: "#777" },
  card: { backgroundColor: "#fff", padding: 18, borderRadius: 16, marginBottom: 18, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 4 },
  activeCard: { borderWidth: 1.5, borderColor: "#00b894" },
  date: { fontSize: 12, color: "#999", marginBottom: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "700", flex: 1 },
  content: { color: "#555", marginVertical: 10, lineHeight: 20 },
  readMore: { color: "#00b894", fontWeight: "500", marginTop: 2 },
  analysisButton: { marginTop: 15, padding: 12, backgroundColor: "#e8f8f5", borderRadius: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  analysisButtonActive: { backgroundColor: "#00b894" },
  analysisText: { fontWeight: "600" },
  analysisBox: { backgroundColor: "#f1f2f6", padding: 15, borderRadius: 12, marginTop: 12 },
  sentimentRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sentimentTitle: { fontWeight: "700" },
  analysisContent: { color: "#555", lineHeight: 18 },
  floatingButton: { position: "absolute", right: 25, backgroundColor: "#00b894", width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center", elevation: 8, zIndex: 10 },
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-around", backgroundColor: "#fff", paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f0f0f0", shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 10 },
  navItem: { alignItems: "center", flex: 1 },
  navItemActive: { alignItems: "center", flex: 1 },
  navText: { fontSize: 12, marginTop: 4, color: "#888" },
  consistencyContainer: { marginTop: 10, backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 4 },
  consistencyTitle: { fontSize: 18, fontWeight: "700", color: "#333" },
  consistencySubtitle: { fontSize: 14, color: "#888", marginBottom: 15 },
  heatmapWrapper: { flexDirection: 'row' },
  dayLabelsColumn: { marginRight: 8, justifyContent: 'space-around', paddingBottom: 4 },
  heatmapLabel: { fontSize: 10, color: '#999' },
  monthLabelsRow: { flexDirection: 'row', marginBottom: 4 },
  heatmapGrid: { flexDirection: 'row', gap: 4 },
  heatmapWeekColumn: { gap: 4 },
  heatmapSquare: { borderRadius: 3 }
});
