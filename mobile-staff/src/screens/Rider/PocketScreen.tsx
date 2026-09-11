import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, Alert } from 'react-native';
import { Bell, HelpCircle, AlertTriangle, ChevronRight, User, Wallet, History, CreditCard, Heart, FileText, IndianRupee } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function PocketScreen({ navigation }: any) {
  const { profile } = useAuth() as any;
  const [isOnline, setIsOnline] = useState(profile?.is_online || false);
  
  const [pocketBalance, setPocketBalance] = useState(0);
  const [unsettledCod, setUnsettledCod] = useState(0);
  const [weeklyEarnings, setWeeklyEarnings] = useState(0);
  const [weeklyTips, setWeeklyTips] = useState(0);
  const [weeklyDeductions, setWeeklyDeductions] = useState(0);

  useEffect(() => {
    if (profile?.id) {
      fetchPocketData();
    }
  }, [profile?.id]);

  const fetchPocketData = async () => {
    try {
      const { data: rawData, error } = await supabase
        .from('driver_financial_summary')
        .select('*')
        .eq('driver_id', profile.id)
        .maybeSingle();
      const data = rawData as any;
        
      if (error && error.code !== 'PGRST116') { // PGRST116 is multiple (or no) rows returned
        console.error('Error fetching pocket summary', error);
      }
      
      if (data) {
        setPocketBalance(Number(data.pocket_balance) || 0);
        setUnsettledCod(Number(data.unsettled_cod) || 0);
        setWeeklyEarnings(Number(data.weekly_earnings) || 0);
        setWeeklyTips(Number(data.weekly_tips) || 0);
        setWeeklyDeductions(Number(data.weekly_deductions) || 0);
      }
    } catch (e) {
      console.error('Exception fetching pocket summary', e);
    }
  };

  const handleToggleOnline = async (value: boolean) => {
    setIsOnline(value);
    try {
      const response = (await supabase.from('profiles').update({ is_online: value }).eq('id', profile?.id)) as any;
      if (response.error) throw response.error;
    } catch (e: any) {
      setIsOnline(!value);
    }
  };

  const handleSettleCod = () => {
    Alert.alert(
      "Settle COD", 
      "To settle your COD liability, please physically hand the cash to an authorized FlashGO Admin or Warehouse Manager at your assigned warehouse."
    );
  };

  const availablePayout = Math.max(0, pocketBalance);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.onlineBadge}>
          <Text style={styles.onlineText}>{isOnline ? 'Online' : 'Offline'}</Text>
          <Switch 
            value={isOnline} 
            onValueChange={handleToggleOnline}
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
          <TouchableOpacity 
            style={styles.profileCircle} 
            onPress={() => navigation.navigate('Profile')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <User color="#9ca3af" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        
        {/* Weekly Earnings Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <IndianRupee color="#10b981" size={20} />
            <Text style={styles.cardTitle}>Current Week Earnings</Text>
          </View>
          <Text style={styles.mainAmount}>₹{weeklyEarnings.toFixed(2)}</Text>
          <Text style={styles.subText}>Qualifying deliveries this week</Text>
        </View>

        {/* Pocket Balance & COD Card */}
        <View style={[styles.card, { borderColor: unsettledCod > 0 ? '#f59e0b' : '#334155', borderWidth: 1 }]}>
          <View style={styles.cardHeader}>
            <Wallet color="#3b82f6" size={20} />
            <Text style={styles.cardTitle}>Pocket & Settlement</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Pocket Balance</Text>
            <Text style={[styles.rowValue, { color: pocketBalance < 0 ? '#ef4444' : '#10b981' }]}>
              {pocketBalance < 0 ? '-' : ''}₹{Math.abs(pocketBalance).toFixed(2)}
            </Text>
          </View>
          <Text style={styles.hintText}>
            {pocketBalance < 0 ? 'You owe FlashGO' : 'FlashGO owes you'}
          </Text>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Available Payout</Text>
            <Text style={styles.rowValue}>₹{availablePayout.toFixed(2)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>COD Cash to Settle</Text>
              {unsettledCod > 0 && (
                <Text style={{color: '#f59e0b', fontSize: 12, marginTop: 4}}>Please deposit cash at warehouse</Text>
              )}
            </View>
            <Text style={[styles.rowValue, { color: unsettledCod > 0 ? '#f59e0b' : '#ffffff' }]}>
              ₹{unsettledCod.toFixed(2)}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.actionButton, unsettledCod <= 0 && { opacity: 0.5 }]}
            onPress={handleSettleCod}
            disabled={unsettledCod <= 0}
          >
            <Text style={styles.actionButtonText}>Settle COD Cash</Text>
          </TouchableOpacity>
        </View>

        {/* More Services Title */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>MORE SERVICES</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* 2x2 Grid */}
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            {/* Payout */}
            <TouchableOpacity style={styles.gridCard} disabled={true}>
              <CreditCard color="#a1a1aa" size={24} />
              <View style={styles.gridCardContent}>
                <Text style={styles.gridCardTitle}>Payout</Text>
                <Text style={styles.gridCardSub}>View history</Text>
              </View>
            </TouchableOpacity>

            {/* Customer Tips */}
            <TouchableOpacity style={styles.gridCard} disabled={true}>
              <Heart color="#a1a1aa" size={24} />
              <View style={styles.gridCardContent}>
                <Text style={styles.gridCardTitle}>Customer Tips</Text>
                <Text style={styles.gridCardSub}>₹0 / No tips yet</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.gridRow}>
            {/* Deduction Statement */}
            <TouchableOpacity style={styles.gridCard} disabled={true}>
              <AlertTriangle color="#a1a1aa" size={24} />
              <View style={styles.gridCardContent}>
                <Text style={styles.gridCardTitle}>Deduction Statement</Text>
                <Text style={styles.gridCardSub}>View penalties</Text>
              </View>
            </TouchableOpacity>

            {/* Pocket Statement */}
            <TouchableOpacity style={styles.gridCard} disabled={true}>
              <FileText color="#a1a1aa" size={24} />
              <View style={styles.gridCardContent}>
                <Text style={styles.gridCardTitle}>Pocket Statement</Text>
                <Text style={styles.gridCardSub}>Full ledger</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={{height: 100}} />
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
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  mainAmount: {
    color: '#10b981',
    fontSize: 36,
    fontWeight: '800',
  },
  subText: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  rowLabel: {
    color: '#d4d4d8',
    fontSize: 15,
    fontWeight: '600',
  },
  rowValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  actionButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
    paddingHorizontal: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#3f3f46',
  },
  dividerText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 12,
    letterSpacing: 1,
  },
  grid: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    height: 110,
    justifyContent: 'space-between',
    opacity: 0.6,
  },
  gridCardContent: {
    marginTop: 'auto',
  },
  gridCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  gridCardSub: {
    color: '#a1a1aa',
    fontSize: 12,
  },
});
