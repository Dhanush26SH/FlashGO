import React, { useState } from 'react';
import { Send, Bell, Mail, MessageSquare, Plus } from 'lucide-react';

export const NotificationCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'push' | 'sms' | 'email' | 'internal'>('push');

  return (
    <div className="admin-module">
      <header className="module-header">
        <div>
          <h2>Notification Center</h2>
          <p>Dispatch and track push notifications, SMS, emails, and internal alerts.</p>
        </div>
        <button className="primary-btn">
          <Plus size={16} /> New Broadcast
        </button>
      </header>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {['push', 'sms', 'email', 'internal'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: activeTab === tab ? 'var(--primary)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--text-primary)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === tab ? 'none' : '2px solid var(--border)'
            }}
          >
            {tab === 'push' && <Bell size={16} />}
            {tab === 'sms' && <MessageSquare size={16} />}
            {tab === 'email' && <Mail size={16} />}
            {tab === 'internal' && <Send size={16} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', opacity: 0.6 }}>
          <Bell size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h3>No recent {activeTab} campaigns</h3>
          <p>Click "New Broadcast" to create your first {activeTab} message.</p>
        </div>
      </div>
    </div>
  );
};
