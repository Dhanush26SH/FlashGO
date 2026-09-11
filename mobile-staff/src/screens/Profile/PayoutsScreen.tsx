import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Modal, Pressable } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function PayoutsScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const isFocused = useIsFocused();

  const [activeTab, setActiveTab] = useState<'Weekly' | 'Daily'>('Daily');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);
  
  const [selectedDaily, setSelectedDaily] = useState("3 Aug '26");
  const [selectedWeekly, setSelectedWeekly] = useState("3 Aug '26 - 3 Aug '26");

  const dailyOptions = [
    "3 Aug '26", "2 Aug '26", "1 Aug '26", "31 Jul '26", 
    "30 Jul '26", "29 Jul '26", "28 Jul '26", "27 Jul '26", "26 Jul '26"
  ];
  
  const weeklyOptions = [
    "3 Aug '26 - 3 Aug '26", "27 Jul '26 - 2 Aug '26", 
    "20 Jul '26 - 26 Jul '26", "13 Jul '26 - 19 Jul '26"
  ];

  const currentOptions = activeTab === 'Daily' ? dailyOptions : weeklyOptions;
  const currentSelected = activeTab === 'Daily' ? selectedDaily : selectedWeekly;

  const handleSelect = (val: string) => {
    if (activeTab === 'Daily') {
      setSelectedDaily(val);
    } else {
      setSelectedWeekly(val);
    }
    setIsDropdownOpen(false);
  };

  useEffect(() => {
    if (profile?.id && isFocused) {
      const fetchEarnings = async () => {
        try {
          // Fetch booked slots for this picker to calculate earnings
          const { data, error } = await supabase
            .from('slot_bookings')
            .select('status, slots(payout_min, payout_max)')
            .eq('picker_id', profile.id)
            .in('status', ['booked', 'completed']);

          if (error) throw error;
          
          let total = 0;
          if (data) {
            data.forEach((booking: any) => {
              if (booking.slots && booking.slots.payout_max) {
                total += Number(booking.slots.payout_max);
              }
            });
          }
          setTotalEarnings(total);
        } catch (e) {
          console.error("Error fetching earnings", e);
        }
      };
      
      fetchEarnings();
    }
  }, [profile, isFocused]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Earnings and Payout</Text>
          <Text style={styles.userDetails}>Hi, {profile?.full_name || 'Staff-982'}</Text>
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
          <Text style={styles.dropdownHeaderText}>{currentSelected}</Text>
          <ChevronDown size={20} color="#1f2937" />
        </TouchableOpacity>

        {/* Total Pay Card */}
        <View style={styles.totalPayCard}>
          <View style={styles.totalPayRow}>
            <Text style={styles.totalPayText}>Total Pay</Text>
            <Text style={styles.totalPayAmount}>₹{totalEarnings}</Text>
          </View>
          <View style={styles.totalPayDivider} />
        </View>
      </View>

      {/* Dropdown Modal */}
      <Modal visible={isDropdownOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setIsDropdownOpen(false)}>
          <View style={styles.dropdownMenuContainer}>
            <ScrollView style={styles.dropdownScroll} bounces={false}>
              {currentOptions.map((opt, idx) => {
                const isSelected = opt === currentSelected;
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
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50, // For status bar
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  userDetails: {
    fontSize: 13,
    color: '#6b7280',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#111827',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#111827',
  },
  content: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f4f5f8',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dropdownHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginRight: 8,
  },
  totalPayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  totalPayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalPayText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  totalPayAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10b981', // green
  },
  totalPayDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingTop: 160, // Adjust to match screenshot position roughly under tabs
    paddingHorizontal: 16,
  },
  dropdownMenuContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    maxHeight: 400,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownScroll: {
    flexGrow: 0,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  dropdownItemActive: {
    backgroundColor: '#dbeafe', // light blue from screenshot
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f2937',
  },
});
