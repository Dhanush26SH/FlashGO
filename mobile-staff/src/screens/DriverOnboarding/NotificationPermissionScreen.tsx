import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Bell } from 'lucide-react-native';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

export default function NotificationPermissionScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();

  const requestPermission = async () => {
    try {
      let status = 'granted';
      
      // Skip unsupported remote push registration in Android Expo Go SDK 53+
      if (!(Constants.appOwnership === 'expo' && Platform.OS === 'android')) {
        const Notifications = await import('expo-notifications');
        const response = await Notifications.requestPermissionsAsync();
        status = response.status;
      }
      
      if (session?.user?.id) {
        await supabase
          .from('driver_onboarding')
          .update({ notification_permission_granted: status === 'granted' })
          .eq('id', session.user.id);
      }

      navigation.replace('LanguageSelection');
    } catch (e) {
      console.error(e);
      navigation.replace('LanguageSelection');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Bell size={48} color="#10b981" />
        </View>
        <Text style={styles.title}>Enable Notifications</Text>
        <Text style={styles.description}>
          FlashGO needs to send you notifications for new delivery assignments and important updates.
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={requestPermission}>
        <Text style={styles.buttonText}>Allow Notifications</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    padding: 24,
    justifyContent: 'space-between'
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center'
  },
  description: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20
  },
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16
  },
  buttonText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  }
});
