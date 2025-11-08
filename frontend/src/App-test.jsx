import React, { useState, useEffect } from 'react';
import './EnhancedUI.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    console.log('App useEffect running');
    setTimeout(() => {
      console.log('Setting demo user and stopping loading');
      setUser({ email: 'demo@vaai.com', name: 'Demo User' });
      setLoading(false);
    }, 1000);
  }, []);

  console.log('App render - loading:', loading, 'user:', user);

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

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh',
      background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)'
    }}>
      <div style={{
        width: '280px',
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        color: 'white',
        padding: '20px'
      }}>
        <h1 style={{ color: 'white', margin: 0 }}>VAAI</h1>
        <p style={{ color: '#94a3b8', margin: '8px 0' }}>Premium AI Assistant</p>
        
        <div style={{ marginTop: '40px' }}>
          <h3 style={{ color: '#60a5fa', fontSize: '14px', margin: '0 0 16px 0' }}>WORKSPACE</h3>
          <div style={{ color: '#cbd5e1' }}>
            <div style={{ padding: '8px 0' }}>🏠 Dashboard</div>
            <div style={{ padding: '8px 0' }}>🎯 Daily Focus</div>
            <div style={{ padding: '8px 0' }}>📧 Smart Inbox</div>
            <div style={{ padding: '8px 0' }}>📅 Calendar</div>
          </div>
        </div>
      </div>
      
      <div style={{ 
        flex: 1, 
        padding: '40px',
        background: 'white'
      }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '800',
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: '0 0 20px 0'
        }}>
          Welcome to VAAI
        </h1>
        <p style={{ color: '#64748b', fontSize: '18px' }}>
          Your premium AI productivity assistant is ready.
        </p>
        
        <div style={{ 
          marginTop: '40px',
          padding: '20px',
          background: '#f1f5f9',
          borderRadius: '12px'
        }}>
          <h2 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Quick Stats</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6' }}>12</div>
              <div style={{ color: '#64748b' }}>Emails</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>5</div>
              <div style={{ color: '#64748b' }}>Meetings</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>8</div>
              <div style={{ color: '#64748b' }}>Tasks</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;