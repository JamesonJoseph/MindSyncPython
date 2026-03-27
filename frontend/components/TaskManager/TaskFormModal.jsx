import React, { useState, useEffect } from 'react';
import './styles/TaskFormModal.css';

const TaskFormModal = ({ isOpen, onClose, onSave, editTask, type }) => {
  const [formData, setFormData] = useState({
    title: '',
    type: 'task',
    allDay: true,
    date: '',
    time: '',
    reminder_minutes: 30,
  });
  const [errors, setErrors] = useState({});
  const [isClosing, setIsClosing] = useState(false);

  const typeOptions = [
    { value: 'event', label: 'Event', icon: '📅' },
    { value: 'task', label: 'Task', icon: '✅' },
    { value: 'birthday', label: 'Birthday', icon: '🎂' },
  ];

  const reminderOptions = [
    { value: 0, label: 'At time' },
    { value: 5, label: '5 min before' },
    { value: 15, label: '15 min before' },
    { value: 30, label: '30 min before' },
    { value: 60, label: '1 hour before' },
    { value: 1440, label: '1 day before' },
  ];

  useEffect(() => {
    if (isOpen) {
      if (editTask) {
        // Parse existing task for editing
        const eventDate = new Date(editTask.event_datetime);
        setFormData({
          title: editTask.title,
          type: editTask.type,
          allDay: editTask.allDay,
          date: eventDate.toISOString().split('T')[0],
          time: editTask.allDay ? '' : eventDate.toTimeString().slice(0, 5),
          reminder_minutes: editTask.reminder_minutes || 30,
        });
      } else {
        // New task with selected type
        const today = new Date();
        setFormData({
          title: '',
          type: type || 'task',
          allDay: true,
          date: today.toISOString().split('T')[0],
          time: '',
          reminder_minutes: 30,
        });
      }
      setErrors({});
      setIsClosing(false);
    }
  }, [isOpen, editTask, type]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (!formData.date) {
      newErrors.date = 'Date is required';
    } else {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formData.date)) {
        newErrors.date = 'Invalid date format (YYYY-MM-DD)';
      }
    }
    
    if (!formData.allDay && !formData.time) {
      newErrors.time = 'Time is required for non-all-day events';
    }
    
    if (!formData.allDay && formData.time) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(formData.time)) {
        newErrors.time = 'Invalid time format (HH:MM)';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateReminders = (eventDatetime) => {
    const reminderMs = formData.reminder_minutes * 60 * 1000;
    const reminderDate = new Date(eventDatetime.getTime() - reminderMs);
    return reminderDate.toISOString();
  };

  const handleSave = () => {
    if (!validateForm()) return;

    // Combine date and time into ISO datetime
    let eventDatetime;
    if (formData.allDay) {
      // Set to start of day for all-day events
      eventDatetime = new Date(`${formData.date}T00:00:00`);
    } else {
      eventDatetime = new Date(`${formData.date}T${formData.time}:00`);
    }

    // Validate that the datetime is valid
    if (isNaN(eventDatetime.getTime())) {
      setErrors({ date: 'Invalid date/time combination' });
      return;
    }

    const reminderDatetime = calculateReminders(eventDatetime);

    const taskData = {
      id: editTask?.id || Date.now(),
      title: formData.title.trim(),
      type: formData.type,
      allDay: formData.allDay,
      event_datetime: eventDatetime.toISOString(),
      reminder_minutes: formData.reminder_minutes,
      reminder_datetime: reminderDatetime,
      created_at: editTask?.created_at || new Date().toISOString(),
      status: editTask?.status || 'pending',
    };

    onSave(taskData);
    handleClose();
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div className={`modal-overlay ${isClosing ? 'closing' : ''}`}>
      <div className={`task-form-modal ${isClosing ? 'closing' : ''}`}>
        {/* Header */}
        <div className="modal-header">
          <button className="close-btn" onClick={handleClose}>
            <span>✕</span>
          </button>
          <h2 className="modal-title">
            {editTask ? 'Edit' : 'Add'} {formData.type.charAt(0).toUpperCase() + formData.type.slice(1)}
          </h2>
          <button className="save-btn" onClick={handleSave}>
            Save
          </button>
        </div>

        {/* Form Content */}
        <div className="modal-content">
          {/* Title Input */}
          <div className="form-group">
            <input
              type="text"
              className={`title-input ${errors.title ? 'error' : ''}`}
              placeholder="Add title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              autoFocus
            />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>

          {/* Type Selector */}
          <div className="form-group">
            <label className="form-label">Type</label>
            <div className="type-selector">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`type-option ${formData.type === option.value ? 'selected' : ''}`}
                  onClick={() => handleInputChange('type', option.value)}
                >
                  <span className="type-icon">{option.icon}</span>
                  <span className="type-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* All Day Toggle */}
          <div className="form-group">
            <div className="toggle-row">
              <label className="form-label">All Day</label>
              <button
                className={`toggle-switch ${formData.allDay ? 'on' : ''}`}
                onClick={() => handleInputChange('allDay', !formData.allDay)}
              >
                <span className="toggle-slider" />
              </button>
            </div>
          </div>

          {/* Date Input */}
          <div className="form-group">
            <label className="form-label">Date</label>
            <div className="datetime-row">
              <input
                type="date"
                className={`date-input ${errors.date ? 'error' : ''}`}
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
              />
              <input
                type="text"
                className="date-text-input"
                placeholder="YYYY-MM-DD"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
              />
            </div>
            {errors.date && <span className="error-text">{errors.date}</span>}
          </div>

          {/* Time Input (when not all day) */}
          {!formData.allDay && (
            <div className="form-group">
              <label className="form-label">Time</label>
              <div className="datetime-row">
                <input
                  type="time"
                  className={`time-input ${errors.time ? 'error' : ''}`}
                  value={formData.time}
                  onChange={(e) => handleInputChange('time', e.target.value)}
                />
                <input
                  type="text"
                  className="time-text-input"
                  placeholder="HH:MM"
                  value={formData.time}
                  onChange={(e) => handleInputChange('time', e.target.value)}
                />
              </div>
              {errors.time && <span className="error-text">{errors.time}</span>}
            </div>
          )}

          {/* Reminder Selector */}
          <div className="form-group">
            <label className="form-label">Reminder</label>
            <select
              className="reminder-select"
              value={formData.reminder_minutes}
              onChange={(e) => handleInputChange('reminder_minutes', parseInt(e.target.value))}
            >
              {reminderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskFormModal;
