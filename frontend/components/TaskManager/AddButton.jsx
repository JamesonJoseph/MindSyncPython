import React, { useState, useEffect } from 'react';
import './styles/AddButton.css';

const AddButton = ({ onSelectType }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const menuItems = [
    { type: 'event', icon: '📅', label: 'Event', color: '#FF9500' },
    { type: 'task', icon: '✅', label: 'Task', color: '#00E0C6' },
    { type: 'birthday', icon: '🎂', label: 'Birthday', color: '#FF6B6B' },
  ];

  const handleToggle = () => {
    if (!isOpen) {
      setIsOpen(true);
      setIsAnimating(true);
    } else {
      setIsAnimating(false);
      setTimeout(() => setIsOpen(false), 300);
    }
  };

  const handleSelect = (type) => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsOpen(false);
      onSelectType(type);
    }, 200);
  };

  return (
    <div className="add-button-container">
      {/* Menu */}
      <div className={`menu-overlay ${isOpen ? 'visible' : ''}`} onClick={handleToggle} />
      
      <div className={`task-type-menu ${isOpen ? 'open' : ''} ${isAnimating ? 'animating' : ''}`}>
        {menuItems.map((item, index) => (
          <button
            key={item.type}
            className="menu-item"
            style={{ 
              '--item-color': item.color,
              '--item-delay': `${index * 0.1}s`
            }}
            onClick={() => handleSelect(item.type)}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Floating Button */}
      <button 
        className={`floating-add-button ${isOpen ? 'active' : ''}`}
        onClick={handleToggle}
        aria-label="Add new item"
      >
        <span className="button-icon">+</span>
      </button>
    </div>
  );
};

export default AddButton;
