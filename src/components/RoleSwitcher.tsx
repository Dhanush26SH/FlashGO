import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ShoppingBag, CheckSquare, Truck, ShieldAlert, Award, Compass, Sun, Moon } from 'lucide-react';
import type { UserRole } from '../services/db';

export const RoleSwitcher: React.FC = () => {
  const { activeRole, setActiveRole, orders, theme, toggleTheme, products } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  // Compute live indicator counts
  const pendingPickingCount = orders.filter(o => o.status === 'placed').length;
  const pendingDeliveryCount = orders.filter(o => o.status === 'packed').length;
  const lowStockCount = products.filter(p => p.stock_quantity < 15).length;

  const roles: { val: UserRole; label: string; icon: React.ReactNode; desc: string; badge?: number }[] = [
    { 
      val: 'customer', 
      label: 'Customer App', 
      icon: <ShoppingBag size={18} />, 
      desc: 'Shop groceries, track live, manage subscription pass' 
    },
    { 
      val: 'picker', 
      label: 'Picker App', 
      icon: <CheckSquare size={18} />, 
      desc: 'Pick assigned orders, scan barcodes, handle out-of-stock',
      badge: pendingPickingCount 
    },
    { 
      val: 'driver', 
      label: 'Delivery Partner', 
      icon: <Truck size={18} />, 
      desc: 'Navigate routes, complete delivery OTP verification, view earnings',
      badge: pendingDeliveryCount 
    },
    { 
      val: 'warehouse_staff', 
      label: 'Warehouse Manager', 
      icon: <ShieldAlert size={18} />, 
      desc: 'Restock inventory, manage vendors, create procurement drafts',
      badge: lowStockCount 
    },
    { 
      val: 'admin', 
      label: 'Super Admin Dashboard', 
      icon: <Award size={18} />, 
      desc: 'Fleet telemetry maps, real-time sales KPIs, edit CMS & coupon codes' 
    }
  ];

  const activeRoleLabel = roles.find(r => r.val === activeRole)?.label || 'Customer';

  return (
    <div style={containerStyle}>
      {/* Dynamic Theme & System Trigger buttons */}
      <div style={controlsRowStyle}>
        <button 
          onClick={toggleTheme} 
          style={actionButtonStyle} 
          title="Toggle Light/Dark Theme"
        >
          {theme === 'light' ? <Moon size={16} color="#0f172a" /> : <Sun size={16} color="#fbbf24" />}
        </button>

        <button 
          onClick={() => setIsOpen(!isOpen)} 
          style={triggerButtonStyle(isOpen)}
        >
          <Compass size={18} className="pulse-active" />
          <span>{activeRoleLabel}</span>
          <div style={arrowStyle(isOpen)}>▼</div>
        </button>
      </div>

      {isOpen && (
        <div style={menuStyle} className="glass-panel animate-slide-up">
          <div style={menuHeaderStyle}>
            <div style={menuHeaderTitleStyle}>FlashGO Workspace Role Switcher</div>
            <div style={menuHeaderSubStyle}>Switch roles to trace the quick-commerce order lifecycle.</div>
          </div>

          <div style={roleListStyle}>
            {roles.map(r => {
              const isCurrent = r.val === activeRole;
              return (
                <button
                  key={r.val}
                  onClick={() => {
                    setActiveRole(r.val);
                    setIsOpen(false);
                  }}
                  style={roleButtonStyle(isCurrent)}
                >
                  <div style={iconContainerStyle(isCurrent)}>
                    {r.icon}
                  </div>
                  <div style={roleMetaStyle}>
                    <div style={roleLabelStyle(isCurrent)}>
                      {r.label}
                      {r.badge !== undefined && r.badge > 0 && (
                        <span style={badgeStyle}>{r.badge}</span>
                      )}
                    </div>
                    <div style={roleDescStyle}>{r.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// --- INLINE premium STYLES ---
const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  zIndex: 9999,
  fontFamily: 'var(--font-heading)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '12px',
};

const controlsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
};

const actionButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-elevated)',
  border: '1px solid var(--border-light)',
  borderRadius: '50%',
  width: '42px',
  height: '42px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: 'var(--shadow-md)',
  transition: 'transform var(--transition-fast)',
};

const triggerButtonStyle = (isOpen: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  padding: '0 20px',
  height: '42px',
  borderRadius: '21px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.9rem',
  boxShadow: '0 8px 24px var(--primary-glow)',
  transform: isOpen ? 'scale(0.98)' : 'scale(1)',
  transition: 'all var(--transition-fast)',
});

const arrowStyle = (isOpen: boolean): React.CSSProperties => ({
  fontSize: '0.7rem',
  transition: 'transform var(--transition-normal)',
  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
});

const menuStyle: React.CSSProperties = {
  width: '360px',
  padding: '16px',
  maxHeight: '480px',
  overflowY: 'auto',
  borderRadius: 'var(--border-radius-md)',
  backgroundColor: 'var(--bg-glass)',
  border: '1px solid var(--border-light)',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const menuHeaderStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '10px',
};

const menuHeaderTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
};

const menuHeaderSubStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  marginTop: '2px',
};

const roleListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const roleButtonStyle = (isCurrent: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  width: '100%',
  padding: '10px',
  borderRadius: 'var(--border-radius-sm)',
  border: '1px solid ' + (isCurrent ? 'var(--primary)' : 'transparent'),
  backgroundColor: isCurrent ? 'var(--primary-glow)' : 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'all var(--transition-fast)',
  outline: 'none',
});

const iconContainerStyle = (isCurrent: boolean): React.CSSProperties => ({
  backgroundColor: isCurrent ? 'var(--primary)' : 'var(--border-light)',
  color: isCurrent ? '#ffffff' : 'var(--text-secondary)',
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: 'all var(--transition-fast)',
});

const roleMetaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const roleLabelStyle = (isCurrent: boolean): React.CSSProperties => ({
  fontSize: '0.85rem',
  fontWeight: 600,
  color: isCurrent ? 'var(--primary)' : 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

const roleDescStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.3,
};

const badgeStyle: React.CSSProperties = {
  backgroundColor: 'var(--danger)',
  color: '#ffffff',
  fontSize: '0.65rem',
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '10px',
  lineHeight: 1,
};
