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

export default function TaskDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const title = params.title as string || 'Task';
  const description = params.description as string || '';
  const priority = params.priority as string || 'medium';
  const status = params.status as string || 'pending';
  const eventDatetime = params.event_datetime as string || '';
  const time = params.time as string || '';

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return '#FF3B30';
      case 'medium': return '#FF9500';
      case 'low': return '#34C759';
      default: return '#00E0C6';
    }
  };

  const getPriorityIcon = (p: string) => {
    switch (p) {
      case 'high': return '🔴';
      case 'medium': return '🟠';
      case 'low': return '🟢';
      default: return '🔵';
    }
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const istDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 5.5 * 60 * 60 * 1000);
      const weekday = istDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
      return `${weekday}, ${monthNames[istDate.getMonth()]} ${istDate.getDate()}, ${istDate.getFullYear()}`;
    } catch {
      return isoStr;
    }
  };

  const priorityColor = getPriorityColor(priority);
  const isCompleted = status === 'completed';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <Ionicons name="close" size={24} color="#333" />
      </TouchableOpacity>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerArea}>
          <View style={[styles.iconCircle, { backgroundColor: priorityColor + '20' }]}>
            <Ionicons
              name={isCompleted ? "checkmark-done-circle" : "clipboard-outline"}
              size={48}
              color={priorityColor}
            />
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={[styles.colorBar, { backgroundColor: priorityColor }]} />
          <Text style={styles.titleText}>{title}</Text>

          <View style={styles.statusBadge}>
            <Ionicons
              name={isCompleted ? "checkmark-circle" : "time"}
              size={16}
              color={isCompleted ? "#34C759" : "#FF9500"}
            />
            <Text style={[styles.statusText, { color: isCompleted ? "#34C759" : "#FF9500" }]}>
              {isCompleted ? 'Completed' : 'Pending'}
            </Text>
          </View>

          {description ? (
            <Text style={styles.descriptionText}>{description}</Text>
          ) : null}
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Ionicons name="flag-outline" size={18} color="#666" />
            <Text style={styles.detailLabel}>Priority</Text>
            <View style={styles.detailValue}>
              <Text>{getPriorityIcon(priority)}</Text>
              <Text style={[styles.detailValueText, { color: priorityColor }]}>
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </Text>
            </View>
          </View>

          {eventDatetime ? (
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={18} color="#666" />
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValueText}>{formatDate(eventDatetime)}</Text>
            </View>
          ) : null}

          {time ? (
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={18} color="#666" />
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValueText}>{time}</Text>
            </View>
          ) : null}
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
  headerArea: {
    height: 200,
    backgroundColor: '#F5FAFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
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
  titleText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  detailsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#999',
    flex: 1,
  },
  detailValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailValueText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
});
