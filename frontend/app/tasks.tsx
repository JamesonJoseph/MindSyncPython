import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { auth } from '../firebaseConfig';
import { getApiBaseUrl } from '../utils/api';
import { fromISOToIST, toISTISOString } from '../utils/timezone';

type Task = {
  _id: string;
  title: string;
  description: string;
  status: 'pending' | 'completed';
  priority?: 'high' | 'medium' | 'low';
  date?: string;
  event_datetime?: string;
  time?: string;
  type?: string;
  allDay?: boolean;
  reminder_minutes?: number;
};

type Birthday = {
  _id: string;
  name: string;
  date: string;
  monthDay: string;
  year?: number;
  relation: string;
  color: string;
};

type Event = {
  _id: string;
  title: string;
  date: string;
  time?: string;
  color: string;
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

  const menuItems = [
    { type: 'event' as const, label: 'Event', icon: 'calendar', color: '#FF9500' },
    { type: 'task' as const, label: 'Task', icon: 'checkbox', color: '#00E0C6' },
    { type: 'birthday' as const, label: 'Birthday', icon: 'gift', color: '#FF6B6B' },
  ];

  const timeSlots = [
    '12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM', '4:00 AM', '5:00 AM',
    '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
    '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM',
  ];

export default function TasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = auth.currentUser?.uid || '';
  const userEmail = auth.currentUser?.email || '';
  const rawName = userEmail.split('@')[0] || 'User';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasksByDate, setTasksByDate] = useState<Record<string, Task[]>>({});
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskPriority, setTaskPriority] = useState<Task['priority']>('medium');
  const [taskDescription, setTaskDescription] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [taskTime, setTaskTime] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);

   const getISTDateKey = (isoString?: string): string => {
     if (!isoString) return '';
     const istDate = fromISOToIST(isoString);
     const year = istDate.getFullYear();
     const month = String(istDate.getMonth() + 1).padStart(2, '0');
     const day = String(istDate.getDate()).padStart(2, '0');
     return `${year}-${month}-${day}`;
   };

  const getDateKeyFromDate = (date: Date): string => {
    // Convert to IST to ensure consistency with getISTDateKey
    const istDate = fromISOToIST(date.toISOString());
    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const day = String(istDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const loadData = async () => {
    console.log('loadData called, userId:', userId);
    if (!userId) return;
    setLoadingTasks(true);
    try {
      const { authFetch } = await import('../utils/api');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      try {
        const [tasksRes, birthdaysRes, eventsRes] = await Promise.all([
          authFetch(`${getApiBaseUrl()}/api/tasks`, { signal: controller.signal }),
          authFetch(`${getApiBaseUrl()}/api/birthdays`, { signal: controller.signal }),
          authFetch(`${getApiBaseUrl()}/api/events`, { signal: controller.signal }),
        ]);
        
        clearTimeout(timeoutId);
        
        console.log('Tasks response status:', tasksRes.status);
        
        if (tasksRes.ok) {
          const tasks: Task[] = await tasksRes.json();
          console.log('Tasks from API:', tasks);
          const grouped: Record<string, Task[]> = {};
          tasks.forEach(task => {
            const dateStr = task.event_datetime || task.date;
            const dateKey = getISTDateKey(dateStr);
            console.log(`Task ${task.title}: dateStr=${dateStr}, dateKey=${dateKey}`);
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(task);
          });
          Object.keys(grouped).forEach(key => {
            grouped[key].sort((a, b) => {
              const priorityOrder = { high: 0, medium: 1, low: 2 };
              const aOrder = a.priority ? priorityOrder[a.priority] : 3;
              const bOrder = b.priority ? priorityOrder[b.priority] : 3;
              return aOrder - bOrder;
            });
          });
          console.log('Tasks loaded:', tasks);
          console.log('Grouped tasks:', grouped);
          setTasksByDate(grouped);
        } else {
          console.log('Tasks fetch failed:', tasksRes.status, await tasksRes.text());
        }
        
        if (birthdaysRes.ok) {
          const bdays: Birthday[] = await birthdaysRes.json();
          setBirthdays(bdays);
        }
        
        if (eventsRes.ok) {
          const evts: Event[] = await eventsRes.json();
          setEvents(evts);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.log('Fetch error in loadData:', fetchError);
      }
    } catch (error) {
      console.log('Error loading data', error);
    } finally {
      setLoadingTasks(false);
    }
  };

   useFocusEffect(
     useCallback(() => {
       console.log('Tasks screen focused, userId:', userId);
       if (userId) {
         loadData();
       }
     }, [userId, selectedDate])
   );

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
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    return selectedDate.toDateString() === date.toDateString();
  };

  const hasTasks = (date: Date) => {
    const dateString = getDateKeyFromDate(date);
    return tasksByDate[dateString] && tasksByDate[dateString].length > 0;
  };

  const getBirthdaysForDate = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateKey = `${month}-${day}`;
    return birthdays.filter(b => b.monthDay === dateKey);
  };

  const getEventsForDate = (date: Date) => {
    const dateKey = getDateKeyFromDate(date);
    return events.filter(e => e.date && getISTDateKey(e.date) === dateKey);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const getMonthName = (date: Date) => {
    return date.toLocaleDateString(undefined, { month: 'long' });
  };

  const getSelectedDateTasks = () => {
    const dateString = getDateKeyFromDate(selectedDate);
    console.log(`Selected date: ${selectedDate.toISOString()}, key: ${dateString}`);
    return tasksByDate[dateString] || [];
  };

   const handleAddTask = async () => {
     if (!newTaskTitle.trim() || !userId) return;
     
     const dateStr = getDateKeyFromDate(selectedDate);
     const event_datetime = taskTime ? toISTISOString(dateStr, taskTime) : toISTISOString(dateStr);
     
     // Optimistically add task to local state
     const newTask: Task = {
       _id: Date.now().toString(), // Temporary ID
       title: newTaskTitle.trim(),
       description: taskDescription,
       priority: taskPriority,
       event_datetime,
       time: taskTime,
       type: 'task',
       allDay: !taskTime,
       reminder_minutes: 30,
       status: 'pending'
     };
     
     // Update local state immediately
     setTasksByDate(prev => {
       const dateTasks = prev[dateStr] || [];
       return { ...prev, [dateStr]: [...dateTasks, newTask] };
     });
     
     // Close modal immediately
     setNewTaskTitle('');
     setTaskDescription('');
     setTaskPriority('medium');
     setTaskTime('');
     setShowTaskModal(false);
     
     // Send request to backend
     try {
       const { authFetch } = await import('../utils/api');
       const res = await authFetch(`${getApiBaseUrl()}/api/tasks`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ 
           userId, 
           title: newTaskTitle.trim(),
           description: taskDescription,
           priority: taskPriority,
           event_datetime,
           time: taskTime,
           type: 'task',
           allDay: !taskTime,
           reminder_minutes: 30,
           status: 'pending'
         }),
       });
       
       if (!res.ok) {
         // If server error, rollback the optimistic update
         console.log('Error adding task', await res.text());
         // Note: In a production app, we'd want to properly rollback here
         // For simplicity, we'll just show an error and let user retry
         Alert.alert('Error', 'Failed to save task. Please try again.');
         loadData(); // Reload to get correct state
       } else {
         // Success
         setShowTaskModal(false);
         setNewTaskTitle('');
         setTaskDescription('');
         setTaskTime('');
         setTaskPriority('medium');
         loadData(); // Refresh list
       }
     } catch (error) {
       console.log('Error adding task', error);
       // Rollback optimistic update on error
       loadData(); // Reload to get correct state
       Alert.alert('Error', 'Failed to save task. Please check your connection.');
     }
   };

   const handleUpdateTask = async () => {
     if (!editingTask || !newTaskTitle.trim()) return;
     
     const dateStr = getDateKeyFromDate(selectedDate);
     
     // Optimistically update task in local state
     const updatedTask = {
       ...editingTask,
       title: newTaskTitle.trim(),
       description: taskDescription,
       priority: taskPriority
     };
     
     // Update local state immediately
     setTasksByDate(prev => {
       const dateTasks = prev[dateStr] || [];
       const updatedTasks = dateTasks.map(t => 
         t._id === editingTask._id ? updatedTask : t
       );
       return { ...prev, [dateStr]: updatedTasks };
     });
     
     // Close modal immediately
     setEditingTask(null);
     setNewTaskTitle('');
     setTaskDescription('');
     setTaskPriority('medium');
     setShowTaskModal(false);
     
     // Send request to backend
     try {
       const { authFetch } = await import('../utils/api');
       const res = await authFetch(`${getApiBaseUrl()}/api/tasks/${editingTask._id}`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ 
           title: newTaskTitle.trim(),
           description: taskDescription,
           priority: taskPriority,
         }),
       });
       
       if (!res.ok) {
         // If server error, rollback the optimistic update
         console.log('Error updating task', await res.text());
         // Note: In a production app, we'd want to properly rollback here
         // For simplicity, we'll just show an error and let user retry
         Alert.alert('Error', 'Failed to update task. Please try again.');
         loadData(); // Reload to get correct state
       }
     } catch (error) {
       console.log('Error updating task', error);
       // Rollback optimistic update on error
       loadData(); // Reload to get correct state
       Alert.alert('Error', 'Failed to update task. Please check your connection.');
     }
   };

   const handleDeleteTask = async (task: Task) => {
     Alert.alert(
       'Delete Task',
       'Are you sure you want to delete this task?',
       [
         { text: 'Cancel', style: 'cancel' },
         { 
           text: 'Delete', 
           style: 'destructive',
           onPress: async () => {
             const dateStr = getDateKeyFromDate(selectedDate);
             
             // Optimistically remove task from local state
             setTasksByDate(prev => {
               const dateTasks = prev[dateStr] || [];
               const filteredTasks = dateTasks.filter(t => t._id !== task._id);
               return { ...prev, [dateStr]: filteredTasks };
             });
             
             try {
               const { authFetch } = await import('../utils/api');
               await authFetch(`${getApiBaseUrl()}/api/tasks/${task._id}`, {
                 method: 'DELETE',
               });
             } catch (error) {
               console.log('Error deleting task', error);
               // Rollback optimistic update on error
               loadData(); // Reload to get correct state
               Alert.alert('Error', 'Failed to delete task. Please try again.');
             }
           }
         },
       ]
     );
   };

   const toggleTaskStatus = async (task: Task) => {
     const newStatus: 'pending' | 'completed' = task.status === 'completed' ? 'pending' : 'completed';
     const dateString = getDateKeyFromDate(selectedDate);
     
     // Optimistically update task status in local state
     setTasksByDate(prev => {
       const dateTasks = prev[dateString] || [];
       const updatedTasks = dateTasks.map(t => 
         t._id === task._id ? { ...t, status: newStatus } : t
       );
       return { ...prev, [dateString]: updatedTasks };
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
       // Rollback optimistic update on error
       loadData(); // Reload to get correct state
       Alert.alert('Error', 'Failed to update task status. Please try again.');
     }
   };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setTaskDescription(task.description || '');
    setTaskPriority(task.priority || 'medium');
    setTaskTime(task.time || '');
    setShowTaskModal(true);
  };

  const openAddModal = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setTaskDescription('');
    setTaskPriority('medium');
    setTaskTime('');
    setShowTaskModal(true);
  };

  const handleOpenMenu = () => {
    setShowAddMenu(true);
  };

  const handleCloseMenu = () => {
    setShowAddMenu(false);
  };

  const handleSelectType = (type: 'event' | 'task' | 'birthday') => {
    setShowAddMenu(false);
    const dateString = selectedDate.toISOString().split('T')[0];
    
    if (type === 'task') {
      router.push(`/add-task?date=${dateString}`);
    } else if (type === 'event') {
      router.push(`/add-event?date=${dateString}`);
    } else if (type === 'birthday') {
      router.push(`/add-birthday?date=${dateString}`);
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return '#FF3B30';
      case 'medium': return '#FF9500';
      case 'low': return '#34C759';
      default: return '#00E0C6';
    }
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
        data={getSelectedDateTasks()}
        keyExtractor={item => item._id}
        renderItem={({ item }) => {
          const isCompleted = item.status === 'completed';
          const priorityInfo = priorityOptions.find(p => p.value === item.priority);
          const priorityColor = getPriorityColor(item.priority);
          
          return (
            <View style={[styles.itemCard, { borderLeftColor: priorityColor }]}>
              <View style={styles.itemLeft}>
                <TouchableOpacity 
                  style={styles.checkButton}
                  onPress={() => toggleTaskStatus(item)}
                >
                  <Ionicons 
                    name={isCompleted ? "checkmark-circle" : "ellipse-outline"} 
                    size={26} 
                    color={isCompleted ? "#34C759" : "#ccc"} 
                  />
                </TouchableOpacity>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemTitle, isCompleted && styles.itemTitleCompleted]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.description ? (
                    <Text style={styles.itemSubtitle} numberOfLines={1}>{item.description}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.itemRight}>
                {item.priority && (
                  <View style={[styles.priorityDot, { backgroundColor: priorityColor }]}>
                    <Text style={styles.priorityDotText}>{priorityInfo?.icon}</Text>
                  </View>
                )}
                <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
                  <Ionicons name="pencil" size={18} color="#666" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteTask(item)} style={styles.actionBtn}>
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListHeaderComponent={
          <>
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

            <View style={styles.calendarContainer}>
              <View style={styles.weekdayRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <Text key={day} style={styles.weekdayText}>{day}</Text>
                ))}
              </View>
              <View style={styles.daysContainer}>
                {[...Array(getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()))].map((_, index) => (
                  <View key={`empty-${index}`} style={styles.dayCell} />
                ))}
                {[...Array(getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()))].map((_, dayIndex) => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayIndex + 1);
                  const isTodayDate = isToday(date);
                  const isSelectedDate = isSelected(date);
                  const tasksOnDate = hasTasks(date);
                  const birthdaysOnDate = getBirthdaysForDate(date);
                  const eventsOnDate = getEventsForDate(date);
                  
                  return (
                    <TouchableOpacity
                      key={dayIndex}
                      style={[
                        styles.dayCell,
                        isSelectedDate && styles.selectedDay,
                        isTodayDate && styles.todayDay,
                        tasksOnDate && styles.hasTaskDay,
                        birthdaysOnDate.length > 0 && styles.hasBirthdayDay
                      ]}
                      onPress={() => handleDateSelect(date)}
                    >
                      <Text style={[styles.dayNumber, isSelectedDate && styles.selectedDayNumber]}>
                        {dayIndex + 1}
                      </Text>
                      <View style={styles.indicatorsRow}>
                        {tasksOnDate && (
                          <View style={styles.taskIndicator} />
                        )}
                        {birthdaysOnDate.map((bday, idx) => (
                          <View 
                            key={idx} 
                            style={[styles.birthdayDot, { backgroundColor: bday.color }]} 
                          />
                        ))}
                        {eventsOnDate.length > 0 && (
                          <View style={[styles.eventDot, { backgroundColor: eventsOnDate[0].color }]} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.selectedDateContainer}>
              <View style={styles.selectedDateLeft}>
                <Text style={styles.dayNameText}>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                </Text>
                <Text style={styles.selectedDateText}>{selectedDate.getDate()}</Text>
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

            {getBirthdaysForDate(selectedDate).length > 0 && (
              <View style={styles.dateBirthdaysSection}>
                {getBirthdaysForDate(selectedDate).map((birthday) => (
                  <TouchableOpacity 
                    key={birthday._id} 
                    style={[styles.dateBirthdayCard, { borderLeftColor: birthday.color }]}
                    onPress={() => router.push(`/birthday-detail?id=${birthday._id}&name=${encodeURIComponent(birthday.name)}&date=${birthday.date}&relation=${encodeURIComponent(birthday.relation || '')}&color=${birthday.color}`)}
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

            {getEventsForDate(selectedDate).length > 0 && (
              <View style={styles.dateBirthdaysSection}>
                {getEventsForDate(selectedDate).map((event) => (
                  <View 
                    key={event._id} 
                    style={[styles.dateBirthdayCard, { borderLeftColor: event.color }]}
                  >
                    <Text style={styles.dateBirthdayIcon}>📅</Text>
                    <View style={styles.dateBirthdayInfo}>
                      <Text style={styles.dateBirthdayName}>{event.title}</Text>
                      {event.time && <Text style={styles.dateBirthdayRelation}>{event.time}</Text>}
                    </View>
                  </View>
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
          !loadingTasks && getSelectedDateTasks().length === 0 ? (
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

      <TouchableOpacity 
        style={[styles.floatingAddButton, { bottom: Math.max(insets.bottom, 10) + 90 }]}
        onPress={handleOpenMenu}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Add Menu Modal */}
      <Modal visible={showAddMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.menuOverlay} onPress={handleCloseMenu}>
          <View style={[styles.addMenu, { bottom: Math.max(insets.bottom, 30) + 160 }]}>
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

      <Modal visible={showTaskModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTask ? 'Edit Task' : 'Add Task'}</Text>
              <TouchableOpacity onPress={() => setShowTaskModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Date Display */}
            <View style={styles.dateDisplay}>
              <Ionicons name="calendar" size={20} color="#00E0C6" />
              <Text style={styles.dateDisplayText}>
                Adding for: {selectedDate.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric',
                  year: 'numeric'
                })}
              </Text>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Task title"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholderTextColor="#999"
            />

            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Description (optional)"
              value={taskDescription}
              onChangeText={setTaskDescription}
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.modalLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {priorityOptions.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles.priorityOption,
                    taskPriority === p.value && { 
                      backgroundColor: p.color + '20',
                      borderColor: p.color 
                    }
                  ]}
                  onPress={() => setTaskPriority(p.value)}
                >
                  <Text>{p.icon}</Text>
                  <Text style={[
                    styles.priorityLabel,
                    taskPriority === p.value && { color: p.color }
                  ]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Time Selection */}
            <Text style={styles.modalLabel}>Time (optional)</Text>
            <TouchableOpacity 
              style={styles.timeSelector}
              onPress={() => setShowTimePicker(true)}
            >
              <Ionicons name="time" size={20} color="#666" />
              <Text style={styles.timeSelectorText}>
                {taskTime || 'Select time (optional)'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.saveButton}
              onPress={editingTask ? handleUpdateTask : handleAddTask}
            >
              <Text style={styles.saveButtonText}>{editingTask ? 'Update' : 'Add'} Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.timePickerModal, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.timeList}>
              {timeSlots.map((time) => (
                <TouchableOpacity
                  key={time}
                  style={[
                    styles.timeOption,
                    taskTime === time && styles.timeOptionSelected
                  ]}
                  onPress={() => {
                    setTaskTime(time);
                    setShowTimePicker(false);
                  }}
                >
                  <Text style={[
                    styles.timeOptionText,
                    taskTime === time && styles.timeOptionTextSelected
                  ]}>
                    {time}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFCFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backButton: { padding: 5 },
  headerContent: { flex: 1 },
  greetingTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  greetingSubtitle: { fontSize: 14, color: '#666' },
  todayButton: { padding: 8 },
  dateNavContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  navButton: { padding: 8 },
  monthYearDisplay: { alignItems: 'center' },
  monthText: { fontSize: 18, fontWeight: '600', color: '#333' },
  yearText: { fontSize: 16, color: '#666' },
  calendarContainer: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginHorizontal: 20, marginTop: 16,
  },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
  weekdayText: { fontSize: 14, fontWeight: '600', color: '#666' },
  daysContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%', aspectRatio: 1, justifyContent: 'flex-start', alignItems: 'center', padding: 4,
  },
  selectedDay: { backgroundColor: '#E3F2FD', borderRadius: 8 },
  todayDay: { borderWidth: 2, borderColor: '#00E0C6', borderRadius: 8 },
  hasTaskDay: { backgroundColor: '#FFF3E0', borderRadius: 8 },
  hasBirthdayDay: { backgroundColor: '#FCE4EC', borderRadius: 8 },
  dayNumber: { fontSize: 16, fontWeight: '600', color: '#333' },
  selectedDayNumber: { color: '#00E0C6' },
  indicatorsRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  taskIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00E0C6' },
  birthdayDot: { width: 6, height: 6, borderRadius: 3 },
  eventDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9500' },
  selectedDateContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff',
  },
  selectedDateLeft: { flexDirection: 'row', alignItems: 'center' },
  dayNameText: { fontSize: 18, color: '#666', marginRight: 12 },
  selectedDateText: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  selectedDateActions: { flexDirection: 'row', alignItems: 'center' },
  actionButton: { padding: 8 },
  dateBirthdaysSection: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff' },
  dateBirthdayCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF9F9',
    borderRadius: 12, padding: 14, borderLeftWidth: 4, marginBottom: 8,
  },
  dateBirthdayIcon: { fontSize: 28, marginRight: 12 },
  dateBirthdayInfo: { flex: 1 },
  dateBirthdayName: { fontSize: 16, fontWeight: '600', color: '#333' },
  dateBirthdayRelation: { fontSize: 13, color: '#666', marginTop: 2 },
  tasksSection: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', marginTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  loadingContainer: { alignItems: 'center', padding: 16 },
  taskListContent: { padding: 12 },
  itemCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, borderLeftWidth: 4,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  checkButton: { padding: 4 },
  itemInfo: { flex: 1, marginLeft: 8 },
  itemTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  itemTitleCompleted: { textDecorationLine: 'line-through', color: '#999' },
  itemSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priorityDot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  priorityDotText: { fontSize: 12 },
  actionBtn: { padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, color: '#999' },
  floatingAddButton: {
    position: 'absolute', right: 20, bottom: 100, width: 60, height: 60,
    borderRadius: 30, backgroundColor: '#00E0C6', justifyContent: 'center', alignItems: 'center',
    elevation: 5, shadowColor: '#00E0C6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    justifyContent: 'space-around', backgroundColor: '#fff', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  navItem: { alignItems: 'center', flex: 1 },
  navItemActive: { alignItems: 'center', flex: 1 },
  navText: { fontSize: 12, marginTop: 4, color: '#888' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#333' },
  modalInput: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#333', marginBottom: 16,
  },
  modalTextArea: { minHeight: 80, textAlignVertical: 'top' },
  modalLabel: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  priorityRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  priorityOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
    borderRadius: 12, borderWidth: 2, borderColor: '#e0e0e0', backgroundColor: '#fff', marginHorizontal: 4,
  },
  priorityLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginLeft: 4 },
  dateDisplay: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3F2FD', borderRadius: 12, 
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16,
  },
  dateDisplayText: { fontSize: 14, color: '#1976D2', marginLeft: 10, fontWeight: '500' },
  timeSelector: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, 
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
  },
  timeSelectorText: { flex: 1, fontSize: 16, color: '#333', marginLeft: 12 },
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  addMenu: {
    position: 'absolute', right: 20, backgroundColor: '#fff', borderRadius: 16, 
    padding: 8, minWidth: 150, elevation: 5, shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12,
  },
  menuItemText: { fontSize: 16, fontWeight: '600' },
  timePickerModal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
    maxHeight: '60%',
  },
  timeList: { maxHeight: 300 },
  timeOption: {
    paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, marginBottom: 8,
    backgroundColor: '#f5f5f5',
  },
  timeOptionSelected: { backgroundColor: '#00E0C6' },
  timeOptionText: { fontSize: 16, color: '#333', textAlign: 'center' },
  timeOptionTextSelected: { color: '#fff', fontWeight: '600' },
  saveButton: {
    backgroundColor: '#00E0C6', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
