import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Alert,
  Platform,
  Dimensions,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl, authFetch } from '../utils/api';
import { toISTISOString } from '../utils/timezone';
import { requestNotificationPermissions, scheduleTaskReminder, scheduleEventReminder, scheduleBirthdayReminder } from '../utils/notifications';

// Types
interface TaskItem {
  _id: string;
  id?: number | string;
  title: string;
  type: 'event' | 'task' | 'birthday';
  allDay: boolean;
  event_datetime: string;
  reminder_minutes: number;
  reminder_datetime?: string;
  status: 'pending' | 'completed';
  created_at: string;
}

const TYPE_COLORS = {
  event: '#FF9500',
  task: '#00E0C6',
  birthday: '#FF6B6B',
};

const TYPE_ICONS = {
  event: 'calendar',
  task: 'checkbox',
  birthday: 'gift',
};

export default function TaskManagerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get('window');
  const userId = auth.currentUser?.uid || '';

  // State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [selectedType, setSelectedType] = useState<'event' | 'task' | 'birthday'>('task');
  const [filterType, setFilterType] = useState<'all' | 'event' | 'task' | 'birthday'>('all');

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<'event' | 'task' | 'birthday'>('task');
  const [formAllDay, setFormAllDay] = useState(true);
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formReminder, setFormReminder] = useState(30);
  const [showCustomReminder, setShowCustomReminder] = useState(false);
  const [customReminderValue, setCustomReminderValue] = useState('');

  // Load tasks
  const loadTasks = useCallback(async () => {
    if (!userId) {
      setTasks([]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await authFetch(`${getApiBaseUrl()}/api/tasks`);
      if (res.ok) {
        const data: TaskItem[] = await res.json();
        setTasks(data);
      }
    } catch (error) {
      console.log('Error loading tasks:', error);
      Alert.alert('Error', 'Failed to load tasks. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Open add menu
  const handleOpenMenu = () => {
    setShowAddMenu(true);
  };

  // Close add menu
  const handleCloseMenu = () => {
    setShowAddMenu(false);
  };

  // Open form for new item
  const handleSelectType = (type: 'event' | 'task' | 'birthday') => {
    setShowAddMenu(false);
    setEditingTask(null);
    setFormType(type);
    setFormTitle('');
    setFormAllDay(true);
    const today = new Date();
    setFormDate(today.toISOString().split('T')[0]);
    setFormTime('');
    setFormReminder(30);
    setShowFormModal(true);
  };

  // Open form for editing
  const handleEditTask = (task: TaskItem) => {
    setEditingTask(task);
    setFormType(task.type);
    setFormTitle(task.title);
    setFormAllDay(task.allDay);
    const eventDate = new Date(task.event_datetime);
    setFormDate(eventDate.toISOString().split('T')[0]);
    setFormTime(task.allDay ? '' : eventDate.toTimeString().slice(0, 5));
    setFormReminder(task.reminder_minutes);
    setShowFormModal(true);
  };

  // Calculate reminder datetime
  const calculateReminderDatetime = (eventDatetime: Date, reminderMinutes: number): string => {
    const reminderMs = reminderMinutes * 60 * 1000;
    const reminderDate = new Date(eventDatetime.getTime() - reminderMs);
    return reminderDate.toISOString();
  };

    // Save task
    const handleSaveTask = async () => {
      if (!formTitle.trim()) {
        Alert.alert('Error', 'Please enter a title');
        return;
      }

      if (!formDate) {
        Alert.alert('Error', 'Please select a date');
        return;
      }

      // Build datetime in IST format for backend
      const dateStr = formDate; // Already in YYYY-MM-DD format
      const timeStr = formAllDay ? undefined : formTime;
      const event_datetime = timeStr ? toISTISOString(dateStr, timeStr) : toISTISOString(dateStr);

      // For local state and reminder calculation, we still need the Date object
      let eventDatetime: Date;
      if (formAllDay) {
        eventDatetime = new Date(`${dateStr}T00:00:00`);
      } else {
        if (!timeStr) {
          Alert.alert('Error', 'Please select a time');
          return;
        }
        eventDatetime = new Date(`${dateStr}T${timeStr}:00`);
      }

      if (isNaN(eventDatetime.getTime())) {
        Alert.alert('Error', 'Invalid date/time');
        return;
      }

      const newTask: TaskItem = {
        _id: editingTask?._id || '',
        id: editingTask?.id || Date.now(),
        title: formTitle.trim(),
        type: formType,
        allDay: formAllDay,
        event_datetime: event_datetime, // IST-converted ISO string for backend
        reminder_minutes: formReminder,
        // reminder_datetime: reminderDatetime, // Let backend calculate this
        status: editingTask?.status || 'pending',
        created_at: editingTask?.created_at || new Date().toISOString(),
      };

      try {
        let savedTaskId: string | undefined;
        if (userId) {
          let response;
          if (editingTask) {
            response = await authFetch(`${getApiBaseUrl()}/api/tasks/${editingTask.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newTask),
            });
          } else {
            response = await authFetch(`${getApiBaseUrl()}/api/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newTask),
            });
          }

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save task');
          }

          const responseData = await response.json();
          savedTaskId = responseData._id || responseData.id;
        }

        // Update local state with the saved task data
        const savedTaskWithId: TaskItem = {
          ...newTask,
          _id: savedTaskId || (editingTask ? editingTask._id : Date.now().toString()), // Use the ID from backend or generate temp one
          id: editingTask?.id || Date.now(), // Keep the numeric id for compatibility
        };
        
        let updatedTasks: TaskItem[];
        if (editingTask) {
          updatedTasks = tasks.map(t => t._id === editingTask._id ? savedTaskWithId : t);
        } else {
          // Prevent duplicates
          const exists = tasks.some(t => 
            t.title === newTask.title && 
            t.event_datetime === newTask.event_datetime
          );
          updatedTasks = exists ? tasks : [...tasks, savedTaskWithId];
        }
        
        setTasks(updatedTasks);
        setShowFormModal(false);
        setEditingTask(null);

        // Schedule notification if we have a task ID and user is logged in
        if (userId && savedTaskId) {
          try {
            const hasPermission = await requestNotificationPermissions();
            if (hasPermission) {
              // Convert to IST for scheduling
              const istEventDatetime = new Date(newTask.event_datetime);
              
              let notificationScheduled = false;
              if (newTask.type === 'task') {
                await scheduleTaskReminder(
                  savedTaskId,
                  newTask.title,
                  istEventDatetime,
                  newTask.reminder_minutes
                );
                console.log('Task reminder scheduled for:', savedTaskId);
                notificationScheduled = true;
              } else if (newTask.type === 'event') {
                await scheduleEventReminder(
                  savedTaskId,
                  newTask.title,
                  istEventDatetime,
                  newTask.reminder_minutes
                );
                console.log('Event reminder scheduled for:', savedTaskId);
                notificationScheduled = true;
              } else if (newTask.type === 'birthday') {
                // For birthdays, we use a different approach - schedule for 9 AM on the birthday
                const birthdayName = newTask.title; // Assuming title contains the name for birthdays
                await scheduleBirthdayReminder(
                  savedTaskId,
                  birthdayName,
                  istEventDatetime
                );
                console.log('Birthday reminder scheduled for:', savedTaskId);
                notificationScheduled = true;
              }
              
              if (!notificationScheduled) {
                console.log('No reminder scheduling needed for type:', newTask.type);
              }
            }
          } catch (notificationError) {
            console.log('Error scheduling notification:', notificationError);
            // Don't fail the task save if notification scheduling fails
          }
        }
      } catch (error) {
        console.log('Error saving task:', error);
        Alert.alert('Error', 'Failed to save task: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    };

  // Delete task
  const handleDeleteTask = async (task: TaskItem) => {
    Alert.alert(
      'Delete Item',
      `Delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (userId) {
                await authFetch(`${getApiBaseUrl()}/api/tasks/${task.id}`, {
                  method: 'DELETE',
                });
              }
              const updatedTasks = tasks.filter(t => t.id !== task.id);
              setTasks(updatedTasks);
            } catch (error) {
              console.log('Error deleting task:', error);
            }
          },
        },
      ]
    );
  };

  // Toggle status
  const handleToggleStatus = async (task: TaskItem) => {
    const newStatus: 'pending' | 'completed' = task.status === 'completed' ? 'pending' : 'completed';
    const updatedTask: TaskItem = { ...task, status: newStatus };

    try {
      if (userId) {
        await authFetch(`${getApiBaseUrl()}/api/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
      }

      const updatedTasks: TaskItem[] = tasks.map(t => t.id === task.id ? updatedTask : t);
      setTasks(updatedTasks);
    } catch (error) {
      console.log('Error toggling status:', error);
    }
  };

  // Format datetime for display
  const formatDateTime = (isoString: string, allDay: boolean): string => {
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    };
    if (!allDay) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return date.toLocaleDateString('en-US', options);
  };

  // Format reminder text
  const formatReminder = (minutes: number): string => {
    if (minutes === 0) return 'At time';
    if (minutes < 60) return `${minutes} min before`;
    if (minutes === 60) return '1 hour before';
    return `${minutes / 60} hours before`;
  };

  // Filter tasks
  const filteredTasks = tasks
    .filter(t => filterType === 'all' || t.type === filterType)
    .sort((a, b) => new Date(a.event_datetime).getTime() - new Date(b.event_datetime).getTime());

  const menuItems = [
    { type: 'event' as const, label: 'Event', icon: 'calendar', color: '#FF9500' },
    { type: 'task' as const, label: 'Task', icon: 'checkbox', color: '#00E0C6' },
    { type: 'birthday' as const, label: 'Birthday', icon: 'gift', color: '#FF6B6B' },
  ];

  const filterOptions = [
    { value: 'all' as const, label: 'All' },
    { value: 'event' as const, label: 'Events' },
    { value: 'task' as const, label: 'Tasks' },
    { value: 'birthday' as const, label: 'Birthdays' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#E0E0E0" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>📋 Task Manager</Text>
          <Text style={styles.headerSubtitle}>Manage tasks, events & birthdays</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.filterTab,
                filterType === option.value && styles.filterTabActive
              ]}
              onPress={() => setFilterType(option.value)}
            >
              <Text style={[
                styles.filterTabText,
                filterType === option.value && styles.filterTabTextActive
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Task List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyText}>Tap the + button to add your first item</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.taskCard, { borderLeftColor: TYPE_COLORS[item.type] }]}>
            <View style={styles.taskTypeBar} />
            <View style={styles.taskContent}>
              <View style={styles.taskHeader}>
                <Ionicons name={TYPE_ICONS[item.type] as any} size={18} color={TYPE_COLORS[item.type]} />
                <Text style={styles.taskType}>{item.type}</Text>
                {item.allDay && <View style={styles.allDayBadge}><Text style={styles.allDayText}>All Day</Text></View>}
              </View>
              <Text style={[styles.taskTitle, item.status === 'completed' && styles.taskTitleCompleted]}>
                {item.title}
              </Text>
              <View style={styles.taskMeta}>
                <Ionicons name="time-outline" size={14} color="#888" />
                <Text style={styles.taskMetaText}>{formatDateTime(item.event_datetime, item.allDay)}</Text>
              </View>
              <View style={styles.taskMeta}>
                <Ionicons name="notifications-outline" size={14} color="#888" />
                <Text style={styles.taskMetaText}>{formatReminder(item.reminder_minutes)}</Text>
              </View>
            </View>
            <View style={styles.taskActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleToggleStatus(item)}
              >
                <Ionicons
                  name={item.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={item.status === 'completed' ? '#34C759' : '#666'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleEditTask(item)}
              >
                <Ionicons name="pencil" size={18} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDeleteTask(item)}
              >
                <Ionicons name="trash" size={18} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Floating Add Button */}
      <TouchableOpacity style={[styles.fab, { bottom: Math.max(insets.bottom, 30) + 20 }]} onPress={handleOpenMenu}>
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Add Menu Modal */}
      <Modal visible={showAddMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} onPress={handleCloseMenu}>
          <View style={[styles.addMenu, { bottom: Math.max(insets.bottom, 30) + 80 }]}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={item.type}
                style={[styles.menuItem, { backgroundColor: item.color + '20' }]}
                onPress={() => handleSelectType(item.type)}
              >
                <Ionicons name={item.icon as any} size={24} color={item.color} />
                <Text style={[styles.menuItemText, { color: item.color }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Form Modal */}
      <Modal visible={showFormModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.formModal, { paddingBottom: insets.bottom + 20 }]}>
            {/* Form Header */}
            <View style={styles.formHeader}>
              <TouchableOpacity onPress={() => setShowFormModal(false)}>
                <Ionicons name="close" size={28} color="#E0E0E0" />
              </TouchableOpacity>
              <Text style={styles.formTitle}>
                {editingTask ? 'Edit' : 'Add'} {formType.charAt(0).toUpperCase() + formType.slice(1)}
              </Text>
              <TouchableOpacity onPress={handleSaveTask}>
                <Text style={styles.saveButton}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContent} showsVerticalScrollIndicator={false}>
              {/* Title */}
              <View style={styles.formGroup}>
                <TextInput
                  style={styles.titleInput}
                  placeholder="Add title"
                  placeholderTextColor="#666"
                  value={formTitle}
                  onChangeText={setFormTitle}
                  autoFocus
                />
              </View>

              {/* Type Selector */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Type</Text>
                <View style={styles.typeRow}>
                  {(['event', 'task', 'birthday'] as const).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeOption,
                        formType === type && { 
                          backgroundColor: TYPE_COLORS[type] + '20',
                          borderColor: TYPE_COLORS[type] 
                        }
                      ]}
                      onPress={() => setFormType(type)}
                    >
                      <Ionicons 
                        name={TYPE_ICONS[type] as any} 
                        size={20} 
                        color={formType === type ? TYPE_COLORS[type] : '#666'} 
                      />
                      <Text style={[
                        styles.typeOptionText,
                        formType === type && { color: TYPE_COLORS[type] }
                      ]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* All Day Toggle */}
              <View style={styles.formGroup}>
                <View style={styles.toggleRow}>
                  <Text style={styles.formLabel}>All Day</Text>
                  <Switch
                    value={formAllDay}
                    onValueChange={setFormAllDay}
                    trackColor={{ false: '#3A3A5A', true: '#00E0C6' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>

              {/* Date */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#666"
                  value={formDate}
                  onChangeText={setFormDate}
                />
              </View>

              {/* Time (when not all day) */}
              {!formAllDay && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="HH:MM"
                    placeholderTextColor="#666"
                    value={formTime}
                    onChangeText={setFormTime}
                  />
                </View>
              )}

               {/* Reminder */}
               <View style={styles.formGroup}>
                 <Text style={styles.formLabel}>Reminder</Text>
                 <View style={styles.reminderRow}>
                   {[
                     { value: 0, label: 'At time' },
                     { value: 15, label: '15 min' },
                     { value: 30, label: '30 min' },
                     { value: 60, label: '1 hr' },
                   ].map((option) => (
                     <TouchableOpacity
                       key={option.value}
                       style={[
                         styles.reminderOption,
                         formReminder === option.value && styles.reminderOptionActive
                       ]}
                       onPress={() => setFormReminder(option.value)}
                     >
                       <Text style={[
                         styles.reminderOptionText,
                         formReminder === option.value && styles.reminderOptionTextActive
                       ]}>
                       {option.label}
                       </Text>
                     </TouchableOpacity>
                   ))}
                    <TouchableOpacity
                      style={[styles.reminderOption, { flex: 1, marginLeft: 10 }]}
                      onPress={() => {
                        setCustomReminderValue(formReminder.toString());
                        setShowCustomReminder(true);
                      }}
                    >
                     <Text style={[
                       styles.reminderOptionText,
                       ![0, 15, 30, 60].includes(formReminder) && styles.reminderOptionTextActive
                     ]}>
                       {![0, 15, 30, 60].includes(formReminder) ? formReminder + ' min' : 'Custom'}
                     </Text>
                   </TouchableOpacity>
                 </View>
               </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Custom Reminder Modal */}
      <Modal visible={showCustomReminder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.customReminderModal, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.formHeader}>
              <TouchableOpacity onPress={() => setShowCustomReminder(false)}>
                <Ionicons name="close" size={24} color="#E0E0E0" />
              </TouchableOpacity>
              <Text style={styles.formTitle}>Custom Reminder</Text>
              <TouchableOpacity onPress={() => {
                const parsed = parseInt(customReminderValue, 10);
                if (!isNaN(parsed) && parsed >= 0) {
                  setFormReminder(parsed);
                  setShowCustomReminder(false);
                } else {
                  Alert.alert('Invalid input', 'Please enter a valid number of minutes');
                }
              }}>
                <Text style={styles.saveButton}>Set</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.formContent}>
              <Text style={styles.formLabel}>Minutes before event</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 45"
                placeholderTextColor="#666"
                value={customReminderValue}
                onChangeText={setCustomReminderValue}
                keyboardType="numeric"
                autoFocus
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#16162A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16162A',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#252540',
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#00E0C6',
  },
  filterTabText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
  taskCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderLeftWidth: 4,
  },
  taskTypeBar: {
    height: 4,
    width: '100%',
  },
  taskContent: {
    padding: 16,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  taskType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
  },
  allDayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    marginLeft: 'auto',
  },
  allDayText: {
    fontSize: 10,
    color: '#888',
    fontWeight: '600',
  },
  taskTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  taskMetaText: {
    fontSize: 13,
    color: '#888',
  },
  taskActions: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00E0C6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#00E0C6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  addMenu: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 8,
    minWidth: 150,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  formModal: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00E0C6',
  },
  formContent: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleInput: {
    backgroundColor: '#252540',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    color: '#fff',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#252540',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#252540',
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reminderOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#252540',
    alignItems: 'center',
  },
  reminderOptionActive: {
    backgroundColor: '#00E0C6',
  },
  reminderOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  reminderOptionTextActive: {
    color: '#fff',
  },
  customReminderModal: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '50%',
  },
});
