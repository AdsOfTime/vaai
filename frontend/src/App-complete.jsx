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
  const [dailyFocus, setDailyFocus] = useState({
    priority: 'Complete quarterly review',
    meetings: 3,
    emails: 12,
    tasks: 8
  });

  // AI Assistant state
  const [assistantMessages, setAssistantMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your AI assistant. How can I help you today?' }
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);

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
      const response = await fetch(`${API_BASE_URL}/api/auth/status`);
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const userData = await response.json();
        if (userData && !userData.error) {
          setUser(userData);
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
    
    // No authenticated user found - show login
    setLoading(false);
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  };

  const loadData = async () => {
    try {
      // Try to load real data from APIs first
      const [emailRes, calendarRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/emails`).catch(() => null),
        fetch(`${API_BASE_URL}/api/calendar`).catch(() => null),
        fetch(`${API_BASE_URL}/api/tasks`).catch(() => null)
      ]);

      let hasRealData = false;

      if (emailRes?.ok && emailRes.headers.get('content-type')?.includes('application/json')) {
        const emailData = await emailRes.json();
        setEmails(emailData || []);
        hasRealData = true;
      }

      if (calendarRes?.ok && calendarRes.headers.get('content-type')?.includes('application/json')) {
        const calendarData = await calendarRes.json();
        setCalendar(calendarData || []);
        hasRealData = true;
      }

      if (tasksRes?.ok && tasksRes.headers.get('content-type')?.includes('application/json')) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData || []);
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
          { id: 1, title: 'Daily Standup', time: '9:00 AM', duration: '30 min' },
          { id: 2, title: 'Client Review', time: '2:00 PM', duration: '1 hour' },
          { id: 3, title: 'Team Planning', time: '4:00 PM', duration: '45 min' }
        ]);
        
        setTasks([
          { id: 1, title: 'Complete quarterly review', priority: 'high', completed: false },
          { id: 2, title: 'Update project documentation', priority: 'medium', completed: false },
          { id: 3, title: 'Review code changes', priority: 'low', completed: true }
        ]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const sendAssistantMessage = async () => {
    if (!assistantInput.trim() || assistantLoading) return;
    
    const newMessage = { role: 'user', content: assistantInput };
    setAssistantMessages(prev => [...prev, newMessage]);
    setAssistantInput('');
    setAssistantLoading(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: assistantInput })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAssistantMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setAssistantMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'I\'m sorry, I\'m having trouble connecting right now. Please try again later.' 
        }]);
      }
    } catch (error) {
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
              { id: 'focus', icon: '🎯', label: 'Daily Focus', badge: '3' },
              { id: 'inbox', icon: '📧', label: 'Smart Inbox', badge: emails.length || '12' },
              { id: 'calendar', icon: '📅', label: 'Calendar', badge: calendar.length || '5' },
              { id: 'tasks', icon: '✅', label: 'Tasks', badge: tasks.length || '8' }
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
              { id: 'assistant', icon: '🤖', label: 'AI Assistant' },
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
              {currentView === 'focus' && 'Daily Focus'}
              {currentView === 'inbox' && 'Smart Inbox'}
              {currentView === 'calendar' && 'Calendar'}
              {currentView === 'tasks' && 'Tasks'}
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
                  <p style={{ margin: '0 0 16px 0', color: '#64748b' }}>{emails.length} unread emails organized by AI</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ background: '#e879f9', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>Priority (1)</span>
                    <span style={{ background: '#3b82f6', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>Work (5)</span>
                    <span style={{ background: '#64748b', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px' }}>Personal (4)</span>
                  </div>
                </div>

                <div style={{ 
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  padding: '24px',
                  borderRadius: '16px'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', color: '#1e293b' }}>📅 Calendar</h3>
                  <p style={{ margin: '0 0 16px 0', color: '#64748b' }}>{calendar.length} meetings today</p>
                  {calendar.slice(0, 2).map(meeting => (
                    <div key={meeting.id} style={{ 
                      padding: '8px 0', 
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: '14px'
                    }}>
                      <div style={{ fontWeight: '600', color: '#1e293b' }}>{meeting.title}</div>
                      <div style={{ color: '#64748b' }}>{meeting.time} • {meeting.duration}</div>
                    </div>
                  ))}
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
                  <h3 style={{ margin: 0, fontSize: '18px' }}>AI Assistant</h3>
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
                        lineHeight: '1.5'
                      }}>
                        {message.content}
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
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{
                  padding: '20px',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  gap: '12px'
                }}>
                  <span style={{ background: '#e879f9', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '14px' }}>Priority</span>
                  <span style={{ background: '#3b82f6', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '14px' }}>Work</span>
                  <span style={{ background: '#64748b', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '14px' }}>Personal</span>
                </div>
                {emails.map(email => (
                  <div key={email.id} style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b' }}>{email.subject}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{email.time}</div>
                    </div>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>{email.from}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(currentView === 'focus' || currentView === 'calendar' || currentView === 'tasks' || currentView === 'compose' || currentView === 'analyzer') && (
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