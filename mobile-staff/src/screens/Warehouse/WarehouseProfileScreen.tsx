import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  ChevronRight, 
  CreditCard, 
  LogOut,
  Building,
  Star,
  Headphones,
  FileText
} from 'lucide-react-native';
import PickerHeader from '../../components/PickerHeader';

export default function WarehouseProfileScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth() as any;
  const [warehouseName, setWarehouseName] = useState<string | null>(null);
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
    fetchWarehouseInfo();
  }, [profile]);

  const fetchWarehouseInfo = async () => {
    if (!profile?.warehouse_id) return;
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('name')
        .eq('id', profile.warehouse_id)
        .single();
      
      if (!error && data) {
        setWarehouseName(data.name);
      } else {
        setWarehouseName(null);
      }
    } catch (e) {
      console.log('Error fetching warehouse', e);
    }
  };

  const MenuItem = ({ icon, title, onPress, disabled, comingSoon }: any) => (
    <TouchableOpacity style={[styles.menuRow, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <View style={styles.menuLeft}>
        <View style={styles.iconContainer}>
          {icon}
        </View>
        <Text style={styles.menuTitle}>{title}</Text>
      </View>
      {comingSoon ? (
        <Text style={styles.comingSoonText}>Coming soon</Text>
      ) : (
        <ChevronRight size={20} color="#9ca3af" />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Section */}
      <PickerHeader
        profile={profile}
        subTitle={warehouseName || 'Unassigned Warehouse'}
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
            icon={<FileText size={22} color="#10b981" />} 
            title="Payments" 
            onPress={() => navigation.navigate('WarehousePayroll')} 
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
  comingSoonText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
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
