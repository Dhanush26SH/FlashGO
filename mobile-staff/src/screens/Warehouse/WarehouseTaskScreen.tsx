import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, AppState, Switch, ScrollView, Modal, Pressable } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { QrCode, Clock, Bell, Timer, Star, Medal, ChevronDown, Check, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import PutterWorkflow from './PutterWorkflow';

const DUTIES = [
  { id: 'putaway', title: 'Putter (Putaway)', subtitle: 'Place received stock into assigned rack/shelf locations.' },
  { id: 'auditor', title: 'Auditor', subtitle: 'Count and verify physical inventory against system stock.' },
  { id: 'fnv', title: 'FnV (Fruits & Vegetables)', subtitle: 'Check, grade and manage fresh produce quality.' },
  { id: 'inward_receiver', title: 'Inward Receiver', subtitle: 'Receive and verify incoming warehouse stock.' },
  { id: 'damage_expiry', title: 'Damage & Expiry', subtitle: 'Inspect and process damaged, expired or near-expiry stock.' }
];

export default function WarehouseTaskScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [shift, setShift] = useState<any>(null);
  const [slot, setSlot] = useState<any>(null);
  const [warehouse, setWarehouse] = useState<any>(null);
  
  const [isOnline, setIsOnline] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [currentDuty, setCurrentDuty] = useState<string | null>(null);
  
  const [activeHours, setActiveHours] = useState('0h 0m');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [showDutySelector, setShowDutySelector] = useState(false);
  const [settingDuty, setSettingDuty] = useState(false);

  const fetchShiftData = useCallback(async () => {
    if (!profile) return;
    
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const { data: shiftData, error: shiftError } = await supabase
        .from('staff_shifts')
        .select('*')
        .eq('staff_id', profile.id)
        .in('status', ['scheduled', 'active'])
        .order('shift_start', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (shiftError) throw shiftError;

      if (shiftData) {
        setShift(shiftData);
        setCurrentDuty(shiftData.current_duty || null);
        
        const { data: slotData } = await supabase
          .from('work_slots')
          .select('*')
          .eq('id', shiftData.work_slot_id)
          .single();
        
        setSlot(slotData);

        const { data: warehouseData } = await supabase
          .from('warehouses')
          .select('name')
          .eq('id', shiftData.warehouse_id)
          .single();
        
        setWarehouse(warehouseData);

        // Fetch authoritative profile state for the header
        const { data: profileData } = await supabase
          .from('profiles')
          .select('warehouse_is_online, employee_id')
          .eq('id', profile.id)
          .single();
        
        if (profileData) {
          setIsOnline(profileData.warehouse_is_online);
          setEmployeeId(profileData.employee_id || null);
        }
      } else {
        setShift(null);
        setSlot(null);
        setWarehouse(null);
        setIsOnline(false);
        setCurrentDuty(null);
      }
    } catch (e: any) {
      console.error('Fetch shift error:', e);
      setErrorMsg(e.message || 'An error occurred while fetching shifts.');
      setShift(null);
      setSlot(null);
      setWarehouse(null);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const reconcileShift = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('warehouse_staff_reconcile_shift');
      if (error) throw error;
      
      if (data.status === 'expired' || data.status === 'no_active_shift') {
        setIsOnline(false);
        await fetchShiftData();
      }
    } catch (e) {
      console.error('Reconciliation error:', e);
    }
  }, [fetchShiftData]);

  // Handle focus
  useEffect(() => {
    if (isFocused) {
      reconcileShift().then(() => fetchShiftData());
    }
  }, [isFocused, reconcileShift, fetchShiftData]);

  // Handle AppState (Foregrounding)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && isFocused) {
        reconcileShift().then(() => fetchShiftData());
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isFocused, reconcileShift, fetchShiftData]);

  // Periodic reconciliation while active
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isFocused && shift?.status === 'active') {
      interval = setInterval(() => {
        reconcileShift();
      }, 60000); // Check every minute
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isFocused, shift?.status, reconcileShift]);

  // Active hours counter
  useEffect(() => {
    if (shift?.status === 'active' && shift?.started_at) {
      const updateTimer = () => {
        const start = new Date(shift.started_at).getTime();
        const now = new Date().getTime();
        const diffMs = Math.max(0, now - start);
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setActiveHours(`${hours}h ${mins}m`);
      };
      
      updateTimer();
      timerRef.current = setInterval(updateTimer, 60000);
    } else {
      setActiveHours('0h 0m');
      if (timerRef.current) clearInterval(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [shift?.status, shift?.started_at]);

  const handleStartShift = () => {
    if (!shift) return;
    navigation.navigate('WarehouseStaffQRScreen', { shiftId: shift.id });
  };

  const handleToggleOnline = async (value: boolean) => {
    if (value) {
      await reconcileShift();
    }
    
    try {
      const { data, error } = await supabase.rpc('warehouse_staff_toggle_online', {
        p_is_online: value
      });
      if (error) throw error;
      setIsOnline(value);
    } catch (e: any) {
      Alert.alert("Toggle Failed", e.message);
      setIsOnline(!value);
    }
  };

  const handleSelectDuty = async (dutyId: string) => {
    setSettingDuty(true);
    try {
      const { data, error } = await supabase.rpc('warehouse_staff_set_duty', {
        p_duty: dutyId
      });
      
      if (error) throw error;
      
      if (data.status === 'success') {
        setCurrentDuty(data.current_duty);
        setShowDutySelector(false);
      } else {
        throw new Error(data.message || 'Failed to update duty');
      }
    } catch (e: any) {
      Alert.alert("Duty Selection Failed", e.message);
    } finally {
      setSettingDuty(false);
    }
  };

  const getShiftState = () => {
    if (!shift || !slot) return 'NO_SHIFT';
    if (shift.status === 'active') return 'ACTIVE';
    
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

  const IdentityHeader = () => (
    <View style={styles.identityHeader}>
      <View style={styles.identityLeft}>
        <Text style={styles.identityName}>{profile?.full_name?.split(' ')[0] || 'Worker'}</Text>
        {employeeId ? (
          <Text style={styles.identityId}>Staff ID: {employeeId}</Text>
        ) : (
          <Text style={styles.identityId}>Warehouse Staff</Text>
        )}
      </View>
      <View style={styles.identityRight}>
        <Text style={[styles.identityStatus, { color: isOnline ? '#10b981' : '#64748b' }]}>
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </Text>
        <Switch
          value={isOnline}
          onValueChange={handleToggleOnline}
          disabled={shiftState !== 'ACTIVE'}
          trackColor={{ false: '#cbd5e1', true: '#34d399' }}
          thumbColor={isOnline ? '#10b981' : '#f8fafc'}
        />
      </View>
    </View>
  );

  const getEmptyStateMessage = () => {
    if (!currentDuty && !isOnline) {
      return "Select a duty and go ONLINE to receive warehouse tasks.";
    } else if (currentDuty && !isOnline) {
      return "Go ONLINE to receive warehouse tasks.";
    } else if (!currentDuty && isOnline) {
      return "Select a duty to receive warehouse tasks.";
    } else {
      return "No tasks assigned right now";
    }
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

  // Pre-Shift Error State
  if (shiftState !== 'ACTIVE' && errorMsg) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tasks</Text>
        </View>
        <View style={styles.content}>
          <View style={[styles.centerContainer, { backgroundColor: '#fef2f2', padding: 24, borderRadius: 16 }]}>
            <Text style={[styles.statusTitle, { color: '#ef4444' }]}>Error Loading Shift</Text>
            <Text style={[styles.statusSubtitle, { color: '#dc2626' }]}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => fetchShiftData()} style={{ marginTop: 16, padding: 12, backgroundColor: '#ef4444', borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // PRE-SHIFT / NO_SHIFT (Success)
  if (shiftState !== 'ACTIVE') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Tasks</Text>
        </View>
        
        {shiftState !== 'NO_SHIFT' && <IdentityHeader />}
        
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
        </View>
      </SafeAreaView>
    );
  }

  const selectedDutyObj = currentDuty ? DUTIES.find(d => d.id === currentDuty) : null;

  // ACTIVE SHIFT DASHBOARD
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <IdentityHeader />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.cardsRow}>
          <View style={styles.summaryCard}>
            <Timer size={24} color="#10b981" style={styles.cardIcon} />
            <Text style={styles.cardValue}>{activeHours}</Text>
            <Text style={styles.cardLabel}>Active hours</Text>
          </View>
          <View style={styles.summaryCard}>
            <Star size={24} color="#f59e0b" style={styles.cardIcon} />
            <Text style={styles.cardValue}>--</Text>
            <Text style={styles.cardLabel}>Today's points</Text>
          </View>
          <View style={styles.summaryCard}>
            <Medal size={24} color="#3b82f6" style={styles.cardIcon} />
            <Text style={styles.cardValue}>-</Text>
            <Text style={styles.cardLabel}>Current rank</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.selectRoleButton, currentDuty ? styles.selectRoleButtonActive : null]}
          onPress={() => setShowDutySelector(true)}
        >
          <View>
            <Text style={styles.selectRoleLabel}>{currentDuty ? 'Current duty' : 'Select duty for'}</Text>
            <Text style={styles.selectRoleName}>
              {currentDuty ? selectedDutyObj?.title : (profile?.full_name || 'Worker')}
            </Text>
          </View>
          <ChevronDown size={24} color={currentDuty ? '#10b981' : '#0f172a'} />
        </TouchableOpacity>

        {currentDuty === 'putaway' && isOnline ? (
          <PutterWorkflow onWorkflowComplete={() => {}} />
        ) : (
          <View style={styles.lowerWorkArea}>
            <Clock size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyStateTitle}>
              {currentDuty && isOnline ? "Waiting for tasks..." : "Attention Required"}
            </Text>
            <Text style={styles.emptyStateSubtitle}>
              {getEmptyStateMessage()}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Duty Selector Modal */}
      <Modal
        visible={showDutySelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDutySelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Duty</Text>
              <TouchableOpacity onPress={() => setShowDutySelector(false)} style={styles.modalClose}>
                <X size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.dutyList}>
              {DUTIES.map((duty) => {
                const isSelected = currentDuty === duty.id;
                return (
                  <TouchableOpacity 
                    key={duty.id} 
                    style={[styles.dutyItem, isSelected && styles.dutyItemSelected]}
                    onPress={() => handleSelectDuty(duty.id)}
                    disabled={settingDuty}
                  >
                    <View style={styles.dutyItemText}>
                      <Text style={[styles.dutyItemTitle, isSelected && styles.dutyItemTitleSelected]}>
                        {duty.title}
                      </Text>
                      <Text style={styles.dutyItemSubtitle}>{duty.subtitle}</Text>
                    </View>
                    {isSelected && <Check size={24} color="#10b981" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  identityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  identityLeft: {
    flex: 1,
  },
  identityName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  identityId: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  identityRight: {
    alignItems: 'center',
  },
  identityStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
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
  
  // Active Dashboard Styles
  scrollContent: { padding: 16 },
  cardsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, flex: 1,
    alignItems: 'center', marginHorizontal: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  cardIcon: { marginBottom: 8 },
  cardValue: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  cardLabel: { fontSize: 12, color: '#64748b', textAlign: 'center' },
  selectRoleButton: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 2, borderColor: '#e2e8f0', marginBottom: 32,
  },
  selectRoleButtonActive: {
    borderColor: '#34d399',
    backgroundColor: '#f0fdf4'
  },
  selectRoleLabel: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  selectRoleName: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  lowerWorkArea: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 40,
    backgroundColor: '#f1f5f9', borderRadius: 16, borderWidth: 1,
    borderColor: '#e2e8f0', borderStyle: 'dashed',
  },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', color: '#475569', marginBottom: 8 },
  emptyStateSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingHorizontal: 32 },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: 16,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    padding: 8,
    marginRight: -8,
  },
  dutyList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  dutyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    marginBottom: 12,
  },
  dutyItemSelected: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  dutyItemText: {
    flex: 1,
    paddingRight: 16,
  },
  dutyItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  dutyItemTitleSelected: {
    color: '#10b981',
  },
  dutyItemSubtitle: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  }
});
