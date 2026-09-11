import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MoreVertical, MapPin, ChevronRight, Store, Clock } from 'lucide-react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function SlotsScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { profile } = useAuth();

  const renderDateCard = (date: string, day: string, isActive: boolean, title: string, subtitle: string, icon: 'store' | 'clock', isoDate: string, month: string) => {
    return (
      <TouchableOpacity 
        style={styles.cardContainer} 
        activeOpacity={0.8}
        onPress={() => {
          if (isActive) {
            navigation.navigate('SlotDetails', { date: `${date} ${month.substring(0, 3)}`, isoDate });
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

  const generateDates = () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const generatedDates = [];
    const today = new Date();
    
    for (let i = 0; i < 10; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      
      const month = months[d.getMonth()];
      const dateStr = d.getDate().toString();
      const dayStr = days[d.getDay()];
      const isoDate = d.toISOString().split('T')[0];
      
      generatedDates.push({ month, dateStr, dayStr, isoDate });
    }
    return generatedDates;
  };

  const [datesList, setDatesList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSlotCounts = async () => {
    const dates = generateDates();
    try {
      // Fetch all slots from today onwards
      const todayIso = new Date().toISOString();
      const { data: allSlots } = await supabase
        .from('work_slots')
        .select('id, start_time')
        .eq('status', 'published')
        .gte('start_time', todayIso);

      // Fetch bookings for this picker
      let myBookings: any[] = [];
      if (profile?.id) {
        const { data } = await supabase
          .from('staff_shifts')
          .select('work_slot_id, shift_start')
          .eq('staff_id', profile.id)
          .eq('status', 'booked');
        myBookings = data || [];
      }

      const datesWithCounts = dates.map(d => {
        const slotsForDate = (allSlots || []).filter(s => s.start_time.startsWith(d.isoDate));
        const bookingsForDate = (myBookings || []).filter((b: any) => b.shift_start.startsWith(d.isoDate));
        
        const openCount = Math.max(0, slotsForDate.length - bookingsForDate.length);
        const bookedCount = bookingsForDate.length;
        
        const isActive = slotsForDate.length > 0;
        
        // Formulate titles based on real data
        let title = 'No slots available yet';
        let subtitle = 'Check back later';
        let icon = 'clock';

        if (isActive) {
          title = `${openCount} Slots open, ${bookedCount} Booked`;
          subtitle = 'Store available';
          icon = 'store';
        }

        return { ...d, isActive, title, subtitle, icon, openCount, bookedCount };
      });

      setDatesList(datesWithCounts);
    } catch (error) {
      console.error('Error fetching dates:', error);
      // Fallback
      setDatesList(dates.map(d => ({ ...d, isActive: false, title: 'Error loading', subtitle: '', icon: 'clock', openCount: 0, bookedCount: 0 })));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchSlotCounts();
    }
  }, [isFocused, profile?.id]);

  let currentMonth = '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hi, {profile?.full_name || 'Staff-982'}</Text>
          <Text style={styles.userDetails}>16.24.5 | GCEBOD76301586719 | 5499 | 0</Text>
        </View>
        <TouchableOpacity style={styles.menuButton}>
          <MoreVertical size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Near You Banner */}
      <View style={styles.nearYouContainer}>
        <View style={styles.nearYouLeft}>
          <View style={styles.mapPinContainer}>
            <MapPin size={20} color="#ef4444" fill="#ef4444" opacity={0.8} />
          </View>
          <Text style={styles.nearYouText}>Near you</Text>
        </View>
        <TouchableOpacity style={styles.changeLocationBtn}>
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
  },
  mapPinContainer: {
    width: 36,
    height: 36,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  nearYouText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  changeLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  changeLocationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
    marginRight: 4,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f4f5f8',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d1d5db',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
  },
  cardContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dateBlock: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  dateActive: {
    backgroundColor: '#10b981', // green
  },
  dateInactive: {
    backgroundColor: '#8c95a0', // grey matching screenshot
  },
  dateText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
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
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
  },
  cardTitleInactive: {
    color: '#6b7280',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitleIcon: {
    marginRight: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#4b5563',
  },
  cardSubtitleInactive: {
    color: '#9ca3af',
  },
});
