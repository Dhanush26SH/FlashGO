import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AdminView } from './views/Admin/AdminView';
import { LandingView } from './views/Landing/LandingView';
import { LoginView } from './views/Auth/LoginView';
import { SignupView } from './views/Auth/SignupView';
import { PickerView } from './views/Picker/PickerView';
import { DeliveryView } from './views/Delivery/DeliveryView';
import { WarehouseView } from './views/Warehouse/WarehouseView';

import type { UserRole } from './types';

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: UserRole[] }> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isAuthReady, activeRole } = useApp();
  
  if (!isAuthReady) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
        Verifying session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(activeRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AdminLayout: React.FC = () => {
  return (
    <div style={containerStyle}>
      {/* Dedicated Super Admin Control Center Header Banner */}
      <div style={telemetryBannerStyle} className="glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={telemetryDotStyle} />
          <strong style={{ color: 'var(--primary)' }}>FLASHGO SUPER ADMIN CONTROL CENTER</strong>
        </div>
        <div style={telemetryBannerRightStyle}>
          <span>Portal: <strong>WEBSITE SYSTEM</strong></span> |
          <span>System Status: <strong>ONLINE</strong></span>
        </div>
      </div>

      <div style={workspaceMainStyle}>
        <Outlet />
      </div>

    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingView />} />
          <Route path="/login" element={<LoginView />} />
          <Route path="/signup" element={<SignupView />} />

          {/* Admin & Warehouse routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'warehouse_staff']}><AdminLayout /></ProtectedRoute>}>
            <Route path="/admin" element={<AdminView />} />
            <Route path="/warehouse" element={<WarehouseView />} />
          </Route>

          {/* Picker route */}
          <Route path="/picker" element={
            <ProtectedRoute allowedRoles={['picker']}>
              <PickerView />
            </ProtectedRoute>
          } />

          {/* Driver / Delivery route */}
          <Route path="/delivery" element={
            <ProtectedRoute allowedRoles={['driver']}>
              <DeliveryView />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
      {/* Dynamic Toast Notifications */}
      <ToastContainer />
      {/* Global Fallback Banner */}
      <FallbackBanner />
    </AppProvider>
  );
}

// --- GLOBAL WORKSPACE STYLES ---
const containerStyle: React.CSSProperties = {
  height: '100vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
  transition: 'background-color var(--transition-normal), color var(--transition-normal)'
};

const telemetryBannerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 24px',
  margin: 0,
  borderRadius: 0,
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  backgroundColor: 'var(--bg-glass)',
  border: 'none',
  borderBottom: '1px solid var(--border-light)',
  boxShadow: 'var(--shadow-sm)'
};

const telemetryDotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: 'var(--primary)',
  boxShadow: '0 0 8px var(--primary)'
};

const telemetryBannerRightStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center'
};

const workspaceMainStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  return (
    <div style={toastContainerStyle}>
      {toasts.map((t) => (
        <div 
          key={t.id} 
          onClick={() => removeToast(t.id)}
          style={toastCardStyle(t.type)} 
          className="glass-panel"
        >
          <span style={toastIconStyle(t.type)}>
            {t.type === 'success' ? '⚡' : t.type === 'warning' ? '🚴' : t.type === 'error' ? '❌' : '🍳'}
          </span>
          <div style={{ flexGrow: 1, fontSize: '0.78rem', fontWeight: 600 }}>{t.message}</div>
          <button style={toastCloseButtonStyle}>✕</button>
        </div>
      ))}
    </div>
  );
};

const toastContainerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  zIndex: 99999,
  maxWidth: '380px',
  width: '100%'
};

const toastCardStyle = (type: string): React.CSSProperties => {
  const borderColors: Record<string, string> = {
    success: 'var(--primary)',
    warning: 'var(--accent)',
    error: 'var(--danger)',
    info: 'var(--info)'
  };
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 18px',
    backgroundColor: 'var(--bg-surface)',
    border: `1px solid ${borderColors[type] || 'var(--border-light)'}`,
    boxShadow: 'var(--shadow-lg)',
    cursor: 'pointer',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-primary)',
    animation: 'slide-up var(--transition-normal) forwards'
  };
};

const toastIconStyle = (type: string): React.CSSProperties => {
  const bgColors: Record<string, string> = {
    success: 'var(--primary-glow)',
    warning: 'var(--accent-glow)',
    error: 'rgba(239, 68, 68, 0.15)',
    info: 'rgba(59, 130, 246, 0.15)'
  };
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: bgColors[type] || 'var(--border-light)',
    fontSize: '0.9rem',
    flexShrink: 0
  };
};

const toastCloseButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: '4px',
  flexShrink: 0
};

const FallbackBanner: React.FC = () => {
  const { fallbackState } = useApp();

  if (fallbackState.type === 'none') return null;

  return (
    <div style={fallbackBannerStyle}>
      <span style={{ fontSize: '1.2rem' }}>{fallbackState.type === 'full' ? '🔌' : '⚠️'}</span>
      <div style={{ flexGrow: 1 }}>
        <strong style={{ display: 'block', fontSize: '0.85rem' }}>
          {fallbackState.type === 'full' ? 'Offline Mode' : 'Degraded Mode'}
        </strong>
        <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
          {fallbackState.type === 'full' 
            ? 'Application is disconnected. Operating entirely from local fallback data.'
            : `Some data sources are unreachable. Serving local fallback for: ${fallbackState.failedModules.join(', ')}`}
        </span>
      </div>
    </div>
  );
};

const fallbackBannerStyle: React.CSSProperties = {
  position: 'fixed',
  top: '16px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 999999,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 24px',
  backgroundColor: 'var(--bg-glass)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid var(--accent)',
  boxShadow: '0 8px 32px rgba(234, 179, 8, 0.15)',
  borderRadius: '32px',
  color: 'var(--text-primary)',
  maxWidth: '90%',
  width: 'max-content',
  animation: 'slide-down var(--transition-normal) forwards'
};

