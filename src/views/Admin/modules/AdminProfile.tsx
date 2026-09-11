import React, { useState } from 'react';
import './AdminProfile.css';
import { useApp } from '../../../context/AppContext';
import { UsersService } from '../../../services/api/UsersService';
import { 
  ShieldCheck, 
  Mail, 
  Save, 
  User
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
      <div className=" ">
        <div>
          <h2 className="title">Administrator Profile</h2>
          <p className="subtitle">Manage your personal details</p>
        </div>
        <ShieldCheck size={36} color="var(--primary)" />
      </div>

      <div className="layout-grid">
        
        {/* Left Column: Profile & Security */}
        <div className="column">
          
          {/* Identity Card */}
          <div className=" ">
            <div className="identity-header">
              <div className="avatar-wrapper">
                {currentUser?.full_name?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div>
                <h3 className="identity-name">{currentUser?.full_name || 'System Administrator'}</h3>
                <span className="role-badge">{adminRoleDisplay}</span>
              </div>
            </div>

            <div className="divider" />

            <form onSubmit={handleUpdateProfile} className="form">
              <div className="input-group">
                <label className="input-label"><User size={12} /> FULL NAME</label>
                <input 
                  type="text" 
                  value={fullName} 
                  onChange={e => setFullName(e.target.value)} 
                  className="input" 
                  required
                />
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

              <div className="input-group">
                <label className="input-label">PHONE NUMBER</label>
                <input 
                  type="text" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                  className="input" 
                />
              </div>
              <button type="submit" disabled={isSaving} style={btnStyle('var(--primary)')}>
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Kept empty now since mock features are removed */}
        <div className="column">
        </div>
      </div>
    </div>
  );
};

// --- STYLING CONSTANTS ---
const btnStyle = (color: string): React.CSSProperties => ({
  marginTop: '8px',
  padding: '10px 16px',
  backgroundColor: color,
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.82rem',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  transition: 'opacity 0.2s',
  opacity: 1
});
