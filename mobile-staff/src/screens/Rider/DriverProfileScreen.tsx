import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { ChevronRight, Store, Settings, HelpCircle, LogOut, FileText, CheckCircle2, Clock, XCircle, MapPin, Map, PackageOpen, Award, CreditCard, ShieldCheck } from 'lucide-react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { setRole, profile } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();

  const [loading, setLoading] = useState(true);
  const [warehouseName, setWarehouseName] = useState<string | null>(null);
  
  // Onboarding Data
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>('not_started');
  
  // Details status
  const [payoutStatus, setPayoutStatus] = useState<'Completed' | 'Required'>('Required');
  
  // Vehicle status
  const [vehicleDetails, setVehicleDetails] = useState<{ label: string, plate: string, status: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchProfileData = async () => {
      if (!profile?.id) return;
      
      try {
        setLoading(true);

        // Fetch Warehouse Name safely
        const warehousePromise = profile.warehouse_id 
          ? supabase.from('warehouses').select('name').eq('id', profile.warehouse_id).single()
          : Promise.resolve({ data: null });

        // Driver-specific fetches
        let onboardingPromise: any = Promise.resolve({ data: null });
        let payoutPromise: any = Promise.resolve({ data: null });
        let vehiclePromise: any = Promise.resolve({ data: null });

        if (profile.role === 'driver') {
          onboardingPromise = supabase
            .from('driver_onboarding')
            .select('status, vehicle_type')
            .eq('id', profile.id)
            .maybeSingle();

          payoutPromise = supabase
            .from('staff_payout_details')
            .select('staff_id')
            .eq('staff_id', profile.id)
            .maybeSingle();

          vehiclePromise = supabase
            .from('vehicles')
            .select('license_plate, status')
            .eq('owner_driver_id', profile.id)
            .eq('ownership_type', 'driver_owned')
            .maybeSingle();
        }

        const [whRes, onbRes, payRes, vehRes] = await Promise.allSettled([
          warehousePromise,
          onboardingPromise,
          payoutPromise,
          vehiclePromise
        ]);

        if (!isMounted) return;

        // Process Warehouse
        if (whRes.status === 'fulfilled' && whRes.value.data) {
          setWarehouseName(whRes.value.data.name);
        } else {
          setWarehouseName('Unassigned');
        }

        // Process Onboarding
        if (onbRes.status === 'fulfilled' && onbRes.value.data) {
          const ob = onbRes.value.data;
          setOnboardingStatus(ob.status);
        } else {
          setOnboardingStatus('not_started');
        }

        // Process Details
        if (payRes.status === 'fulfilled' && payRes.value.data) setPayoutStatus('Completed');
        
        // Process Vehicle
        if (vehRes.status === 'fulfilled' && vehRes.value.data) {
          const veh = vehRes.value.data;
          // Format status nice
          let statusText = 'Pending Approval';
          if (veh.status === 'active') statusText = 'Approved';
          if (veh.status === 'rejected') statusText = 'Rejected';
          
          setVehicleDetails({
            label: (onbRes.status === 'fulfilled' && onbRes.value.data?.vehicle_type) ? onbRes.value.data.vehicle_type : 'Personal Vehicle',
            plate: veh.license_plate,
            status: statusText
          });
        } else {
          setVehicleDetails(null);
        }

      } catch (error) {
        console.error("Error fetching profile data", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProfileData();

    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setRole('auth');
  };

  const getStatusDisplay = () => {
    switch(onboardingStatus) {
      case 'not_started': return { label: 'Not Started', color: '#94a3b8', icon: XCircle };
      case 'draft': 
      case 'in_progress': return { label: 'Incomplete', color: '#f59e0b', icon: Clock };
      case 'ready_to_submit':
      case 'pending': return { label: 'Pending Approval', color: '#3b82f6', icon: Clock };
      case 'approved': return { label: 'Approved', color: '#10b981', icon: CheckCircle2 };
      case 'rejected': return { label: 'Rejected', color: '#ef4444', icon: XCircle };
      default: return { label: 'Unknown', color: '#94a3b8', icon: HelpCircle };
    }
  };

  const statusConfig = getStatusDisplay();
  const StatusIcon = statusConfig.icon;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#10b981" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <Text style={styles.name}>{profile?.full_name || 'Driver'}</Text>
            {profile?.employee_id && (
              <Text style={styles.employeeId}>ID: {profile.employee_id}</Text>
            )}
          </View>
        </View>

        {/* Assigned Store */}
        <View style={styles.storeCard}>
          <View style={styles.storeIconBg}>
            <Store size={24} color="#10b981" />
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeTitle}>Assigned Warehouse</Text>
            <Text style={styles.storeName}>{warehouseName || 'None'}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        {profile?.role === 'driver' && (
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('DriverPayouts')} activeOpacity={0.8}>
              <View style={styles.actionIconBg}><CreditCard size={24} color="#64748b" /></View>
              <Text style={styles.actionText}>Payouts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} activeOpacity={0.8} disabled={true}>
              <View style={styles.actionIconBg}><Map size={24} color="#64748b" /></View>
              <Text style={styles.actionText}>Trips History</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} activeOpacity={0.8} disabled={true}>
              <View style={styles.actionIconBg}><PackageOpen size={24} color="#64748b" /></View>
              <Text style={styles.actionText}>Gigs History</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} activeOpacity={0.8} disabled={true}>
              <View style={styles.actionIconBg}><Award size={24} color="#64748b" /></View>
              <Text style={styles.actionText}>Your Offers</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Documents & Verification */}
        {profile?.role === 'driver' && (
          <>
            <Text style={styles.sectionHeader}>Documents & Verification</Text>
            <View style={styles.sectionCard}>
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <ShieldCheck size={20} color="#94a3b8" />
                  <Text style={styles.rowTitle}>Verification Status</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusConfig.color}15`, borderColor: `${statusConfig.color}30` }]}>
                  <StatusIcon size={12} color={statusConfig.color} style={{marginRight: 4}} />
                  <Text style={[styles.statusText, {color: statusConfig.color}]}>{statusConfig.label}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              
              <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('BankDetails')}>
                <View style={styles.rowLeft}>
                  <CreditCard size={20} color="#94a3b8" />
                  <Text style={styles.rowTitle}>Bank Details</Text>
                </View>
                <Text style={[styles.statusTextValue, payoutStatus === 'Completed' ? styles.textSuccess : styles.textWarning]}>
                  {payoutStatus}
                </Text>
              </TouchableOpacity>
              <View style={styles.divider} />

              <View style={[styles.row, { alignItems: 'flex-start' }]}>
                <View style={styles.rowLeft}>
                  <FileText size={20} color="#94a3b8" style={{ marginTop: 2 }} />
                  <View>
                    <Text style={styles.rowTitle}>Vehicle Details</Text>
                    {vehicleDetails && (
                      <>
                        <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                          {vehicleDetails.label} • {vehicleDetails.plate}
                        </Text>
                        <Text style={{ 
                          color: vehicleDetails.status === 'Approved' ? '#10b981' : vehicleDetails.status === 'Rejected' ? '#ef4444' : '#f59e0b', 
                          fontSize: 12, 
                          marginTop: 2,
                          fontWeight: '600'
                        }}>
                          {vehicleDetails.status}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('VehicleType')} style={{ paddingVertical: 2 }}>
                  <Text style={{color: '#3b82f6', fontWeight: 'bold'}}>{vehicleDetails ? 'Edit' : 'Update'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}



        {/* Support */}
        <Text style={styles.sectionHeader}>Support</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <HelpCircle size={20} color="#94a3b8" />
              <Text style={styles.rowTitle}>Help Centre</Text>
            </View>
            <Text style={styles.comingSoon}>Coming soon</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
          <LogOut size={20} color="#ef4444" style={{marginRight: 8}} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.footerVersion}>FlashGO Partner</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // FlashGO Dark Theme Background
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#334155',
    overflow: 'hidden',
    backgroundColor: '#1e293b',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#94a3b8',
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  employeeId: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  storeCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  storeIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  storeInfo: {
    flex: 1,
  },
  storeTitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 2,
  },
  storeName: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  actionItem: {
    alignItems: 'center',
    width: '30%',
  },
  actionIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowTitle: {
    fontSize: 15,
    color: '#f8fafc',
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  comingSoon: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  textSuccess: { color: '#10b981' },
  textWarning: { color: '#f59e0b' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },
  footerVersion: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 12,
    marginTop: 24,
    fontWeight: '600',
  }
});
