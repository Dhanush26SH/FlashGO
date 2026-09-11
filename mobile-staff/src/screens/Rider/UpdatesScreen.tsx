import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Radio, AlertTriangle, HelpCircle, User } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function UpdatesScreen({ navigation }: any) {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      fetchNotifications();
    }
  }, [profile]);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    fetchNotifications();
  };

  const renderNotification = (notif: any) => (
    <View key={notif.id} style={[styles.notificationCard, notif.is_read && { opacity: 0.6 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Radio size={24} color="#3b82f6" />
        </View>
        <Text style={styles.cardTitle}>
          {notif.title}
        </Text>
      </View>

      <Text style={styles.greetingText}>Hello {profile?.full_name || 'Driver-982'},</Text>
      
      <Text style={styles.bodyText}>
        {notif.message}
      </Text>

      {!notif.is_read && (
        <TouchableOpacity style={styles.ackButton} onPress={() => markAsRead(notif.id)}>
          <Text style={styles.ackButtonText}>ACK</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderFallback = () => (
    <View style={[styles.notificationCard, { alignItems: 'center', padding: 32 }]}>
      <Text style={{ color: '#a1a1aa', fontSize: 14 }}>No pending updates.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.onlineBadge}>
          <Text style={styles.onlineText}>{isOnline ? 'Online' : 'Offline'}</Text>
          <Switch 
            value={isOnline} 
            onValueChange={setIsOnline}
            trackColor={{ false: '#3f3f46', true: '#10b981' }}
            thumbColor={'#ffffff'}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconCircle}>
            <AlertTriangle color="#f59e0b" size={16} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconCircle}>
            <HelpCircle color="#9ca3af" size={16} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileCircle} onPress={() => navigation.navigate('Profile')}>
            <User color="#9ca3af" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Updates</Text>
        <Text style={styles.pageSub}>Pending notifications - {notifications.filter(n => !n.is_read).length}</Text>
        
        {notifications.length > 0 ? (
          notifications.map(renderNotification)
        ) : (
          renderFallback()
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 4,
  },
  onlineText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  scrollBody: {
    padding: 16,
  },
  pageTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  pageSub: {
    color: '#a1a1aa',
    fontSize: 14,
    marginBottom: 24,
  },
  notificationCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  greetingText: {
    color: '#d4d4d8',
    fontSize: 14,
    marginBottom: 12,
  },
  bodyText: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  ackButton: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  ackButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
