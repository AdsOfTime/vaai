import React, { useState, useEffect } from 'react';
import './EnhancedUI.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://vaai-backend-worker.dnash29.workers.dev';

function App() {
  // Core state management
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  
  // Data states
  const [emails, setEmails] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [emailCategories, setEmailCategories] = useState({
    priority: 0,
    work: 0,
    personal: 0
  });
  const [dailyFocus, setDailyFocus] = useState({
    priority: 'Loading your daily priorities...',
    meetings: 0,
    emails: 0,
    tasks: 0
  });

  // AI Assistant state
  const [assistantMessages, setAssistantMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your AI assistant. How can I help you today?' }
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);

  // Google Docs & Sheets state
  const [googleDocs, setGoogleDocs] = useState([]);
  const [googleSheets, setGoogleSheets] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  // Favorites state
  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);

  // Calendar interaction states
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showNewMeetingForm, setShowNewMeetingForm] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('vaai_token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const userData = await response.json();
        if (userData && !userData.error) {
          setUser(userData.user);
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
    
    // No authenticated user found or invalid token - clear and show login
    localStorage.removeItem('vaai_token');
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/google`);
      if (response.ok) {
        const data = await response.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      }
    } catch (error) {
      console.error('Failed to initiate Google login:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vaai_token');
    setUser(null);
    setEmails([]);
    setCalendar([]);
    setTasks([]);
    setCurrentView('dashboard');
  };

  const generateDailyFocus = (emailsData, calendarData, tasksData) => {
    const emailCount = Array.isArray(emailsData) ? emailsData.length : 0;
    const meetingCount = Array.isArray(calendarData) ? calendarData.length : 0;
    const taskCount = Array.isArray(tasksData) ? tasksData.length : 0;

    // Calculate email categories
    let priorityEmails = 0, workEmails = 0, personalEmails = 0;
    if (Array.isArray(emailsData)) {
      priorityEmails = emailsData.filter(email => email.category === 'priority').length;
      workEmails = emailsData.filter(email => email.category === 'work').length;
      personalEmails = emailsData.filter(email => email.category === 'personal').length;
    }

    setEmailCategories({
      priority: priorityEmails,
      work: workEmails,
      personal: personalEmails
    });

    let priority = 'Your inbox is clear - great job!';
    
    if (meetingCount > 0) {
      priority = `Focus on ${meetingCount} upcoming meeting${meetingCount > 1 ? 's' : ''} today`;
    } else if (priorityEmails > 0) {
      priority = `${priorityEmails} priority email${priorityEmails > 1 ? 's' : ''} need${priorityEmails === 1 ? 's' : ''} your attention`;
    } else if (emailCount > 5) {
      priority = `Process ${emailCount} emails to reach inbox zero`;
    } else if (taskCount > 0) {
      priority = `Complete ${taskCount} pending task${taskCount > 1 ? 's' : ''}`;
    } else if (emailCount > 0) {
      priority = `Review ${emailCount} recent email${emailCount > 1 ? 's' : ''}`;
    }

    return {
      priority,
      meetings: meetingCount,
      emails: emailCount,
      tasks: taskCount
    };
  };

  const handleRefreshCalendar = async () => {
    setCalendarLoading(true);
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      const response = await fetch(`${API_BASE_URL}/api/calendar/events`, { headers });
      if (response.ok) {
        const data = await response.json();
        setCalendar(data?.events || []);
        
        // Show success feedback
        const focus = generateDailyFocus(emails, data?.events || [], tasks);
        setDailyFocus(focus);
      }
    } catch (error) {
      console.error('Failed to refresh calendar:', error);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleScheduleMeeting = () => {
    // Navigate to dashboard and populate AI assistant with scheduling guidance
    setCurrentView('dashboard');
    setAssistantInput('Schedule a meeting for me');
    setAssistantMessages(prev => [...prev, {
      role: 'assistant',
      content: 'I can help you schedule a new meeting! Use the AI Assistant below and provide these details:\n\n📝 **Meeting title** (e.g., "Team standup")\n🕒 **Date and time** (e.g., "November 6, 2025 at 8:00 PM")\n⏱️ **Duration** (e.g., "30 minutes")\n👥 **Attendees** (optional - email addresses)\n📍 **Location** (optional - or say "Google Meet" for video call)\n\n**Example:** "Schedule a team standup on November 6, 2025 at 9:00 AM for 30 minutes"\n\n**Tip:** Be specific with the date and time to avoid confusion!'
    }]);
  };

  const handleCalendarSettings = () => {
    // Open Google Calendar in a new tab for now
    window.open('https://calendar.google.com/calendar/u/0/r/settings', '_blank');
  };

  const handleRefreshTasks = async () => {
    setCalendarLoading(true);
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      const response = await fetch(`${API_BASE_URL}/api/tasks`, { headers });
      if (response.ok) {
        const data = await response.json();
        setTasks(data?.tasks || []);
      }
    } catch (error) {
      console.error('Failed to refresh tasks:', error);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleCreateTask = async (title) => {
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      const response = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title })
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(prev => Array.isArray(prev) ? [...prev, data.task] : [data.task]);
      }
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleToggleTask = async (taskId, completed) => {
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ 
          status: completed ? 'completed' : 'needsAction' 
        })
      });

      if (response.ok) {
        setTasks(prev => Array.isArray(prev) ? prev.map(task => 
          task.id === taskId 
            ? { ...task, status: completed ? 'completed' : 'needsAction' }
            : task
        ) : []);
      }
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };

      // Note: Google Tasks API doesn't have a delete endpoint, so we'll mark as completed
      const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ 
          status: 'completed',
          title: '[DELETED] ' + (tasks.find(t => t.id === taskId)?.title || 'Task')
        })
      });

      if (response.ok) {
        setTasks(prev => Array.isArray(prev) ? prev.filter(task => task.id !== taskId) : []);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  // Handle OAuth callback when user returns from Google
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code) {
        try {
          const response = await fetch(`${API_BASE_URL}/auth/google/callback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, state })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.token) {
              localStorage.setItem('vaai_token', data.token);
              setUser(data.user);
              // Clear URL parameters
              window.history.replaceState({}, document.title, window.location.pathname);
            } else {
              console.error('OAuth callback failed:', data.error);
            }
          }
        } catch (error) {
          console.error('OAuth callback error:', error);
        }
        setLoading(false);
      }
    };

    handleOAuthCallback();
  }, []);

  const loadData = async () => {
    const token = localStorage.getItem('vaai_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    try {
      // Try to load real data from APIs first
      const [emailRes, calendarRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/emails`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/api/calendar/events`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/api/tasks`, { headers }).catch(() => null)
      ]);

      let hasRealData = false;

      if (emailRes?.ok && emailRes.headers.get('content-type')?.includes('application/json')) {
        const emailData = await emailRes.json();
        // Backend returns { emails: [...] }, we need the emails array
        setEmails(emailData?.emails || []);
        hasRealData = true;
      }

      if (calendarRes?.ok && calendarRes.headers.get('content-type')?.includes('application/json')) {
        const calendarData = await calendarRes.json();
        // Backend returns { events: [...] }, we need the events array
        setCalendar(calendarData?.events || []);
        hasRealData = true;
      }

      if (tasksRes?.ok && tasksRes.headers.get('content-type')?.includes('application/json')) {
        const tasksData = await tasksRes.json();
        // Backend returns { tasks: [...] }, we need the tasks array
        setTasks(tasksData?.tasks || []);
        hasRealData = true;
      }

      // Use demo data if no real APIs worked
      if (!hasRealData) {
        console.log('Loading demo data - APIs not available');
        setEmails([
          { id: 1, subject: 'Q4 Budget Review Meeting', from: 'sarah@company.com', category: 'priority', time: '2 hours ago' },
          { id: 2, subject: 'Project Deadline Extension', from: 'mike@client.com', category: 'priority', time: '4 hours ago' },
          { id: 3, subject: 'Team Standup Notes', from: 'team@company.com', category: 'work', time: '1 hour ago' }
        ]);
        
        setCalendar([
          { id: 1, summary: 'Daily Standup', start: { dateTime: '2025-11-06T09:00:00' }, end: { dateTime: '2025-11-06T09:30:00' } },
          { id: 2, summary: 'Client Review', start: { dateTime: '2025-11-06T14:00:00' }, end: { dateTime: '2025-11-06T15:00:00' } },
          { id: 3, summary: 'Team Planning', start: { dateTime: '2025-11-06T16:00:00' }, end: { dateTime: '2025-11-06T16:45:00' } }
        ]);
        
        setTasks([
          { id: 1, title: 'Complete quarterly review', status: 'needsAction' },
          { id: 2, title: 'Update project documentation', status: 'needsAction' },
          { id: 3, title: 'Review code changes', status: 'completed' }
        ]);
      }

      // Update daily focus based on loaded data
      const focus = generateDailyFocus(emails, calendar, tasks);
      setDailyFocus(focus);

      // Load Google Docs and Sheets
      loadGoogleDocs();
      loadGoogleSheets();
      
      // Load favorites
      loadFavorites();
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadGoogleDocs = async () => {
    if (!user) return;
    
    setDocsLoading(true);
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const response = await fetch(`${API_BASE_URL}/api/googledocs`, { headers });
      if (response.ok) {
        const docs = await response.json();
        setGoogleDocs(docs);
      } else {
        console.error('Failed to load Google Docs:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to load Google Docs:', error);
    } finally {
      setDocsLoading(false);
    }
  };

  const loadGoogleSheets = async () => {
    if (!user) return;
    
    setSheetsLoading(true);
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const response = await fetch(`${API_BASE_URL}/api/googlesheets`, { headers });
      if (response.ok) {
        const sheets = await response.json();
        setGoogleSheets(sheets);
      } else {
        console.error('Failed to load Google Sheets:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to load Google Sheets:', error);
    } finally {
      setSheetsLoading(false);
    }
  };

  const createGoogleDoc = async (title) => {
    if (!user || !title) return;
    
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const response = await fetch(`${API_BASE_URL}/api/googledocs/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title })
      });
      
      if (response.ok) {
        const newDoc = await response.json();
        setGoogleDocs(prev => [newDoc, ...prev]);
        return newDoc;
      } else {
        console.error('Failed to create Google Doc:', response.status, await response.text());
        throw new Error('Failed to create document');
      }
    } catch (error) {
      console.error('Failed to create Google Doc:', error);
    }
  };

  const createGoogleSheet = async (title) => {
    if (!user || !title) return;
    
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const response = await fetch(`${API_BASE_URL}/api/googlesheets/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title })
      });
      
      if (response.ok) {
        const newSheet = await response.json();
        setGoogleSheets(prev => [newSheet, ...prev]);
        return newSheet;
      } else {
        console.error('Failed to create Google Sheet:', response.status, await response.text());
        throw new Error('Failed to create spreadsheet');
      }
    } catch (error) {
      console.error('Failed to create Google Sheet:', error);
    }
  };

  // Favorites functions
  const loadFavorites = async () => {
    if (!user) return;
    
    console.log('Loading favorites for user:', user);
    setFavoritesLoading(true);
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const response = await fetch(`${API_BASE_URL}/api/favorites`, { headers });
      console.log('Favorites response:', response.status);
      if (response.ok) {
        const favs = await response.json();
        console.log('Loaded favorites:', favs);
        setFavorites(favs);
      } else {
        console.error('Failed to load favorites:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setFavoritesLoading(false);
    }
  };

  const addToFavorites = async (command, description = '') => {
    if (!user || !command) return;
    
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const response = await fetch(`${API_BASE_URL}/api/favorites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, description })
      });
      
      if (response.ok) {
        const newFavorite = await response.json();
        setFavorites(prev => [newFavorite, ...prev]);
        return newFavorite;
      } else {
        console.error('Failed to add favorite:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to add favorite:', error);
    }
  };

  const removeFromFavorites = async (favoriteId) => {
    if (!user || !favoriteId) return;
    
    try {
      const token = localStorage.getItem('vaai_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const response = await fetch(`${API_BASE_URL}/api/favorites/${favoriteId}`, {
        method: 'DELETE',
        headers
      });
      
      if (response.ok) {
        setFavorites(prev => prev.filter(fav => fav.id !== favoriteId));
      } else {
        console.error('Failed to remove favorite:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to remove favorite:', error);
    }
  };

  const isCommandFavorite = (command) => {
    return favorites.some(fav => fav.command === command);
  };

  const getFavoriteId = (command) => {
    const favorite = favorites.find(fav => fav.command === command);
    return favorite?.id;
  };

  const isFavorite = (command) => {
    const result = isCommandFavorite(command);
    console.log('isFavorite check:', command, result, favorites.length);
    return result;
  };

  const toggleFavorite = async (command) => {
    console.log('toggleFavorite called:', command);
    if (isFavorite(command)) {
      const favoriteId = getFavoriteId(command);
      if (favoriteId) {
        console.log('Removing favorite:', favoriteId);
        await removeFromFavorites(favoriteId);
      }
    } else {
      console.log('Adding favorite:', command);
      await addToFavorites(command);
    }
  };

  const removeFavorite = async (favoriteId) => {
    await removeFromFavorites(favoriteId);
  };

  const sendAssistantMessage = async () => {
    if (!assistantInput.trim() || assistantLoading) return;
    
    const token = localStorage.getItem('vaai_token');
    const newMessage = { role: 'user', content: assistantInput };
    setAssistantMessages(prev => [...prev, newMessage]);
    setAssistantInput('');
    setAssistantLoading(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/assistant`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ 
          message: assistantInput,
          conversation: [...assistantMessages, newMessage],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          context: {
            emails: Array.isArray(emails) ? emails : [],
            calendar: Array.isArray(calendar) ? calendar : [],
            tasks: Array.isArray(tasks) ? tasks : []
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAssistantMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.response }]);
      } else {
        console.error('Assistant API error:', response.status, response.statusText);
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Assistant API response:', errorText);
        setAssistantMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'I\'m sorry, I\'m having trouble connecting right now. Please try again later.' 
        }]);
      }
    } catch (error) {
      console.error('Assistant network error:', error);
      setAssistantMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'I\'m sorry, I\'m having trouble connecting right now. Please try again later.' 
      }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <div style={{ fontSize: '18px' }}>Loading VAAI...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '24px',
          padding: '48px',
          textAlign: 'center',
          maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔍</div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '800',
            marginBottom: '12px',
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Welcome to VAAI
          </h1>
          <p style={{
            color: '#64748b',
            marginBottom: '32px',
            fontSize: '16px'
          }}>
            Your premium AI productivity assistant with beautiful navy blue theme.
          </p>
          <button 
            onClick={handleGoogleLogin}
            style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              color: 'white',
              border: 'none',
              padding: '16px 32px',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
              transition: 'transform 0.2s ease'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            🔐 Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const renderSidebar = () => (
    <div style={{
      width: '280px',
      background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.1)'
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontSize: '24px',
            fontWeight: '800',
            color: 'white',
            marginBottom: '4px'
          }}>VAAI</div>
          <div style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.6)'
          }}>Premium AI Assistant</div>
        </div>
        <div style={{
          background: 'rgba(96, 165, 250, 0.2)',
          color: '#60a5fa',
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: '600'
        }}>
          PREMIUM
        </div>
      </div>

      {/* Search */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ position: 'relative' }}>
          <input 
            type="text" 
            placeholder="Search..." 
            style={{
              width: '100%',
              padding: '12px 40px 12px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <span style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.5)'
          }}>🔍</span>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '20px 0', flex: 1 }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '0 20px 12px'
          }}>Workspace</div>
          <div>
            {[
              { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
              { id: 'inbox', icon: '📧', label: 'Smart Inbox', badge: Array.isArray(emails) ? emails.length : '12' },
              { id: 'calendar', icon: '📅', label: 'Calendar', badge: Array.isArray(calendar) ? calendar.length : '5' },
              { id: 'tasks', icon: '✅', label: 'Tasks', badge: Array.isArray(tasks) ? tasks.length : '8' }
            ].map(item => (
              <div 
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 20px',
                  color: currentView === item.id ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                  background: currentView === item.id ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  borderRight: currentView === item.id ? '3px solid #3b82f6' : '3px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span style={{
                    background: currentView === item.id ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                    color: currentView === item.id ? 'white' : 'rgba(255,255,255,0.8)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    minWidth: '20px',
                    textAlign: 'center'
                  }}>{item.badge}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '0 20px 12px'
          }}>AI Tools</div>
          <div>
            {[
              { id: 'docs', icon: '📝', label: 'Google Docs' },
              { id: 'sheets', icon: '📊', label: 'Google Sheets' },
              { id: 'compose', icon: '✍️', label: 'Email Composer' },
              { id: 'analyzer', icon: '📈', label: 'Data Analysis' }
            ].map(item => (
              <div 
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 20px',
                  color: currentView === item.id ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                  background: currentView === item.id ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                  borderRight: currentView === item.id ? '3px solid #3b82f6' : '3px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* User Profile */}
      <div style={{
        padding: '20px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px'
        }}>
          👤
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
            {user?.email || 'user@vaai.com'}
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            color: 'white',
            padding: '6px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255,255,255,0.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255,255,255,0.1)';
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh',
      background: '#f8fafc'
    }}>
      {renderSidebar()}
      
      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top Header */}
        <header style={{
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '24px', 
              fontWeight: '700', 
              color: '#1e293b'
            }}>
              {currentView === 'dashboard' && 'Dashboard'}
              {currentView === 'inbox' && 'Smart Inbox'}
              {currentView === 'calendar' && 'Calendar'}
              {currentView === 'tasks' && 'Tasks'}
              {currentView === 'docs' && 'Google Docs'}
              {currentView === 'sheets' && 'Google Sheets'}
              {currentView === 'assistant' && 'AI Assistant'}
              {currentView === 'compose' && 'Email Composer'}
              {currentView === 'analyzer' && 'Data Analysis'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </span>
          </div>
        </header>

        {/* Main Content Area */}
        <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
          {currentView === 'dashboard' && (
            <div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                gap: '24px',
                marginBottom: '32px'
              }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                  color: 'white',
                  padding: '24px',
                  borderRadius: '16px'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '20px' }}>🎯 Daily Focus</h3>
                  <p style={{ margin: '0 0 16px 0', opacity: 0.9 }}>Your AI-curated priority for today</p>
                  <div style={{ 
                    background: 'rgba(255,255,255,0.2)', 
                    padding: '16px', 
                    borderRadius: '12px',
                    fontWeight: '600'
                  }}>
                    {dailyFocus.priority}
                  </div>
                </div>
                
                <div style={{ 
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  padding: '24px',
                  borderRadius: '16px'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#1e293b' }}>📧 Smart Inbox</h3>
                  <p style={{ margin: '0 0 16px 0', color: '#64748b' }}>{Array.isArray(emails) ? emails.length : 0} unread emails organized by AI</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {emailCategories.priority > 0 && (
                      <span style={{ background: '#dc2626', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>
                        Priority ({emailCategories.priority})
                      </span>
                    )}
                    {emailCategories.work > 0 && (
                      <span style={{ background: '#3b82f6', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>
                        Work ({emailCategories.work})
                      </span>
                    )}
                    {emailCategories.personal > 0 && (
                      <span style={{ background: '#059669', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>
                        Personal ({emailCategories.personal})
                      </span>
                    )}
                    {emailCategories.priority === 0 && emailCategories.work === 0 && emailCategories.personal === 0 && (
                      <span style={{ background: '#64748b', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>
                        All caught up! 🎉
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ 
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  padding: '24px',
                  borderRadius: '16px'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#1e293b' }}>📅 Calendar</h3>
                  <p style={{ margin: '0 0 16px 0', color: '#64748b' }}>{Array.isArray(calendar) ? calendar.length : 0} meetings today</p>
                  {(Array.isArray(calendar) ? calendar : []).slice(0, 2).map(meeting => {
                    const startTime = meeting.start?.dateTime || meeting.start?.date;
                    const endTime = meeting.end?.dateTime || meeting.end?.date;
                    let timeDisplay = 'Time TBD';
                    
                    if (startTime) {
                      const start = new Date(startTime);
                      const end = new Date(endTime);
                      const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      const duration = Math.round((end - start) / (1000 * 60));
                      timeDisplay = `${timeStr} • ${duration} min`;
                    }
                    
                    return (
                      <div key={meeting.id} style={{ 
                        padding: '8px 0', 
                        borderBottom: '1px solid #f1f5f9',
                        fontSize: '14px'
                      }}>
                        <div style={{ fontWeight: '600', color: '#1e293b' }}>
                          {meeting.summary || meeting.title || 'Untitled Meeting'}
                        </div>
                        <div style={{ color: '#64748b' }}>{timeDisplay}</div>
                      </div>
                    );
                  })}
                  {(!Array.isArray(calendar) || calendar.length === 0) && (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                      No meetings scheduled today 📅
                    </div>
                  )}
                </div>

                {/* AI Assistant Card */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '24px',
                  borderRadius: '16px',
                  gridColumn: '1 / -1'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>🤖 AI Assistant</h3>
                      <p style={{ margin: '0', opacity: 0.9, fontSize: '14px' }}>Ask me anything about your work, emails, and schedule</p>
                    </div>
                  </div>
                  
                  {/* Mini Chat Interface */}
                  <div style={{ 
                    background: 'rgba(255,255,255,0.1)', 
                    borderRadius: '12px', 
                    padding: '16px',
                    marginBottom: '16px',
                    minHeight: '120px',
                    maxHeight: '120px',
                    overflowY: 'auto'
                  }}>
                    {assistantMessages.length === 0 ? (
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontStyle: 'italic' }}>
                        Start a conversation with your AI assistant...
                      </div>
                    ) : (
                      assistantMessages.slice(-2).map((message, index) => (
                        <div key={index} style={{
                          marginBottom: '8px',
                          fontSize: '13px',
                          opacity: message.role === 'user' ? 0.8 : 1
                        }}>
                          <strong>{message.role === 'user' ? '👤' : '🤖'}:</strong> {message.content.slice(0, 100)}{message.content.length > 100 ? '...' : ''}
                        </div>
                      ))
                    )}
                    {assistantLoading && (
                      <div style={{ fontSize: '13px' }}>
                        <strong>🤖:</strong> Thinking...
                      </div>
                    )}
                  </div>
                  
                  {/* Quick Input */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={assistantInput}
                      onChange={(e) => setAssistantInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendAssistantMessage()}
                      placeholder="Ask me anything..."
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      onClick={sendAssistantMessage}
                      disabled={assistantLoading || !assistantInput.trim()}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: 'white',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        cursor: assistantLoading || !assistantInput.trim() ? 'not-allowed' : 'pointer',
                        opacity: assistantLoading || !assistantInput.trim() ? 0.6 : 1
                      }}
                    >
                      Send
                    </button>
                  </div>
                  
                  {/* Quick Actions */}
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        setAssistantInput('Give me a summary of my most important emails today');
                        setTimeout(() => sendAssistantMessage(), 100);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      📧 Email Summary
                    </button>
                    <button
                      onClick={() => {
                        setAssistantInput('Create a task for me');
                        setTimeout(() => sendAssistantMessage(), 100);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      ✅ New Task
                    </button>
                    <button
                      onClick={() => {
                        setAssistantInput('Schedule a meeting for me');
                        setTimeout(() => sendAssistantMessage(), 100);
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      📅 Schedule Meeting
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentView === 'assistant' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                height: '500px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{
                  padding: '20px',
                  borderBottom: '1px solid #e2e8f0',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                  borderRadius: '16px 16px 0 0',
                  color: 'white'
                }}>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>AI Assistant - v2.5 FORCE UPDATE</h3>
                  <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Ask me anything about your work</p>
                </div>
                
                <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                  {assistantMessages.map((message, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      gap: '12px',
                      marginBottom: '16px',
                      alignItems: 'flex-start'
                    }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: message.role === 'user' ? '#3b82f6' : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px'
                      }}>
                        {message.role === 'user' ? '👤' : '🤖'}
                      </div>
                      <div style={{
                        flex: 1,
                        background: message.role === 'user' ? '#f1f5f9' : '#f0f9ff',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        position: 'relative'
                      }}>
                        {message.content}
                        {message.role === 'user' && (
                          <button
                            onClick={() => toggleFavorite(message.content)}
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '16px',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.7,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.opacity = '1'}
                            onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                            title={isFavorite(message.content) ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {isFavorite(message.content) ? '⭐' : '☆'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {assistantLoading && (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>🤖</div>
                      <div style={{ color: '#64748b' }}>Thinking...</div>
                    </div>
                  )}
                </div>
                
                {/* Favorites Panel */}
                {favorites.length > 0 && (
                  <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#f8fafc'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px'
                    }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>⭐ Favorites</span>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>({favorites.length})</span>
                    </div>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      maxHeight: '120px',
                      overflowY: 'auto'
                    }}>
                      {favorites.slice(0, 5).map((favorite) => (
                        <div
                          key={favorite.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            background: 'white',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            fontSize: '13px',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => {
                            setAssistantInput(favorite.command);
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = '#f1f5f9';
                            e.target.style.borderColor = '#3b82f6';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'white';
                            e.target.style.borderColor = '#e2e8f0';
                          }}
                        >
                          <span style={{ color: '#f59e0b' }}>⭐</span>
                          <span style={{ 
                            flex: 1, 
                            color: '#374151',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {favorite.command.length > 50 ? favorite.command.slice(0, 50) + '...' : favorite.command}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFavorite(favorite.id);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#ef4444',
                              fontSize: '12px',
                              padding: '2px',
                              opacity: 0.7
                            }}
                            onMouseEnter={(e) => e.target.style.opacity = '1'}
                            onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                            title="Remove favorite"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {favorites.length > 5 && (
                        <div style={{
                          textAlign: 'center',
                          color: '#6b7280',
                          fontSize: '12px',
                          padding: '4px'
                        }}>
                          +{favorites.length - 5} more favorites
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <div style={{
                  padding: '20px',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  gap: '12px'
                }}>
                  <input
                    type="text"
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendAssistantMessage()}
                    placeholder="Ask me anything..."
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      outline: 'none',
                      fontSize: '14px'
                    }}
                  />
                  <button
                    onClick={sendAssistantMessage}
                    disabled={!assistantInput.trim() || assistantLoading}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '12px 20px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentView === 'inbox' && (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>📧 Smart Inbox</h2>
                <p style={{ color: '#64748b', fontSize: '16px' }}>AI-powered email organization and insights</p>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
                gap: '24px' 
              }}>
                {/* Priority Emails */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>🔥</span>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      Priority ({emailCategories.priority})
                    </h3>
                  </div>
                  
                  {(Array.isArray(emails) ? emails : [])
                    .filter(email => email.category === 'priority')
                    .slice(0, 3)
                    .map(email => (
                      <div key={email.id} style={{
                        padding: '12px 0',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer'
                      }}>
                        <div style={{ fontWeight: '500', color: '#1e293b', marginBottom: '4px', fontSize: '14px' }}>
                          {email.subject}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                          {email.from} • {email.time}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={() => {
                              setCurrentView('assistant');
                              setAssistantInput(`Draft a reply to: ${email.subject}`);
                            }}
                            style={{
                              background: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            📝 Reply
                          </button>
                          <button
                            onClick={() => {
                              setCurrentView('assistant');
                              setAssistantInput(`Summarize this email: ${email.subject}`);
                            }}
                            style={{
                              background: '#64748b',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            📋 Summary
                          </button>
                        </div>
                      </div>
                    ))
                  }
                  
                  {emailCategories.priority === 0 && (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '20px 0' }}>
                      🎉 No priority emails! You're caught up.
                    </div>
                  )}
                </div>

                {/* Work Emails */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>💼</span>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      Work ({emailCategories.work})
                    </h3>
                  </div>
                  
                  {(Array.isArray(emails) ? emails : [])
                    .filter(email => email.category === 'work')
                    .slice(0, 3)
                    .map(email => (
                      <div key={email.id} style={{
                        padding: '12px 0',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer'
                      }}>
                        <div style={{ fontWeight: '500', color: '#1e293b', marginBottom: '4px', fontSize: '14px' }}>
                          {email.subject}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                          {email.from} • {email.time}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={() => {
                              setCurrentView('assistant');
                              setAssistantInput(`Create a task based on this email: ${email.subject}`);
                            }}
                            style={{
                              background: '#059669',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            ✅ Task
                          </button>
                          <button
                            onClick={() => {
                              setCurrentView('assistant');
                              setAssistantInput(`Schedule a meeting about: ${email.subject}`);
                            }}
                            style={{
                              background: '#dc2626',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            📅 Meet
                          </button>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* Personal & Others */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>👤</span>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      Personal ({emailCategories.personal})
                    </h3>
                  </div>
                  
                  {(Array.isArray(emails) ? emails : [])
                    .filter(email => email.category === 'personal')
                    .slice(0, 3)
                    .map(email => (
                      <div key={email.id} style={{
                        padding: '12px 0',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer'
                      }}>
                        <div style={{ fontWeight: '500', color: '#1e293b', marginBottom: '4px', fontSize: '14px' }}>
                          {email.subject}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                          {email.from} • {email.time}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={() => {
                              setCurrentView('assistant');
                              setAssistantInput(`Help me respond to this personal email: ${email.subject}`);
                            }}
                            style={{
                              background: '#7c3aed',
                              color: 'white',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            💬 Respond
                          </button>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* AI Insights */}
                <div style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px',
                  color: 'white'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>🤖</span>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                      AI Insights
                    </h3>
                  </div>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', marginBottom: '8px', opacity: 0.9 }}>
                      📊 Email Analysis
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.8 }}>
                      • {emailCategories.priority} urgent items need attention
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.8 }}>
                      • {emailCategories.work} work emails to process  
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.8 }}>
                      • Best time to respond: Next 2 hours
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setCurrentView('assistant');
                      setAssistantInput('Give me a summary of my most important emails today');
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.3)',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    🧠 Ask AI Assistant
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentView === 'calendar' && (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>📅 Calendar</h2>
                <p style={{ color: '#64748b', fontSize: '16px' }}>Your upcoming meetings and events</p>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
                gap: '24px' 
              }}>
                {/* Today's Meetings */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                    Today's Schedule
                  </h3>
                  {(Array.isArray(calendar) && calendar.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {calendar.map(meeting => {
                        const startTime = meeting.start?.dateTime || meeting.start?.date;
                        const endTime = meeting.end?.dateTime || meeting.end?.date;
                        let timeDisplay = 'Time TBD';
                        let isNow = false;
                        
                        if (startTime) {
                          const start = new Date(startTime);
                          const end = new Date(endTime);
                          const now = new Date();
                          const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                          const duration = Math.round((end - start) / (1000 * 60));
                          timeDisplay = `${timeStr} • ${duration} min`;
                          isNow = now >= start && now <= end;
                        }
                        
                        return (
                          <div key={meeting.id} style={{
                            padding: '16px',
                            borderRadius: '12px',
                            border: isNow ? '2px solid #22c55e' : '1px solid #f1f5f9',
                            background: isNow ? '#f0fdf4' : '#fafafa',
                            position: 'relative'
                          }}>
                            {isNow && (
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: '#22c55e',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '10px',
                                fontWeight: '600'
                              }}>
                                LIVE
                              </div>
                            )}
                            <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                              {meeting.summary || meeting.title || 'Untitled Meeting'}
                            </div>
                            <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '8px' }}>
                              {timeDisplay}
                            </div>
                            {meeting.description && (
                              <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '8px' }}>
                                {meeting.description.slice(0, 100)}{meeting.description.length > 100 ? '...' : ''}
                              </div>
                            )}
                            {meeting.attendees && meeting.attendees.length > 0 && (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                👥 {meeting.attendees.length} attendee{meeting.attendees.length > 1 ? 's' : ''}
                              </div>
                            )}
                            {meeting.hangoutLink && (
                              <div style={{ marginTop: '8px' }}>
                                <a 
                                  href={meeting.hangoutLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{
                                    color: '#3b82f6',
                                    textDecoration: 'none',
                                    fontSize: '12px',
                                    fontWeight: '500'
                                  }}
                                >
                                  🔗 Join Meeting
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px',
                      color: '#64748b'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                      <div style={{ fontSize: '16px', marginBottom: '8px' }}>No meetings scheduled today</div>
                      <div style={{ fontSize: '14px' }}>Enjoy your free time!</div>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
                    Quick Actions
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button 
                      onClick={handleScheduleMeeting}
                      style={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'transform 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0)';
                      }}
                    >
                      📅 Schedule New Meeting
                    </button>
                    <button 
                      onClick={handleRefreshCalendar}
                      disabled={calendarLoading}
                      style={{
                        background: calendarLoading ? '#f1f5f9' : '#f8fafc',
                        color: calendarLoading ? '#94a3b8' : '#1e293b',
                        border: '1px solid #e2e8f0',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        fontWeight: '500',
                        cursor: calendarLoading ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!calendarLoading) {
                          e.target.style.background = '#f1f5f9';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!calendarLoading) {
                          e.target.style.background = '#f8fafc';
                        }
                      }}
                    >
                      {calendarLoading ? '🔄 Refreshing...' : '🔄 Refresh Calendar'}
                    </button>
                    <button 
                      onClick={handleCalendarSettings}
                      style={{
                        background: '#f8fafc',
                        color: '#1e293b',
                        border: '1px solid #e2e8f0',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#f8fafc';
                      }}
                    >
                      ⚙️ Calendar Settings
                    </button>
                  </div>

                  {/* Calendar Stats */}
                  <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                      This Week
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span style={{ color: '#64748b' }}>Total Meetings:</span>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>
                          {Array.isArray(calendar) ? calendar.length : 0}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span style={{ color: '#64748b' }}>Meeting Time:</span>
                        <span style={{ fontWeight: '600', color: '#1e293b' }}>
                          {Array.isArray(calendar) ? 
                            calendar.reduce((total, meeting) => {
                              if (meeting.start?.dateTime && meeting.end?.dateTime) {
                                const duration = Math.round((new Date(meeting.end.dateTime) - new Date(meeting.start.dateTime)) / (1000 * 60));
                                return total + duration;
                              }
                              return total;
                            }, 0) + ' min'
                            : '0 min'
                          }
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span style={{ color: '#64748b' }}>Free Time:</span>
                        <span style={{ fontWeight: '600', color: '#22c55e' }}>
                          {Array.isArray(calendar) ? 
                            (480 - calendar.reduce((total, meeting) => {
                              if (meeting.start?.dateTime && meeting.end?.dateTime) {
                                const duration = Math.round((new Date(meeting.end.dateTime) - new Date(meeting.start.dateTime)) / (1000 * 60));
                                return total + duration;
                              }
                              return total;
                            }, 0)) + ' min'
                            : '480 min'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentView === 'tasks' && (
            <div>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>✅ Tasks</h2>
                <p style={{ color: '#64748b', fontSize: '16px' }}>Manage your Google Tasks and to-dos</p>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
                gap: '24px' 
              }}>
                {/* Task List */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px',
                  minHeight: '500px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      My Tasks
                    </h3>
                    <button
                      onClick={() => {
                        setCurrentView('assistant');
                        setAssistantInput('Create a task for me');
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      ➕ Ask AI to Add Task
                    </button>
                  </div>

                  {(Array.isArray(tasks) && tasks.length > 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {tasks.map(task => {
                        const isCompleted = task.status === 'completed';
                        const dueDate = task.due ? new Date(task.due) : null;
                        const isOverdue = dueDate && !isCompleted && dueDate < new Date();
                        
                        return (
                          <div 
                            key={task.id} 
                            style={{
                              padding: '16px',
                              borderRadius: '12px',
                              border: '1px solid #f1f5f9',
                              background: isCompleted ? '#f0fdf4' : isOverdue ? '#fef2f2' : '#fafafa',
                              display: 'flex',
                              alignItems: 'start',
                              gap: '12px',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <button
                              onClick={() => handleToggleTask(task.id, !isCompleted)}
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '4px',
                                border: isCompleted ? 'none' : '2px solid #d1d5db',
                                background: isCompleted ? '#22c55e' : 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: '2px'
                              }}
                            >
                              {isCompleted && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                            </button>
                            
                            <div style={{ flex: 1 }}>
                              <div style={{ 
                                fontWeight: '500', 
                                color: isCompleted ? '#6b7280' : '#1e293b',
                                textDecoration: isCompleted ? 'line-through' : 'none',
                                marginBottom: '4px'
                              }}>
                                {task.title || 'Untitled Task'}
                              </div>
                              
                              {task.notes && (
                                <div style={{ 
                                  fontSize: '14px', 
                                  color: '#64748b',
                                  marginBottom: '8px'
                                }}>
                                  {task.notes}
                                </div>
                              )}
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                                {dueDate && (
                                  <span style={{ 
                                    color: isOverdue ? '#dc2626' : '#64748b',
                                    fontWeight: isOverdue ? '600' : 'normal'
                                  }}>
                                    📅 {dueDate.toLocaleDateString()}
                                    {isOverdue && ' (Overdue)'}
                                  </span>
                                )}
                                
                                {task.updated && (
                                  <span style={{ color: '#94a3b8' }}>
                                    Updated: {new Date(task.updated).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                fontSize: '14px'
                              }}
                              title="Delete task"
                            >
                              🗑️
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{
                      textAlign: 'center',
                      padding: '60px 20px',
                      color: '#64748b'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                      <div style={{ fontSize: '18px', marginBottom: '8px' }}>No tasks yet</div>
                      <div style={{ fontSize: '14px' }}>Create your first task to get started!</div>
                    </div>
                  )}
                </div>

                {/* Task Stats & Actions */}
                <div style={{
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '24px'
                }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                    Task Overview
                  </h3>
                  
                  {/* Task Statistics */}
                  <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{
                        background: '#f8fafc',
                        padding: '16px',
                        borderRadius: '12px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>
                          {Array.isArray(tasks) ? tasks.filter(t => t.status !== 'completed').length : 0}
                        </div>
                        <div style={{ fontSize: '14px', color: '#64748b' }}>Active</div>
                      </div>
                      
                      <div style={{
                        background: '#f0fdf4',
                        padding: '16px',
                        borderRadius: '12px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>
                          {Array.isArray(tasks) ? tasks.filter(t => t.status === 'completed').length : 0}
                        </div>
                        <div style={{ fontSize: '14px', color: '#64748b' }}>Completed</div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                      Quick Actions
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        onClick={handleRefreshTasks}
                        disabled={calendarLoading}
                        style={{
                          background: '#f8fafc',
                          color: '#1e293b',
                          border: '1px solid #e2e8f0',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: calendarLoading ? 'not-allowed' : 'pointer',
                          opacity: calendarLoading ? 0.6 : 1
                        }}
                      >
                        {calendarLoading ? '🔄 Refreshing...' : '🔄 Refresh Tasks'}
                      </button>
                      
                      <button
                        onClick={() => window.open('https://tasks.google.com/', '_blank')}
                        style={{
                          background: '#f8fafc',
                          color: '#1e293b',
                          border: '1px solid #e2e8f0',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        🌐 Open Google Tasks
                      </button>
                    </div>
                  </div>

                  {/* Progress Indicator */}
                  {Array.isArray(tasks) && tasks.length > 0 && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Progress</span>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>
                          {Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100)}%
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '8px',
                        background: '#f1f5f9',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${(tasks.filter(t => t.status === 'completed').length / tasks.length) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Google Docs View */}
          {currentView === 'docs' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '24px',
                  borderBottom: '1px solid #e2e8f0',
                  background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                  color: 'white'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>📝 Google Docs</h3>
                      <p style={{ margin: '0', opacity: 0.9 }}>Create, edit, and collaborate on documents</p>
                    </div>
                    <button
                      onClick={async () => {
                        const docName = prompt('Enter document name:') || 'New Document';
                        const newDoc = await createGoogleDoc(docName);
                        if (newDoc) {
                          alert(`Created "${docName}" successfully!`);
                        } else {
                          alert(`Creating "${docName}" - Google Docs API endpoint needs to be implemented in backend`);
                        }
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: 'white',
                        padding: '12px 20px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      ➕ New Document
                    </button>
                  </div>
                </div>

                <div style={{ padding: '24px' }}>
                  {/* Quick Actions */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Quick Actions</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                      <button
                        onClick={async () => {
                          const templateName = prompt('Enter document name for Business Letter:') || 'Business Letter';
                          const newDoc = await createGoogleDoc(templateName);
                          if (newDoc) {
                            alert(`Created "${templateName}" from Business Letter template successfully!`);
                          } else {
                            alert(`Creating "${templateName}" from template - Google Docs API endpoint needs to be implemented in backend`);
                          }
                        }}
                        style={{
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>📄</div>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Business Letter</div>
                        <div style={{ color: '#64748b', fontSize: '14px' }}>Professional letter template</div>
                      </button>
                      
                      <button
                        onClick={async () => {
                          const templateName = prompt('Enter document name for Resume:') || 'My Resume';
                          const newDoc = await createGoogleDoc(templateName);
                          if (newDoc) {
                            alert(`Created "${templateName}" from Resume template successfully!`);
                          } else {
                            alert(`Creating "${templateName}" from template - Google Docs API endpoint needs to be implemented in backend`);
                          }
                        }}
                        style={{
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>👤</div>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Resume</div>
                        <div style={{ color: '#64748b', fontSize: '14px' }}>Professional resume template</div>
                      </button>

                      <button
                        onClick={() => {
                          const templateName = prompt('Enter document name for Report:') || 'Project Report';
                          alert(`Creating "${templateName}" from Report template within VAAI - Google Docs API integration needed`);
                        }}
                        style={{
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>📋</div>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Report</div>
                        <div style={{ color: '#64748b', fontSize: '14px' }}>Structured report template</div>
                      </button>
                    </div>
                  </div>

                  {/* Recent Documents */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ margin: '0', color: '#1e293b' }}>Recent Documents</h4>
                      <button
                        onClick={() => alert('Refreshing document list - Google Docs API integration needed')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#3b82f6',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        Refresh →
                      </button>
                    </div>
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      minHeight: '500px'
                    }}>
                      {/* Document List Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '8px 0', borderBottom: '2px solid #e2e8f0' }}>
                        <h4 style={{ margin: 0, color: '#1e293b', fontSize: '18px' }}>My Documents</h4>
                        <button
                          onClick={async () => {
                            const newDocName = prompt('Enter document name:') || 'Untitled Document';
                            const newDoc = await createGoogleDoc(newDocName);
                            if (newDoc) {
                              alert(`Created "${newDocName}" successfully!`);
                            } else {
                              alert(`Creating "${newDocName}" - Google Docs API endpoint needs to be implemented in backend`);
                            }
                          }}
                          style={{
                            background: '#4285f4',
                            border: 'none',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          ➕ New Document
                        </button>
                      </div>

                      {/* Document Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* Google Docs from API */}
                        {docsLoading ? (
                          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                            <div style={{ color: '#64748b' }}>Loading your Google Docs...</div>
                          </div>
                        ) : googleDocs.length > 0 ? googleDocs.map((doc, index) => (
                          <div key={index} style={{
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            ':hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }
                          }}
                          onClick={() => {
                            if (doc.webViewLink) {
                              window.open(doc.webViewLink, '_blank');
                            } else {
                              alert(`Opening "${doc.name || doc.title}" - Google Docs API integration needed`);
                            }
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                              <div style={{ fontSize: '24px', marginRight: '12px' }}>📝</div>
                              <div>
                                <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>{doc.name || doc.title}</div>
                                <div style={{ color: '#64748b', fontSize: '12px' }}>Modified {doc.modified || doc.modifiedTime || 'recently'}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (doc.webViewLink) {
                                    window.open(doc.webViewLink, '_blank');
                                  } else {
                                    alert(`Editing "${doc.name || doc.title}" - Google Docs API integration needed`);
                                  }
                                }}
                                style={{
                                  background: '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  color: '#475569',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert(`Sharing "${doc.name || doc.title}" - Google Docs API integration needed`);
                                }}
                                style={{
                                  background: '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  color: '#475569',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                Share
                              </button>
                            </div>
                          </div>
                        )) : (
                          // Show sample documents when API is not implemented yet
                          [
                            { name: 'Project Proposal 2025', modified: '2 hours ago', type: 'document' },
                            { name: 'Meeting Notes - Nov 6', modified: '1 day ago', type: 'document' },
                            { name: 'Business Plan Draft', modified: '3 days ago', type: 'document' },
                            { name: 'Client Presentation', modified: '1 week ago', type: 'document' }
                          ].map((doc, index) => (
                            <div key={index} style={{
                              background: 'white',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '16px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              opacity: 0.7
                            }}
                            onClick={() => alert(`Sample document - Google Docs API integration needed`)}>
                              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ fontSize: '24px', marginRight: '12px' }}>📝</div>
                                <div>
                                  <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>{doc.name}</div>
                                  <div style={{ color: '#64748b', fontSize: '12px' }}>Sample • Modified {doc.modified}</div>
                                </div>
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                                Connect Google Docs API to see real documents
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* API Integration Notice */}
                      <div style={{
                        marginTop: '24px',
                        padding: '16px',
                        background: 'linear-gradient(135deg, #dbeafe 0%, #fef3c7 100%)',
                        border: '1px solid #fbbf24',
                        borderRadius: '8px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>🚀</div>
                        <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>Google Docs API Integration</div>
                        <div style={{ color: '#92400e', fontSize: '13px' }}>
                          Connect your Google account to access real documents within VAAI
                        </div>
                        <button
                          onClick={() => {
                            loadGoogleDocs();
                            alert('Refreshing Google Docs - API endpoints need to be implemented in backend');
                          }}
                          style={{
                            background: '#f59e0b',
                            border: 'none',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            marginTop: '8px'
                          }}
                        >
                          Refresh Documents
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Google Sheets View */}
          {currentView === 'sheets' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '24px',
                  borderBottom: '1px solid #e2e8f0',
                  background: 'linear-gradient(135deg, #0f9d58 0%, #34a853 100%)',
                  color: 'white'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>📊 Google Sheets</h3>
                      <p style={{ margin: '0', opacity: 0.9 }}>Create, edit, and analyze spreadsheets</p>
                    </div>
                    <button
                      onClick={async () => {
                        const sheetName = prompt('Enter spreadsheet name:') || 'New Spreadsheet';
                        const newSheet = await createGoogleSheet(sheetName);
                        if (newSheet) {
                          alert(`Created "${sheetName}" successfully!`);
                        } else {
                          alert(`Creating "${sheetName}" - Google Sheets API endpoint needs to be implemented in backend`);
                        }
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: 'white',
                        padding: '12px 20px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      ➕ New Spreadsheet
                    </button>
                  </div>
                </div>

                <div style={{ padding: '24px' }}>
                  {/* Quick Templates */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Quick Templates</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                      <button
                        onClick={() => {
                          const templateName = prompt('Enter spreadsheet name for Budget Tracker:') || 'Budget Tracker 2025';
                          alert(`Creating "${templateName}" from Budget Tracker template within VAAI - Google Sheets API integration needed`);
                        }}
                        style={{
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>💰</div>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Budget Tracker</div>
                        <div style={{ color: '#64748b', fontSize: '14px' }}>Track income and expenses</div>
                      </button>
                      
                      <button
                        onClick={() => {
                          const templateName = prompt('Enter spreadsheet name for Project Schedule:') || 'Project Schedule';
                          alert(`Creating "${templateName}" from Project Schedule template within VAAI - Google Sheets API integration needed`);
                        }}
                        style={{
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>📅</div>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Project Schedule</div>
                        <div style={{ color: '#64748b', fontSize: '14px' }}>Plan and track projects</div>
                      </button>

                      <button
                        onClick={() => {
                          const templateName = prompt('Enter spreadsheet name for Inventory:') || 'Inventory Management';
                          alert(`Creating "${templateName}" from Inventory template within VAAI - Google Sheets API integration needed`);
                        }}
                        style={{
                          padding: '16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>📦</div>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Inventory</div>
                        <div style={{ color: '#64748b', fontSize: '14px' }}>Manage stock and supplies</div>
                      </button>
                    </div>
                  </div>

                  {/* AI-Powered Actions */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>AI-Powered Actions</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                      <div style={{
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
                      }}>
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>🤖</div>
                        <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Ask AI to Create</div>
                        <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '12px' }}>
                          Use our AI Assistant to generate custom spreadsheets based on your needs
                        </div>
                        <button
                          onClick={() => {
                            setCurrentView('dashboard');
                            setAssistantInput('Create a spreadsheet for me');
                            setTimeout(() => sendAssistantMessage(), 100);
                          }}
                          style={{
                            background: '#3b82f6',
                            border: 'none',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Ask AI Assistant
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Recent Spreadsheets */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ margin: '0', color: '#1e293b' }}>Recent Spreadsheets</h4>
                      <button
                        onClick={() => alert('Refreshing spreadsheet list - Google Sheets API integration needed')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#3b82f6',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        Refresh →
                      </button>
                    </div>
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '16px',
                      minHeight: '500px'
                    }}>
                      {/* Spreadsheet List Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '8px 0', borderBottom: '2px solid #e2e8f0' }}>
                        <h4 style={{ margin: 0, color: '#1e293b', fontSize: '18px' }}>My Spreadsheets</h4>
                        <button
                          onClick={async () => {
                            const newSheetName = prompt('Enter spreadsheet name:') || 'Untitled Spreadsheet';
                            const newSheet = await createGoogleSheet(newSheetName);
                            if (newSheet) {
                              alert(`Created "${newSheetName}" successfully!`);
                            } else {
                              alert(`Creating "${newSheetName}" - Google Sheets API endpoint needs to be implemented in backend`);
                            }
                          }}
                          style={{
                            background: '#0f9d58',
                            border: 'none',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          ➕ New Spreadsheet
                        </button>
                      </div>

                      {/* Spreadsheet Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* Google Sheets from API */}
                        {sheetsLoading ? (
                          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                            <div style={{ color: '#64748b' }}>Loading your Google Sheets...</div>
                          </div>
                        ) : googleSheets.length > 0 ? googleSheets.map((sheet, index) => (
                          <div key={index} style={{
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onClick={() => {
                            // TODO: Open spreadsheet editor within VAAI
                            alert(`Opening "${sheet.name}" in VAAI editor - Google Sheets API integration needed`);
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                              <div style={{ fontSize: '24px', marginRight: '12px' }}>📊</div>
                              <div>
                                <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>{sheet.name}</div>
                                <div style={{ color: '#64748b', fontSize: '12px' }}>
                                  {sheet.rows} rows • Modified {sheet.modified}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert(`Editing "${sheet.name}" - Google Sheets API integration needed`);
                                }}
                                style={{
                                  background: '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  color: '#475569',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert(`Viewing charts for "${sheet.name}" - Google Sheets API integration needed`);
                                }}
                                style={{
                                  background: '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  color: '#475569',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                Charts
                              </button>
                            </div>
                          </div>
                        )) : (
                          // Show sample spreadsheets when API is not implemented yet
                          [
                            { name: 'Q4 Budget Tracker', modified: '1 hour ago', type: 'spreadsheet', rows: 156 },
                            { name: 'Project Timeline', modified: '2 days ago', type: 'spreadsheet', rows: 42 },
                            { name: 'Sales Dashboard', modified: '5 days ago', type: 'spreadsheet', rows: 89 },
                            { name: 'Inventory Management', modified: '1 week ago', type: 'spreadsheet', rows: 234 }
                          ].map((sheet, index) => (
                            <div key={index} style={{
                              background: 'white',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '16px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              opacity: 0.7
                            }}
                            onClick={() => alert(`Sample spreadsheet - Google Sheets API integration needed`)}>
                              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                                <div style={{ fontSize: '24px', marginRight: '12px' }}>📊</div>
                                <div>
                                  <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>{sheet.name}</div>
                                  <div style={{ color: '#64748b', fontSize: '12px' }}>
                                    Sample • {sheet.rows} rows • Modified {sheet.modified}
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                                Connect Google Sheets API to see real spreadsheets
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* API Integration Notice */}
                      <div style={{
                        marginTop: '24px',
                        padding: '16px',
                        background: 'linear-gradient(135deg, #dcfce7 0%, #fef3c7 100%)',
                        border: '1px solid #10b981',
                        borderRadius: '8px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>🚀</div>
                        <div style={{ fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>Google Sheets API Integration</div>
                        <div style={{ color: '#065f46', fontSize: '13px' }}>
                          Connect your Google account to access real spreadsheets within VAAI
                        </div>
                        <button
                          onClick={() => {
                            loadGoogleSheets();
                            alert('Refreshing Google Sheets - API endpoints need to be implemented in backend');
                          }}
                          style={{
                            background: '#10b981',
                            border: 'none',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            marginTop: '8px'
                          }}
                        >
                          Refresh Spreadsheets
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(currentView === 'compose' || currentView === 'analyzer') && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>🚧</div>
              <h2 style={{ fontSize: '24px', color: '#1e293b', marginBottom: '12px' }}>Coming Soon</h2>
              <p style={{ color: '#64748b', fontSize: '16px' }}>This feature is currently under development.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;