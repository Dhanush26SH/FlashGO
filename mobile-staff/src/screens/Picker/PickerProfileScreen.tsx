import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  Bell, 
  ChevronRight, 
  CreditCard, 
  LogOut,
  Building,
  Star,
  Headphones
} from 'lucide-react-native';
import PickerHeader from '../../components/PickerHeader';

export default function PickerProfileScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth() as any;
  const [isOnline, setIsOnline] = useState(!!profile?.is_online);
  const [shiftInfo, setShiftInfo] = useState<any>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // AuthContext will automatically redirect to Login via onAuthStateChange
    } catch (e: any) {
      Alert.alert('Logout Failed', e.message || 'An error occurred during logout.');
      setIsLoggingOut(false);
    }
  };

  useEffect(() => {
    setIsOnline(!!profile?.is_online);
    fetchShiftInfo();
  }, [profile]);

  const fetchShiftInfo = async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('staff_shifts')
        .select(`
          id, status, shift_start, shift_end,
          warehouses ( name )
        `)
        .eq('staff_id', profile.id)
        .eq('status', 'active')
        .single();
      
      if (!error && data) {
        setShiftInfo(data);
      } else {
        setShiftInfo(null);
        // Force offline if no active shift but they are online
        if (profile?.is_online) {
          toggleOnlineStatus(false, true);
        }
      }
    } catch (e) {
      console.log('Error fetching shift', e);
    }
  };

  const toggleOnlineStatus = async (value: boolean, silent = false) => {
    setIsOnline(value);
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase.rpc('picker_toggle_online', { p_is_online: value });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.code || 'Failed to update online status');
      }
    } catch (e: any) {
      setIsOnline(!value);
      if (!silent) {
        Alert.alert("Status Update Failed", e.message || "Failed to update online status. Please check your active shifts.");
      }
    }
  };

  const MenuItem = ({ icon, title, onPress }: any) => (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuLeft}>
        <View style={styles.iconContainer}>
          {icon}
        </View>
        <Text style={styles.menuTitle}>{title}</Text>
      </View>
      <ChevronRight size={20} color="#9ca3af" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Section */}
      <PickerHeader
        profile={profile}
        subTitle={shiftInfo?.warehouses?.name}
        rightContent={
          <>
            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleText, { color: '#ffffff' }]}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
              <Switch
                trackColor={{ false: '#d1d5db', true: '#10b981' }}
                thumbColor={'#ffffff'}
                onValueChange={(val) => toggleOnlineStatus(val)}
                value={isOnline}
              />
            </View>
            <TouchableOpacity style={styles.iconBtn}>
              <Bell size={24} color="#374151" />
            </TouchableOpacity>
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Menu Section */}
        <View style={styles.card}>
          <MenuItem 
            icon={<Building size={22} color="#10b981" />} 
            title="Bank Details" 
            onPress={() => navigation.navigate('BankDetails')} 
          />
          <View style={styles.divider} />
          <MenuItem 
            icon={<CreditCard size={22} color="#10b981" />} 
            title="Payouts" 
            onPress={() => navigation.navigate('Payouts')} 
          />
          <View style={styles.divider} />
          <MenuItem 
            icon={<Star size={22} color="#10b981" />} 
            title="Your Rating" 
            onPress={() => navigation.navigate('StaffRating')} 
          />
          <View style={styles.divider} />
          <MenuItem 
            icon={<Headphones size={22} color="#10b981" />} 
            title="Help & Support" 
            onPress={() => navigation.navigate('StaffSupportList')} 
          />
        </View>

        {/* Logout Section */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? (
            <ActivityIndicator color="#ef4444" size="small" />
          ) : (
            <>
              <LogOut color="#ef4444" size={20} />
              <Text style={styles.logoutText}>Logout</Text>
            </>
          )}
        </TouchableOpacity>
        
        {/* Spacer for bottom navigation */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6', // Clean light-grey background
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  iconBtn: {
    padding: 6,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ecfdf5', // light green tint
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuTitle: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 72, // Aligned with the text
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
