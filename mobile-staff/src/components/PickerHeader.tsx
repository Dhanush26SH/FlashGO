import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PickerHeaderProps {
  profile: any;
  rightContent?: React.ReactNode;
  subTitle?: string;
}

export default function PickerHeader({ profile, rightContent, subTitle }: PickerHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.greeting}>Hi, {profile?.full_name || 'Staff'}</Text>
        <Text style={styles.userDetails}>ID: {profile?.employee_id || '----'}</Text>
        {subTitle ? <Text style={styles.warehouseDetails}>{subTitle}</Text> : null}
      </View>
      {rightContent && <View style={styles.headerRight}>{rightContent}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
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
  warehouseDetails: {
    color: '#d1fae5',
    fontSize: 14,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
