import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Target, Gift, ChevronRight, CheckCircle, Clock } from 'lucide-react-native';
import PickerHeader from '../../components/PickerHeader';

export default function OffersScreen({ navigation }: any) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [subTab, setSubTab] = useState<'CURRENT_WEEK' | 'NEXT_WEEK'>('CURRENT_WEEK');

  const [loading, setLoading] = useState(true);
  const [weeklyTarget, setWeeklyTarget] = useState<any>(null);
  const [activeBonuses, setActiveBonuses] = useState<any[]>([]);

  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const today = new Date();
  const currentDay = today.getDay();
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
  
  const reqMonday = new Date(today);
  if (subTab === 'NEXT_WEEK') {
    reqMonday.setDate(today.getDate() - daysToMonday + 7);
  } else {
    reqMonday.setDate(today.getDate() - daysToMonday);
  }
  reqMonday.setHours(0, 0, 0, 0);

  const reqSunday = new Date(reqMonday);
  reqSunday.setDate(reqMonday.getDate() + 6);
  reqSunday.setHours(23, 59, 59, 999);

  const reqMondayStr = formatLocalDate(reqMonday);
  const reqSundayStr = formatLocalDate(reqSunday);

  useEffect(() => {
    fetchOffersData();
  }, [profile, subTab]);

  const fetchOffersData = async () => {
    if (!profile) return;
    setLoading(true);

    try {
      // 1. Fetch Weekly Target (deterministic versioning)
      const { data: targetData } = await supabase
        .from('picker_weekly_targets')
        .select('*')
        .lte('effective_from', reqMonday.toISOString())
        .or(`effective_to.is.null,effective_to.gt.${reqMonday.toISOString()}`)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();

      if (targetData) {
        let itemsPicked = 0;
        let shiftPay = 0;
        let bonusPay = 0;

        if (subTab === 'CURRENT_WEEK') {
          // Fetch items picked this week
          const { data: shifts } = await supabase
            .from('staff_shifts')
            .select('items_picked')
            .eq('staff_id', profile.id)
            .gte('started_at', reqMonday.toISOString())
            .lte('started_at', reqSunday.toISOString());
          
          itemsPicked = shifts ? shifts.reduce((sum, s) => sum + (s.items_picked || 0), 0) : 0;

          // Fetch earned this week
          const { data: payouts } = await supabase
            .from('staff_shift_payouts')
            .select('total_amount')
            .eq('staff_id', profile.id)
            .gte('earning_date', reqMondayStr)
            .lte('earning_date', reqSundayStr);
          
          shiftPay = payouts ? payouts.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) : 0;

          const { data: awards } = await supabase
            .from('picker_bonus_awards')
            .select('incremental_award_amount')
            .eq('staff_id', profile.id)
            .gte('earning_date', reqMondayStr)
            .lte('earning_date', reqSundayStr);

          bonusPay = awards ? awards.reduce((sum, a) => sum + Number(a.incremental_award_amount || 0), 0) : 0;
        }

        setWeeklyTarget({
          id: targetData.id,
          targetItems: targetData.target_items,
          itemsPicked,
          earned: shiftPay + bonusPay,
          reqMonday: reqMondayStr,
          reqSunday: reqSundayStr,
        });
      } else {
        setWeeklyTarget(null);
      }

      // 2. Fetch Active Bonus Offers
      const { data: offers } = await supabase
        .from('picker_bonus_offers')
        .select('*, picker_bonus_offer_milestones(*)')
        .eq('is_active', true)
        .lte('start_date', reqSundayStr)
        .gte('end_date', reqMondayStr);

      if (offers) {
        const bonusesPromises = offers.map(async (offer) => {
          let completedSlots = 0;
          let earned = 0;

          if (subTab === 'CURRENT_WEEK') {
            const { data: completedShifts } = await supabase
              .from('staff_shifts')
              .select('id', { count: 'exact' })
              .eq('staff_id', profile.id)
              .eq('status', 'completed')
              .not('work_slot_id', 'is', null)
              .gte('completed_at', `${offer.start_date}T00:00:00Z`)
              .lte('completed_at', `${offer.end_date}T23:59:59Z`);

            completedSlots = completedShifts ? completedShifts.length : 0;

            const { data: awards } = await supabase
              .from('picker_bonus_awards')
              .select('incremental_award_amount')
              .eq('staff_id', profile.id)
              .eq('offer_id', offer.id);

            earned = awards ? awards.reduce((sum, a) => sum + Number(a.incremental_award_amount || 0), 0) : 0;
          }

          const highestTarget = offer.picker_bonus_offer_milestones?.reduce((max: number, m: any) => Math.max(max, m.target_value), 0) || 0;
          const maxReward = offer.picker_bonus_offer_milestones?.reduce((max: number, m: any) => Math.max(max, m.reward_amount), 0) || 0;

          return {
            id: offer.id,
            name: offer.name,
            dateRange: `${offer.start_date} to ${offer.end_date}`,
            completedSlots,
            highestTarget,
            earned,
            maxReward,
          };
        });

        const bonusesData = await Promise.all(bonusesPromises);
        setActiveBonuses(bonusesData);
      } else {
        setActiveBonuses([]);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (profile?.role !== 'picker') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Offers are only available for Pickers.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PickerHeader profile={profile} />

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'ACTIVE' && styles.activeTab]}
          onPress={() => setActiveTab('ACTIVE')}
        >
          <Text style={[styles.tabText, activeTab === 'ACTIVE' && styles.activeTabText]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'HISTORY' && styles.activeTab]}
          onPress={() => setActiveTab('HISTORY')}
        >
          <Text style={[styles.tabText, activeTab === 'HISTORY' && styles.activeTabText]}>History</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'ACTIVE' && (
        <View style={styles.subTabContainer}>
          <TouchableOpacity 
            style={[styles.subTab, subTab === 'CURRENT_WEEK' && styles.activeSubTab]}
            onPress={() => setSubTab('CURRENT_WEEK')}
          >
            <Text style={[styles.subTabText, subTab === 'CURRENT_WEEK' && styles.activeSubTabText]}>Current Week</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.subTab, subTab === 'NEXT_WEEK' && styles.activeSubTab]}
            onPress={() => setSubTab('NEXT_WEEK')}
          >
            <Text style={[styles.subTabText, subTab === 'NEXT_WEEK' && styles.activeSubTabText]}>Next Week</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
        ) : activeTab === 'ACTIVE' ? (
          <>
            <Text style={styles.sectionTitle}>Weekly Item Target</Text>
            {weeklyTarget ? (
              <TouchableOpacity 
                style={styles.card}
                onPress={() => navigation.navigate('WeeklyItemTargetScreen', { 
                  targetId: weeklyTarget.id, 
                  subTab,
                  reqMonday: weeklyTarget.reqMonday,
                  reqSunday: weeklyTarget.reqSunday
                })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Target color="#3b82f6" size={24} />
                    <Text style={styles.cardTitle}>Item Picking Target</Text>
                  </View>
                  <ChevronRight color="#9ca3af" size={20} />
                </View>
                {subTab === 'NEXT_WEEK' && (
                  <View style={{ backgroundColor: '#eff6ff', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, color: '#2563eb', fontWeight: '500' }}>Starts next Monday</Text>
                  </View>
                )}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.min(100, (weeklyTarget.itemsPicked / weeklyTarget.targetItems) * 100)}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{weeklyTarget.itemsPicked} / {weeklyTarget.targetItems} Items</Text>
                </View>
                {subTab === 'CURRENT_WEEK' && (
                  <View style={styles.earnedRow}>
                    <Text style={styles.earnedLabel}>Already Earned this Week</Text>
                    <Text style={styles.earnedValue}>₹{weeklyTarget.earned}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
                <Text style={styles.emptyText}>No weekly target available</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Bonus Offers</Text>
            {activeBonuses.length > 0 ? activeBonuses.map(bonus => (
              <TouchableOpacity 
                key={bonus.id} 
                style={styles.card}
                onPress={() => navigation.navigate('PickerBonusOfferDetailScreen', { 
                  bonusId: bonus.id, 
                  subTab,
                  reqMonday: reqMondayStr,
                  reqSunday: reqSundayStr
                })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Gift color="#f59e0b" size={24} />
                    <View>
                      <Text style={styles.cardTitle}>{bonus.name}</Text>
                      <Text style={styles.cardSubtitle}>{bonus.dateRange}</Text>
                    </View>
                  </View>
                  <ChevronRight color="#9ca3af" size={20} />
                </View>
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { backgroundColor: '#f59e0b', width: `${(bonus.completedSlots / bonus.highestTarget) * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{bonus.completedSlots} / {bonus.highestTarget} Slots</Text>
                </View>
                {subTab === 'CURRENT_WEEK' ? (
                  <View style={styles.earnedRow}>
                    <Text style={styles.earnedLabel}>Bonus Earned</Text>
                    <Text style={styles.earnedValueBonus}>₹{bonus.earned} / ₹{bonus.maxReward}</Text>
                  </View>
                ) : (
                  <View style={styles.earnedRow}>
                    <Text style={styles.earnedLabel}>Maximum Bonus</Text>
                    <Text style={styles.earnedValueBonus}>₹{bonus.maxReward}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )) : null}
            {activeBonuses.length === 0 && (
              <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
                <Text style={styles.emptyText}>No bonus offers available</Text>
              </View>
            )}
          </>
        ) : null}

        {activeTab === 'HISTORY' && (
          <View style={styles.emptyContainer}>
            <CheckCircle color="#9ca3af" size={48} />
            <Text style={styles.emptyText}>Your past targets and bonuses will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#2563eb' },
  tabText: { fontSize: 16, fontWeight: '500', color: '#6b7280' },
  activeTabText: { color: '#2563eb', fontWeight: '600' },
  subTabContainer: { flexDirection: 'row', backgroundColor: '#f9fafb', padding: 8, gap: 8 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeSubTab: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  subTabText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  activeSubTabText: { color: '#111827', fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12, marginTop: 8 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  progressContainer: { marginBottom: 16 },
  progressBarBg: { height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 4 },
  progressText: { fontSize: 14, color: '#4b5563', fontWeight: '500' },
  earnedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  earnedLabel: { fontSize: 14, color: '#6b7280' },
  earnedValue: { fontSize: 16, fontWeight: '700', color: '#10b981' },
  earnedValueBonus: { fontSize: 16, fontWeight: '700', color: '#f59e0b' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 16 },
});
