// Simple sidebar version - add this to existing App.jsx
const [activeSection, setActiveSection] = useState('dashboard');
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

// Add this before the main return statement
const renderSidebar = () => (
  <div className={`vaai-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
    <div className="vaai-sidebar-header">
      <div className="vaai-sidebar-logo">
        <div className="vaai-sidebar-logo-icon">🔍</div>
        {!sidebarCollapsed && <span>VAAI</span>}
      </div>
      <button 
        className="vaai-sidebar-toggle"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      >
        {sidebarCollapsed ? '→' : '←'}
      </button>
    </div>
    
    <nav className="vaai-sidebar-nav">
      <div className="vaai-sidebar-section">
        <button 
          className={`vaai-sidebar-nav-item ${activeSection === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveSection('dashboard')}
        >
          <span className="vaai-sidebar-nav-item-icon">🏠</span>
          <span className="vaai-sidebar-nav-item-text">Dashboard</span>
        </button>
        <button 
          className={`vaai-sidebar-nav-item ${activeSection === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveSection('ai')}
        >
          <span className="vaai-sidebar-nav-item-icon">🤖</span>
          <span className="vaai-sidebar-nav-item-text">AI Assistant</span>
        </button>
        <button 
          className={`vaai-sidebar-nav-item ${activeSection === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveSection('tasks')}
        >
          <span className="vaai-sidebar-nav-item-icon">✅</span>
          <span className="vaai-sidebar-nav-item-text">Tasks</span>
        </button>
        <button 
          className={`vaai-sidebar-nav-item ${activeSection === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveSection('calendar')}
        >
          <span className="vaai-sidebar-nav-item-icon">📅</span>
          <span className="vaai-sidebar-nav-item-text">Calendar</span>
        </button>
        <button 
          className={`vaai-sidebar-nav-item ${activeSection === 'emails' ? 'active' : ''}`}
          onClick={() => setActiveSection('emails')}
        >
          <span className="vaai-sidebar-nav-item-icon">📧</span>
          <span className="vaai-sidebar-nav-item-text">Inbox</span>
        </button>
      </div>
    </nav>
  </div>
);

// Wrap the main return in:
// <div className="vaai-app-container">
//   {renderSidebar()}
//   <main className={`vaai-main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
//     {/* existing content */}
//   </main>
// </div>