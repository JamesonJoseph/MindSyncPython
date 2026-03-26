import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
} as any);

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Notifications require a physical device');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission not granted');
    return false;
  }

  // Configure Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('task-reminders', {
      name: 'Task Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00E0C6',
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('event-reminders', {
      name: 'Event Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF9500',
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('birthday-reminders', {
      name: 'Birthday Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
      sound: 'default',
    });
  }

  return true;
}

/**
 * Schedule a local notification for a task/event/birthday
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Additional data to pass
 * @param triggerDate - When to trigger the notification
 * @param type - Type of notification (task, event, birthday)
 */
export async function scheduleNotification(
  title: string,
  body: string,
  data: Record<string, any>,
  triggerDate: Date,
  type: 'task' | 'event' | 'birthday' = 'task'
): Promise<string | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('Cannot schedule notification without permission');
      return null;
    }

    // Don't schedule if the date is in the past
    if (triggerDate <= new Date()) {
      console.log('Cannot schedule notification for past date');
      return null;
    }

    const channelId = Platform.OS === 'android' ? `${type}-reminders` : undefined;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          ...data,
          type,
        },
        sound: 'default',
        ...(channelId && { channelId }),
      },
      trigger: {
        date: triggerDate,
      } as any,
    });

    console.log(`Notification scheduled: ${notificationId} for ${triggerDate.toLocaleString()}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
}

/**
 * Schedule task reminder (30 minutes before by default)
 */
export async function scheduleTaskReminder(
  taskId: string,
  taskTitle: string,
  taskDate: Date,
  reminderMinutes: number = 30
): Promise<string | null> {
  const reminderTime = new Date(taskDate.getTime() - reminderMinutes * 60 * 1000);

  return scheduleNotification(
    '📋 Task Reminder',
    `${taskTitle} - in ${reminderMinutes} minutes`,
    { taskId, taskTitle, reminderMinutes },
    reminderTime,
    'task'
  );
}

/**
 * Schedule event reminder
 */
export async function scheduleEventReminder(
  eventId: string,
  eventTitle: string,
  eventDate: Date,
  reminderMinutes: number = 30
): Promise<string | null> {
  const reminderTime = new Date(eventDate.getTime() - reminderMinutes * 60 * 1000);

  return scheduleNotification(
    '📅 Event Reminder',
    `${eventTitle} - in ${reminderMinutes} minutes`,
    { eventId, eventTitle, reminderMinutes },
    reminderTime,
    'event'
  );
}

/**
 * Schedule birthday reminder
 * For birthdays, we schedule at 9 AM on the day
 */
export async function scheduleBirthdayReminder(
  birthdayId: string,
  name: string,
  birthDate: Date,
  relation?: string
): Promise<string | null> {
  // Set reminder time to 9 AM on the birthday
  const reminderTime = new Date(birthDate);
  reminderTime.setHours(9, 0, 0, 0);

  const relationText = relation ? ` (${relation})` : '';

  return scheduleNotification(
    '🎂 Birthday Today!',
    `Don't forget to wish ${name}${relationText}!`,
    { birthdayId, name, relation },
    reminderTime,
    'birthday'
  );
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`Notification cancelled: ${notificationId}`);
  } catch (error) {
    console.error('Error cancelling notification:', error);
  }
}

/**
 * Cancel all scheduled notifications for a specific item
 */
export async function cancelNotificationsForItem(itemId: string): Promise<void> {
  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    
    for (const notification of scheduledNotifications) {
      if (notification.content.data?.taskId === itemId ||
          notification.content.data?.eventId === itemId ||
          notification.content.data?.birthdayId === itemId) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch (error) {
    console.error('Error cancelling notifications:', error);
  }
}

/**
 * Get all scheduled notifications
 */
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}

/**
 * Add notification response listener
 */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Add notification received listener (when app is in foreground)
 */
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}
