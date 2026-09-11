import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MoreVertical, ChevronRight, AlertCircle, Star } from 'lucide-react-native';

export default function PerformanceScreen() {
  const navigation = useNavigation<any>();
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Your performance</Text>
          <Text style={styles.userDetails}>16.24.5 | GCEBOD76301586719 | 5499 | 0</Text>
        </View>
        <TouchableOpacity style={styles.menuButton}>
          <MoreVertical size={24} color="#1f2937" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.sectionTitle}>Warnings</Text>
        
        <View style={styles.warningsRow}>
          {/* Card 1 */}
          <TouchableOpacity 
            style={styles.warningCard} 
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Warnings', { type: 'performance' })}
          >
            <View style={styles.warningCardContent}>
              <View style={styles.warningCardTop}>
                <Text style={styles.warningCount}>0/9</Text>
                <ChevronRight size={18} color="#1f2937" />
              </View>
              <Text style={styles.warningLabel}>Performance{'\n'}warnings</Text>
            </View>
            <View style={styles.warningCardFooter}>
              <AlertCircle size={14} color="#9ca3af" style={{ marginRight: 6 }} />
              <Text style={styles.warningFooterText}>2 days suspension</Text>
            </View>
          </TouchableOpacity>
          
          {/* Card 2 */}
          <TouchableOpacity 
            style={styles.warningCard} 
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Warnings', { type: 'behavioral' })}
          >
            <View style={styles.warningCardContent}>
              <View style={styles.warningCardTop}>
                <Text style={styles.warningCount}>0/5</Text>
                <ChevronRight size={18} color="#1f2937" />
              </View>
              <Text style={styles.warningLabel}>Behavioral{'\n'}warnings</Text>
            </View>
            <View style={styles.warningCardFooter}>
              <AlertCircle size={14} color="#9ca3af" style={{ marginRight: 6 }} />
              <Text style={styles.warningFooterText}>2 days{'\n'}suspension</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Store Manager Ratings</Text>
        <TouchableOpacity style={styles.ratingCard} activeOpacity={0.8}>
          <View style={styles.ratingTop}>
            <Star size={22} color="#eab308" fill="#eab308" style={{ marginRight: 8 }} />
            <Text style={styles.ratingValue}>4/5</Text>
            <ChevronRight size={18} color="#1f2937" />
          </View>
          <Text style={styles.ratingDate}>Jul 2026</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
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
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 16,
    marginTop: 8,
  },
  warningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  warningCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  warningCardContent: {
    padding: 16,
  },
  warningCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningCount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
  },
  warningLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    lineHeight: 20,
  },
  warningCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningFooterText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
    flex: 1,
  },
  ratingCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    alignSelf: 'flex-start',
    minWidth: 140,
  },
  ratingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
    marginRight: 4,
  },
  ratingDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  }
});
