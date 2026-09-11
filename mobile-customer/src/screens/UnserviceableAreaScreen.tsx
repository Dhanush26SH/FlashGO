import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
import { theme } from '../theme';

interface UnserviceableAreaScreenProps {
  addressString: string;
  onChooseAnotherLocation: () => void;
}

export default function UnserviceableAreaScreen({ addressString, onChooseAnotherLocation }: UnserviceableAreaScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MapPin size={48} color={theme.colors.textMuted} />
          <View style={styles.xBadge}>
            <Text style={styles.xText}>✕</Text>
          </View>
        </View>
        
        <Text style={styles.title}>Unserviceable area</Text>
        <Text style={styles.subtitle}>FlashGO isn’t available here yet</Text>
        
        <View style={styles.addressBox}>
          <Text style={styles.addressLabel}>Selected Location:</Text>
          <Text style={styles.addressValue} numberOfLines={2}>{addressString}</Text>
        </View>

        <Text style={styles.description}>
          We’re currently not delivering to this location. Please choose another delivery location to continue shopping.
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={onChooseAnotherLocation}>
          <Text style={styles.primaryBtnText}>Choose another location</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  xBadge: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#EF4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F3F4F6',
  },
  xText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 24,
    textAlign: 'center',
  },
  addressBox: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  addressValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
