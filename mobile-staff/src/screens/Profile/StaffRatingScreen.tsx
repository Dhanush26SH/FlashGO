import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Star, ChevronLeft, Calendar, User, MapPin } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

export default function StaffRatingScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState<number>(0);

  const isDriver = profile?.role === 'driver';

  useEffect(() => {
    let isMounted = true;

    const fetchRatings = async () => {
      if (!profile?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('staff_performance_reviews')
          .select(`
            *,
            reviewer:reviewed_by(full_name),
            warehouse:warehouse_id(name)
          `)
          .eq('staff_id', profile.id)
          .order('period_end', { ascending: false });

        if (error) throw error;
        
        if (isMounted && data) {
          setReviews(data);
          
          if (data.length > 0) {
            const sum = data.reduce((acc, curr) => acc + curr.star_rating, 0);
            setAverageRating(sum / data.length);
          }
        }
      } catch (err) {
        console.error('Error fetching ratings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRatings();

    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const formatDateRange = (start: string, end: string) => {
    const formatOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const s = new Date(start).toLocaleDateString('en-GB', formatOpts);
    const e = new Date(end).toLocaleDateString('en-GB', formatOpts);
    return `${s} - ${e}`;
  };

  const getThemeStyle = (light: any, dark: any) => {
    return isDriver ? dark : light;
  };

  const renderStars = (rating: number) => {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star 
            key={i} 
            size={16} 
            color={i <= rating ? '#eab308' : (isDriver ? '#334155' : '#e2e8f0')} 
            fill={i <= rating ? '#eab308' : 'transparent'} 
          />
        ))}
      </View>
    );
  };

  const MetricRow = ({ label, value }: { label: string, value: string }) => (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, getThemeStyle(styles.textLight, styles.textDark)]}>{label}</Text>
      <Text style={[
        styles.metricValue, 
        value === 'Good' ? styles.valueGood : value === 'Average' ? styles.valueAvg : styles.valuePoor
      ]}>
        {value}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, getThemeStyle(styles.bgLight, styles.bgDark)]}>
      {/* Header */}
      <View style={[styles.header, getThemeStyle(styles.headerLight, styles.headerDark)]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color={isDriver ? '#f8fafc' : '#1f2937'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, getThemeStyle(styles.titleLight, styles.titleDark)]}>Your Rating</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Average Rating Summary */}
          <View style={[styles.summaryCard, getThemeStyle(styles.cardLight, styles.cardDark)]}>
            <Text style={[styles.summaryTitle, getThemeStyle(styles.textLight, styles.textDark)]}>Overall Performance</Text>
            <View style={styles.ratingBigContainer}>
              <Text style={[styles.ratingBigText, getThemeStyle(styles.titleLight, styles.titleDark)]}>
                {averageRating > 0 ? averageRating.toFixed(1) : '-'}
              </Text>
              <Text style={[styles.ratingMaxText, getThemeStyle(styles.textLight, styles.textDark)]}>/5</Text>
            </View>
            {averageRating > 0 && renderStars(Math.round(averageRating))}
            <Text style={[styles.summarySubtitle, getThemeStyle(styles.textLight, styles.textDark)]}>
              Based on {reviews.length} review{reviews.length !== 1 && 's'}
            </Text>
          </View>

          {/* Reviews List */}
          <View style={styles.reviewsContainer}>
            <Text style={[styles.sectionTitle, getThemeStyle(styles.titleLight, styles.titleDark)]}>Review History</Text>
            
            {reviews.length === 0 ? (
              <View style={[styles.emptyState, getThemeStyle(styles.cardLight, styles.cardDark)]}>
                <Star size={40} color="#94a3b8" />
                <Text style={[styles.emptyTitle, getThemeStyle(styles.titleLight, styles.titleDark)]}>No ratings yet</Text>
                <Text style={[styles.emptyText, getThemeStyle(styles.textLight, styles.textDark)]}>
                  Your performance reviews will appear here once submitted by management.
                </Text>
              </View>
            ) : (
              reviews.map((review) => (
                <View key={review.id} style={[styles.reviewCard, getThemeStyle(styles.cardLight, styles.cardDark)]}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewPeriod}>
                      <Calendar size={16} color="#10b981" style={{ marginRight: 6 }} />
                      <Text style={[styles.periodText, getThemeStyle(styles.textLight, styles.textDark)]}>
                        {formatDateRange(review.period_start, review.period_end)}
                      </Text>
                    </View>
                    <View style={styles.reviewStars}>
                      <Text style={[styles.starNum, getThemeStyle(styles.textLight, styles.textDark)]}>{review.star_rating}/5</Text>
                      <Star size={14} color="#eab308" fill="#eab308" />
                    </View>
                  </View>
                  
                  <View style={styles.metricsContainer}>
                    <MetricRow label="Performance" value={review.performance} />
                    <MetricRow label="Work Behaviour" value={review.work_behaviour} />
                    <MetricRow label="Attendance" value={review.attendance} />
                  </View>

                  {review.remarks && (
                    <View style={[styles.remarksContainer, getThemeStyle(styles.remarksLight, styles.remarksDark)]}>
                      <Text style={[styles.remarksLabel, getThemeStyle(styles.textLight, styles.textDark)]}>Remarks:</Text>
                      <Text style={[styles.remarksText, getThemeStyle(styles.textLight, styles.textDark)]}>{review.remarks}</Text>
                    </View>
                  )}

                  <View style={[styles.reviewFooter, getThemeStyle(styles.footerLight, styles.footerDark)]}>
                    <View style={styles.footerItem}>
                      <User size={12} color="#94a3b8" />
                      <Text style={[styles.footerText, getThemeStyle(styles.textLight, styles.textDark)]}>
                        {review.reviewer?.full_name || 'Admin'}
                      </Text>
                    </View>
                    <View style={styles.footerItem}>
                      <MapPin size={12} color="#94a3b8" />
                      <Text style={[styles.footerText, getThemeStyle(styles.textLight, styles.textDark)]}>
                        {review.warehouse?.name || 'Warehouse'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bgLight: { backgroundColor: '#f3f4f6' },
  bgDark: { backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLight: { backgroundColor: '#ffffff', borderBottomColor: '#e2e8f0' },
  headerDark: { backgroundColor: '#0f172a', borderBottomColor: '#1e293b' },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  titleLight: { color: '#1f2937' },
  titleDark: { color: '#f8fafc' },
  textLight: { color: '#64748b' },
  textDark: { color: '#94a3b8' },
  
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  summaryCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardLight: { backgroundColor: '#ffffff' },
  cardDark: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  summaryTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  ratingBigContainer: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  ratingBigText: { fontSize: 48, fontWeight: '800' },
  ratingMaxText: { fontSize: 24, fontWeight: '600', opacity: 0.5 },
  summarySubtitle: { fontSize: 13, marginTop: 12 },
  
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  reviewsContainer: { flex: 1 },
  
  emptyState: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  
  reviewCard: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  reviewPeriod: { flexDirection: 'row', alignItems: 'center' },
  periodText: { fontSize: 14, fontWeight: '600' },
  reviewStars: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eab30815', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  starNum: { fontSize: 13, fontWeight: '700', color: '#eab308', marginRight: 4 },
  
  metricsContainer: { paddingHorizontal: 16, paddingBottom: 16 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  metricLabel: { fontSize: 14 },
  metricValue: { fontSize: 13, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  valueGood: { color: '#10b981', backgroundColor: '#10b98115' },
  valueAvg: { color: '#f59e0b', backgroundColor: '#f59e0b15' },
  valuePoor: { color: '#ef4444', backgroundColor: '#ef444415' },
  
  remarksContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  remarksLight: { backgroundColor: '#f8fafc' },
  remarksDark: { backgroundColor: '#0f172a' },
  remarksLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  remarksText: { fontSize: 13, lineHeight: 18 },
  
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  footerLight: { backgroundColor: '#f8fafc', borderTopColor: '#f1f5f9' },
  footerDark: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { fontSize: 12 },
});
