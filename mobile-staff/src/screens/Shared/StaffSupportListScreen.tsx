import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Plus, MessageSquare, ChevronRight, Clock } from 'lucide-react-native';
import { StaffSupportService, StaffSupportTicket } from '../../services/StaffSupportService';
import { supabase } from '../../lib/supabase';

export default function StaffSupportListScreen() {
  const navigation = useNavigation<any>();
  const [tickets, setTickets] = useState<StaffSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await StaffSupportService.getTickets();
      setTickets(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTickets();

      const subscription = supabase
        .channel('staff_support_tickets_list')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'staff_support_tickets' },
          (payload) => {
            setTickets((prev) =>
              prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as StaffSupportTicket : t)
            );
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }, [])
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return '#10B981';
      case 'closed': return '#6B7280';
      default: return '#F59E0B';
    }
  };

  const renderTicket = ({ item }: { item: StaffSupportTicket }) => (
    <TouchableOpacity 
      style={styles.ticketCard} 
      onPress={() => navigation.navigate('StaffSupportChat', { ticketId: item.id })}
    >
      <View style={styles.ticketHeader}>
        <View style={[styles.badge, { backgroundColor: `${getStatusColor(item.status)}15` }]}>
          <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
      </View>
      <Text style={styles.subject}>{item.subject}</Text>
      <View style={styles.ticketFooter}>
        <View style={styles.categoryRow}>
          <Text style={styles.category}>{item.category}</Text>
        </View>
        <ChevronRight size={16} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Help & Support</Text>
        <Text style={styles.subtitle}>Manage your support requests</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
      ) : tickets.length === 0 ? (
        <View style={styles.emptyState}>
          <MessageSquare size={48} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No support tickets yet</Text>
          <Text style={styles.emptyDesc}>If you have an issue, create a new ticket and our staff support team will help you.</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={t => t.id}
          renderItem={renderTicket}
          contentContainerStyle={styles.list}
        />
      )}

      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => navigation.navigate('StaffSupportCreate')}
      >
        <Plus size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { padding: 20, backgroundColor: '#FFF', paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 40 },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  list: { padding: 16 },
  ticketCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  date: { fontSize: 12, color: '#9CA3AF' },
  subject: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryRow: { flexDirection: 'row', alignItems: 'center' },
  category: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 }
});
