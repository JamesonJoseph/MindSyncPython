import React, { useState } from 'react';
import './styles/TaskList.css';

const TaskList = ({ tasks, onEdit, onDelete, onToggleStatus }) => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('datetime');

  const getTypeIcon = (type) => {
    switch (type) {
      case 'event': return '📅';
      case 'task': return '✅';
      case 'birthday': return '🎂';
      default: return '📌';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'event': return '#FF9500';
      case 'task': return '#00E0C6';
      case 'birthday': return '#FF6B6B';
      default: return '#888';
    }
  };

  const formatDateTime = (isoString, allDay) => {
    const date = new Date(isoString);
    const options = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    };
    
    if (!allDay) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    
    return date.toLocaleDateString('en-US', options);
  };

  const formatReminder = (minutes) => {
    if (minutes === 0) return 'At time';
    if (minutes < 60) return `${minutes} min before`;
    if (minutes === 60) return '1 hour before';
    if (minutes < 1440) return `${minutes / 60} hours before`;
    return `${minutes / 1440} day(s) before`;
  };

  const isUpcoming = (datetime) => {
    return new Date(datetime) > new Date();
  };

  const isPast = (datetime) => {
    return new Date(datetime) < new Date();
  };

  const getFilteredTasks = () => {
    let filtered = [...tasks];
    
    // Apply filter
    switch (filter) {
      case 'events':
        filtered = filtered.filter(t => t.type === 'event');
        break;
      case 'tasks':
        filtered = filtered.filter(t => t.type === 'task');
        break;
      case 'birthdays':
        filtered = filtered.filter(t => t.type === 'birthday');
        break;
      case 'upcoming':
        filtered = filtered.filter(t => isUpcoming(t.event_datetime));
        break;
      case 'past':
        filtered = filtered.filter(t => isPast(t.event_datetime));
        break;
      default:
        break;
    }
    
    // Apply sort
    switch (sortBy) {
      case 'datetime':
        filtered.sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime));
        break;
      case 'created':
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'title':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'type':
        filtered.sort((a, b) => a.type.localeCompare(b.type));
        break;
      default:
        break;
    }
    
    return filtered;
  };

  const filteredTasks = getFilteredTasks();

  const handleDelete = (task) => {
    if (window.confirm(`Delete "${task.title}"?`)) {
      onDelete(task.id);
    }
  };

  return (
    <div className="task-list-container">
      {/* Header with Filters */}
      <div className="list-header">
        <h2 className="list-title">My Events & Tasks</h2>
        <div className="list-stats">
          <span className="stat-badge">{tasks.length} total</span>
          <span className="stat-badge upcoming">
            {tasks.filter(t => isUpcoming(t.event_datetime)).length} upcoming
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-row">
        <div className="filter-group">
          <label className="filter-label">Filter:</label>
          <div className="filter-tabs">
            {[
              { value: 'all', label: 'All' },
              { value: 'events', label: 'Events' },
              { value: 'tasks', label: 'Tasks' },
              { value: 'birthdays', label: 'Birthdays' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
            ].map((option) => (
              <button
                key={option.value}
                className={`filter-tab ${filter === option.value ? 'active' : ''}`}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="sort-group">
          <label className="filter-label">Sort:</label>
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="datetime">Date & Time</option>
            <option value="created">Recently Added</option>
            <option value="title">Title</option>
            <option value="type">Type</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="tasks-wrapper">
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <h3 className="empty-title">No items found</h3>
            <p className="empty-text">
              {filter === 'all' 
                ? 'Click the + button to add your first event, task, or birthday!'
                : 'No items match the current filter.'}
            </p>
          </div>
        ) : (
          <div className="tasks-grid">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`task-card ${task.status === 'completed' ? 'completed' : ''} ${
                  isPast(task.event_datetime) ? 'past' : ''
                }`}
                style={{ '--type-color': getTypeColor(task.type) }}
              >
                {/* Type Indicator */}
                <div className="task-type-bar" style={{ backgroundColor: getTypeColor(task.type) }} />
                
                {/* Content */}
                <div className="task-content">
                  <div className="task-header">
                    <span className="task-type-icon">{getTypeIcon(task.type)}</span>
                    <span className="task-type-label">{task.type}</span>
                    {task.allDay && <span className="all-day-badge">All Day</span>}
                  </div>
                  
                  <h3 className={`task-title ${task.status === 'completed' ? 'completed-text' : ''}`}>
                    {task.title}
                  </h3>
                  
                  <div className="task-datetime">
                    <span className="datetime-icon">🕐</span>
                    <span className="datetime-text">{formatDateTime(task.event_datetime, task.allDay)}</span>
                  </div>
                  
                  <div className="task-reminder">
                    <span className="reminder-icon">🔔</span>
                    <span className="reminder-text">{formatReminder(task.reminder_minutes)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="task-actions">
                  <button
                    className="action-btn complete-btn"
                    onClick={() => onToggleStatus(task.id)}
                    title={task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
                  >
                    {task.status === 'completed' ? '↩️' : '✓'}
                  </button>
                  <button
                    className="action-btn edit-btn"
                    onClick={() => onEdit(task)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => handleDelete(task)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskList;
