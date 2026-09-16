import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Modal, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { ChevronLeft, ChevronDown, ChevronRight, Clock, Package, AlertTriangle, XCircle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// Helpers for dynamic dates
const formatDateLabel = (d: Date) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} '${d.getFullYear().toString().substring(2)}`;
};

const formatIsoDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDynamicDailyOptions = () => {
  const options = [];
  const today = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    options.push({
      label: formatDateLabel(d),
      date: formatIsoDate(d),
    });
  }
  return options;
};

const getDynamicWeeklyOptions = () => {
  const options = [];
  const today = new Date();
  
  const currentDay = today.getDay();
  // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  // Days to previous Wednesday
  const daysToWednesday = currentDay >= 3 ? currentDay - 3 : currentDay + 4;
  
  const currentWednesday = new Date(today);
  currentWednesday.setDate(today.getDate() - daysToWednesday);

  options.push({
    label: `${formatDateLabel(currentWednesday)} - ${formatDateLabel(today)}`,
    start: formatIsoDate(currentWednesday),
    end: formatIsoDate(today)
  });

  for (let i = 1; i <= 3; i++) {
    const prevTuesday = new Date(currentWednesday);
    prevTuesday.setDate(currentWednesday.getDate() - 1 - (i - 1) * 7);
    
    const prevWednesday = new Date(prevTuesday);
    prevWednesday.setDate(prevTuesday.getDate() - 6);
    
    options.push({
      label: `${formatDateLabel(prevWednesday)} - ${formatDateLabel(prevTuesday)}`,
      start: formatIsoDate(prevWednesday),
      end: formatIsoDate(prevTuesday)
    });
  }
  return options;
};

const dynamicDailyOptions = getDynamicDailyOptions();
const dynamicWeeklyOptions = getDynamicWeeklyOptions();

export default function PayoutsScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<'Weekly' | 'Daily'>('Weekly');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [selectedDaily, setSelectedDaily] = useState(dynamicDailyOptions[0].label);
  const [selectedWeekly, setSelectedWeekly] = useState(dynamicWeeklyOptions[0].label);

  // Real data state
  const [loading, setLoading] = useState(false);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [bonusAwards, setBonusAwards] = useState<any[]>([]);
  const [slotsMissed, setSlotsMissed] = useState(0);

  const dailyOptions = dynamicDailyOptions;
  const weeklyOptions = dynamicWeeklyOptions;

  const currentOptions = activeTab === 'Daily' ? dailyOptions.map(o => o.label) : weeklyOptions.map(o => o.label);
  const currentSelectedLabel = activeTab === 'Daily' ? selectedDaily : selectedWeekly;

  const fetchPayoutData = async () => {
    if (!profile) return;
    setLoading(true);

    let startDate, endDate;
    if (activeTab === 'Daily') {
      const opt = dailyOptions.find(o => o.label === selectedDaily) || dailyOptions[0];
      startDate = opt.date;
      endDate = opt.date;
    } else {
      const opt = weeklyOptions.find(o => o.label === selectedWeekly) || weeklyOptions[0];
      startDate = opt.start;
      endDate = opt.end;
    }

    // 1. Fetch immutable payouts
    const { data: payoutsData, error: payoutsError } = await supabase
      .from('staff_shift_payouts')
      .select('*, warehouses(name)')
      .eq('staff_id', profile.id)
      .gte('earning_date', startDate)
      .lte('earning_date', endDate)
      .order('shift_started_at', { ascending: true });

    if (payoutsError) {
      console.error('Error fetching payouts', payoutsError);
    }

    setPayouts(payoutsData || []);

    // 2. Fetch authoritative slots missed from absent staff_shifts
    // We use shift_start as the anchor for absence date per requirement
    const { count: missedCount, error: missedError } = await supabase
      .from('staff_shifts')
      .select('*', { count: 'exact', head: true })
      .eq('staff_id', profile.id)
      .eq('status', 'absent')
      .gte('shift_start', `${startDate}T00:00:00Z`) // naive timezone mapping for demo
      .lte('shift_start', `${endDate}T23:59:59Z`);

    if (missedError) {
      console.error('Error fetching absent shifts', missedError);
    }
    setSlotsMissed(missedCount || 0);

    // 3. Fetch Bonus Awards
    const { data: bonusData, error: bonusError } = await supabase
      .from('picker_bonus_awards')
      .select('*')
      .eq('staff_id', profile.id)
      .gte('earning_date', startDate)
      .lte('earning_date', endDate)
      .order('earning_date', { ascending: true });

    if (bonusError) {
      console.error('Error fetching bonus awards', bonusError);
    }
    setBonusAwards(bonusData || []);

    setLoading(false);
  };

  useEffect(() => {
    if (isFocused) {
      fetchPayoutData();
    }
  }, [isFocused, activeTab, selectedDaily, selectedWeekly]);

  const handleSelect = (val: string) => {
    if (activeTab === 'Daily') {
      setSelectedDaily(val);
    } else {
      setSelectedWeekly(val);
    }
    setIsDropdownOpen(false);
  };

  // Aggregations
  const totalBase = payouts.reduce((sum, p) => sum + Number(p.base_amount), 0);
  const totalShiftIncentive = payouts.reduce((sum, p) => sum + Number(p.incentive_amount), 0);
  const totalBonusAwards = bonusAwards.reduce((sum, b) => sum + Number(b.incremental_award_amount), 0);
  const totalIncentive = totalShiftIncentive + totalBonusAwards;
  const totalPay = totalBase + totalIncentive;
  
  const totalItems = payouts.reduce((sum, p) => sum + Number(p.items_count), 0);
  const totalMinutes = payouts.reduce((sum, p) => sum + Number(p.active_minutes), 0);
  const totalComplaints = payouts.reduce((sum, p) => sum + Number(p.complaints_count), 0);

  const activeHoursStr = (totalMinutes / 60).toFixed(1);

  const dateWisePayouts = payouts.reduce((acc, curr) => {
    const d = curr.earning_date;
    if (!acc[d]) acc[d] = 0;
    acc[d] += Number(curr.total_amount);
    return acc;
  }, {} as Record<string, number>);

  bonusAwards.forEach(b => {
    const d = b.earning_date;
    if (!dateWisePayouts[d]) dateWisePayouts[d] = 0;
    dateWisePayouts[d] += Number(b.incremental_award_amount);
  });

  const hasData = payouts.length > 0 || bonusAwards.length > 0;

  const handleDateRowTap = (dateStr: string) => {
    // Attempt to match the exact string format, for demo we just switch to daily
    setActiveTab('Daily');
    // In a real app we'd map YYYY-MM-DD back to "14 Sep '26" label precisely
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Earnings and Payout</Text>
          <Text style={styles.userDetails}>Hi, {profile?.full_name || 'Staff'}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'Weekly' && styles.activeTab]}
          onPress={() => setActiveTab('Weekly')}
        >
          <Text style={[styles.tabText, activeTab === 'Weekly' && styles.activeTabText]}>Weekly</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'Daily' && styles.activeTab]}
          onPress={() => setActiveTab('Daily')}
        >
          <Text style={[styles.tabText, activeTab === 'Daily' && styles.activeTabText]}>Daily</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Dropdown Header */}
        <TouchableOpacity 
          style={styles.dropdownHeader} 
          onPress={() => setIsDropdownOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.dropdownHeaderText}>{currentSelectedLabel}</Text>
          <ChevronDown size={20} color="#1f2937" />
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Total Pay Card */}
            <View style={styles.totalPayCard}>
              <View style={styles.totalPayRow}>
                <Text style={styles.totalPayText}>Total Pay</Text>
                <Text style={styles.totalPayAmount}>₹{totalPay.toFixed(2)}</Text>
              </View>
              
              {hasData && (
                <>
                  <View style={styles.totalPayDivider} />
                  
                  <View style={styles.breakdownRow}>
                    <View>
                      <Text style={styles.breakdownTitle}>Base earning</Text>
                      <Text style={styles.breakdownSub}>Items Picking and Packing</Text>
                    </View>
                    <Text style={styles.breakdownAmount}>₹{totalBase.toFixed(2)}</Text>
                  </View>

                  <View style={styles.breakdownRow}>
                    <View>
                      <Text style={styles.breakdownTitle}>Incentive earnings</Text>
                      <Text style={styles.breakdownSub}>Cumulative shift & admin bonus</Text>
                    </View>
                    <Text style={styles.breakdownAmount}>₹{totalIncentive.toFixed(2)}</Text>
                  </View>
                </>
              )}
            </View>

            {hasData && (
              <>
                <Text style={styles.sectionHeading}>Performance</Text>
                
                <View style={styles.perfGrid}>
                  <View style={styles.perfCard}>
                    <View style={styles.perfIconRow}>
                      <Clock size={20} color="#3b82f6" />
                      <Text style={styles.perfValue}>{activeHoursStr}h</Text>
                    </View>
                    <Text style={styles.perfLabel}>Active hours</Text>
                  </View>
                  
                  <View style={styles.perfCard}>
                    <View style={styles.perfIconRow}>
                      <Package size={20} color="#8b5cf6" />
                      <Text style={styles.perfValue}>{totalItems}</Text>
                    </View>
                    <Text style={styles.perfLabel}>Items Picked</Text>
                  </View>
                  
                  <View style={styles.perfCard}>
                    <View style={styles.perfIconRow}>
                      <AlertTriangle size={20} color="#f59e0b" />
                      <Text style={styles.perfValue}>{totalComplaints}</Text>
                    </View>
                    <Text style={styles.perfLabel}>Complaints</Text>
                  </View>
                  
                  <View style={styles.perfCard}>
                    <View style={styles.perfIconRow}>
                      <XCircle size={20} color="#ef4444" />
                      <Text style={styles.perfValue}>{slotsMissed}</Text>
                    </View>
                    <Text style={styles.perfLabel}>Slots Missed</Text>
                  </View>
                </View>

                {activeTab === 'Weekly' ? (
                  <>
                    <Text style={styles.sectionHeading}>Date wise Payout</Text>
                    <View style={styles.listContainer}>
                      {Object.entries(dateWisePayouts).map(([date, amount], idx) => (
                        <TouchableOpacity 
                          key={date} 
                          style={[styles.listItem, idx > 0 && styles.listBorder]}
                          onPress={() => handleDateRowTap(date)}
                        >
                          <Text style={styles.listItemTitle}>{date}</Text>
                          <View style={styles.listRight}>
                            <Text style={styles.listItemAmount}>₹{Number(amount).toFixed(2)}</Text>
                            <ChevronRight size={18} color="#9ca3af" style={{ marginLeft: 4 }} />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.sectionHeading}>Slot wise Payout</Text>
                    <View style={styles.listContainer}>
                      {payouts.map((p, idx) => {
                        const sStart = new Date(p.shift_started_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        const sEnd = new Date(p.shift_ended_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        return (
                          <TouchableOpacity 
                            key={p.id} 
                            style={[styles.listItem, idx > 0 && styles.listBorder]}
                            onPress={() => { /* Wait for future slot detail design */ }}
                          >
                            <View>
                              <Text style={styles.listItemTitle}>{p.warehouses?.name || 'FlashGO Store'}</Text>
                              <Text style={styles.listItemSub}>{`${sStart} - ${sEnd}`}</Text>
                            </View>
                            <View style={styles.listRight}>
                              <Text style={styles.listItemAmount}>₹{Number(p.total_amount).toFixed(2)}</Text>
                              <ChevronRight size={18} color="#9ca3af" style={{ marginLeft: 4 }} />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* Dropdown Modal */}
      <Modal visible={isDropdownOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setIsDropdownOpen(false)}>
          <View style={styles.dropdownMenuContainer}>
            <ScrollView style={styles.dropdownScroll} bounces={false}>
              {currentOptions.map((opt, idx) => {
                const isSelected = opt === currentSelectedLabel;
                return (
                  <TouchableOpacity 
                    key={idx}
                    style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                    onPress={() => handleSelect(opt)}
                  >
                    <Text style={styles.dropdownItemText}>{opt}</Text>
                    <ChevronRight size={18} color="#4b5563" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, backgroundColor: '#ffffff' },
  backBtn: { padding: 8, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  userDetails: { fontSize: 13, color: '#6b7280' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#111827' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  activeTabText: { color: '#111827' },
  content: { flex: 1, padding: 16, backgroundColor: '#f3f4f6' },
  dropdownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e0f2fe', paddingVertical: 12, paddingHorizontal: 16, marginBottom: 16, borderRadius: 8 },
  dropdownHeaderText: { fontSize: 16, fontWeight: '600', color: '#0369a1', marginRight: 8 },
  totalPayCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  totalPayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalPayText: { fontSize: 18, fontWeight: '700', color: '#111827' },
  totalPayAmount: { fontSize: 18, fontWeight: '700', color: '#10b981' },
  totalPayDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  breakdownTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 2 },
  breakdownSub: { fontSize: 13, color: '#9ca3af' },
  breakdownAmount: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  sectionHeading: { fontSize: 17, fontWeight: '700', color: '#1f2937', marginTop: 24, marginBottom: 12 },
  perfGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  perfCard: { backgroundColor: '#ffffff', width: '48%', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  perfIconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  perfValue: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  perfLabel: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  listContainer: { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  listBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  listItemTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937', marginBottom: 4 },
  listItemSub: { fontSize: 13, color: '#6b7280' },
  listRight: { flexDirection: 'row', alignItems: 'center' },
  listItemAmount: { fontSize: 16, fontWeight: '700', color: '#10b981' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', paddingTop: 160, paddingHorizontal: 16 },
  dropdownMenuContainer: { backgroundColor: '#ffffff', borderRadius: 12, maxHeight: 400, padding: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  dropdownScroll: { flexGrow: 0 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f1f5f9', borderRadius: 8, marginBottom: 4 },
  dropdownItemActive: { backgroundColor: '#e0f2fe' },
  dropdownItemText: { fontSize: 15, fontWeight: '600', color: '#1f2937' }
});
