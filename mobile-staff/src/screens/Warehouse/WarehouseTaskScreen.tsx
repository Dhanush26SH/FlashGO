import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { QrCode, Clock, CheckCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function WarehouseTaskScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<any>(null);
  const [slot, setSlot] = useState<any>(null);
  const [warehouse, setWarehouse] = useState<any>(null);

  const fetchShiftData = async () => {
    if (!profile) return;
    
    try {
      setLoading(true);
      // Fetch the active or upcoming shift
      const { data: shiftData, error: shiftError } = await supabase
        .from('staff_shifts')
        .select('*')
        .eq('staff_id', profile.id)
        .in('status', ['upcoming', 'active'])
        .order('shift_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (shiftError) throw shiftError;

      if (shiftData) {
        setShift(shiftData);
        
        // Fetch slot details for times
        const { data: slotData } = await supabase
          .from('work_slots')
          .select('*')
          .eq('id', shiftData.work_slot_id)
          .single();
        setSlot(slotData);

        // Fetch warehouse
        const { data: warehouseData } = await supabase
          .from('warehouses')
          .select('name')
          .eq('id', shiftData.warehouse_id)
          .single();
        setWarehouse(warehouseData);
      } else {
        setShift(null);
        setSlot(null);
        setWarehouse(null);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error fetching shift", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchShiftData();
    }
  }, [isFocused]);

  const handleStartShift = () => {
    if (!shift) return;
    navigation.navigate('WarehouseStaffQRScreen', { shiftId: shift.id });
  };

  const getShiftState = () => {
    if (!shift || !slot) return 'NO_SHIFT';
    if (shift.status === 'active') return 'ACTIVE';
    
    // Check if within 5 min window (READY) or too early (UPCOMING)
    const now = new Date();
    const startTime = new Date(slot.start_time);
    const windowStart = new Date(startTime.getTime() - 5 * 60000);
    
    if (now >= windowStart) return 'READY';
    return 'UPCOMING';
  };

  const shiftState = getShiftState();

  const formatTime = (ts: string) => {
    if (!ts) return '--:--';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks</Text>
      </View>

      <View style={styles.content}>
        {shiftState === 'NO_SHIFT' && (
          <View style={styles.centerContainer}>
            <Clock size={48} color="#64748b" style={{ marginBottom: 16 }} />
            <Text style={styles.statusTitle}>No Upcoming Shifts</Text>
            <Text style={styles.statusSubtitle}>You have no shifts scheduled right now.</Text>
          </View>
        )}

        {shiftState === 'UPCOMING' && (
          <View style={styles.centerContainer}>
            <Clock size={48} color="#64748b" style={{ marginBottom: 16 }} />
            <Text style={styles.statusTitle}>Shift Upcoming</Text>
            <Text style={styles.statusSubtitle}>
              Your shift at {warehouse?.name || 'Warehouse'} starts at {formatTime(slot?.start_time)}.
            </Text>
            <Text style={styles.statusSubtitle}>You can check in 5 minutes early.</Text>
          </View>
        )}

        {shiftState === 'READY' && (
          <View style={styles.readyContainer}>
            <View style={styles.iconContainer}>
              <QrCode size={48} color="#10b981" />
            </View>
            <Text style={styles.readyTitle}>Get Started with your Shift!</Text>
            <Text style={styles.readySubtitle}>Scan QR code inside the store</Text>
            
            <TouchableOpacity style={styles.startButton} onPress={handleStartShift}>
              <Text style={styles.startButtonText}>Start shift</Text>
            </TouchableOpacity>
          </View>
        )}

        {shiftState === 'ACTIVE' && (
          <View style={styles.activeContainer}>
            <View style={styles.activeIconBox}>
              <CheckCircle size={32} color="#10b981" />
            </View>
            <Text style={styles.activeTitle}>Shift Active</Text>
            <Text style={styles.activeWarehouse}>{warehouse?.name || 'Warehouse'}</Text>
            <Text style={styles.activeTime}>
              {formatTime(slot?.start_time)} - {formatTime(slot?.end_time)}
            </Text>
            <View style={styles.activeCard}>
              <Text style={styles.activeMessage}>
                You're checked in and ready for warehouse tasks.
              </Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  content: { flex: 1, padding: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  statusSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 4 },
  
  readyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },
  iconContainer: { padding: 24, backgroundColor: '#d1fae5', borderRadius: 50, marginBottom: 24 },
  readyTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  readySubtitle: { fontSize: 16, color: '#475569', marginBottom: 32 },
  startButton: { backgroundColor: '#0f172a', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 12, width: '100%', alignItems: 'center' },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  activeContainer: { flex: 1, paddingTop: 40, alignItems: 'center' },
  activeIconBox: { marginBottom: 16 },
  activeTitle: { fontSize: 24, fontWeight: '700', color: '#10b981', marginBottom: 4 },
  activeWarehouse: { fontSize: 18, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  activeTime: { fontSize: 16, color: '#64748b', marginBottom: 24 },
  activeCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  activeMessage: { fontSize: 16, color: '#334155', textAlign: 'center', lineHeight: 24 }
});
