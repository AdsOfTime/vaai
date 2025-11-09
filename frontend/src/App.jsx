import React, { useState, useEffect } from 'react';
import './EnhancedUI.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      
      if (code) {
        try {
          const response = await fetch(`${API_BASE_URL}/auth/google/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          
          if (response.ok) {
            const data = await response.json();
            localStorage.setItem('authToken', data.token);
            setUser(data.user);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (error) {
          console.error('OAuth callback error:', error);
        }
      }
      
      // Check existing auth
      const token = localStorage.getItem('authToken');
      if (token && !user) {
        try {
          const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
          } else {
            localStorage.removeItem('authToken');
          }
        } catch (error) {
          console.error('Auth check error:', error);
        }
      }
      
      setLoading(false);
    };
    
    handleOAuthCallback();
  }, []);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  
  // AI Assistant state
  const [assistantMessages, setAssistantMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your AI assistant. How can I help you today?' }
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);

  // Data states
  const [emails, setEmails] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [dailyFocus, setDailyFocus] = useState({
    priority: 'Finish quarterly review',
    meetings: 2,
    emails: 5,
    tasks: 3
  });

  const handleLogin = async () => {
    try {
      // Get auth URL from worker
      const response = await fetch(`${API_BASE_URL}/auth/google`);
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.authUrl;
      } else {
        console.error('Failed to get auth URL');
      }
    } catch (error) {
      console.error('Auth error:', error);
    }
  };

  const handleAssistantMessage = async () => {
    if (!assistantInput.trim() || assistantLoading) return;

    const userMessage = assistantInput.trim();
    setAssistantInput('');
    setAssistantLoading(true);
    
    setAssistantMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          message: userMessage,
          context: { emails, calendar, tasks }
        })
      });
      
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        setAssistantMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        // Mock AI response for demo
        const mockResponses = [
          `I can help you with that! Based on your current workload, I see you have ${emails.length} emails and ${calendar.length} meetings today.`,
          `Great question! I've analyzed your tasks and suggest focusing on the high-priority items first.`,
          `I'm here to help optimize your productivity. Would you like me to prioritize your emails or schedule some focus time?`,
          `Based on your recent activity, I recommend taking a short break and then tackling your most important tasks.`
        ];
        const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        setAssistantMessages(prev => [...prev, { role: 'assistant', content: randomResponse }]);
      }
    } catch (error) {
      // Mock AI response for demo when API is not available
      const mockResponses = [
        `I can help you with that! Based on your current workload, I see you have ${emails.length} emails and ${calendar.length} meetings today.`,
        `Great question! I've analyzed your tasks and suggest focusing on the high-priority items first.`,
        `I'm here to help optimize your productivity. Would you like me to prioritize your emails or schedule some focus time?`
      ];
      const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
      setAssistantMessages(prev => [...prev, { role: 'assistant', content: randomResponse }]);
    }
    
    setAssistantLoading(false);
  };

  const renderLarkSidebar = () => (
    <div className={`vaai-sidebar ${sidebarVisible ? 'visible' : 'hidden'}`} style={{
      width: '280px',
      background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
      borderRight: '1px solid rgba(255,255,255,0.1)',
      position: 'fixed',
      left: 0,
      top: 0,
      height: '100vh',
      zIndex: 1000,
      boxShadow: '4px 0 20px rgba(0,0,0,0.3)',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        padding: '24px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px'
          }}>🔍</div>
          <div style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'white'
          }}>VAAI</div>
        </div>
        <button 
          onClick={() => setSidebarVisible(false)}
          title="Hide sidebar"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '6px',
            fontSize: '18px',
            transition: 'color 0.2s ease'
          }}
          onMouseOver={(e) => e.target.style.color = 'white'}
          onMouseOut={(e) => e.target.style.color = 'rgba(255,255,255,0.6)'}
        >
          ×
        </button>
      </div>

      <div style={{
        padding: '20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{
          position: 'relative'
        }}>
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
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.15)';
              e.target.style.borderColor = 'rgba(255,255,255,0.3)';
            }}
            onBlur={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.1)';
              e.target.style.borderColor = 'rgba(255,255,255,0.2)';
            }}
          />
          <span style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '14px'
          }}>🔍</span>
        </div>
      </div>

      <nav style={{ padding: '20px 0', flex: 1 }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '0 20px 12px',
            marginBottom: '8px'
          }}>Workspace</div>
          <div>
            {[
              { id: 'dashboard', icon: '🏠', label: 'Dashboard', badge: null },
              { id: 'focus', icon: '🎯', label: 'Daily Focus', badge: '3' },
              { id: 'inbox', icon: '📧', label: 'Smart Inbox', badge: emails.length || '12' },
              { id: 'calendar', icon: '📅', label: 'Calendar', badge: calendar.length || '5' },
              { id: 'tasks', icon: '✅', label: 'Tasks', badge: tasks.length || '8' },
              { id: 'docs', icon: '📄', label: 'Documents', badge: null },
              { id: 'sheets', icon: '📊', label: 'Sheets', badge: null }
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
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseOver={(e) => {
                  if (currentView !== item.id) {
                    e.target.style.background = 'rgba(255,255,255,0.05)';
                    e.target.style.color = 'white';
                  }
                }}
                onMouseOut={(e) => {
                  if (currentView !== item.id) {
                    e.target.style.background = 'transparent';
                    e.target.style.color = 'rgba(255,255,255,0.7)';
                  }
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
            padding: '0 20px 12px',
            marginBottom: '8px'
          }}>AI Tools</div>
          <div>
            {[
              { id: 'assistant', icon: '🤖', label: 'AI Assistant', badge: null },
              { id: 'compose', icon: '✍️', label: 'Email Composer', badge: null },
              { id: 'analyzer', icon: '📈', label: 'Data Analysis', badge: null },
              { id: 'automation', icon: '⚡', label: 'Automation', badge: '2' }
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
                onMouseOver={(e) => {
                  if (currentView !== item.id) {
                    e.target.style.background = 'rgba(255,255,255,0.05)';
                    e.target.style.color = 'white';
                  }
                }}
                onMouseOut={(e) => {
                  if (currentView !== item.id) {
                    e.target.style.background = 'transparent';
                    e.target.style.color = 'rgba(255,255,255,0.7)';
                  }
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
            padding: '0 20px 12px',
            marginBottom: '8px'
          }}>Settings</div>
          <div>
            <div 
              onClick={() => setCurrentView('settings')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                color: currentView === 'settings' ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                background: currentView === 'settings' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                borderRight: currentView === 'settings' ? '3px solid #3b82f6' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                marginBottom: '2px'
              }}
              onMouseOver={(e) => {
                if (currentView !== 'settings') {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'white';
                }
              }}
              onMouseOut={(e) => {
                if (currentView !== 'settings') {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
            >
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>⚙️</span>
              <span style={{ flex: 1 }}>Preferences</span>
            </div>
            <div 
              onClick={() => setCurrentView('billing')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                color: currentView === 'billing' ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                background: currentView === 'billing' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                borderRight: currentView === 'billing' ? '3px solid #3b82f6' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (currentView !== 'billing') {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'white';
                }
              }}
              onMouseOut={(e) => {
                if (currentView !== 'billing') {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
            >
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>💳</span>
              <span style={{ flex: 1 }}>Billing</span>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <div style={{ fontSize: '18px', color: '#64748b' }}>Loading VAAI...</div>
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
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
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
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Welcome to VAAI
          </h1>
          <p style={{
            color: '#64748b',
            marginBottom: '32px',
            fontSize: '16px',
            lineHeight: '1.5'
          }}>
            Your AI-powered productivity assistant for email, calendar, and task management.
          </p>
          <button
            onClick={handleLogin}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              padding: '16px 32px',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%',
              marginBottom: '16px'
            }}
          >
            Continue with Google
          </button>
          <p style={{
            fontSize: '14px',
            color: '#64748b'
          }}>
            Start on the Solo plan — upgrade to Business once your team is ready.
          </p>
        </div>
      </div>
    );
  }

  const renderMainContent = () => {
    switch (currentView) {
      case 'focus':
        return (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '32px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.05)'
          }}>
            <h2 style={{
              fontSize: '28px',
              fontWeight: '700',
              marginBottom: '8px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Daily Focus
            </h2>
            <p style={{ color: '#64748b', marginBottom: '32px' }}>
              Your AI-curated priority for today
            </p>

            <div style={{
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              borderRadius: '16px',
              padding: '24px',
              color: 'white',
              marginBottom: '24px'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                Today's Priority
              </h3>
              <p style={{ fontSize: '16px', opacity: 0.9 }}>
                {dailyFocus.priority}
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px'
            }}>
              {[
                { label: 'Meetings Today', value: dailyFocus.meetings, icon: '📅', color: '#667eea' },
                { label: 'Unread Emails', value: dailyFocus.emails, icon: '📧', color: '#f093fb' },
                { label: 'Pending Tasks', value: dailyFocus.tasks, icon: '✅', color: '#64748b' }
              ].map((item, index) => (
                <div key={index} style={{
                  background: '#f8fafc',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>{item.icon}</div>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    color: item.color,
                    marginBottom: '4px'
                  }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'inbox':
        return (
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '32px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.05)'
          }}>
            <h2 style={{
              fontSize: '28px',
              fontWeight: '700',
              marginBottom: '8px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Smart Inbox
            </h2>
            <p style={{ color: '#64748b', marginBottom: '32px' }}>
              AI-organized and prioritized emails
            </p>

            <div style={{ display: 'grid', gap: '16px' }}>
              {[
                {
                  category: 'Priority', count: 3, color: '#f093fb', emails: [
                    { subject: 'Q4 Budget Review Meeting', from: 'sarah@company.com', time: '2 hours ago' },
                    { subject: 'Project Deadline Extension', from: 'mike@client.com', time: '4 hours ago' }
                  ]
                },
                {
                  category: 'Work', count: 5, color: '#667eea', emails: [
                    { subject: 'Team Standup Notes', from: 'team@company.com', time: '1 hour ago' }
                  ]
                },
                {
                  category: 'Personal', count: 4, color: '#64748b', emails: [
                    { subject: 'Weekend Plans', from: 'friend@gmail.com', time: '3 hours ago' }
                  ]
                }
              ].map((category, index) => (
                <div key={index} style={{
                  border: `2px solid ${category.color}20`,
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                  }}>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: category.color
                    }}>
                      {category.category}
                    </h3>
                    <span style={{
                      background: category.color,
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {category.count}
                    </span>
                  </div>
                  {category.emails.map((email, emailIndex) => (
                    <div key={emailIndex} style={{
                      padding: '12px 0',
                      borderBottom: emailIndex < category.emails.length - 1 ? '1px solid #e2e8f0' : 'none'
                    }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                        {email.subject}
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: '#64748b'
                      }}>
                        <span>{email.from}</span>
                        <span>{email.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="vaai-app-container">
      {renderLarkSidebar()}
      
      <div className="vaai-main-content" style={{
        marginLeft: sidebarVisible ? '280px' : '0',
        transition: 'margin-left 0.3s ease',
        minHeight: '100vh',
        background: '#f8fafc'
      }}>
        <header className="workspace-hero" style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px 32px',
          minHeight: '80px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              {!sidebarVisible && (
                <button 
                  onClick={() => setSidebarVisible(true)}
                  title="Show sidebar"
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '18px'
                  }}
                >
                  ☰
                </button>
              )}
              <span style={{ fontSize: '24px' }}>🔍</span>
              <span style={{ 
                fontSize: '24px', 
                fontWeight: '600',
                letterSpacing: '0.5px'
              }}>VAAI Command</span>
            </div>
            <div style={{
              fontSize: '14px',
              opacity: 0.9
            }}>
              {user?.email}
            </div>
          </div>
        </header>

        <main style={{
          padding: '32px',
          maxWidth: '1400px',
          margin: '0 auto'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '32px'
          }}>
            <div>
              <h1 style={{
                fontSize: '36px',
                fontWeight: '800',
                color: '#1e293b',
                marginBottom: '8px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>AI Command Center</h1>
              <p style={{
                fontSize: '16px',
                color: '#64748b',
                fontWeight: '500'
              }}>
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
          </div>

          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}

export default App;