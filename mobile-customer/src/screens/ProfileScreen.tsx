import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { User, Wallet, Package, MapPin, HeadphonesIcon, LogOut, ChevronRight, Bell, ArrowLeft, X, Info } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { sessionUser, walletBalance } = useMobileAppContext();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (!sessionUser) return;
      const { data, error } = await supabase.from('profiles').select('*').eq('id', sessionUser.id).single();
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading || !profile) {
    return (
      <View style={styles.backdrop}>
        <View style={[styles.sheetContainer, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.backdrop}>
      <TouchableOpacity 
        style={styles.closeBtn} 
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <X size={24} color="#ffffff" />
      </TouchableOpacity>
      
      <View style={styles.sheetContainer}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Premium Account Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarInitials}>{profile.full_name?.substring(0, 2).toUpperCase() || 'CU'}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{profile.full_name}</Text>
            {profile.phone_number ? <Text style={styles.contactInfo}>{profile.phone_number}</Text> : null}
            {profile.email ? <Text style={styles.contactInfo}>{profile.email}</Text> : null}
          </View>
        </View>
      </View>

      {/* Quick Action Cards */}
      <View style={styles.quickActionsContainer}>
        <TouchableOpacity style={styles.quickActionCard} onPress={() => navigation.navigate('OrdersStack')}>
          <View style={[styles.iconCircle, { backgroundColor: '#f0fdf4' }]}>
            <Package size={22} color={theme.colors.primary} />
          </View>
          <Text style={styles.quickActionTitle}>My Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickActionCard} onPress={() => navigation.navigate('SupportStack')}>
          <View style={[styles.iconCircle, { backgroundColor: '#fef2f2' }]}>
            <HeadphonesIcon size={22} color={theme.colors.danger} />
          </View>
          <Text style={styles.quickActionTitle}>Support</Text>
        </TouchableOpacity>
      </View>

      {/* My Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Account</Text>
        <View style={styles.cardGroup}>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Addresses')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <MapPin size={20} color={theme.colors.text} />
              </View>
              <Text style={styles.menuLabel}>Address Book</Text>
            </View>
            <ChevronRight size={20} color={theme.colors.border} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => navigation.navigate('Notifications')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <Bell size={20} color={theme.colors.text} />
              </View>
              <Text style={styles.menuLabel}>Notifications</Text>
            </View>
            <ChevronRight size={20} color={theme.colors.border} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Orders & Payments */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Orders & Payments</Text>
        <View style={styles.cardGroup}>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => navigation.navigate('OrdersStack')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <Package size={20} color={theme.colors.text} />
              </View>
              <Text style={styles.menuLabel}>Returns & Refunds</Text>
            </View>
            <ChevronRight size={20} color={theme.colors.border} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Help & Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Help & Support</Text>
        <View style={styles.cardGroup}>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => navigation.navigate('SupportStack')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <HeadphonesIcon size={20} color={theme.colors.text} />
              </View>
              <Text style={styles.menuLabel}>Order Issue / Help</Text>
            </View>
            <ChevronRight size={20} color={theme.colors.border} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Account & App */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account & App</Text>
        <View style={styles.cardGroup}>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AboutFlashGo')}>
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <Info size={20} color={theme.colors.text} />
              </View>
              <Text style={styles.menuLabel}>About FlashGO</Text>
            </View>
            <ChevronRight size={20} color={theme.colors.border} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={handleLogout}>
            <View style={styles.menuLeft}>
              <View style={[styles.menuIconBox, { backgroundColor: '#fef2f2' }]}>
                <LogOut size={20} color={theme.colors.danger} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.colors.danger }]}>Log Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

        <Text style={styles.versionText}>FlashGO v1.0.0 (Build 54)</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 600,
    height: '90%',
    backgroundColor: '#FAF9F6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
  },
  header: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl, 
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingBottom: 32,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.primaryDark,
  },
  headerInfo: {
    marginLeft: theme.spacing.lg,
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  contactInfo: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '500',
    marginBottom: 2,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    marginTop: -24,
    justifyContent: 'space-between',
  },
  quickActionCard: {
    backgroundColor: '#ffffff',
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    alignItems: 'center',
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  walletBalanceText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.primary,
    marginTop: 4,
  },
  section: {
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 12,
    paddingHorizontal: 4,
    letterSpacing: -0.3,
  },
  cardGroup: {
    backgroundColor: '#ffffff',
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  versionText: {
    textAlign: 'center',
    marginTop: 40,
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  }
});
