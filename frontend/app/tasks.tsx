import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl } from '../utils/api';

type Task = {
  _id: string;
  title: string;
  description: string;
  status: 'pending' | 'completed';
  priority?: 'high' | 'medium' | 'low';
};

type PriorityOption = {
  value: Task['priority'];
  label: string;
  color: string;
  icon: string;
};

const priorityOptions: PriorityOption[] = [
  { value: 'high', label: 'High', color: '#FF3B30', icon: '🔴' },
  { value: 'medium', label: 'Medium', color: '#FF9500', icon: '🟠' },
  { value: 'low', label: 'Low', color: '#34C759', icon: '🟢' },
];

export default function TasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = auth.currentUser?.uid || '';
  const userEmail = auth.currentUser?.email || '';
  const rawName = userEmail.split('@')[0] || 'User';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasksByDate, setTasksByDate] = useState<Record<string, Task[]>>({});
  const [loadingTasks, setLoadingTasks] = useState(false);
  
  // Task input state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  
  // Birthday/anniversary data (mock data for now)
  const [birthdays, setBirthdays] = useState<Array<{
    id: string;
    name: string;
    date: string;
    year?: number;
    relation: string;
    color?: string;
  }>>([]);

  // Events data
  const [events, setEvents] = useState<Array<{
    id: string;
    title: string;
    date: string;
    time?: string;
    color?: string;
  }>>([]);

  // Combined items for the day
  type CalendarItem = {
    id: string;
    type: 'task' | 'birthday' | 'event';
    title: string;
    subtitle?: string;
    status?: 'pending' | 'completed';
    color: string;
    icon: string;
    priority?: 'high' | 'medium' | 'low';
  };

  const getItemsForDate = (): CalendarItem[] => {
    const dateString = selectedDate.toISOString().split('T')[0];
    const monthDay = dateString.slice(5);
    const items: CalendarItem[] = [];

    // Add birthdays
    const dayBirthdays = birthdays.filter(b => b.date === monthDay);
    dayBirthdays.forEach(b => {
      items.push({
        id: `bday-${b.id}`,
        type: 'birthday',
        title: b.name,
        subtitle: b.relation,
        color: b.color || '#FF6B6B',
        icon: '🎂'
      });
    });

    // Add events
    const dayEvents = events.filter(e => e.date === dateString);
    dayEvents.forEach(e => {
      items.push({
        id: `event-${e.id}`,
        type: 'event',
        title: e.title,
        subtitle: e.time,
        color: e.color || '#FF9500',
        icon: '📅'
      });
    });

    // Add tasks
    const dayTasks = tasksByDate[dateString] || [];
    dayTasks.forEach(t => {
      items.push({
        id: `task-${t._id}`,
        type: 'task',
        title: t.title,
        status: t.status,
        color: t.status === 'completed' ? '#34C759' : (t.priority === 'high' ? '#FF3B30' : t.priority === 'medium' ? '#FF9500' : '#00E0C6'),
        icon: t.status === 'completed' ? '✅' : '🔥',
        priority: t.priority
      });
    });

    // Sort: birthdays first, then events, then tasks by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    
    items.sort((a, b) => {
      // Birthday and events come first
      if (a.type === 'birthday' && b.type !== 'birthday') return -1;
      if (b.type === 'birthday' && a.type !== 'birthday') return 1;
      if (a.type === 'event' && b.type === 'task') return -1;
      if (b.type === 'event' && a.type === 'task') return 1;
      
      // For tasks, sort by priority
      if (a.type === 'task' && b.type === 'task') {
        const aPriority = a.priority ? priorityOrder[a.priority] : 3;
        const bPriority = b.priority ? priorityOrder[b.priority] : 3;
        return aPriority - bPriority;
      }
      
      return 0;
    });

    return items;
  };

  useEffect(() => {
    if (userId) {
      loadTasksForDate(selectedDate);
      loadBirthdays();
    }
  }, [userId, selectedDate]);

  // Load tasks for a specific date
  const loadTasksForDate = async (date: Date) => {
    if (!userId) return;
    
    setLoadingTasks(true);
    try {
      const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const { authFetch } = await import('../utils/api');
      const res = await authFetch(`${getApiBaseUrl()}/api/tasks?userId=${userId}&date=${dateString}`);
      
      if (res.ok) {
        const data = await res.json();
        // Ensure data is properly typed as Task[]
        const typedData: Task[] = data.map((item: any) => ({
          _id: item._id || '',
          title: item.title || '',
          description: item.description || '',
          status: item.status === 'completed' ? 'completed' : 'pending'
        }));
        setTasksByDate(prev => ({
          ...prev,
          [dateString]: typedData
        }));
      }
    } catch (error) {
      console.log('Error fetching tasks for date', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Load birthdays (mock implementation)
  const loadBirthdays = async () => {
    setBirthdays([]);
    setEvents([]);
    setTasksByDate({});
  };

  // Handle date navigation
  const goToPreviousMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    loadTasksForDate(today);
  };

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    loadTasksForDate(date);
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if date is selected
  const isSelected = (date: Date) => {
    return selectedDate.toDateString() === date.toDateString();
  };

  // Check if date has tasks
  const hasTasks = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    return tasksByDate[dateString] && tasksByDate[dateString].length > 0;
  };

  // Get tasks for selected date
  const getSelectedDateTasks = () => {
    const dateString = selectedDate.toISOString().split('T')[0];
    return tasksByDate[dateString] || [];
  };

  // Check if date has birthday
  const getBirthdaysForDate = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${month}-${day}`;
    
    return birthdays.filter(birthday => birthday.date === dateKey);
  };

  // Handle adding task
  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !userId) return;
    
    try {
      const dateString = selectedDate.toISOString().split('T')[0];
      const { authFetch } = await import('../utils/api');
      const res = await authFetch(`${getApiBaseUrl()}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          title: newTaskTitle.trim(),
          date: dateString
        }),
      });
      
      if (res.ok) {
        const newTask = await res.json();
        // Update tasks for selected date
        setTasksByDate(prev => ({
          ...prev,
          [dateString]: [newTask as Task, ...(prev[dateString] || [])]
        }));
        setNewTaskTitle('');
      }
    } catch (error) {
      console.log('Error adding task', error);
    }
  };

  // Handle toggling task status
  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const dateString = new Date().toISOString().split('T')[0]; // Simplified - in real app we'd store date with task
    
    // Optimistic update
    setTasksByDate(prev => {
      const dateTasks = prev[dateString] || [];
      const updatedTasks = dateTasks.map(t => 
        t._id === task._id ? { ...t, status: newStatus as Task['status'] } : t
      );
      return {
        ...prev,
        [dateString]: updatedTasks
      };
    });
    
    try {
      const { authFetch } = await import('../utils/api');
      await authFetch(`${getApiBaseUrl()}/api/tasks/${task._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (error) {
      console.log('Error updating task', error);
      // Revert on error
      setTasksByDate(prev => {
        const dateTasks = prev[dateString] || [];
        const updatedTasks = dateTasks.map(t => 
          t._id === task._id ? { ...t, status: task.status } : t
        );
        return {
          ...prev,
          [dateString]: updatedTasks
        };
      });
    }
  };

  // Handle deleting task
  const deleteTask = async (taskId: string) => {
    // We would need to know which date this task belongs to
    // For simplicity, we'll refetch all tasks for the selected date after deletion
    try {
      const { authFetch } = await import('../utils/api');
      await authFetch(`${getApiBaseUrl()}/api/tasks/${taskId}`, {
        method: 'DELETE',
      });
      
      // Refetch tasks for selected date
      loadTasksForDate(selectedDate);
    } catch (error) {
      console.log('Error deleting task', error);
    }
  };

  // Get days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get first day of month (0-6, where 0 is Sunday)
  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Get month name
  const getMonthName = (date: Date) => {
    return date.toLocaleDateString(undefined, { month: 'long' });
  };

  // Check if date has birthday today
  const hasBirthdayToday = (date: Date) => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayKey = `${month}-${day}`;
    
    return birthdays.some(birthday => birthday.date === todayKey);
  };

  // Get today's birthdays
  const getTodaysBirthdays = () => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayKey = `${month}-${day}`;
    
    return birthdays.filter(birthday => birthday.date === todayKey);
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.greetingTitle}>Hello {userName} 👋</Text>
          <Text style={styles.greetingSubtitle}>Your Tasks & Calendar</Text>
        </View>
        <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
          <Ionicons name="today" size={24} color="#00E0C6" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={getItemsForDate()}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isCompleted = item.status === 'completed';
          const priorityInfo = priorityOptions.find(p => p.value === item.priority);
          
          const handlePress = () => {
            if (item.type === 'birthday') {
              const birthday = birthdays.find(b => `bday-${b.id}` === item.id);
              if (birthday) {
                router.push(`/birthday-detail?id=${birthday.id}&name=${encodeURIComponent(birthday.name)}&date=${birthday.date}&relation=${encodeURIComponent(birthday.relation || '')}&color=${birthday.color || '#FF6B6B'}`);
              }
            }
          };
          
          const CardComponent = item.type !== 'task' ? TouchableOpacity : View;
          
          return (
            <CardComponent 
              style={[styles.itemCard, { borderLeftColor: item.color }]}
              onPress={item.type !== 'task' ? handlePress : undefined}
            >
              <View style={styles.itemLeft}>
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <View style={styles.itemInfo}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.itemTitle, isCompleted && styles.itemTitleCompleted]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.type === 'task' && item.priority && (
                      <View style={[styles.priorityBadge, { backgroundColor: priorityInfo?.color + '20' }]}>
                        <Text style={[styles.priorityText, { color: priorityInfo?.color }]}>
                          {priorityInfo?.icon} {priorityInfo?.label}
                        </Text>
                      </View>
                    )}
                  </View>
                  {item.subtitle && (
                    <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                  )}
                </View>
              </View>
              <View style={styles.itemRight}>
                {item.type === 'task' ? (
                  <TouchableOpacity 
                    style={styles.checkButton}
                    onPress={() => {
                      const task = getSelectedDateTasks().find(t => t._id === item.id.replace('task-', ''));
                      if (task) toggleTaskStatus(task);
                    }}
                  >
                    <Ionicons 
                      name={isCompleted ? "checkmark-circle" : "ellipse-outline"} 
                      size={26} 
                      color={isCompleted ? "#34C759" : "#ccc"} 
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.typeBadge, { backgroundColor: item.color + '20' }]}>
                    <Text style={[styles.typeBadgeText, { color: item.color }]}>
                      {item.type === 'birthday' ? 'Birthday' : 'Event'}
                    </Text>
                  </View>
                )}
              </View>
            </CardComponent>
          );
        }}
        ListHeaderComponent={
          <>
            {/* Date Navigation */}
            <View style={styles.dateNavContainer}>
              <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
                <Ionicons name="chevron-back" size={28} color="#333" />
              </TouchableOpacity>
              <View style={styles.monthYearDisplay}>
                <Text style={styles.monthText}>{getMonthName(currentDate)}</Text>
                <Text style={styles.yearText}>{currentDate.getFullYear()}</Text>
              </View>
              <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
                <Ionicons name="chevron-forward" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarContainer}>
              <View style={styles.weekdayRow}>
                <Text style={styles.weekdayText}>Sun</Text>
                <Text style={styles.weekdayText}>Mon</Text>
                <Text style={styles.weekdayText}>Tue</Text>
                <Text style={styles.weekdayText}>Wed</Text>
                <Text style={styles.weekdayText}>Thu</Text>
                <Text style={styles.weekdayText}>Fri</Text>
                <Text style={styles.weekdayText}>Sat</Text>
              </View>
              <View style={styles.daysContainer}>
                {[...Array(getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()))].map((_, index) => (
                  <View key={index} style={styles.dayCell} />
                ))}
                {[...Array(getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()))].map((_, dayIndex) => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayIndex + 1);
                  const isTodayDate = isToday(date);
                  const isSelectedDate = isSelected(date);
                  const hasTasksOnDate = hasTasks(date);
                  const birthdaysOnDate = getBirthdaysForDate(date);
                  
                  return (
                    <TouchableOpacity
                      key={dayIndex}
                      style={[
                        styles.dayCell,
                        isSelectedDate && styles.selectedDay,
                        isTodayDate && styles.todayDay,
                        hasTasksOnDate && styles.hasTaskDay,
                        birthdaysOnDate.length > 0 && styles.hasBirthdayDay
                      ]}
                      onPress={() => handleDateSelect(date)}
                    >
                      <Text style={styles.dayNumber}>{dayIndex + 1}</Text>
                      {hasTasksOnDate && (
                        <View style={styles.taskIndicator}>
                          <Text style={styles.taskIndicatorText}>●</Text>
                        </View>
                      )}
                      {birthdaysOnDate.length > 0 && (
                        <View style={styles.birthdayIndicator}>
                          <Text style={styles.birthdayIndicatorText}>🎂</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected Date Header */}
            <View style={styles.selectedDateContainer}>
              <View style={styles.selectedDateLeft}>
                <Text style={styles.dayNameText}>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                </Text>
                <Text style={styles.selectedDateText}>
                  {selectedDate.getDate()}
                </Text>
              </View>
              <View style={styles.selectedDateActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/add-journal')}>
                  <Ionicons name="create" size={20} color="#00E0C6" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/chat')}>
                  <Ionicons name="chatbubble-ellipses" size={20} color="#00E0C6" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Birthdays on Selected Date */}
            {getBirthdaysForDate(selectedDate).length > 0 && (
              <View style={styles.dateBirthdaysSection}>
                {getBirthdaysForDate(selectedDate).map((birthday) => (
                  <TouchableOpacity 
                    key={birthday.id} 
                    style={[styles.dateBirthdayCard, { borderLeftColor: birthday.color || '#FF6B6B' }]}
                    onPress={() => router.push(`/birthday-detail?id=${birthday.id}&name=${encodeURIComponent(birthday.name)}&date=${birthday.date}&relation=${encodeURIComponent(birthday.relation || '')}&color=${birthday.color || '#FF6B6B'}`)}
                  >
                    <Text style={styles.dateBirthdayIcon}>🎂</Text>
                    <View style={styles.dateBirthdayInfo}>
                      <Text style={styles.dateBirthdayName}>{birthday.name}'s birthday</Text>
                      <Text style={styles.dateBirthdayRelation}>{birthday.relation}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#999" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.tasksSection}>
              <Text style={styles.sectionTitle}>🔥 Today's Focus</Text>
              {loadingTasks && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#00E0C6" />
                </View>
              )}
            </View>
          </>
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
        ListEmptyComponent={
          !loadingTasks ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎉</Text>
              <Text style={styles.emptyTitle}>Nothing planned</Text>
              <Text style={styles.emptySubtitle}>Tap + to add a task, event, or birthday!</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.taskListContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Add Button */}
      <TouchableOpacity 
        style={[styles.floatingAddButton, { bottom: Math.max(insets.bottom, 10) + 90 }]}
        onPress={() => router.push('/add-task')}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>


      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={26} color="#888" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/journal')}>
          <Ionicons name="book-outline" size={26} color="#888" />
          <Text style={styles.navText}>Journal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/avatar')}>
          <MaterialCommunityIcons name="account-voice" size={26} color="#888" />
          <Text style={styles.navText}>Avatar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="checkbox-outline" size={26} color="#00E0C6" />
          <Text style={[styles.navText, { color: '#00E0C6' }]}>Tasks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/vault')}>
          <Ionicons name="documents-outline" size={26} color="#888" />
          <Text style={styles.navText}>Docs</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFCFC',
  },
  scrollContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 5,
  },
  headerContent: {
    flex: 1,
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  greetingSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  todayButton: {
    padding: 8,
  },
  dateNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navButton: {
    padding: 8,
  },
  monthYearDisplay: {
    alignItems: 'center',
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  yearText: {
    fontSize: 16,
    color: '#666',
  },
  calendarContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 8,
  },
  weekdayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%', // 100% / 7
    aspectRatio: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 4,
  },
  selectedDay: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  todayDay: {
    borderWidth: 2,
    borderColor: '#00E0C6',
    borderRadius: 8,
  },
  hasTaskDay: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
  },
  hasBirthdayDay: {
    backgroundColor: '#FCE4EC',
    borderRadius: 8,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  taskIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#00E0C6',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskIndicatorText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  birthdayIndicator: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#ff6b6b',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  birthdayIndicatorText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  selectedDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  selectedDateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: 18,
    color: '#666',
    marginRight: 12,
  },
  selectedDateText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  selectedDateActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBirthdaysSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  dateBirthdayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9F9',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  dateBirthdayIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  dateBirthdayInfo: {
    flex: 1,
  },
  dateBirthdayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  dateBirthdayRelation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  actionButton: {
    padding: 8,
  },
  tasksSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 16,
  },
  emptyTasksText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    padding: 24,
  },
  taskListContent: {
    padding: 12,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    color: '#333',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  deleteButton: {
    padding: 6,
  },
  inputSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    marginTop: 16,
  },
  taskInput: {
    flex: 1,
    height: 48,
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
  },
  floatingAddButton: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00E0C6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#00E0C6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  itemTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  itemSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemRight: {
    marginLeft: 12,
  },
  checkButton: {
    padding: 4,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
  },
  birthdaysSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    marginTop: 16,
  },
  birthdaysList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  birthdayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff8f8',
    borderRadius: 8,
    marginRight: 12,
    marginBottom: 8,
  },
  birthdayInfo: {
    marginLeft: 8,
  },
  birthdayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  birthdayRelation: {
    fontSize: 14,
    color: '#666',
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
  navItemActive: {
    alignItems: 'center',
    flex: 1,
  },
  navText: {
    fontSize: 12,
    marginTop: 4,
    color: '#888',
  },
});