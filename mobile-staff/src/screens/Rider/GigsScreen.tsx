import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, RefreshControl } from 'react-native';
import { Check, X, Calendar, MapPin, Clock } from 'lucide-react-native';
import { format, parseISO, isSameDay, differenceInMinutes, startOfDay, addDays } from 'date-fns';
import { useGigs, GigSlot } from './useGigs';

export default function GigsScreen({ navigation }: any) {
  const { gigs, loading, refreshing, onRefresh, bookGigs } = useGigs();
  
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [isBooking, setIsBooking] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [bookedData, setBookedData] = useState<any[] | null>(null);
  
  const [filter, setFilter] = useState<'All' | 'Open' | 'Booked'>('Open');

  // Derive active dates from actual slots, plus a few empty days for UX padding
  const uniqueDates = useMemo(() => {
    const dates = new Map<string, Date>();
    const today = startOfDay(new Date());
    dates.set(today.toISOString(), today);
    for (let i = 1; i <= 3; i++) {
      const d = addDays(today, i);
      dates.set(d.toISOString(), d);
    }
    gigs.forEach(g => {
      const d = startOfDay(parseISO(g.start_time));
      if (!dates.has(d.toISOString())) dates.set(d.toISOString(), d);
    });
    return Array.from(dates.values()).sort((a, b) => a.getTime() - b.getTime());
  }, [gigs]);

  // Calendar status precedence
  const getDateStatus = (d: Date) => {
    const dateGigs = gigs.filter(g => isSameDay(parseISO(g.start_time), d));
    if (dateGigs.length === 0) return 'No Gigs';
    
    const hasBooked = dateGigs.some(g => g.is_booked);
    if (hasBooked) return 'Booked';
    return 'Booking Open';
  };

  const currentGigs = useMemo(() => {
    let filtered = gigs.filter(g => isSameDay(parseISO(g.start_time), selectedDate));
    if (filter === 'Open') filtered = filtered.filter(g => !g.is_booked);
    if (filter === 'Booked') filtered = filtered.filter(g => g.is_booked);
    return filtered;
  }, [gigs, selectedDate, filter]);

  const toggleSlot = (id: string) => {
    const newSet = new Set(selectedSlotIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedSlotIds(newSet);
  };

  const getSection = (isoTime: string) => {
    const hour = parseISO(isoTime).getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    if (hour < 21) return 'Evening';
    return 'Night';
  };

  const groupedGigs = useMemo(() => {
    const groups: Record<string, GigSlot[]> = { 'Morning': [], 'Afternoon': [], 'Evening': [], 'Night': [] };
    currentGigs.forEach(g => {
      groups[getSection(g.start_time)].push(g);
    });
    return groups;
  }, [currentGigs]);

  const selectedSlotsData = useMemo(() => gigs.filter(g => selectedSlotIds.has(g.id)), [gigs, selectedSlotIds]);

  let totalHours = 0;
  let totalMin = 0;
  let totalMax = 0;
  
  selectedSlotsData.forEach(g => {
    const hours = differenceInMinutes(parseISO(g.end_time), parseISO(g.start_time)) / 60;
    totalHours += hours;
    if (g.estimated_hourly_rate_min) totalMin += (g.estimated_hourly_rate_min * hours);
    if (g.estimated_hourly_rate_max) totalMax += (g.estimated_hourly_rate_max * hours);
  });

  const handleBook = async () => {
    if (selectedSlotIds.size === 0) return;
    setIsBooking(true);
    const res = await bookGigs(Array.from(selectedSlotIds));
    setIsBooking(false);
    if (res.success) {
      setBookedData(res.data);
      setShowConfirm(true);
      setSelectedSlotIds(new Set());
    }
  };

  const closeConfirm = () => {
    setShowConfirm(false);
    setBookedData(null);
    onRefresh();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#10b981" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gigs</Text>
      </View>

      {/* Calendar */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarScroll}>
          {uniqueDates.map((d, i) => {
            const isSelected = isSameDay(d, selectedDate);
            const status = getDateStatus(d);
            return (
              <TouchableOpacity 
                key={i} 
                style={[styles.dateCard, isSelected && styles.dateCardActive]}
                onPress={() => setSelectedDate(d)}
              >
                <Text style={[styles.dateDayName, isSelected && styles.textActive]}>{format(d, 'EEE')}</Text>
                <Text style={[styles.dateDayNumber, isSelected && styles.textActive]}>{format(d, 'd')}</Text>
                <Text style={[styles.dateStatus, isSelected && styles.textActiveStatus]}>{status}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {['All', 'Open', 'Booked'].map(f => (
          <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f as any)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Gig List */}
      <ScrollView 
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {Object.entries(groupedGigs).map(([group, slots]) => {
          if (slots.length === 0) return null;
          return (
            <View key={group} style={styles.groupContainer}>
              <Text style={styles.groupTitle}>{group}</Text>
              {slots.map(g => {
                const isSelected = selectedSlotIds.has(g.id);
                return (
                  <TouchableOpacity 
                    key={g.id} 
                    style={[styles.slotCard, isSelected && styles.slotCardSelected, g.is_booked && { borderColor: '#10b981', backgroundColor: '#132c22', opacity: 0.8 }]}
                    onPress={() => !g.is_booked && toggleSlot(g.id)}
                    activeOpacity={g.is_booked ? 1 : 0.8}
                  >
                    <View style={styles.slotLeft}>
                      <Text style={styles.slotTime}>{format(parseISO(g.start_time), 'h:mm a')} - {format(parseISO(g.end_time), 'h:mm a')}</Text>
                      <View style={styles.slotRow}>
                        <MapPin color="#a1a1aa" size={14} />
                        <Text style={styles.slotStore}>{g.warehouse_name}</Text>
                      </View>
                      <View style={styles.slotRow}>
                        <Clock color="#a1a1aa" size={14} />
                        <Text style={styles.slotRate}>₹{g.estimated_hourly_rate_min} - ₹{g.estimated_hourly_rate_max} per hour</Text>
                      </View>
                    </View>
                    <View style={styles.slotRight}>
                      {g.is_booked ? (
                        <View style={[styles.checkbox, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
                          <Check color="#10b981" size={16} />
                        </View>
                      ) : (
                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                          {isSelected && <Check color="#000" size={16} />}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })}
        {currentGigs.length === 0 && (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyTitle}>No Gigs Available</Text>
            <Text style={styles.emptySub}>
              {filter === 'Booked' 
                ? "You haven't booked any gigs for this date."
                : "There are no open gigs on this date."}
            </Text>
          </View>
        )}
        <View style={{height: 120}} />
      </ScrollView>

      {/* Sticky Bottom Summary */}
      {selectedSlotIds.size > 0 && (
        <View style={styles.stickyBottom}>
          <View style={styles.stickyContent}>
            <View>
              <Text style={styles.stickyTotalLabel}>Estimated earnings</Text>
              <Text style={styles.stickyTotalValue}>₹{totalMin.toFixed(0)} - ₹{totalMax.toFixed(0)}</Text>
              <Text style={styles.stickySub}>{selectedSlotIds.size} Gigs • {totalHours} hrs</Text>
            </View>
            <TouchableOpacity style={styles.bookButton} onPress={handleBook} disabled={isBooking}>
              {isBooking ? <ActivityIndicator color="#000" /> : <Text style={styles.bookButtonText}>Book</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Confirmation Modal */}
      <Modal visible={showConfirm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconWrapper}>
              <Check color="#10b981" size={40} />
            </View>
            <Text style={styles.modalTitle}>Gig Booked!</Text>
            
            <View style={styles.modalDetails}>
              {bookedData?.map((b, idx) => (
                <View key={idx} style={styles.modalRow}>
                  <Text style={styles.modalStore}>{b.warehouse_name}</Text>
                  <Text style={styles.modalTime}>{format(parseISO(b.start_time), 'MMM d, h:mm a')}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.okayButton} onPress={closeConfirm}>
              <Text style={styles.okayText}>Okay, Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#0A0A0A' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  calendarScroll: { paddingHorizontal: 12, paddingBottom: 16 },
  dateCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    width: 80,
  },
  dateCardActive: { backgroundColor: '#10b981' },
  dateDayName: { color: '#a1a1aa', fontSize: 13, marginBottom: 4 },
  dateDayNumber: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  dateStatus: { color: '#f59e0b', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  textActive: { color: '#fff' },
  textActiveStatus: { color: '#dcfce7' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1C1C1E' },
  filterChipActive: { backgroundColor: '#3f3f46' },
  filterText: { color: '#a1a1aa', fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  listContent: { paddingHorizontal: 16 },
  groupContainer: { marginBottom: 24 },
  groupTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  slotCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262626'
  },
  slotCardSelected: { borderColor: '#10b981', backgroundColor: '#132c22' },
  slotLeft: { flex: 1 },
  slotTime: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  slotStore: { color: '#d4d4d8', fontSize: 14 },
  slotRate: { color: '#10b981', fontSize: 14, fontWeight: '500' },
  slotRight: { paddingLeft: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: '#52525b', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  emptyStateContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#a1a1aa', fontSize: 14, textAlign: 'center' },
  stickyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#262626',
    padding: 16,
    paddingBottom: 32, // for safe area
  },
  stickyContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stickyTotalLabel: { color: '#a1a1aa', fontSize: 12, marginBottom: 2 },
  stickyTotalValue: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 2 },
  stickySub: { color: '#a1a1aa', fontSize: 12 },
  bookButton: { backgroundColor: '#10b981', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  bookButtonText: { color: '#000', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#1C1C1E', borderRadius: 16, width: '100%', padding: 24, alignItems: 'center' },
  successIconWrapper: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#132c22', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 24 },
  modalDetails: { width: '100%', backgroundColor: '#0A0A0A', borderRadius: 8, padding: 16, marginBottom: 24, gap: 12 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalStore: { color: '#fff', fontSize: 14, fontWeight: '500' },
  modalTime: { color: '#a1a1aa', fontSize: 14 },
  okayButton: { backgroundColor: '#10b981', width: '100%', paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
  okayText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
