import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCircle2, XCircle } from 'lucide-react'; // Added icons
import { logout, getCurrentUser, api } from '../../services/authService'; // Ensure api is imported

const Header = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  
  // State for notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationRef = useRef(null);

  const displayName = user?.username ? user.username.toUpperCase() : 'GUEST';

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
    
    // Optional: Poll every 30 seconds for new updates
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/staff/notifications'); // Adjust path based on your route prefix
      if (res.data.status === 'success') {
        setNotifications(res.data.data);
        // Logic to determine "unread" - for now, we just count all. 
        // In a real app, you'd save 'lastReadTime' in local storage or DB.
        setUnreadCount(res.data.data.length); 
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  };

  const handleNotificationClick = () => {
    setShowNotifications(!showNotifications);
    // When opening, we can technically mark them as read visually
    if (!showNotifications) {
      setUnreadCount(0); 
    }
  };

  const handleHome = () => navigate('/staff/dashboard');
  const handleAttendance = () => navigate('/staff/attendance');
  
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      navigate('/login');
    }
  };

  return (
    <header className="bg-blue-600 text-white p-4 flex justify-between items-center shadow-md relative z-50">
      <h1 className="text-xl font-bold flex items-center gap-2">
        HI, {displayName} 👋
      </h1>

      <nav className="flex items-center space-x-4">
        <button onClick={handleHome} className="px-3 py-2 rounded-md hover:bg-blue-700 transition-colors">
          Home
        </button>
        
        <button onClick={handleAttendance} className="px-3 py-2 rounded-md hover:bg-blue-700 transition-colors">
          Attendance
        </button>

        {/* Notification Bell Section */}
        <div className="relative" ref={notificationRef}>
          <button 
            onClick={handleNotificationClick}
            className="p-2 rounded-full hover:bg-blue-700 transition-colors relative"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-blue-600 animate-pulse"></span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 bg-white text-gray-800 rounded-xl shadow-2xl border border-gray-100 overflow-hidden transform origin-top-right transition-all">
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-sm text-gray-700">Notifications</h3>
                <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
              
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div key={notif.requestId} className="p-4 border-b hover:bg-gray-50 transition-colors flex gap-3 items-start">
                      <div className="mt-1">
                        {notif.status === 'ACCEPTED' ? (
                          <CheckCircle2 className="text-green-500" size={18} />
                        ) : (
                          <XCircle className="text-red-500" size={18} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {notif.status === 'ACCEPTED' ? 'Request Accepted!' : 'Request Rejected'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Your request for <span className="font-bold">{notif.courseCode} - {notif.courseTitle}</span> was {notif.status.toLowerCase()}.
                        </p>
                        <p className="text-[10px] text-gray-400 mt-2">
                          {new Date(notif.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {/* End Notification Section */}

        <button onClick={handleLogout} className="px-4 py-2 bg-red-500 rounded-md hover:bg-red-600 transition-colors text-sm font-medium shadow-sm">
          Logout
        </button>
      </nav>
    </header>
  );
};

export default Header;