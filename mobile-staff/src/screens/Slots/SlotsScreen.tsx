import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { MoreVertical, MapPin, ChevronRight, Store, Clock, X } from 'lucide-react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SlotsScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { profile } = useAuth();

  const [datesList, setDatesList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Location selection state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  const fetchWarehouses = async () => {
    setLoadingWarehouses(true);
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name, address')
        .eq('is_active', true);
      if (!error && data) {
        setWarehouses(data);
      }
    } catch (e) {
      console.log('Error fetching warehouses:', e);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const handleOpenLocationModal = () => {
    setShowLocationModal(true);
    if (warehouses.length === 0) {
      fetchWarehouses();
    }
  };

  const handleSelectWarehouse = (warehouse: any) => {
    setSelectedWarehouse(warehouse);
    setShowLocationModal(false);
  };

  const generateDates = () => {
    const generatedDates = [];
    const todayMs = Date.now();
    
    for (let i = 0; i < 10; i++) {
      const dTarget = new Date(todayMs + i * 86400000);
      
      const f = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      const parts = f.formatToParts(dTarget);
      const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
      
      const month = p.month;
      const dateStr = p.day;
      const dayStr = p.weekday;
      
      const isoDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(dTarget);
      
      generatedDates.push({ month, dateStr, dayStr, isoDate });
    }
    return generatedDates;
  };

  const fetchSlotCounts = async () => {
    setIsLoading(true);
    const dates = generateDates();
    try {
      const todayIso = new Date().toISOString();
      let query = supabase
        .from('work_slots')
        .select('id, start_time, warehouse_id')
        .eq('status', 'published')
        .gte('start_time', todayIso);

      if (selectedWarehouse) {
        query = query.eq('warehouse_id', selectedWarehouse.id);
      }

      if (profile?.role) {
        query = query.eq('target_role', profile.role);
      }

      const { data: allSlots } = await query;

      let myBookings: any[] = [];
      if (profile?.id) {
        let bookingsQuery = supabase
          .from('staff_shifts')
          .select('work_slot_id, shift_start, shift_end, work_slots(warehouse_id)')
          .eq('staff_id', profile.id)
          .gt('shift_end', todayIso)
          .neq('status', 'cancelled');
          
        const { data } = await bookingsQuery;
        
        // Filter my bookings by selected warehouse if one is selected
        myBookings = (data || []).filter((b: any) => {
          if (!selectedWarehouse) return true;
          return b.work_slots?.warehouse_id === selectedWarehouse.id;
        });
      }

      const datesWithCounts = dates.map((d, idx) => {
        const matchDate = (isoString: string) => {
          if (!isoString) return false;
          const localIso = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
          }).format(new Date(isoString));
          return localIso === d.isoDate;
        };

        const slotsForDate = (allSlots || []).filter(s => matchDate(s.start_time));
        const bookingsForDate = (myBookings || []).filter((b: any) => matchDate(b.shift_start));
        
        const openCount = Math.max(0, slotsForDate.length - bookingsForDate.length);
        const bookedCount = bookingsForDate.length;
        
        const isActive = slotsForDate.length > 0;
        
        let title = 'No slots available yet';
        let subtitle = 'Check back later';
        let icon = 'clock';

        if (isActive) {
          title = `${openCount} Slots open, ${bookedCount} Booked`;
          subtitle = selectedWarehouse ? selectedWarehouse.name : 'Store available';
          icon = 'store';
        } else if (idx === 0) {
          title = 'No more slots available today';
        }

        return { ...d, isActive, title, subtitle, icon, openCount, bookedCount };
      });

      setDatesList(datesWithCounts);
    } catch (error) {
      console.error('Error fetching dates:', error);
      setDatesList(dates.map(d => ({ ...d, isActive: false, title: 'Error loading', subtitle: '', icon: 'clock', openCount: 0, bookedCount: 0 })));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchSlotCounts();
    }
  }, [isFocused, profile?.id, selectedWarehouse]);

  const renderDateCard = (date: string, day: string, isActive: boolean, title: string, subtitle: string, icon: 'store' | 'clock', isoDate: string, month: string) => {
    return (
      <TouchableOpacity 
        style={styles.cardContainer} 
        activeOpacity={0.8}
        onPress={() => {
          if (isActive) {
            navigation.navigate('SlotDetails', { 
              date: `${date} ${month.substring(0, 3)}`, 
              isoDate,
              warehouseId: selectedWarehouse?.id // pass down to SlotDetails
            });
          }
        }}
      >
        <View style={[styles.dateBlock, isActive ? styles.dateActive : styles.dateInactive]}>
          <Text style={styles.dateText}>{date}</Text>
          <Text style={styles.dayText}>{day}</Text>
        </View>
        <View style={styles.detailsBlock}>
          <View>
            <Text style={[styles.cardTitle, !isActive && styles.cardTitleInactive]}>{title}</Text>
            <View style={styles.subtitleRow}>
              {icon === 'store' ? (
                <Store size={14} color="#6b7280" style={styles.subtitleIcon} />
              ) : (
                <Clock size={14} color="#9ca3af" style={styles.subtitleIcon} />
              )}
              <Text style={[styles.cardSubtitle, !isActive && styles.cardSubtitleInactive]}>{subtitle}</Text>
            </View>
          </View>
          {isActive && <ChevronRight size={20} color="#1f2937" />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderDivider = (month: string) => {
    return (
      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{month}</Text>
        <View style={styles.dividerLine} />
      </View>
    );
  };

  let currentMonth = '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hi, {profile?.full_name || 'Staff'}</Text>
          <Text style={styles.userDetails}>{profile?.id?.substring(0, 8).toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={styles.menuButton}>
          <MoreVertical size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Near You / Selected Location Banner */}
      <View style={styles.nearYouContainer}>
        <View style={styles.nearYouLeft}>
          <View style={styles.mapPinContainer}>
            <MapPin size={20} color="#ef4444" fill="#ef4444" opacity={0.8} />
          </View>
          <Text style={styles.nearYouText} numberOfLines={1} ellipsizeMode="tail">
            {selectedWarehouse ? selectedWarehouse.name : 'Near you'}
          </Text>
        </View>
        <TouchableOpacity style={styles.changeLocationBtn} onPress={handleOpenLocationModal}>
          <Text style={styles.changeLocationText}>Change Location</Text>
          <ChevronRight size={16} color="#1f2937" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={{ marginTop: 12, color: '#6b7280' }}>Loading dates...</Text>
          </View>
        ) : (
          datesList.map((item, index) => {
            const showDivider = item.month !== currentMonth;
            if (showDivider) {
              currentMonth = item.month;
            }
            
            return (
              <React.Fragment key={index}>
                {showDivider && renderDivider(item.month)}
                {renderDateCard(item.dateStr, item.dayStr, item.isActive, item.title, item.subtitle, item.icon as 'store' | 'clock', item.isoDate, item.month)}
              </React.Fragment>
            );
          })
        )}
      </ScrollView>

      {/* Location Selection Modal */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Store</Text>
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <X size={24} color="#1f2937" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.warehouseList}>
              {loadingWarehouses ? (
                <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
              ) : warehouses.length > 0 ? (
                warehouses.map((wh) => (
                  <TouchableOpacity 
                    key={wh.id} 
                    style={[
                      styles.warehouseItem, 
                      selectedWarehouse?.id === wh.id && styles.warehouseItemActive
                    ]}
                    onPress={() => handleSelectWarehouse(wh)}
                  >
                    <View style={styles.warehouseItemIcon}>
                      <Store size={24} color={selectedWarehouse?.id === wh.id ? '#10b981' : '#6b7280'} />
                    </View>
                    <View style={styles.warehouseItemDetails}>
                      <Text style={styles.warehouseItemName}>{wh.name}</Text>
                      <Text style={styles.warehouseItemAddress}>{wh.address}</Text>
                    </View>
                    {selectedWarehouse?.id === wh.id && (
                      <ChevronRight size={20} color="#10b981" />
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.noWarehousesText}>No stores found.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55, // For status bar
    paddingBottom: 16,
    backgroundColor: '#10b981', // Solid FlashGO Green Header
    borderBottomWidth: 0,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 10
  },
  headerLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  greeting: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  userDetails: {
    fontSize: 12,
    color: '#d1fae5',
    fontWeight: '600',
  },
  menuButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  nearYouContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f4f5f8', // matching body bg a bit more closely
  },
  nearYouLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  mapPinContainer: {
    width: 36,
    height: 36,
    backgroundColor: '#fee2e2',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  nearYouText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    flexShrink: 1,
  },
  changeLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  changeLocationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
    marginRight: 4,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    paddingHorizontal: 12,
    color: '#9ca3af',
    fontWeight: '600',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  cardContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  dateBlock: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  dateActive: {
    backgroundColor: '#ecfdf5', // Light green
  },
  dateInactive: {
    backgroundColor: '#f9fafb', // Light grey
  },
  dateText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 2,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  detailsBlock: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  cardTitleInactive: {
    color: '#9ca3af',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitleIcon: {
    marginRight: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  cardSubtitleInactive: {
    color: '#9ca3af',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '50%',
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  warehouseList: {
    flex: 1,
  },
  warehouseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  warehouseItemActive: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },
  warehouseItemIcon: {
    marginRight: 16,
  },
  warehouseItemDetails: {
    flex: 1,
  },
  warehouseItemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  warehouseItemAddress: {
    fontSize: 13,
    color: '#6b7280',
  },
  noWarehousesText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 40,
    fontSize: 16,
  }
});
