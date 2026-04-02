import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function BirthdayDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const name = params.name as string || 'Birthday';
  const date = params.date as string || '';
  const relation = params.relation as string || '';
  const color = params.color as string || '#FF6B6B';

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        const [month, day] = dateStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1] || ''} ${parseInt(day) || ''}, ${new Date().getFullYear()}`;
      }
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const istDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 5.5 * 60 * 60 * 1000);
      return `${monthNames[istDate.getMonth()]} ${istDate.getDate()}, ${new Date().getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Ionicons name="close" size={24} color="#333" />
      </TouchableOpacity>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Celebration Area */}
        <View style={styles.celebrationArea}>
          <Text style={styles.celebrationEmoji}>🎉</Text>
          <View style={styles.balloonsContainer}>
            <Text style={styles.balloon}>🎈</Text>
            <Text style={styles.balloon}>🎈</Text>
            <Text style={styles.balloon}>🎈</Text>
          </View>
          <Text style={styles.cakeEmoji}>🎂</Text>
          <View style={styles.confettiContainer}>
            <Text style={styles.confetti}>🎊</Text>
            <Text style={styles.confetti}>🎊</Text>
            <Text style={styles.confetti}>🎊</Text>
          </View>
        </View>

        {/* Name and Date */}
        <View style={styles.infoSection}>
          <View style={[styles.colorBar, { backgroundColor: color }]} />
          <Text style={styles.nameText}>{name}'s birthday</Text>
          <Text style={styles.dateText}>{formatDate(date)}</Text>
          {relation && (
            <Text style={styles.relationText}>{relation}</Text>
          )}
        </View>

        {/* Notifications */}
        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          
          <View style={styles.notificationItem}>
            <Ionicons name="notifications" size={20} color="#00E0C6" />
            <Text style={styles.notificationText}>On the day at 9 AM</Text>
          </View>
          
          <View style={styles.notificationItem}>
            <Ionicons name="notifications" size={20} color="#00E0C6" />
            <Text style={styles.notificationText}>1 week before at 9 AM</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFCFC',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  content: {
    flex: 1,
  },
  celebrationArea: {
    height: 280,
    backgroundColor: '#FFF9F9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  celebrationEmoji: {
    fontSize: 48,
    position: 'absolute',
    top: 40,
    left: 40,
  },
  balloonsContainer: {
    flexDirection: 'row',
    position: 'absolute',
    top: 20,
    right: 30,
  },
  balloon: {
    fontSize: 36,
    marginLeft: -10,
  },
  cakeEmoji: {
    fontSize: 80,
  },
  confettiContainer: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 30,
    left: 40,
  },
  confetti: {
    fontSize: 28,
    marginRight: -8,
  },
  infoSection: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: -30,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  colorBar: {
    width: 60,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  nameText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 18,
    color: '#666',
  },
  relationText: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  notificationsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  notificationText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
});
