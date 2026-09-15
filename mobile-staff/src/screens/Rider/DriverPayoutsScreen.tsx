import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { ChevronLeft, ChevronDown, Clock, MapPin, Award, CreditCard, AlertTriangle, XCircle, FileText } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const formatDateLabel = (d: Date) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} '${d.getUTCFullYear().toString().substring(2)}`;
};

const formatIsoDate = (d: Date) => {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDynamicDailyOptions = () => {
  const options = [];
  const todayUtc = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const todayIst = new Date(todayUtc.getTime() + istOffset);
  
  for (let i = 0; i < 8; i++) {
    const d = new Date(todayIst);
    d.setUTCDate(todayIst.getUTCDate() - i);
    options.push({
      label: formatDateLabel(d),
      date: formatIsoDate(d),
      fullDate: d
    });
  }
  return options;
};

const getDynamicWeeklyOptions = () => {
  const options = [];
  const todayUtc = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const todayIst = new Date(todayUtc.getTime() + istOffset);
  
  const currentDay = todayIst.getUTCDay();
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
  
  const currentMonday = new Date(todayIst);
  currentMonday.setUTCDate(todayIst.getUTCDate() - daysToMonday);

  options.push({
    label: `${formatDateLabel(currentMonday)} - ${formatDateLabel(todayIst)}`,
    start: formatIsoDate(currentMonday),
    end: formatIsoDate(todayIst)
  });

  for (let i = 1; i <= 3; i++) {
    const prevSunday = new Date(currentMonday);
    prevSunday.setUTCDate(currentMonday.getUTCDate() - 1 - (i - 1) * 7);
    
    const prevMonday = new Date(prevSunday);
    prevMonday.setUTCDate(prevSunday.getUTCDate() - 6);
    
    options.push({
      label: `${formatDateLabel(prevMonday)} - ${formatDateLabel(prevSunday)}`,
      start: formatIsoDate(prevMonday),
      end: formatIsoDate(prevSunday)
    });
  }
  return options;
};

const dynamicDailyOptions = getDynamicDailyOptions();
const dynamicWeeklyOptions = getDynamicWeeklyOptions();

export default function DriverPayoutsScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<'Weekly' | 'Daily'>('Weekly');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [selectedDaily, setSelectedDaily] = useState(dynamicDailyOptions[0].label);
  const [selectedWeekly, setSelectedWeekly] = useState(dynamicWeeklyOptions[0].label);

  const [loading, setLoading] = useState(false);
  const [tripsCompleted, setTripsCompleted] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [activeHours, setActiveHours] = useState('0h 00m');

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

    // Trips Completed semantics: count genuine completed Driver deliveries
    // bounded by Asia/Kolkata boundary for the selected date range.
    // Convert IST startDate and endDate to UTC bounds for query.
    const startIst = new Date(`${startDate}T00:00:00Z`);
    const startUtc = new Date(startIst.getTime() - (5.5 * 60 * 60 * 1000)).toISOString();
    
    const endIst = new Date(`${endDate}T23:59:59Z`);
    const endUtc = new Date(endIst.getTime() - (5.5 * 60 * 60 * 1000)).toISOString();

    const { count, error } = await supabase
      .from('logistics_trips')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', profile.id)
      .eq('status', 'completed')
      .gte('delivered_at', startUtc)
      .lte('delivered_at', endUtc);

    if (!error && count !== null) {
      setTripsCompleted(count);
    } else {
      setTripsCompleted(0);
    }
    
    // Earnings from ledger
    const { data: earns } = await supabase
      .from('driver_financial_ledger')
      .select('amount')
      .eq('driver_id', profile.id)
      .eq('transaction_type', 'delivery_earning')
      .gte('occurred_at', startUtc)
      .lte('occurred_at', endUtc);

    if (earns) {
      setTotalEarnings(earns.reduce((sum, e) => sum + Number(e.amount), 0));
    } else {
      setTotalEarnings(0);
    }

    // Active Hours from staff_shifts
    const { data: shifts } = await supabase
      .from('staff_shifts')
      .select('started_at, completed_at, status, shift_end')
      .eq('staff_id', profile.id)
      .gte('started_at', startUtc)
      .lte('started_at', endUtc);

    if (shifts) {
      let totalMs = 0;
      shifts.forEach((s: any) => {
        if (s.started_at) {
          const start = new Date(s.started_at).getTime();
          const end = s.completed_at 
            ? new Date(s.completed_at).getTime() 
            : Math.min(new Date().getTime(), new Date(s.shift_end).getTime());
          if (end > start) {
            totalMs += (end - start);
          }
        }
      });
      const hrs = Math.floor(totalMs / 3600000);
      const mins = Math.floor((totalMs % 3600000) / 60000);
      setActiveHours(`${hrs}h ${mins}m`);
    } else {
      setActiveHours('0h 00m');
    }

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

  // Build the day-by-day UI structure for Weekly View
  // We don't have real earnings data yet, so we just stub the structure safely.
  const renderWeeklyBreakdown = () => {
    const selectedWeekOpt = weeklyOptions.find(o => o.label === selectedWeekly) || weeklyOptions[0];
    const startDate = new Date(`${selectedWeekOpt.start}T00:00:00Z`);
    const endDate = new Date(`${selectedWeekOpt.end}T00:00:00Z`);
    
    const days = [];
    let curr = new Date(startDate);
    while (curr <= endDate) {
      days.push(new Date(curr));
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    return (
      <View style={styles.breakdownContainer}>
        <Text style={styles.sectionTitle}>Daily Breakdown</Text>
        {days.map((day, idx) => (
          <View key={idx} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>{formatDateLabel(day)}</Text>
              <Text style={styles.pendingEarningsLabelDay}>₹0.00</Text>
            </View>
            <View style={styles.dayMetrics}>
              <View style={styles.dayMetric}>
                <Text style={styles.dayMetricLabel}>Hours</Text>
                <Text style={styles.dayMetricValue}>0h 00m</Text>
              </View>
              <View style={styles.dayMetric}>
                <Text style={styles.dayMetricLabel}>Trips</Text>
                <Text style={styles.dayMetricValue}>0</Text>
              </View>
              <View style={styles.dayMetric}>
                <Text style={styles.dayMetricLabel}>Incentive</Text>
                <Text style={styles.dayMetricValue}>₹0.00</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#f8fafc" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Earnings & Payouts</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

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
        <TouchableOpacity 
          style={styles.dropdownHeader} 
          onPress={() => setIsDropdownOpen(!isDropdownOpen)}
          activeOpacity={0.7}
        >
          <Text style={styles.dropdownHeaderText}>{currentSelectedLabel}</Text>
          <ChevronDown size={20} color="#94a3b8" />
        </TouchableOpacity>

        {isDropdownOpen && (
          <View style={styles.dropdownList}>
            {currentOptions.map((opt, idx) => (
              <TouchableOpacity key={idx} style={styles.dropdownItem} onPress={() => handleSelect(opt)}>
                <Text style={[styles.dropdownItemText, currentSelectedLabel === opt && styles.dropdownItemActive]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Primary Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.totalPayRow}>
                <Text style={styles.totalPayLabel}>{activeTab === 'Weekly' ? 'Weekly Earnings' : 'Daily Earnings'}</Text>
                <Text style={styles.emptyEarningsLabel}>₹{totalEarnings.toFixed(2)}</Text>
              </View>

              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Clock size={18} color="#94a3b8" />
                  <Text style={styles.metricValue}>{activeHours}</Text>
                  <Text style={styles.metricLabel}>Active Hours</Text>
                </View>
                <View style={styles.metricItem}>
                  <MapPin size={18} color="#94a3b8" />
                  <Text style={styles.metricValue}>{tripsCompleted}</Text>
                  <Text style={styles.metricLabel}>Trips Completed</Text>
                </View>
                <View style={styles.metricItem}>
                  <Award size={18} color="#94a3b8" />
                  <Text style={styles.metricValue}>₹0.00</Text>
                  <Text style={styles.metricLabel}>Incentives</Text>
                </View>
              </View>
            </View>

            {/* Warning / Important Context */}
            <View style={styles.codWarning}>
              <AlertTriangle size={18} color="#f59e0b" style={{ marginRight: 8, marginTop: 2 }} />
              <Text style={styles.codWarningText}>
                Note: COD cash collected is not included in these earnings. COD liabilities are managed separately.
              </Text>
            </View>

            {/* Payment Status Section */}
            <View style={styles.paymentCard}>
              <View style={styles.paymentHeader}>
                <CreditCard size={20} color="#10b981" />
                <Text style={styles.paymentTitle}>Payout Status</Text>
              </View>
              <View style={styles.paymentBody}>
                <Text style={styles.paymentStatusText}>
                  Payout details will appear once earnings are calculated and settled.
                </Text>
              </View>
            </View>

            {/* Breakdown */}
            {activeTab === 'Weekly' && renderWeeklyBreakdown()}

          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // FlashGO Dark Navy Background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#10b981', // FlashGO Green
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#10b981',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dropdownHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  dropdownList: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#94a3b8',
    fontWeight: '500',
  },
  dropdownItemActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  totalPayRow: {
    marginBottom: 20,
  },
  totalPayLabel: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyEarningsLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
  },
  pendingEarningsLabelDay: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 16,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 8,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  codWarning: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  codWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#fcd34d',
    lineHeight: 18,
  },
  paymentCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
    overflow: 'hidden',
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    backgroundColor: '#0f172a',
  },
  paymentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginLeft: 8,
  },
  paymentBody: {
    padding: 16,
  },
  paymentStatusText: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
  },
  breakdownContainer: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 16,
  },
  dayCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 12,
  },
  dayTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
  },
  pendingText: {
    fontSize: 13,
    color: '#fbbf24',
    fontWeight: '600',
  },
  dayMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayMetric: {
    flex: 1,
  },
  dayMetricLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  dayMetricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
});
