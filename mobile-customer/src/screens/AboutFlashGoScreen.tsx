import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { ArrowLeft, Zap, Package, MapPin, HeadphonesIcon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';

export default function AboutFlashGoScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About FlashGO</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.brandingContainer}>
          <View style={styles.logoBox}>
            <Zap size={32} color="#ffffff" />
          </View>
          <Text style={styles.brandTitle}>FlashGO</Text>
          <Text style={styles.brandTagline}>Fast when it matters. ♡</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What is FlashGO?</Text>
          <Text style={styles.paragraph}>
            FlashGO is a hyperlocal quick-commerce platform designed to bring everyday essentials straight to your door with fast local delivery. We focus on speed, reliability, and convenience.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Experience</Text>
          
          <View style={styles.featureRow}>
            <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
              <Package size={20} color="#3b82f6" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Browse & Order</Text>
              <Text style={styles.featureDesc}>Explore a wide variety of daily products and order from your nearest serving store or warehouse.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.iconBox, { backgroundColor: '#f0fdf4' }]}>
              <MapPin size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Track Delivery</Text>
              <Text style={styles.featureDesc}>Watch your order make its way to you in real-time, ensuring you always know when it arrives.</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.iconBox, { backgroundColor: '#fef2f2' }]}>
              <HeadphonesIcon size={20} color={theme.colors.danger} />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Receive Support</Text>
              <Text style={styles.featureDesc}>Enjoy peace of mind with our dedicated customer support, always ready to assist if you have any issues.</Text>
            </View>
          </View>
        </View>

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>App Version: v1.0.0 (Build 54)</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  brandingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    padding: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  paragraph: {
    fontSize: 15,
    color: theme.colors.textMuted,
    lineHeight: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  versionContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
});
