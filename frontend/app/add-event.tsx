import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl } from '../utils/api';
import { getTodayIST, toISTISOString, formatDateIST, getISTNow } from '../utils/timezone';
import { scheduleEventReminder, requestNotificationPermissions } from '../utils/notifications';

const colors = ['#FF9500', '#FF6B6B', '#00E0C6', '#5856D6', '#34C759', '#007AFF', '#FF2D55', '#AF52DE'];

export default function AddEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = auth.currentUser?.uid || '';
  const params = useLocalSearchParams();

  // Initialize with IST date
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    if (params.date) {
      return new Date(params.date as string + 'T00:00:00+05:30');
    }
    return getISTNow();
  });
  const [selectedTime, setSelectedTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => {
    if (params.date) {
      return new Date(params.date as string + 'T00:00:00+05:30');
    }
    return getISTNow();
  });
  const [selectedColor, setSelectedColor] = useState('#FF9500');
  const [activeTab, setActiveTab] = useState<'task' | 'event' | 'birthday'>('event');
  const [saving, setSaving] = useState(false);

  // Time picker state
  const [timeHour, setTimeHour] = useState(12);
  const [timeMinute, setTimeMinute] = useState(0);
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM');

  // Reminder state
  const [enableReminder, setEnableReminder] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState(30);

  // Request notification permissions on mount
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const handleDateSelect = (day: number) => {
    const newDate = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day);
    setSelectedDate(newDate);
    setShowDatePicker(false);
  };

  const goToPrevMonth = () => {
    setPickerMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setPickerMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const incrementHour = () => {
    setTimeHour(prev => prev >= 12 ? 1 : prev + 1);
  };

  const decrementHour = () => {
    setTimeHour(prev => prev <= 1 ? 12 : prev - 1);
  };

   const incrementMinute = () => {
     setTimeMinute(prev => prev >= 59 ? 0 : prev + 1);
   };

   const decrementMinute = () => {
     setTimeMinute(prev => prev <= 0 ? 59 : prev - 1);
   };

  const togglePeriod = () => {
    setTimePeriod(prev => prev === 'AM' ? 'PM' : 'AM');
  };

  const confirmTime = () => {
    const timeStr = `${timeHour}:${timeMinute.toString().padStart(2, '0')} ${timePeriod}`;
    setSelectedTime(timeStr);
    setShowTimePicker(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'Please sign in to save events');
      return;
    }

    setSaving(true);

    // Build date string in IST format
    const dateStr = selectedDate.toISOString().split('T')[0];
    const isoDate = selectedTime ? toISTISOString(dateStr, selectedTime) : toISTISOString(dateStr);

    const eventData = {
      userId,
      title: title.trim(),
      description: description.trim(),
      date: isoDate,
      time: selectedTime,
      color: selectedColor,
    };

    console.log('Saving event (IST):', eventData);

    try {
      const { authFetch } = await import('../utils/api');
      const url = `${getApiBaseUrl()}/api/events`;
      console.log('POST to:', url);

      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      });

      console.log('Response status:', res.status);
      const responseData = await res.json().catch(() => null);
      console.log('Response data:', responseData);

      if (res.ok) {
        // Schedule reminder notification if enabled
        if (enableReminder && responseData?._id) {
          const eventDateTime = new Date(isoDate);
          await scheduleEventReminder(
            responseData._id,
            title.trim(),
            eventDateTime,
            reminderMinutes
          );
        }

        Alert.alert('Success', 'Event saved successfully!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        const errorMsg = responseData?.error || responseData?.detail || 'Failed to create event';
        Alert.alert('Error', errorMsg);
      }
    } catch (error: any) {
      console.log('Error creating event:', error);
      Alert.alert('Error', `Failed to save event: ${error.message || 'Network error'}`);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Event</Text>
        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#FF9500" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tab Switcher */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'task' && styles.tabActive]}
            onPress={() => router.replace('/add-task')}
          >
            <Ionicons name="checkbox-outline" size={20} color={activeTab === 'task' ? "#00E0C6" : "#999"} />
            <Text style={[styles.tabText, activeTab === 'task' && { color: '#00E0C6' }]}>Task</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'event' && styles.tabActiveEvent]}
            onPress={() => {}}
          >
            <Ionicons name="calendar-outline" size={20} color={activeTab === 'event' ? "#FF9500" : "#999"} />
            <Text style={[styles.tabText, activeTab === 'event' && { color: '#FF9500' }]}>Event</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'birthday' && styles.tabActiveBirthday]}
            onPress={() => router.replace('/add-birthday')}
          >
            <Ionicons name="gift-outline" size={20} color={activeTab === 'birthday' ? "#FF6B6B" : "#999"} />
            <Text style={[styles.tabText, activeTab === 'birthday' && { color: '#FF6B6B' }]}>Birthday</Text>
          </TouchableOpacity>
        </View>

        {/* Date Display */}
        <View style={styles.dateDisplayBanner}>
          <Ionicons name="calendar" size={20} color="#FF9500" />
          <Text style={styles.dateDisplayBannerText}>
            Adding event for: {selectedDate.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </Text>
        </View>

        {/* Title Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Event Title</Text>
          <TextInput
            style={styles.input}
            placeholder="What's the event?"
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#999"
          />
        </View>

        {/* Description Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add more details..."
            value={description}
            onChangeText={setDescription}
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Date Picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar" size={24} color="#FF9500" />
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Time Picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Time (optional)</Text>
          <TouchableOpacity style={styles.datePicker} onPress={() => setShowTimePicker(true)}>
            <Ionicons name="time" size={24} color="#FF9500" />
            <Text style={styles.dateText}>{selectedTime || 'Add time'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Reminder Section */}
        <View style={styles.section}>
          <View style={styles.reminderHeader}>
            <View style={styles.reminderTitleRow}>
              <Ionicons name="notifications" size={20} color="#FF9500" />
              <Text style={styles.label}>Reminder</Text>
            </View>
            <Switch
              value={enableReminder}
              onValueChange={setEnableReminder}
              trackColor={{ false: '#E0E0E0', true: '#FF9500' }}
              thumbColor="#fff"
            />
          </View>
          
          {enableReminder && (
            <View style={styles.reminderOptions}>
              <Text style={styles.reminderLabel}>Remind me before:</Text>
              <View style={styles.reminderButtons}>
                {[
                  { label: '15 min', value: 15 },
                  { label: '30 min', value: 30 },
                  { label: '1 hour', value: 60 },
                  { label: '2 hours', value: 120 },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.reminderOption,
                      reminderMinutes === option.value && styles.reminderOptionSelected
                    ]}
                    onPress={() => setReminderMinutes(option.value)}
                  >
                    <Text style={[
                      styles.reminderOptionText,
                      reminderMinutes === option.value && styles.reminderOptionTextSelected
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Color Picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorPicker}>
            {colors.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorOptionSelected
                ]}
                onPress={() => setSelectedColor(color)}
              >
                {selectedColor === color && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.datePickerModal, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={goToPrevMonth}>
                <Ionicons name="chevron-back" size={28} color="#333" />
              </TouchableOpacity>
              <Text style={styles.monthYearText}>
                {pickerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={goToNextMonth}>
                <Ionicons name="chevron-forward" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} style={styles.weekdayText}>{day}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {[...Array(getFirstDayOfMonth(pickerMonth))].map((_, i) => (
                <View key={`empty-${i}`} style={styles.dayCell} />
              ))}
              {[...Array(getDaysInMonth(pickerMonth))].map((_, i) => {
                const day = i + 1;
                const isSelected = 
                  selectedDate.getDate() === day &&
                  selectedDate.getMonth() === pickerMonth.getMonth() &&
                  selectedDate.getFullYear() === pickerMonth.getFullYear();
                const isToday = 
                  new Date().getDate() === day &&
                  new Date().getMonth() === pickerMonth.getMonth() &&
                  new Date().getFullYear() === pickerMonth.getFullYear();
                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayCell,
                      isSelected && styles.selectedDay,
                      isToday && !isSelected && styles.todayDay
                    ]}
                    onPress={() => handleDateSelect(day)}
                  >
                    <Text style={[
                      styles.dayText, 
                      isSelected && styles.selectedDayText,
                      isToday && !isSelected && styles.todayDayText
                    ]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal with Arrows */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.timePickerModalNew, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.timePickerContainer}>
              {/* Hour Column */}
              <View style={styles.timeColumn}>
                <TouchableOpacity style={styles.arrowButton} onPress={incrementHour}>
                  <Ionicons name="chevron-up" size={32} color="#FF9500" />
                </TouchableOpacity>
                <View style={styles.timeValueBox}>
                  <Text style={styles.timeValue}>{timeHour.toString().padStart(2, '0')}</Text>
                </View>
                <TouchableOpacity style={styles.arrowButton} onPress={decrementHour}>
                  <Ionicons name="chevron-down" size={32} color="#FF9500" />
                </TouchableOpacity>
              </View>

              <Text style={styles.timeColon}>:</Text>

              {/* Minute Column */}
              <View style={styles.timeColumn}>
                <TouchableOpacity style={styles.arrowButton} onPress={incrementMinute}>
                  <Ionicons name="chevron-up" size={32} color="#FF9500" />
                </TouchableOpacity>
                <View style={styles.timeValueBox}>
                  <Text style={styles.timeValue}>{timeMinute.toString().padStart(2, '0')}</Text>
                </View>
                <TouchableOpacity style={styles.arrowButton} onPress={decrementMinute}>
                  <Ionicons name="chevron-down" size={32} color="#FF9500" />
                </TouchableOpacity>
              </View>

              {/* AM/PM Column */}
              <View style={styles.timeColumn}>
                <TouchableOpacity style={styles.arrowButton} onPress={togglePeriod}>
                  <Ionicons name="chevron-up" size={32} color="#FF9500" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.timeValueBoxPeriod} onPress={togglePeriod}>
                  <Text style={styles.timeValuePeriod}>{timePeriod}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.arrowButton} onPress={togglePeriod}>
                  <Ionicons name="chevron-down" size={32} color="#FF9500" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.confirmTimeButton} onPress={confirmTime}>
              <Text style={styles.confirmTimeText}>Confirm Time</Text>
            </TouchableOpacity>

            {/* Quick Time Options */}
            <Text style={styles.quickTimeLabel}>Or select a preset time:</Text>
            <ScrollView style={styles.quickTimeScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.quickTimeGrid}>
                {['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'].map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.quickTimeOption,
                      selectedTime === time && styles.quickTimeOptionSelected
                    ]}
                    onPress={() => {
                      setSelectedTime(time);
                      setShowTimePicker(false);
                    }}
                  >
                    <Text style={[
                      styles.quickTimeText,
                      selectedTime === time && styles.quickTimeTextSelected
                    ]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerButton: {
    padding: 4,
    minWidth: 50,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9500',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginTop: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#E6FFFA',
  },
  tabActiveEvent: {
    backgroundColor: '#FFF4E6',
  },
  tabActiveBirthday: {
    backgroundColor: '#FFE6E6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    marginLeft: 6,
  },
  dateDisplayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
  },
  dateDisplayBannerText: {
    fontSize: 14,
    color: '#E65100',
    marginLeft: 10,
    fontWeight: '500',
  },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  timePickerModalNew: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
    width: 40,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDay: {
    backgroundColor: '#FF9500',
    borderRadius: 20,
  },
  todayDay: {
    borderWidth: 2,
    borderColor: '#FF9500',
    borderRadius: 20,
  },
  dayText: {
    fontSize: 16,
    color: '#333',
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: '600',
  },
  todayDayText: {
    color: '#FF9500',
    fontWeight: '600',
  },
  // New Time Picker Styles
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    paddingVertical: 20,
    marginBottom: 16,
  },
  timeColumn: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  arrowButton: {
    padding: 8,
    borderRadius: 8,
  },
  timeValueBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  timeValueBoxPeriod: {
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  timeValue: {
    fontSize: 42,
    fontWeight: '600',
    color: '#333',
  },
  timeValuePeriod: {
    fontSize: 28,
    fontWeight: '600',
    color: '#fff',
  },
  timeColon: {
    fontSize: 42,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 4,
  },
  confirmTimeButton: {
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmTimeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quickTimeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  quickTimeScroll: {
    maxHeight: 150,
  },
  quickTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickTimeOption: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickTimeOptionSelected: {
    backgroundColor: '#FF9500',
  },
  quickTimeText: {
    fontSize: 14,
    color: '#666',
  },
  quickTimeTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  // Reminder Styles
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reminderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reminderOptions: {
    marginTop: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  reminderLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  reminderButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reminderOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  reminderOptionSelected: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  reminderOptionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  reminderOptionTextSelected: {
    color: '#fff',
  },
});
