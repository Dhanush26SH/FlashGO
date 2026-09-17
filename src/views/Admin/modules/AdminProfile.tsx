import React, { useState } from 'react';
import './AdminProfile.css';
import { useApp } from '../../../context/AppContext';
import { UsersService } from '../../../services/api/UsersService';
import { 
  ShieldCheck, 
  Mail, 
  Save, 
  User,
  Key,
  Smartphone,
  Activity,
  Clock,
  LogOut
} from 'lucide-react';

export const AdminProfile: React.FC = () => {
  const { currentUser, addToast, updateCurrentUserProfile, logout } = useApp();
  
  // Local state for forms
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    try {
      setIsSaving(true);
      await UsersService.updateMyBasicProfile(fullName, phone);
      updateCurrentUserProfile({
        ...currentUser,
        full_name: fullName,
        phone: phone
      });
      addToast('Profile details updated successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const adminRoleDisplay = currentUser?.role === 'admin' ? 'SUPER ADMIN' : 
                           currentUser?.role === 'warehouse_staff' ? 'WAREHOUSE LEAD' : 
                           'AUTHORIZED STAFF';

  return (
    <div className="container">
      {/* Header Banner */}
      <div className="welcome-banner">
        <div>
          <h2 className="title">Administrator Profile</h2>
          <p className="subtitle">Manage your personal details and security settings</p>
        </div>
        <ShieldCheck size={48} color="var(--primary)" opacity={0.2} style={{ position: 'absolute', right: '40px' }} />
        <ShieldCheck size={36} color="var(--primary)" />
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Profile Settings Card */}
        <div className="panel-card" style={{ position: 'relative', overflow: 'hidden', display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: 'linear-gradient(180deg, var(--primary), var(--secondary))' }} />
          
          {/* Left Side: Avatar & Info */}
          <div style={{ flex: '0 0 250px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0' }}>
            <div className="avatar-wrapper" style={{ width: '96px', height: '96px', fontSize: '3rem', boxShadow: '0 12px 24px rgba(16, 185, 129, 0.25)', marginBottom: '16px' }}>
              {currentUser?.full_name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <h3 className="identity-name" style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{currentUser?.full_name || 'System Administrator'}</h3>
            <span className="role-badge" style={{ padding: '6px 12px', fontSize: '0.7rem' }}>{adminRoleDisplay}</span>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '16px', lineHeight: 1.5 }}>
              This is your primary administrative profile. Changes made here will reflect across all enterprise tools.
            </p>
          </div>

          <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }} />

          {/* Right Side: Form */}
          <div style={{ flex: 1, padding: '12px 0' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--primary)" /> Personal Details
            </h3>
            
            <form onSubmit={handleUpdateProfile} className="form" style={{ gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="input-group">
                  <label className="input-label">FULL NAME</label>
                  <input 
                    type="text" 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    className="input" 
                    required
                  />
                </div>
                
                <div className="input-group">
                  <label className="input-label">PHONE NUMBER</label>
                  <input 
                    type="text" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)} 
                    className="input" 
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label"><Mail size={12} /> EMAIL ADDRESS (READ-ONLY)</label>
                <input 
                  type="email" 
                  value={currentUser?.email || ''} 
                  disabled
                  className="input disabled-input" 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="submit" disabled={isSaving} style={{ ...btnStyle('var(--primary)'), padding: '14px 28px', fontSize: '0.9rem' }}>
                  <Save size={18} /> {isSaving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Activity Log Card */}
        <div className="panel-card">
           <div className="panel-header" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="var(--primary)" />
              <h3 className="panel-title">Recent Activity</h3>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            <div className="log-item">
              <Clock size={16} color="var(--text-muted)" style={{ marginTop: '2px' }} />
              <div>
                <div className="log-action" style={{ fontSize: '0.85rem' }}>Successful Login</div>
                <div className="log-meta" style={{ fontSize: '0.75rem' }}>Today, Just now • IP: 192.168.1.1</div>
              </div>
            </div>
            <div className="log-item">
              <Clock size={16} color="var(--text-muted)" style={{ marginTop: '2px' }} />
              <div>
                <div className="log-action" style={{ fontSize: '0.85rem' }}>Dashboard Accessed</div>
                <div className="log-meta" style={{ fontSize: '0.75rem' }}>Today, Just now</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- STYLING CONSTANTS ---
const btnStyle = (color: string): React.CSSProperties => ({
  marginTop: '12px',
  padding: '12px 16px',
  backgroundColor: color,
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.85rem',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  transition: 'all 0.2s ease',
  boxShadow: `0 4px 12px ${color.replace(')', ', 0.3)').replace('rgb', 'rgba')}`,
});
