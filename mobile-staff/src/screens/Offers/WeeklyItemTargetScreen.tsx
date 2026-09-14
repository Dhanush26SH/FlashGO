import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Target, Calendar } from 'lucide-react-native';

export default function WeeklyItemTargetScreen({ route, navigation }: any) {
  const { profile } = useAuth();
  const { targetId, subTab, reqMonday, reqSunday } = route.params || {};
  
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<any>(null);

  useEffect(() => {
    const loadTarget = async () => {
      if (!profile || !targetId) return;
      try {
        const { data: targetData } = await supabase
          .from('picker_weekly_targets')
          .select('*')
          .eq('id', targetId)
          .single();

        if (targetData) {
          let itemsPicked = 0;
          let shiftPay = 0;
          let bonusPay = 0;

          if (subTab !== 'NEXT_WEEK') {
            // Need the full timestamps for staff_shifts started_at (TIMESTAMPTZ)
            // But we can approximate by appending T00:00:00Z to the YYYY-MM-DD local dates.
            // A better way is parsing reqMonday as a local date and getting ISO string
            const localStart = new Date(reqMonday + "T00:00:00");
            const localEnd = new Date(reqSunday + "T23:59:59.999");
            
            // Fetch items picked this week
            const { data: shifts } = await supabase
              .from('staff_shifts')
              .select('items_picked')
              .eq('staff_id', profile.id)
              .gte('started_at', localStart.toISOString())
              .lte('started_at', localEnd.toISOString());
            
            itemsPicked = shifts ? shifts.reduce((sum, s) => sum + (s.items_picked || 0), 0) : 0;

            // Fetch earned this week
            const { data: payouts } = await supabase
              .from('staff_shift_payouts')
              .select('total_amount')
              .eq('staff_id', profile.id)
              .gte('earning_date', reqMonday)
              .lte('earning_date', reqSunday);
            
            shiftPay = payouts ? payouts.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) : 0;

            const { data: awards } = await supabase
              .from('picker_bonus_awards')
              .select('incremental_award_amount')
              .eq('staff_id', profile.id)
              .gte('earning_date', reqMonday)
              .lte('earning_date', reqSunday);

            bonusPay = awards ? awards.reduce((sum, a) => sum + Number(a.incremental_award_amount || 0), 0) : 0;
          }

          const formatDateStr = (dStr: string) => {
            const d = new Date(dStr + "T00:00:00");
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${d.getDate()} ${months[d.getMonth()]}`;
          };

          setTarget({
            targetItems: targetData.target_items,
            itemsPicked,
            earned: shiftPay + bonusPay,
            dateRange: `${formatDateStr(reqMonday)} - ${formatDateStr(reqSunday)}`,
            subTab,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadTarget();
  }, [profile, targetId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#111827" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weekly Item Target</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </View>
    );
  }

  if (!target) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#111827" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weekly Item Target</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>No target data available.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color="#111827" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Item Target</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <View style={styles.dateRow}>
            <Calendar color="#6b7280" size={16} />
            <Text style={styles.dateText}>{target.dateRange}</Text>
          </View>
          
          <View style={styles.targetRow}>
            <View style={styles.iconCircle}>
              <Target color="#3b82f6" size={32} />
            </View>
            <View>
              <Text style={styles.targetLabel}>Target</Text>
              <Text style={styles.targetValue}>{target.targetItems} Items</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{target.subTab === 'NEXT_WEEK' ? 'Scheduled Target' : 'Progress'}</Text>
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Items Picked</Text>
              <Text style={styles.progressValue}>{target.itemsPicked} / {target.targetItems}</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.min(100, (target.itemsPicked / target.targetItems) * 100)}%` }]} />
            </View>
          </View>
        </View>

        {target.subTab !== 'NEXT_WEEK' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Earnings</Text>
            <View style={styles.earnedRow}>
              <Text style={styles.earnedLabel}>Already Earned this Week</Text>
              <Text style={styles.earnedValue}>₹{target.earned}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', padding: 16, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  placeholder: { width: 32 },
  content: { flex: 1, padding: 16 },
  infoCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dateText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  targetLabel: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  targetValue: { fontSize: 24, fontWeight: '700', color: '#111827' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 20 },
  progressContainer: { marginBottom: 24 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, color: '#4b5563', fontWeight: '500' },
  progressValue: { fontSize: 14, color: '#111827', fontWeight: '600' },
  progressBarBg: { height: 12, backgroundColor: '#f3f4f6', borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 6 },
  earnedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  earnedLabel: { fontSize: 14, color: '#111827', fontWeight: '500' },
  earnedHelp: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  earnedValue: { fontSize: 24, fontWeight: '700', color: '#10b981' },
});
