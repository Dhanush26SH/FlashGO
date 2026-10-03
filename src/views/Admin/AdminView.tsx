import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  BarChart3, 
  ShoppingBag, 
  BookOpen, 
  Warehouse, 
  Users, 
  Gift, 
  Megaphone, 
  Settings, 
  Sparkles,
  ShieldCheck,
  Map,
  Truck,
  IndianRupee,
  User,
  LogOut,
  Bell,
  Navigation,
  Calendar,
  CalendarDays,
  QrCode,
  X,
  Package
} from 'lucide-react';

// Import newly refactored sub-modules
import { OverviewDashboard } from './modules/OverviewDashboard';
import { OrderManagement } from './modules/OrderManagement';
import { ProductCatalog } from './modules/ProductCatalog';
import { InventoryWarehouse } from './modules/InventoryWarehouse';
import { PickerOffersManagement } from './modules/PickerOffersManagement';
import { AdminProfile } from './modules/AdminProfile';
import { MarketingCMS } from './modules/MarketingCMS';
import { SupportSettings } from './modules/SupportSettings';
import { NotificationCenter as NotificationWidget } from '../../components/NotificationCenter';
import { DeliveryOperations } from './modules/DeliveryOperations';

import { WarehouseTasks } from './modules/WarehouseTasks';
import { FinanceSettlements } from './modules/FinanceSettlements';
import { ProcurementSupplier } from './modules/ProcurementSupplier';
import { AnalyticsReports } from './modules/AnalyticsReports';
import { RevenueReports } from './modules/RevenueReports';
import { NotificationCenter } from './modules/NotificationCenter';
import { FleetManagement } from './modules/FleetManagement';
import { DropZoneManagement } from './modules/DropZoneManagement';
import { WorkSlotManagement } from './modules/WorkSlotManagement';
import { DriverApprovals } from './modules/DriverApprovals';
import { WorkforceActivity } from './modules/WorkforceActivity';
import { WarehouseQRDisplay } from './components/WarehouseQRDisplay';

export const AdminView: React.FC = () => {
  const { theme, toggleTheme, currentUser, logout } = useApp();
  
  const [showStoreQR, setShowStoreQR] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | undefined>();
  const [pendingSupportTicketId, setPendingSupportTicketId] = useState<string | undefined>();
  const [pendingCustomerReturnTaskId, setPendingCustomerReturnTaskId] = useState<string | undefined>();
  
  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'catalog' | 'inventory' | 'drop_zones' | 'warehouse_tasks' | 'driver_approvals' | 'delivery' | 'profile' | 'procurement' | 'customers' | 'finance' | 'revenue_reports' | 'marketing' | 'settings' | 'analytics' | 'notifications' | 'fleet' | 'work_slots' | 'picker_offers' | 'workforce_history'
  >('overview');

  React.useEffect(() => {
    const handleNav = (e: Event) => {
      const target = (e as CustomEvent).detail;
      if (typeof target === 'string') {
        setActiveTab(target as any);
      } else if (target && typeof target === 'object') {
        if (target.tab) setActiveTab(target.tab);
        if (target.orderId) setPendingOrderId(target.orderId);
        if (target.supportTicketId) setPendingSupportTicketId(target.supportTicketId);
        if (target.customerReturnTaskId) setPendingCustomerReturnTaskId(target.customerReturnTaskId);
      }
    };
    window.addEventListener('NAVIGATE_ADMIN_TAB', handleNav);
    return () => window.removeEventListener('NAVIGATE_ADMIN_TAB', handleNav);
  }, []);

  // Map real user role to dashboard clearance levels
  const adminClearance = 
    currentUser?.role === 'admin' ? 'super_admin' : 
    currentUser?.role === 'warehouse_manager' ? 'warehouse_manager' :
    currentUser?.role === 'warehouse_staff' ? 'warehouse_lead' : 
    'none';

  // Sidebar Menu Config
  const menuItems = [
    { id: 'overview', label: 'Platform Overview', icon: <BarChart3 size={16} />, clearance: ['super_admin', 'support_ops', 'warehouse_lead'] },
    { id: 'orders', label: 'General Order Desk', icon: <ShoppingBag size={16} />, clearance: ['super_admin', 'support_ops'] },
    { id: 'delivery', label: 'Live Delivery Map', icon: <Map size={16} />, clearance: ['super_admin', 'support_ops'] },
    { id: 'catalog', label: 'Catalog Manager', icon: <BookOpen size={16} />, clearance: ['super_admin', 'warehouse_lead'] },
    { id: 'inventory', label: 'Inventory & Stock', icon: <Warehouse size={16} />, clearance: ['super_admin', 'warehouse_manager', 'warehouse_lead'] },
    { id: 'drop_zones', label: 'Drop Zone Management', icon: <Package size={16} />, clearance: ['super_admin', 'warehouse_manager', 'warehouse_lead'] },
    { id: 'warehouse_tasks', label: 'Warehouse Tasks', icon: <Map size={16} />, clearance: ['super_admin', 'warehouse_manager', 'warehouse_lead'] },
    { id: 'workforce_history', label: 'Staff Work History', icon: <CalendarDays size={16} />, clearance: ['super_admin', 'warehouse_manager'] },
    { id: 'picker_offers', label: 'Picker Offers', icon: <Gift size={16} />, clearance: ['super_admin', 'warehouse_manager'] },
    { id: 'driver_approvals', label: 'Staff Approvals', icon: <Users size={16} />, clearance: ['super_admin', 'warehouse_manager'] },
    { id: 'procurement', label: 'Procurement & Replenishment', icon: <Truck size={16} />, clearance: ['super_admin', 'warehouse_manager', 'warehouse_lead'] },
    { id: 'finance', label: 'Finance & Settlements', icon: <IndianRupee size={16} />, clearance: ['super_admin'] },
    { id: 'revenue_reports', label: 'Revenue & Reports', icon: <BarChart3 size={16} />, clearance: ['super_admin'] },
    { id: 'fleet', label: 'Fleet Management', icon: <Navigation size={16} />, clearance: ['super_admin', 'support_ops'] },
    { id: 'work_slots', label: 'Work Slot Management', icon: <Calendar size={16} />, clearance: ['super_admin', 'warehouse_manager'] },

    { id: 'settings', label: 'Support & CRM', icon: <Settings size={16} />, clearance: ['super_admin'] },

    // --- HIDDEN PAGES (Under Development - Uncomment to restore) ---
    // { id: 'marketing', label: 'Marketing CMS Alerts', icon: <Megaphone size={16} />, clearance: ['super_admin'] },
    // { id: 'analytics', label: 'Analytics & Reports', icon: <BarChart3 size={16} />, clearance: ['super_admin'] },
    // { id: 'notifications', label: 'Notification Center', icon: <Bell size={16} />, clearance: ['super_admin'] }
    // ---------------------------------------------------------------
  ] as const;

  // Determine if active selection is permitted under current simulated role
  const activeItem = menuItems.find(m => m.id === activeTab);
  const isPermitted = activeTab === 'profile' ? true : (activeItem?.clearance as readonly string[] | undefined)?.includes(adminClearance);

  const renderModuleContent = () => {
    if (currentUser === undefined) {
      return (
        <div style={restrictedContainerStyle} className="glass-panel">
          <Sparkles size={48} color="var(--primary)" style={{ marginBottom: '16px', opacity: 0.8 }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Authenticating User...</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px', textAlign: 'center', marginTop: '8px', lineHeight: 1.4 }}>
            Please wait while we verify your security clearance level.
          </p>
        </div>
      );
    }

    if (!isPermitted) {
      return (
        <div style={restrictedContainerStyle} className="glass-panel">
          <ShieldCheck size={48} color="var(--danger)" style={{ marginBottom: '16px', opacity: 0.8 }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Security Clearance Required</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '400px', textAlign: 'center', marginTop: '8px', lineHeight: 1.4 }}>
            The current active employee clearance level (<strong>{adminClearance.replace('_', ' ').toUpperCase()}</strong>) does not have read/write access privileges to the requested panel.
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'overview':
        return <OverviewDashboard />;
      case 'orders':
        return <OrderManagement pendingOrderId={pendingOrderId} pendingSupportTicketId={pendingSupportTicketId} onOrderOpened={() => { setPendingOrderId(undefined); setPendingSupportTicketId(undefined); }} />;
      case 'delivery':
        return <DeliveryOperations />;
      case 'catalog':
        return <ProductCatalog />;
      case 'inventory':
        return <InventoryWarehouse />;
      case 'drop_zones':
        return <DropZoneManagement />;
      case 'warehouse_tasks':
        return <WarehouseTasks />;

      case 'workforce_history':
        return <WorkforceActivity pendingCustomerReturnTaskId={pendingCustomerReturnTaskId} />;
      case 'picker_offers':
        return <PickerOffersManagement />;
      case 'driver_approvals':
        return <DriverApprovals />;
      case 'profile':
        return <AdminProfile />;
      case 'procurement':
        return <ProcurementSupplier />;
      case 'finance':
        return <FinanceSettlements />;
      case 'revenue_reports':
        return <RevenueReports />;
      case 'marketing':
        return <MarketingCMS />;
      case 'analytics':
        return <AnalyticsReports />;
      case 'settings':
        return <SupportSettings />;
      case 'notifications':
        return <NotificationCenter />;
      case 'fleet':
        return <FleetManagement />;
      case 'work_slots':
        return <WorkSlotManagement />;
      default:
        return <OverviewDashboard />;
    }
  };

  return (
    <div style={rootContainerStyle}>
      
      {/* Sidebar Navigation */}
      <aside style={sidebarStyle} className="glass-panel">
        <div style={logoWrapperStyle}>
          <Sparkles size={20} color="var(--primary)" />
          <h1 style={logoTitleStyle}>Flash<span style={{ color: 'var(--primary)' }}>GO</span></h1>
          <span style={logoBadgeStyle}>CORE</span>
        </div>

        <div style={dividerStyle} />

        {/* Menu Navigation items */}
        <nav style={navStyle}>
          {menuItems.map(item => {
            const hasAccess = item.clearance.includes(adminClearance as any);
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={navItemStyle(isActive, hasAccess)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {item.icon}
                  <span style={navLabelStyle}>{item.label}</span>
                </div>
                {!hasAccess && <span style={lockIndicatorStyle}>🔒</span>}
              </button>
            );
          })}
        </nav>

        <div style={sidebarFooterStyle}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>VERSION 4.2 (PROD-ENTERPRISE)</div>
          <button onClick={toggleTheme} style={themeToggleBtnStyle}>
            Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div style={mainWorkspaceStyle}>
        
        {/* Unified Administrative Header */}
        <header style={headerStyle} className="glass-panel">
          <div>
            <h2 style={headerTitleStyle}>Platform Central Control Board</h2>
            <div style={headerSubtitleStyle}>
              Logged in: <strong>SuperAdmin Profile</strong> | Mode: Enterprise REST Cloud
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={() => setShowStoreQR(true)} 
              style={{
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                backgroundColor: 'var(--bg-base)', 
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <QrCode size={16} /> Store QR
            </button>
            <NotificationWidget />
            <button 
              onClick={() => setActiveTab('profile')} 
              style={{
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                backgroundColor: activeTab === 'profile' ? 'var(--primary-glow)' : 'var(--bg-base)', 
                color: activeTab === 'profile' ? 'var(--primary)' : 'var(--text-primary)',
                border: '1px solid var(--border-light)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <User size={16} /> My Profile
            </button>
            <button
              onClick={() => logout()}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--danger)',
                border: '1px solid var(--danger)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        {showStoreQR && (
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} 
            onClick={() => setShowStoreQR(false)}
          >
            <div 
              className="form-container glass-panel animate-slide-up" 
              style={{ padding: '0', borderRadius: '12px', width: '90%', maxWidth: '420px', backgroundColor: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }} 
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', padding: '16px 24px' }}>
                <div style={{ fontWeight: 700, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <QrCode size={20} />
                  Store QR
                </div>
                <button onClick={() => setShowStoreQR(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>
              <div style={{ padding: 0 }}>
                <WarehouseQRDisplay />
              </div>
            </div>
          </div>
        )}

        {/* Core Sub-view Container */}
        <main style={workspaceContentStyle}>
          {renderModuleContent()}
        </main>
      </div>

    </div>
  );
};

// --- SIDEBAR SHELL STYLES ---
const rootContainerStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontFamily: "'Outfit', 'Inter', sans-serif"
};

const sidebarStyle: React.CSSProperties = {
  width: '260px',
  height: '100%',
  flexShrink: 0,
  background: 'var(--bg-glass)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderRight: '1px solid var(--border-light)',
  padding: '24px 16px',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 100,
  borderRadius: 0,
  overflowY: 'auto'
};

const logoWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  paddingLeft: '8px'
};

const logoTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 900,
  letterSpacing: '-0.02em',
  fontFamily: 'var(--font-heading)'
};

const logoBadgeStyle: React.CSSProperties = {
  fontSize: '0.52rem',
  fontWeight: 900,
  backgroundColor: 'var(--primary-glow)',
  color: 'var(--primary)',
  padding: '2px 5px',
  borderRadius: '4px',
  letterSpacing: '0.04em'
};

const dividerStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: 'var(--border-light)',
  margin: '20px 0'
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flex: 1
};

const navItemStyle = (active: boolean, hasAccess: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: active ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
  background: active ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))' : 'transparent',
  color: active ? 'var(--primary)' : hasAccess ? 'var(--text-secondary)' : 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'all var(--transition-fast)',
  outline: 'none',
  textAlign: 'left',
  boxShadow: active ? '0 0 16px rgba(16, 185, 129, 0.15)' : 'none'
});

const navLabelStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700
};

const lockIndicatorStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  opacity: 0.6
};

const sidebarFooterStyle: React.CSSProperties = {
  marginTop: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  paddingLeft: '8px'
};

const themeToggleBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.72rem',
  fontWeight: 800,
  borderRadius: '6px',
  border: '1px solid var(--border-light)',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-secondary)',
  cursor: 'pointer'
};

const mainWorkspaceStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden'
};

const headerStyle: React.CSSProperties = {
  padding: '14px 24px',
  background: 'var(--bg-glass)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderBottom: '1px solid var(--border-light)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderRadius: 0,
  position: 'sticky',
  top: 0,
  zIndex: 50
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 800
};

const headerSubtitleStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-secondary)',
  marginTop: '4px'
};


const workspaceContentStyle: React.CSSProperties = {
  padding: '24px',
  flex: 1,
  overflowY: 'auto',
  minHeight: 0
};

const restrictedContainerStyle: React.CSSProperties = {
  padding: '64px 32px',
  backgroundColor: 'var(--bg-surface)',
  borderRadius: 'var(--border-radius-md)',
  border: '1px solid var(--border-light)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: '32px'
};

const elevateClearanceBtnStyle: React.CSSProperties = {
  marginTop: '20px',
  padding: '10px 20px',
  backgroundColor: 'var(--primary)',
  color: 'var(--bg-surface)',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.78rem',
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-md)'
};

export { elevateClearanceBtnStyle };
