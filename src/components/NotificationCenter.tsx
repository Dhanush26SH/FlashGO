import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { supabase } from '../services/api/supabaseClient';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  metadata?: any;
  entity_id?: string;
  created_at: string;
}

export const NotificationCenter: React.FC = () => {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    
    fetchNotifications();
    
    const sub = supabase
      .channel('public:notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: 'recipient_id=eq.' + currentUser.id
      }, (payload: any) => {
        const newNotif = payload.new as Notification;
        setNotifications(prev => {
          if (prev.some(n => n.id === newNotif.id)) return prev;
          return [newNotif, ...prev];
        });
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', currentUser!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (!error && data) {
        setNotifications(data);
        setUnreadCount(data.filter((n: any) => !n.is_read).length);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await supabase.rpc('mark_notification_read', { p_notification_id: id });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      await supabase.rpc('mark_all_notifications_read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) {
      markRead(n.id);
    }
    setIsOpen(false);
    
    // SAFE NAVIGATION CORRECTION
    // Do not blindly execute metadata.route. Map known types to known screens.
    let route = '';
    switch (n.type) {
      case 'ORDER_CONFIRMED':
      case 'ORDER_OUT_FOR_DELIVERY':
      case 'ORDER_DELIVERED':
      case 'ORDER_CANCELLED':
        route = `/customer/orders/${n.entity_id}`;
        break;
      case 'SUBSTITUTION_REQUIRED':
        route = `/customer/orders/${n.entity_id}`;
        break;
      case 'SUPPORT_TICKET_UPDATED':
      case 'REFUND_COMPLETED':
      case 'EXTERNAL_REFUND_PENDING':
        route = '/customer/support';
        break;
      case 'ORDER_ASSIGNED':
      case 'SUBSTITUTION_APPROVED':
      case 'SUBSTITUTION_REJECTED':
        route = '/staff/orders';
        break;
      case 'TRIP_ASSIGNED':
      case 'TRIP_CANCELLED':
        route = '/staff/delivery';
        break;
      case 'SHIFT_SCHEDULE_CHANGED':
        route = '/staff/profile';
        break;
      default:
        // No explicit mapping
        return;
    }
    
    navigate(route);
  };

  if (!currentUser) return null;

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          background: 'transparent', 
          border: 'none', 
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px',
          color: 'var(--text-primary)'
        }}
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            backgroundColor: 'var(--danger)',
            color: 'white',
            borderRadius: '50%',
            width: '18px',
            height: '18px',
            fontSize: '0.65rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          width: '320px',
          maxHeight: '400px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          marginTop: '8px'
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
              >
                Mark all read
              </button>
            )}
          </div>
          
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Bell size={32} style={{ opacity: 0.2, margin: '0 auto 12px auto', display: 'block' }} />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border-light)',
                    backgroundColor: n.is_read ? 'transparent' : 'rgba(var(--primary-rgb), 0.05)',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    position: 'relative',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: n.is_read ? 600 : 800, color: 'var(--text-primary)' }}>
                      {n.title}
                    </span>
                    {!n.is_read && (
                      <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary)', borderRadius: '50%', display: 'inline-block' }} />
                    )}
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {n.message}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                    {!n.is_read && (
                      <button 
                        onClick={(e) => markRead(n.id, e)}
                        style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-muted)', cursor: 'pointer' }}
                        title="Mark as read"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
