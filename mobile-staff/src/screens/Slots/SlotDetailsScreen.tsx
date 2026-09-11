import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Modal, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, MoreVertical, MapPin, ChevronRight, CheckSquare, Square, Filter, X, Smartphone } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function SlotDetailsScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const route = useRoute();
  const dateStr = (route.params as any)?.date || '30 Jul';
  const isoDate = (route.params as any)?.isoDate || new Date().toISOString().split('T')[0];
  const initialTab = (route.params as any)?.initialTab || 'open';
  
  const [activeTab, setActiveTab] = useState<'open' | 'booked'>(initialTab);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);

  const toggleSlot = (id: string) => {
    if (selectedSlots.includes(id)) {
      setSelectedSlots(selectedSlots.filter(s => s !== id));
    } else {
      setSelectedSlots([...selectedSlots, id]);
    }
  };

  const [openSlots, setOpenSlots] = useState<any[]>([]);
  const [bookedSlots, setBookedSlots] = useState<any[]>([]);

  const fetchSlots = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch all slots for this date
      const { data: allSlotsData, error: slotsError } = await supabase
        .from('work_slots')
        .select('*')
        .eq('status', 'published')
        .gte('start_time', `${isoDate}T00:00:00Z`)
        .lte('start_time', `${isoDate}T23:59:59Z`)
        .order('start_time', { ascending: true });

      if (slotsError) throw slotsError;

      // 2. Fetch bookings for this picker
      let myBookingsData: any[] = [];
      if (profile?.id) {
        const { data, error: bookingsError } = await supabase
          .from('staff_shifts')
          .select('work_slot_id')
          .eq('staff_id', profile.id)
          .eq('status', 'booked');

        if (bookingsError) throw bookingsError;
        myBookingsData = data || [];
      }

      const myBookedSlotIds = new Set(myBookingsData?.map(b => b.work_slot_id) || []);

      const formattedOpenSlots: any[] = [];
      const formattedBookedSlots: any[] = [];

      (allSlotsData || []).forEach(slot => {
        const startDate = new Date(slot.start_time);
        const endDate = new Date(slot.end_time);
        const timeStr = `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
        const payoutStr = 'Standard Rate';
        
        if (myBookedSlotIds.has(slot.id)) {
          formattedBookedSlots.push({
            id: slot.id,
            time: timeStr,
            payout: payoutStr,
            status: 'booked',
            storeLocation: 'Warehouse' // Fallback since warehouse_id is used now
          });
        } else {
          // If capacity is reached, it should ideally be filtered or shown as full, but for now we'll show it
          formattedOpenSlots.push({
            id: slot.id,
            time: timeStr,
            payout: `Payout ${payoutStr}`,
            status: 'available',
            storeLocation: 'Warehouse'
          });
        }
      });

      setOpenSlots(formattedOpenSlots);
      setBookedSlots(formattedBookedSlots);
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [isoDate, profile?.id]);

  const handleConfirmBooking = async () => {
    if (selectedSlots.length === 0) return;
    
    setIsBooking(true);
    try {
      // Use RPC for safe slot booking
      for (const slotId of selectedSlots) {
        const { error } = await supabase.rpc('worker_book_slot', { p_slot_id: slotId });
        if (error) throw error;
      }

      // Re-fetch everything to get the latest status
      await fetchSlots();
      
      setSelectedSlots([]);
      setIsConfirmModalVisible(false);
      setActiveTab('booked');
    } catch (error) {
      console.error('Error booking slots:', error);
      alert('Failed to book slots. They might be full.');
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Slots, {dateStr}</Text>
          <Text style={styles.userDetails}>16.24.5 | GCEBOD76301586719 | 5499 | 0</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <MoreVertical size={24} color="#1f2937" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'open' && styles.activeTab]} 
          onPress={() => setActiveTab('open')}
        >
          <Text style={[styles.tabText, activeTab === 'open' && styles.activeTabText]}>Open slots</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'booked' && styles.activeTab]} 
          onPress={() => setActiveTab('booked')}
        >
          <Text style={[styles.tabText, activeTab === 'booked' && styles.activeTabText]}>Booked slots</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'open' ? (
          <>
            {/* Open Slots Content */}
            <View style={styles.nearYouBanner}>
              <View style={styles.nearYouLeft}>
                <View style={styles.mapPinContainer}>
                  <MapPin size={20} color="#ef4444" fill="#ef4444" opacity={0.8} />
                </View>
                <View>
                  <Text style={styles.storesCountText}>1 Store</Text>
                  <Text style={styles.nearYouSubtitle}>Near you</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.changeLocationBtn}>
                <Text style={styles.changeLocationText}>Change Location</Text>
                <ChevronRight size={16} color="#1f2937" />
              </TouchableOpacity>
            </View>

            <View style={styles.storeCardBlue}>
              <View style={styles.distBlock}>
                <Text style={styles.distValue}>0</Text>
                <Text style={styles.distUnit}>kms</Text>
              </View>
              <View style={styles.storeCardContent}>
                <Text style={styles.storeNameBlue}>{openSlots[0]?.storeLocation || 'No store available'}</Text>
                <Text style={styles.storeAddressBlue}>Udupi, Karnataka</Text>
              </View>
              <TouchableOpacity style={styles.detailsBtnDark}>
                <Text style={styles.detailsBtnText}>Details</Text>
                <ChevronRight size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={{ marginTop: 12, color: '#6b7280' }}>Fetching slots...</Text>
              </View>
            ) : openSlots.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280' }}>No open slots available for this date.</Text>
              </View>
            ) : (
              <View style={styles.slotsList}>
                {openSlots.map(slot => {
                const isSelected = selectedSlots.includes(slot.id);
                
                if (slot.status === 'overlapping') {
                  return (
                    <View key={slot.id} style={[styles.slotCard, { backgroundColor: '#f1f5f9', padding: 0, overflow: 'hidden' }]}>
                      <View style={{ padding: 16, paddingBottom: 12 }}>
                        <Text style={[styles.slotTime, { color: '#9ca3af' }]}>{slot.time}</Text>
                        <Text style={[styles.slotPayout, { color: '#9ca3af' }]}>{slot.payout}</Text>
                      </View>
                      <View style={{ backgroundColor: '#fef08a', paddingVertical: 10, paddingHorizontal: 16 }}>
                        <Text style={{ color: '#854d0e', fontSize: 13, fontWeight: '500' }}>{slot.overlapText}</Text>
                      </View>
                    </View>
                  );
                }

                if (slot.status === 'booked') {
                  return (
                    <View key={slot.id} style={[styles.slotCard, { backgroundColor: '#ecfdf5', borderColor: '#d1fae5' }]}>
                      <View>
                        <Text style={styles.slotTime}>{slot.time}</Text>
                        <Text style={styles.slotPayout}>{slot.payout}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: '#10b981', fontWeight: '600', marginRight: 4 }}>Booked</Text>
                        <CheckSquare size={16} color="#10b981" />
                      </View>
                    </View>
                  );
                }

                // Default: available
                return (
                  <TouchableOpacity 
                    key={slot.id} 
                    style={styles.slotCard} 
                    activeOpacity={0.7}
                    onPress={() => toggleSlot(slot.id)}
                  >
                    <View>
                      <Text style={styles.slotTime}>{slot.time}</Text>
                      <Text style={styles.slotPayout}>{slot.payout}</Text>
                    </View>
                    <View style={styles.checkboxContainer}>
                      {isSelected ? (
                        <View style={{ backgroundColor: '#10b981', borderRadius: 4 }}>
                          <CheckSquare size={24} color="#ffffff" />
                        </View>
                      ) : (
                        <Square size={24} color="#10b981" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            )}
          </>
        ) : (
          <>
            {/* Booked Slots Content */}
        {activeTab === 'booked' && (
          <View style={{ padding: 16 }}>
            {isLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={{ marginTop: 12, color: '#6b7280' }}>Fetching bookings...</Text>
              </View>
            ) : bookedSlots.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280', fontSize: 16 }}>You have no booked slots for this date.</Text>
              </View>
            ) : (
              bookedSlots.map(slot => (
                <View key={slot.id} style={styles.slotCard}>
                  <View>
                    <Text style={styles.slotTime}>{slot.time}</Text>
                    <Text style={styles.slotPayout}>Payout {slot.payout}</Text>
                  </View>
                  <TouchableOpacity style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
          </>
        )}
      </ScrollView>

      {/* Footer & Floating Actions */}
      {activeTab === 'open' && (
        <View style={styles.openFooterContainer}>
          <TouchableOpacity style={[styles.floatingFilterBtn, selectedSlots.length > 0 && { top: -110 }]}>
            <Text style={styles.filterText}>Filters</Text>
            <Filter size={16} color="#ffffff" />
          </TouchableOpacity>

          {selectedSlots.length > 0 && (
            <View style={[styles.bookedFooterBanner, { position: 'relative' }]}>
              <View>
                <Text style={styles.footerLabel}>Selected slots</Text>
                <Text style={styles.footerValue}>{selectedSlots.length} Slots ({selectedSlots.length * 2} Hours)</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.footerLabel}>Estimated earnings</Text>
                <Text style={styles.footerValue}>₹60 - ₹255</Text>
              </View>
            </View>
          )}

          <View style={styles.bottomBar}>
            <TouchableOpacity 
              style={[styles.proceedBtn, selectedSlots.length > 0 && { backgroundColor: '#1f2937' }]}
              disabled={selectedSlots.length === 0}
              onPress={() => setIsConfirmModalVisible(true)}
            >
              <Text style={styles.proceedBtnText}>Proceed to book</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeTab === 'booked' && (
        <View style={styles.bookedFooterBanner}>
          <View>
            <Text style={styles.footerLabel}>Selected slots</Text>
            <Text style={styles.footerValue}>{bookedSlots.length} Slots ({bookedSlots.length * 2} Hours)</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.footerLabel}>Estimated earnings</Text>
            <Text style={styles.footerValue}>₹140 - ₹765</Text>
          </View>
        </View>
      )}

      {/* Confirmation Modal */}
      <Modal
        visible={isConfirmModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCloseContainer}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setIsConfirmModalVisible(false)}>
              <X size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            {/* Top Illustration Box */}
            <View style={styles.illustrationBox}>
              <Smartphone size={40} color="#3b82f6" />
              <MapPin size={40} color="#eab308" style={{ marginLeft: 20 }} />
            </View>

            <Text style={styles.modalTitle}>Confirm Booking</Text>
            <Text style={styles.modalSubtitle}>Arrive on time on the following location</Text>

            <View style={styles.modalStoreInfo}>
              <Text style={styles.modalStoreName}>{openSlots.find(s => selectedSlots.includes(s.id))?.storeLocation || 'Udupi service bus stand'}</Text>
              <Text style={styles.modalStoreAddress}>Udupi, Karnataka</Text>
            </View>

            <View style={styles.modalReportItem}>
              <Text style={styles.reportLabel}>Report item</Text>
              <View style={styles.reportRow}>
                <View style={styles.reportCol}>
                  <Text style={styles.reportValue}>{dateStr}, Thursday</Text>
                </View>
                <View style={styles.reportDivider} />
                <View style={styles.reportCol}>
                  <Text style={styles.reportValue}>
                    {openSlots.find(s => selectedSlots.includes(s.id))?.time || '04:00 PM - 06:00 PM'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Slots starting before 3 PM must be cancelled by 9 PM on Jul 29. Later slots must be cancelled by 11 AM on Jul 30.{'\n'}₹50 penalty on Late Cancellation / No show.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsConfirmModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleConfirmBooking}>
                <Text style={styles.modalConfirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50, // rough status bar height for demo
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  iconBtn: { padding: 4 },
  headerCenter: { flex: 1, paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 2 },
  userDetails: { fontSize: 12, color: '#6b7280' },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: '#1f2937' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#9ca3af' },
  activeTabText: { color: '#1f2937' },
  scrollContainer: { flex: 1, backgroundColor: '#f4f5f8' },
  scrollContent: { paddingBottom: 120 },
  
  // Open Slots Styles
  nearYouBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f1f5f9',
  },
  nearYouLeft: { flexDirection: 'row', alignItems: 'center' },
  mapPinContainer: {
    width: 40, height: 40,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  storesCountText: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  nearYouSubtitle: { fontSize: 13, color: '#4b5563' },
  changeLocationBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: '#1f2937',
  },
  changeLocationText: { fontSize: 13, fontWeight: '600', color: '#1f2937', marginRight: 4 },
  
  storeCardBlue: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  distBlock: {
    backgroundColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginRight: 12,
  },
  distValue: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  distUnit: { fontSize: 12, fontWeight: '600', color: '#1f2937' },
  storeCardContent: { flex: 1 },
  storeNameBlue: { fontSize: 15, fontWeight: '700', color: '#1e3a8a', marginBottom: 4 },
  storeAddressBlue: { fontSize: 13, color: '#475569', lineHeight: 18 },
  detailsBtnDark: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6,
  },
  detailsBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600', marginRight: 2 },
  
  slotsList: { paddingHorizontal: 16 },
  slotCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  slotTime: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  slotPayout: { fontSize: 13, color: '#6b7280' },
  checkboxContainer: { padding: 4 },
  
  // Booked Slots Styles
  storeInfoBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#e2e8f0',
    marginBottom: 16,
  },
  storeInfoLeft: { flex: 1, paddingRight: 12 },
  storeNameGrey: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  storeAddressGrey: { fontSize: 13, color: '#475569', lineHeight: 18 },
  cancelBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: '#6b7280',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  
  // Footer
  openFooterContainer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  floatingFilterBtn: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  filterText: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginRight: 8 },
  bottomBar: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  proceedBtn: {
    backgroundColor: '#d1d5db',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  proceedBtnActive: { backgroundColor: '#10b981' },
  proceedBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  
  bookedFooterBanner: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  footerLabel: { color: '#bfdbfe', fontSize: 13, marginBottom: 2 },
  footerValue: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCloseContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalCloseBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    padding: 10,
    borderRadius: 24,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 0,
  },
  illustrationBox: {
    backgroundColor: '#e0f2fe',
    height: 100,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginHorizontal: -24,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalStoreInfo: {
    marginBottom: 20,
  },
  modalStoreName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  modalStoreAddress: {
    fontSize: 13,
    color: '#4b5563',
  },
  modalReportItem: {
    marginBottom: 20,
  },
  reportLabel: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 8,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reportCol: {
    flex: 1,
  },
  reportDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 12,
  },
  reportValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  warningBox: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  warningText: {
    color: '#b91c1c',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#1f2937',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
