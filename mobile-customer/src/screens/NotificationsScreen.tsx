import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Bell, CheckCheck, Package, AlertCircle, RefreshCw, HeadphonesIcon, Info } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function NotificationsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { sessionUser } = useMobileAppContext();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionUser?.id) {
      fetchNotifications();
      
      const channel = supabase
        .channel('customer_notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${sessionUser.id}`
          },
          (payload) => {
            setNotifications(prev => {
              // Deduplicate
              if (prev.find(n => n.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
          }
        )
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [sessionUser?.id]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', sessionUser.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setNotifications(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error: err } = await supabase.rpc('mark_notification_read', { p_notification_id: id });
      if (err) throw err;
      
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err: any) {
      console.error('Failed to mark read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error: err } = await supabase.rpc('mark_all_notifications_read');
      if (err) throw err;
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleNotificationTap = async (notification: any) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    const { type, entity_type, entity_id } = notification;

    if (type.includes('ORDER') || entity_type === 'orders') {
      if (type === 'ORDER_OUT_FOR_DELIVERY' || type === 'ORDER_CONFIRMED' || type === 'ORDER_DELIVERED') {
        navigation.navigate('Tracking', { orderId: entity_id });
      } else {
        navigation.navigate('MainTabs' as any, { screen: 'Orders' });
      }
    } else if (type.includes('SUBSTITUTION') || entity_type === 'order_substitutions') {
      // substitution notifications hold the orderId in metadata or entity_id is substitution id.
      // Usually metadata contains route: '/customer/orders/order_id'
      let orderId = notification.metadata?.order_id;
      const routeStr = notification.metadata?.route;
      if (!orderId && routeStr && routeStr.includes('/orders/')) {
        orderId = routeStr.split('/orders/')[1];
      }
      
      if (orderId) {
        navigation.navigate('Tracking', { orderId });
      } else {
        navigation.navigate('MainTabs' as any, { screen: 'Orders' });
      }
    } else if (type.includes('SUPPORT') || entity_type === 'support_tickets') {
      navigation.navigate('MainTabs' as any, { screen: 'Support' });
    } else if (type.includes('REFUND')) {
      navigation.navigate('MainTabs' as any, { screen: 'Support' });
    } else {
      // Fallback
    }
  };

  const renderIcon = (type: string) => {
    if (type.includes('ORDER')) return <Package size={20} color={theme.colors.primary} />;
    if (type.includes('SUPPORT')) return <HeadphonesIcon size={20} color={theme.colors.primary} />;
    if (type.includes('REFUND')) return <RefreshCw size={20} color={theme.colors.success} />;
    if (type.includes('CANCEL')) return <AlertCircle size={20} color={theme.colors.danger} />;
    return <Info size={20} color={theme.colors.textMuted} />;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <AlertCircle size={48} color={theme.colors.danger} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchNotifications}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {notifications.some(n => !n.is_read) && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
            <CheckCheck size={16} color={theme.colors.primary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Bell size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyStateTitle}>No Notifications</Text>
            <Text style={styles.emptyStateSub}>You're all caught up!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notificationCard, !item.is_read && styles.unreadCard]}
            onPress={() => handleNotificationTap(item)}
          >
            <View style={styles.iconContainer}>
              {renderIcon(item.type)}
            </View>
            <View style={styles.contentContainer}>
              <Text style={[styles.notifTitle, !item.is_read && styles.unreadText]}>{item.title}</Text>
              <Text style={styles.notifMessage} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.notifTime}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
            {!item.is_read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60, // Safe area approximation
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  markAllText: {
    marginLeft: 4,
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'flex-start',
  },
  unreadCard: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  iconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  contentContainer: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  unreadText: {
    color: theme.colors.primary,
  },
  notifMessage: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 8,
    lineHeight: 20,
  },
  notifTime: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginLeft: 8,
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSub: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.danger,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  }
});
