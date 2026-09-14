import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Gift, Calendar, CheckCircle } from 'lucide-react-native';

export default function PickerBonusOfferDetailScreen({ route, navigation }: any) {
  const { profile } = useAuth();
  const { bonusId, subTab, reqMonday, reqSunday } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [bonus, setBonus] = useState<any>(null);

  useEffect(() => {
    const loadBonus = async () => {
      if (!profile || !bonusId) return;
      try {
        const { data: offer } = await supabase
          .from('picker_bonus_offers')
          .select('*, picker_bonus_offer_milestones(*)')
          .eq('id', bonusId)
          .single();

        if (offer) {
          let completedSlots = 0;
          let earned = 0;

          if (subTab !== 'NEXT_WEEK') {
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

          const milestones = offer.picker_bonus_offer_milestones
            ? offer.picker_bonus_offer_milestones.map((m: any) => ({ slots: m.target_value, reward: m.reward_amount }))
            : [];
          milestones.sort((a: any, b: any) => a.slots - b.slots);

          const formatDateStr = (dStr: string) => {
            const d = new Date(dStr + "T00:00:00");
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${d.getDate()} ${months[d.getMonth()]}`;
          };

          // If we passed explicit req boundaries, we can show those, otherwise fallback to offer bounds
          const dateRangeStr = reqMonday && reqSunday 
            ? `${formatDateStr(reqMonday)} - ${formatDateStr(reqSunday)}`
            : `${offer.start_date} to ${offer.end_date}`;

          setBonus({
            name: offer.name,
            dateRange: dateRangeStr,
            completedSlots,
            highestTarget,
            earned,
            maxReward,
            milestones,
            subTab
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadBonus();
  }, [profile, bonusId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#111827" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bonus Offer</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#f59e0b" />
        </View>
      </View>
    );
  }

  if (!bonus) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#111827" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bonus Offer</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>No bonus offer found.</Text>
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
        <Text style={styles.headerTitle}>Bonus Offer</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <View style={styles.titleRow}>
            <View style={styles.iconCircle}>
              <Gift color="#f59e0b" size={32} />
            </View>
            <View>
              <Text style={styles.offerName}>{bonus.name}</Text>
              <View style={styles.dateRow}>
                <Calendar color="#6b7280" size={14} />
                <Text style={styles.dateText}>{bonus.dateRange}</Text>
              </View>
            </View>
          </View>

          {bonus.subTab !== 'NEXT_WEEK' && (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Completed Slots</Text>
                <Text style={styles.progressValue}>{bonus.completedSlots} / {bonus.highestTarget}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${(bonus.completedSlots / bonus.highestTarget) * 100}%` }]} />
              </View>
            </View>
          )}

          {bonus.subTab !== 'NEXT_WEEK' ? (
            <View style={styles.earnedRow}>
              <Text style={styles.earnedLabel}>Total Earned</Text>
              <Text style={styles.earnedValue}>₹{bonus.earned} / ₹{bonus.maxReward}</Text>
            </View>
          ) : (
            <View style={styles.earnedRow}>
              <Text style={styles.earnedLabel}>Maximum Bonus Possible</Text>
              <Text style={styles.earnedValue}>₹{bonus.maxReward}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bonus Tiers</Text>
          <Text style={styles.cardSubtitle}>Complete slots to reach higher total bonus</Text>
          
          <View style={styles.milestoneContainer}>
            {bonus.milestones.map((milestone, index) => {
              const isAchieved = bonus.subTab !== 'NEXT_WEEK' && bonus.completedSlots >= milestone.slots;
              return (
                <View key={index} style={[styles.milestoneRow, isAchieved && styles.milestoneRowAchieved]}>
                  <View style={styles.milestoneLeft}>
                    {isAchieved ? (
                      <CheckCircle color="#10b981" size={20} />
                    ) : (
                      <View style={styles.emptyCircle} />
                    )}
                    <Text style={[styles.milestoneText, isAchieved && styles.milestoneTextAchieved]}>
                      {milestone.slots} Slots
                    </Text>
                  </View>
                  <Text style={[styles.milestoneReward, isAchieved && styles.milestoneRewardAchieved]}>
                    ₹{milestone.reward} Total
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  offerName: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  progressSection: { marginBottom: 20 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, color: '#4b5563', fontWeight: '500' },
  progressValue: { fontSize: 14, color: '#111827', fontWeight: '600' },
  progressBarBg: { height: 12, backgroundColor: '#f3f4f6', borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#f59e0b', borderRadius: 6 },
  earnedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  earnedLabel: { fontSize: 14, color: '#111827', fontWeight: '500' },
  earnedValue: { fontSize: 24, fontWeight: '700', color: '#f59e0b' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 20 },
  milestoneContainer: { gap: 12 },
  milestoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f3f4f6' },
  milestoneRowAchieved: { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' },
  milestoneLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db' },
  milestoneText: { fontSize: 16, color: '#6b7280', fontWeight: '500' },
  milestoneTextAchieved: { color: '#111827', fontWeight: '600' },
  milestoneReward: { fontSize: 16, color: '#6b7280', fontWeight: '500' },
  milestoneRewardAchieved: { color: '#10b981', fontWeight: '700' },
});
