import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, Alert, Linking, AppState } from 'react-native';
import { Bell, HelpCircle, AlertTriangle, ChevronRight, User, LogOut } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

export default function FeedScreen({ navigation }: any) {
  const { profile, setRole } = useAuth() as any;
  const [isOnline, setIsOnline] = useState(profile?.is_online || false);
  const [pendingTrip, setPendingTrip] = useState<any>(null);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayTrips, setTodayTrips] = useState(0);
  const [todaySessions, setTodaySessions] = useState(0);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [nextGig, setNextGig] = useState<any>(null);
  const [activeCampaign, setActiveCampaign] = useState<any>(null);

  const checkActiveSession = async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from('driver_sessions')
      .select(`
        id,
        staff_shifts (
          status,
          shift_end
        )
      `)
      .eq('driver_id', profile.id)
      .eq('status', 'active')
      .single();

    if (data && !error) {
      const shift = Array.isArray(data.staff_shifts) ? data.staff_shifts[0] : data.staff_shifts;
      const shiftEnd = shift?.shift_end ? new Date(shift.shift_end) : null;
      const isExpired = shiftEnd ? shiftEnd < new Date() : false;
      const isShiftActive = shift?.status === 'active';

      if (!isExpired && isShiftActive) {
        navigation.reset({ index: 0, routes: [{ name: 'DriverOperationsMapScreen' }] });
      } else if (isExpired) {
        // Actively clean up stale session on backend
        await supabase.rpc('driver_expire_shift');
        setIsOnline(false);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTripsAndMetrics();
      checkActiveSession();
    }, [profile?.id])
  );

  const handleToggleOnline = async (value: boolean) => {
    setIsOnline(value);
    try {
      const { data, error } = await supabase.rpc('driver_toggle_break_status', { p_is_online: value });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.code || 'Failed to toggle status');
      }
    } catch (e: any) {
      setIsOnline(!value);
      Alert.alert(
        'Cannot go online',
        e.message || 'Ensure you have an active assigned vehicle and valid compliance documents.'
      );
    }
  };

  const handleGoToStore = (gig: any) => {
    const lat = gig?.warehouses?.lat;
    const lng = gig?.warehouses?.lng;
    if (!lat || !lng) {
      Alert.alert('Location Unavailable', 'Store location is not configured.');
      return;
    }
    navigation.navigate('NavigationScreen', { 
      mode: 'warehouse',
      destLat: lat,
      destLng: lng,
      destinationName: gig?.warehouses?.name || 'Warehouse',
      destinationAddress: gig?.warehouses?.address,
      gig: gig
    });
  };

  const fetchTripsAndMetrics = async () => {
    if (!profile?.id) return;
    
    // First look for active trip
    const { data: activeTrips } = await supabase
      .from('logistics_trips')
      .select('id, status, warehouse_id, warehouses(name, address)')
      .eq('driver_id', profile.id)
      .in('status', ['accepted', 'in_transit'])
      .order('created_at', { ascending: true })
      .limit(1);

    if (activeTrips && activeTrips.length > 0) {
      setActiveTrip(activeTrips[0]);
    } else {
      setActiveTrip(null);
    }

    // Fetch Today's Metrics (Asia/Kolkata boundary)
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + (5.5 * 60 * 60 * 1000));
    nowIst.setUTCHours(0, 0, 0, 0); // start of day IST
    const todayStr = new Date(nowIst.getTime() - (5.5 * 60 * 60 * 1000)).toISOString();

    const { data: earns } = await supabase
      .from('driver_financial_ledger')
      .select('amount')
      .eq('driver_id', profile.id)
      .eq('transaction_type', 'delivery_earning')
      .gte('occurred_at', todayStr);

    if (earns) {
      setTodayEarnings(earns.reduce((sum, e) => sum + Number(e.amount), 0));
    }

    const { count: tripsCount } = await supabase
      .from('logistics_trips')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', profile.id)
      .eq('status', 'completed')
      .gte('delivered_at', todayStr);

    if (tripsCount !== null) {
      setTodayTrips(tripsCount);
    }
    
    const { count: sessionsCount } = await supabase
      .from('staff_shifts')
      .select('*', { count: 'exact', head: true })
      .eq('staff_id', profile.id)
      .gte('started_at', todayStr);
      
    if (sessionsCount !== null) {
      setTodaySessions(sessionsCount);
    }
    
    // Fetch Next/Current Booked Gig — driver lifecycle:
    // 'scheduled' = booked and waiting for check-in
    // 'active'    = checked in and shift is running
    // 'completed' / 'cancelled' = terminal, don't show
    if (profile.role === 'driver') {
      const nowIso = new Date().toISOString();
      const { data: nextGigData } = await supabase
        .from('staff_shifts')
        .select('id, shift_start, shift_end, status, warehouses(name, lat, lng), work_slots(estimated_hourly_rate_min, estimated_hourly_rate_max)')
        .eq('staff_id', profile.id)
        .in('status', ['scheduled', 'booked', 'active'])
        .gt('shift_end', nowIso)
        .order('shift_start', { ascending: true })
        .limit(1);
        
      const gigs = nextGigData as any[] | null;
      if (gigs && gigs.length > 0) {
        setNextGig(gigs[0]);
      } else {
        setNextGig(null);
      }
      
      const { data: campaignData } = await supabase.rpc('driver_get_active_campaign');
      if (campaignData && campaignData.success && campaignData.campaign) {
        setActiveCampaign(campaignData.campaign);
      } else {
        setActiveCampaign(null);
      }
    }
  };

  useEffect(() => {
    fetchTripsAndMetrics();

    const channel = supabase.channel('trips_feed_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logistics_trips' }, () => fetchTripsAndMetrics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_financial_ledger' }, () => fetchTripsAndMetrics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_shifts' }, () => fetchTripsAndMetrics())
      .subscribe();

    // AppState for background -> foreground refresh
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchTripsAndMetrics();
      }
    });

    // Schedule Midnight IST refresh
    const now = new Date();
    const utcMs = now.getTime();
    const istMs = utcMs + (5.5 * 60 * 60 * 1000);
    const istDate = new Date(istMs);
    const tomorrowIst = new Date(istDate);
    tomorrowIst.setUTCHours(24, 0, 0, 0);
    const msUntilMidnightIST = tomorrowIst.getTime() - istDate.getTime();
    
    // Safety clamp (if very close to midnight, just wait at least 5s, max 24h)
    const timeoutMs = Math.max(5000, Math.min(msUntilMidnightIST + 1000, 86400000));
    
    const midnightTimer = setTimeout(() => {
      fetchTripsAndMetrics();
    }, timeoutMs);

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
      clearTimeout(midnightTimer);
    };
  }, [profile?.id, profile?.warehouse_id]);

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
          <TouchableOpacity style={styles.iconCircle} onPress={async () => {
            await supabase.auth.signOut();
            setRole('auth');
          }}>
            <LogOut color="#ef4444" size={16} />
          </TouchableOpacity>
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
        
        {/* Today's Progress Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CalendarIcon />
            <Text style={styles.cardTitle}>Today's progress</Text>
          </View>
          
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridValue}>₹{todayEarnings.toFixed(2)}</Text>
              <Text style={styles.gridLabel}>Earnings ➔</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridValue}>{todayTrips}</Text>
              <Text style={styles.gridLabel}>Trips ➔</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridValue}>{todaySessions}</Text>
              <Text style={styles.gridLabel}>Sessions ➔</Text>
            </View>
            <TouchableOpacity style={styles.gridItem} onPress={() => navigation.navigate('DeliveryHistory')}>
              <Text style={styles.gridValue}>View</Text>
              <Text style={styles.gridLabel}>History ➔</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Incentive / Earnings Progress */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.cardHeader}>
            <Text style={{ fontSize: 18 }}>🏆</Text>
            <Text style={styles.cardTitle}>Incentive / Earnings Progress</Text>
          </View>
          
          {activeCampaign ? (
            <View>
              <Text style={{ color: '#10b981', fontSize: 12, marginBottom: 12, fontWeight: 'bold' }}>
                ₹{todayEarnings.toFixed(2)} delivery earnings today!
              </Text>
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'column', gap: 12, minWidth: '100%', paddingBottom: 8 }}>
                  {/* Top Row: Incentives */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: '#9ca3af', fontSize: 10, width: 60, fontWeight: 'bold' }}>INCENTIVE</Text>
                    {activeCampaign.milestones?.map((m: any, idx: number) => (
                      <View key={`inc-${idx}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 60, alignItems: 'center' }}>
                          <Text style={{ color: '#10b981', fontWeight: 'bold', fontSize: 12 }}>₹{m.reward_amount}</Text>
                        </View>
                        {idx < activeCampaign.milestones.length - 1 && (
                          <View style={{ width: 40, height: 2, backgroundColor: '#3f3f46' }} />
                        )}
                      </View>
                    ))}
                  </View>
                  
                  {/* Indicators Row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 60 }} />
                    {activeCampaign.milestones?.map((m: any, idx: number) => (
                      <View key={`ind-${idx}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 60, alignItems: 'center' }}>
                          <View style={[
                            styles.milestoneMarker,
                            todayEarnings >= m.threshold_amount ? styles.milestoneMarkerActive : styles.milestoneMarkerInactive
                          ]} />
                        </View>
                        {idx < activeCampaign.milestones.length - 1 && (
                          <View style={[
                            styles.milestoneLine,
                            todayEarnings >= activeCampaign.milestones[idx+1].threshold_amount 
                              ? styles.milestoneLineActive 
                              : styles.milestoneLineInactive
                          ]} />
                        )}
                      </View>
                    ))}
                  </View>
                  
                  {/* Bottom Row: Earnings Target */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: '#9ca3af', fontSize: 10, width: 60, fontWeight: 'bold' }}>EARNINGS</Text>
                    {activeCampaign.milestones?.map((m: any, idx: number) => (
                      <View key={`tgt-${idx}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 60, alignItems: 'center' }}>
                          <Text style={{ color: '#d1d5db', fontSize: 12 }}>₹{m.target_earnings}</Text>
                        </View>
                        {idx < activeCampaign.milestones.length - 1 && (
                          <View style={{ width: 40, backgroundColor: 'transparent' }} />
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>
          ) : (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>No incentive available today</Text>
            </View>
          )}
        </View>

        {/* Current Gig / Shift Card */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Current Gig</Text>
        </View>
        <View style={styles.gigCard}>
          <View style={styles.gigIconBg}>
            <Text style={{fontSize: 20}}>📅</Text>
          </View>
          <View style={styles.gigInfo}>
            {nextGig ? (
              <>
                <Text style={styles.gigTitle}>
                  {nextGig.status === 'active' ? 'Active Gig' : 'Upcoming Gig'}
                </Text>
                <Text style={styles.gigSub}>
                  {nextGig.warehouses?.name || 'Assigned Store'} — {new Date(nextGig.shift_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {new Date(nextGig.shift_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–{new Date(nextGig.shift_end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — Booked
                </Text>
                
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity style={[styles.gigBtn, { backgroundColor: '#3b82f6' }]} onPress={() => handleGoToStore(nextGig)}>
                    <Text style={styles.gigBtnText}>Go to Store</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[
                      styles.gigBtn, 
                      { backgroundColor: new Date().getTime() >= new Date(nextGig.shift_start).getTime() - 30 * 60000 ? '#10b981' : '#3f3f46' }
                    ]}
                    disabled={new Date().getTime() < new Date(nextGig.shift_start).getTime() - 30 * 60000}
                    onPress={() => navigation.navigate('DriverCheckInScreen', { shift: nextGig })}
                  >
                    <Text style={styles.gigBtnText}>Check In Now</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.gigTitle}>No active/upcoming gig</Text>
                <Text style={styles.gigSub}>Book a slot in the Gigs tab to start earning.</Text>
              </>
            )}
          </View>
        </View>

        {/* Offers Section */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Active Campaigns</Text>
        </View>

        {activeCampaign ? (
          <View style={[styles.offerCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={styles.offerTitle}>Earnings Campaign</Text>
              <Text style={{ color: '#10b981', fontWeight: 'bold' }}>Active</Text>
            </View>
            <Text style={{ color: '#d1d5db', fontSize: 13, marginBottom: 4 }}>
              Valid today
            </Text>
            <Text style={{ color: '#d1d5db', fontSize: 13, marginBottom: 12 }}>
              Ends at 12:00 AM
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#3f3f46' }}>
              <Text style={{ color: '#9ca3af', fontSize: 12 }}>Milestones: {activeCampaign.milestones?.length || 0}</Text>
              <Text style={{ color: '#9ca3af', fontSize: 12 }}>Max Reward: ₹{activeCampaign.milestones?.length ? activeCampaign.milestones[activeCampaign.milestones.length - 1].reward_amount : 0}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.offerCard}>
            <View style={styles.offerLeft}>
              <Text style={styles.offerTitle}>No active campaigns</Text>
              <Text style={styles.offerSub}>Check back later for special offers.</Text>
            </View>
          </View>
        )}

        {/* Padding for bottom floating banner */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Active Order Banner */}
      {activeTrip && (
        <TouchableOpacity style={styles.activeOrderBanner} onPress={() => navigation.navigate('RiderDashboard', { tripId: activeTrip.id })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.orderIconBg}>
               <Text style={{fontSize: 16}}>🛒</Text>
            </View>
            <View>
              <Text style={styles.orderHint}>Pick order from store (ASSIGNED)</Text>
              <Text style={styles.orderStore}>{activeTrip.warehouses?.name || 'Unknown Store'}</Text>
            </View>
          </View>
          <ChevronRight color="#ffffff" size={20} />
        </TouchableOpacity>
      )}

    </View>
  );
}

const CalendarIcon = () => (
  <View style={styles.calIcon}>
    <View style={styles.calTop} />
    <View style={styles.calBody} />
  </View>
);

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
    marginBottom: 16,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  gridItem: {
    width: '50%',
    marginBottom: 20,
  },
  gridValue: {
    color: '#10b981',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  gridLabel: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  gigCard: {
    backgroundColor: '#1e1b4b',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3730a3',
  },
  gigIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  gigInfo: {
    flex: 1,
  },
  gigTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  gigSub: {
    color: '#a5b4fc',
    fontSize: 13,
  },
  gigBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gigBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  offerCard: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offerLeft: {},
  offerTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  offerSub: {
    color: '#a1a1aa',
    fontSize: 11,
  },
  activeOrderBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 24,
  },
  orderIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderHint: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '600',
  },
  orderStore: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  calIcon: {
    width: 20,
    height: 20,
  },
  calTop: {
    height: 6,
    backgroundColor: '#d4d4d8',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  calBody: {
    height: 14,
    borderWidth: 2,
    borderColor: '#d4d4d8',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  milestoneMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#52525b',
  },
  milestoneMarkerActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  milestoneMarkerInactive: {
    backgroundColor: '#3f3f46',
  },
  milestoneLine: {
    width: 40,
    height: 2,
  },
  milestoneLineActive: {
    backgroundColor: '#10b981',
  },
  milestoneLineInactive: {
    backgroundColor: '#3f3f46',
  }
});
