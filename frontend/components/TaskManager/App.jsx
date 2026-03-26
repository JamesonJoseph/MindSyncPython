import React, { useState, useEffect, useCallback } from 'react';
import AddButton from './AddButton';
import TaskFormModal from './TaskFormModal';
import TaskList from './TaskList';
import './styles/App.css';

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

// Notification Manager
const NotificationManager = {
  checkPermission: async () => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        return await Notification.requestPermission();
      }
      return Notification.permission;
    }
    return 'denied';
  },

  schedule: (task) => {
    if (!task.reminder_datetime) return;

    const reminderTime = new Date(task.reminder_datetime);
    const now = new Date();
    const delay = reminderTime.getTime() - now.getTime();

    if (delay <= 0) return; // Already past

    setTimeout(() => {
      NotificationManager.show(task);
    }, delay);
  },

  show: (task) => {
    const permission = Notification.permission;
    if (permission === 'granted') {
      const notification = new Notification(`${task.type.charAt(0).toUpperCase() + task.type.slice(1)} Reminder`, {
        body: task.title,
        icon: task.type === 'birthday' ? '🎂' : task.type === 'event' ? '📅' : '✅',
        tag: `task-${task.id}`,
        requireInteraction: true,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  },

  scheduleAll: (tasks) => {
    tasks.forEach(task => {
      if (task.status !== 'completed') {
        NotificationManager.schedule(task);
      }
    });
  }
};

// API Service
const TaskService = {
  getAuthHeaders: async () => {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Try to get Firebase token if available
    try {
      const { auth } = await import('../../firebaseConfig');
      if (auth?.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (e) {
      // Firebase not available, proceed without auth
    }
    
    return headers;
  },

  fetchAll: async () => {
    try {
      const headers = await TaskService.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks`, { headers });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return await response.json();
    } catch (error) {
      console.error('API fetch error:', error);
      return null;
    }
  },

  create: async (task) => {
    try {
      const headers = await TaskService.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(task),
      });
      if (!response.ok) throw new Error('Failed to create task');
      return await response.json();
    } catch (error) {
      console.error('API create error:', error);
      return null;
    }
  },

  update: async (id, task) => {
    try {
      const headers = await TaskService.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(task),
      });
      if (!response.ok) throw new Error('Failed to update task');
      return await response.json();
    } catch (error) {
      console.error('API update error:', error);
      return null;
    }
  },

  delete: async (id) => {
    try {
      const headers = await TaskService.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw new Error('Failed to delete task');
      return true;
    } catch (error) {
      console.error('API delete error:', error);
      return false;
    }
  }
};

// Local Storage Service
const LocalStorageService = {
  KEY: 'mindsync_tasks',

  getAll: () => {
    try {
      const data = localStorage.getItem(LocalStorageService.KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('localStorage read error:', error);
      return [];
    }
  },

  save: (tasks) => {
    try {
      localStorage.setItem(LocalStorageService.KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('localStorage save error:', error);
    }
  },

  add: (task) => {
    const tasks = LocalStorageService.getAll();
    // Prevent duplicates
    const exists = tasks.some(t => 
      t.title === task.title && 
      t.event_datetime === task.event_datetime
    );
    if (!exists) {
      tasks.push(task);
      LocalStorageService.save(tasks);
    }
    return tasks;
  },

  update: (id, updatedTask) => {
    const tasks = LocalStorageService.getAll();
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...updatedTask };
      LocalStorageService.save(tasks);
    }
    return tasks;
  },

  remove: (id) => {
    let tasks = LocalStorageService.getAll();
    tasks = tasks.filter(t => t.id !== id);
    LocalStorageService.save(tasks);
    return tasks;
  },

  toggleStatus: (id) => {
    const tasks = LocalStorageService.getAll();
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks[index].status = tasks[index].status === 'completed' ? 'pending' : 'completed';
      LocalStorageService.save(tasks);
    }
    return tasks;
  }
};

// Main App Component
const TaskManagerApp = () => {
  const [tasks, setTasks] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('task');
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load tasks on mount
  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      
      // Load from localStorage first (immediate)
      const localTasks = LocalStorageService.getAll();
      setTasks(localTasks);
      
      // Then try to sync with backend
      const apiTasks = await TaskService.fetchAll();
      if (apiTasks && apiTasks.length > 0) {
        // Merge API tasks with local tasks, avoiding duplicates
        const mergedTasks = mergeTasks(localTasks, apiTasks);
        LocalStorageService.save(mergedTasks);
        setTasks(mergedTasks);
      }
      
      setIsLoading(false);
      
      // Request notification permission
      NotificationManager.checkPermission();
    };

    loadTasks();
  }, []);

  // Schedule notifications when tasks change
  useEffect(() => {
    if (tasks.length > 0) {
      NotificationManager.scheduleAll(tasks);
    }
  }, [tasks]);

  // Merge local and API tasks
  const mergeTasks = (local, api) => {
    const merged = [...local];
    api.forEach(apiTask => {
      const exists = merged.some(t => 
        t.id === apiTask.id || 
        (t.title === apiTask.title && t.event_datetime === apiTask.event_datetime)
      );
      if (!exists) {
        merged.push(apiTask);
      }
    });
    return merged;
  };

  // Handle opening form for new task type
  const handleSelectType = useCallback((type) => {
    setSelectedType(type);
    setEditingTask(null);
    setIsModalOpen(true);
  }, []);

  // Handle edit
  const handleEdit = useCallback((task) => {
    setEditingTask(task);
    setSelectedType(task.type);
    setIsModalOpen(true);
  }, []);

  // Handle save
  const handleSave = useCallback(async (taskData) => {
    let updatedTasks;
    
    if (editingTask) {
      // Update existing task
      updatedTasks = LocalStorageService.update(editingTask.id, taskData);
      await TaskService.update(editingTask.id, taskData);
    } else {
      // Add new task
      updatedTasks = LocalStorageService.add(taskData);
      await TaskService.create(taskData);
    }
    
    setTasks(updatedTasks);
    setIsModalOpen(false);
    setEditingTask(null);
    
    // Schedule notification for new/updated task
    NotificationManager.schedule(taskData);
  }, [editingTask]);

  // Handle delete
  const handleDelete = useCallback(async (taskId) => {
    const updatedTasks = LocalStorageService.remove(taskId);
    setTasks(updatedTasks);
    await TaskService.delete(taskId);
  }, []);

  // Handle toggle status
  const handleToggleStatus = useCallback((taskId) => {
    const updatedTasks = LocalStorageService.toggleStatus(taskId);
    setTasks(updatedTasks);
    const task = updatedTasks.find(t => t.id === taskId);
    if (task) {
      TaskService.update(taskId, task);
    }
  }, []);

  // Handle close modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingTask(null);
  }, []);

  return (
    <div className="task-manager-app">
      <div className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="title-icon">📋</span>
            Task & Event Manager
          </h1>
          <p className="app-subtitle">Manage your tasks, events, and birthdays</p>
        </div>
      </div>

      <main className="app-main">
        {isLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading tasks...</p>
          </div>
        ) : (
          <TaskList
            tasks={tasks}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleStatus={handleToggleStatus}
          />
        )}
      </main>

      <AddButton onSelectType={handleSelectType} />

      <TaskFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        editTask={editingTask}
        type={selectedType}
      />
    </div>
  );
};

export default TaskManagerApp;
