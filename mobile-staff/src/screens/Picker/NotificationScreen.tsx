import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, MoreVertical, Radio, Bell } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function NotificationScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);

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

      <Text style={styles.greetingText}>Hello {profile?.full_name || 'Staff'},</Text>
      
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
    <View style={styles.notificationCard}>
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Radio size={24} color="#3b82f6" />
        </View>
        <Text style={styles.cardTitle}>
          🌧️ It's Raining Bonuses! Earn Extra{'\n'}2 hours Now ! 💰
        </Text>
      </View>

      <Text style={styles.greetingText}>Hello {profile?.full_name || 'Staff-982'},</Text>
      
      <Text style={styles.bodyText}>
        Don't let the rain slow you down—let it boost your earnings!
      </Text>

      <Text style={styles.bodyText}>
        🎉 Earn EXTRA on every eligible slot you complete.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notification</Text>
          <Text style={styles.userDetails}>16.26.3 | GCEBOD76301586719 | 5499 | 0</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn}>
          <MoreVertical size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Subheader */}
      <View style={styles.subheader}>
        <Text style={styles.subheaderText}>Pending notifications - {notifications.filter(n => !n.is_read).length}</Text>
      </View>

      {/* Notifications List */}
      <ScrollView style={styles.listContainer}>
        {notifications.length > 0 ? (
          notifications.map(n => renderNotification(n))
        ) : (
          renderFallback()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55, // For status bar
    paddingBottom: 16,
    backgroundColor: '#10b981', // Solid FlashGO Green Header
    borderBottomWidth: 0,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 10
  },
  headerBtn: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  userDetails: {
    fontSize: 12,
    color: '#d1fae5',
    fontWeight: '600',
  },
  subheader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  subheaderText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  notificationCard: {
    backgroundColor: '#ffffff', 
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'center',
  },
  iconContainer: {
    width: 52,
    height: 52,
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 24,
  },
  greetingText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 24,
  },
  ackButton: {
    backgroundColor: '#10b981', // FlashGO Premium Green
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  ackButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
