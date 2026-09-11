import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, MoreVertical, Info, HelpCircle, ThumbsUp } from 'lucide-react-native';

export default function WarningsScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const type = route.params?.type || 'performance'; // 'performance' | 'behavioral'

  const isPerformance = type === 'performance';
  const totalWarnings = isPerformance ? 9 : 5;
  const currentWarnings = 0;
  
  const titleText = isPerformance ? 'Total Performance warnings' : 'Total Behavioral warnings';
  const subtitleText = isPerformance ? 'Issued for performance issues' : 'Issued for behaviour issues';
  const suspensionText = `2 days ID suspension after ${totalWarnings} warnings`;
  const sectionTitle = isPerformance ? 'Warning history' : 'Behavioral warnings';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Warnings</Text>
          <Text style={styles.userDetails}>16.26.3 | GCEBOD76301586719 | 5499 | 0</Text>
        </View>
        <TouchableOpacity style={styles.menuButton}>
          <MoreVertical size={24} color="#1f2937" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Progress Header */}
        <View style={styles.progressHeader}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreText}>{currentWarnings}/{totalWarnings}</Text>
          </View>
          <Text style={styles.mainTitle}>{titleText}</Text>
          <Text style={styles.subtitle}>{subtitleText}</Text>
        </View>

        {/* Custom Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '0%' }]} />
            <View style={styles.progressMarkerLeft}>
              <Text style={styles.progressMarkerText}>{currentWarnings}/{totalWarnings}</Text>
            </View>
            <View style={styles.progressMarkerRight}>
              <View style={styles.infoIconOrange}>
                <Text style={styles.infoIconText}>i</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoIconOrangeLarge}>
            <Text style={styles.infoIconTextLarge}>i</Text>
          </View>
          <Text style={styles.infoBannerText}>{suspensionText}</Text>
        </View>

        <View style={styles.divider} />

        {/* Body Content */}
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>

        {!isPerformance && (
          <>
            <View style={styles.goodBehaviorBanner}>
              <Text style={styles.goodBehaviorText}>👍 Great job! Keep up the good behavior</Text>
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>0</Text>
                <Text style={styles.statLabel}>Slots under 30{'\n'}minutes</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>0</Text>
                <Text style={styles.statLabel}>No show after{'\n'}slot booking</Text>
              </View>
            </View>
            
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Warning history</Text>
          </>
        )}

        {/* History Card */}
        <View style={styles.historyCard}>
          <View style={styles.historyIconWrapper}>
            <Text style={styles.historyIconText}>?</Text>
          </View>
          <Text style={styles.historyText}>No updates. New warning will be{'\n'}updated over here</Text>
        </View>

        {/* Action Button */}
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Raise an issue?</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
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
  menuButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    backgroundColor: '#f4f5f8',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  progressHeader: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  scoreBox: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 16,
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  progressBarContainer: {
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    position: 'relative',
    marginTop: 16,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#f97316', // orange
    borderRadius: 4,
  },
  progressMarkerLeft: {
    position: 'absolute',
    left: -8,
    top: -12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  progressMarkerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  progressMarkerRight: {
    position: 'absolute',
    right: -8,
    top: -8,
  },
  infoIconOrange: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ea580c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    fontStyle: 'italic',
  },
  infoBanner: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  infoIconOrangeLarge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ea580c',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoIconTextLarge: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    fontStyle: 'italic',
  },
  infoBannerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: -20, // stretch across screen
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 16,
  },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  historyIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  historyIconText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  historyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    lineHeight: 22,
  },
  actionButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  
  // Behavioral specific
  goodBehaviorBanner: {
    backgroundColor: '#dcfce7', // light green
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  goodBehaviorText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    lineHeight: 20,
  }
});
