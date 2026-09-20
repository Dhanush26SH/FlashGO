import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';
import { Camera as LucideCamera, CheckCircle, ArrowLeft, MapPin, Camera as CameraIcon } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function DriverCheckInScreen({ route, navigation }: any) {
  const { shift } = route.params;
  const { profile } = useAuth() as any;
  const isFocused = useIsFocused();
  const [step, setStep] = useState<'PERMISSIONS' | 'QR' | 'SUBMITTING'>('PERMISSIONS');
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  
  const cameraRef = useRef<any>(null);
    const [scannedQR, setScannedQR] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  const checkLocationPermission = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setHasLocationPermission(status === 'granted');
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc);
    }
  };

  useEffect(() => {
    checkLocationPermission();
  }, []);

  const handleRequestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setHasLocationPermission(status === 'granted');
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc);
    } else if (status === 'denied') {
      Alert.alert('Permission Denied', 'Please enable location in your device settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]);
    }
  };

  const handleRequestCamera = async () => {
    const res = await requestCameraPermission();
    if (!res.granted && !res.canAskAgain) {
      Alert.alert('Permission Denied', 'Please enable camera in your device settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() }
      ]);
    }
  };

  
  
  const handleBarCodeScanned = ({ data }: any) => {
    if (step === 'QR' && !scannedQR) {
      setScannedQR(data);
      setStep('SUBMITTING');
      submitCheckIn(data);
    }
  };

  const submitCheckIn = async (qrToken: string) => {
    try {
      if (!location) throw new Error('Location is required for check-in');
      
      const { data, error } = await supabase.rpc('driver_shift_check_in', {
        p_shift_id: shift.id,
        p_lat: location.coords.latitude,
        p_lng: location.coords.longitude,
        p_raw_qr_token: qrToken
      });
      
      if (error) throw error;
      
      if (data?.success) {
        Alert.alert('Check-In Successful', 'You are now online and ready to receive trips.', [
          { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DriverOperationsMapScreen' }] }) }
        ]);
      } else {
        const code = data?.code || 'UNKNOWN_ERROR';
        
        let title = 'Check-In Failed';
        let message = 'An unexpected error occurred. Please try again.';
        let actions: any[] = [{ text: 'OK' }];

        switch (code) {
          case 'CHECK_IN_WINDOW_EXPIRED':
            title = 'Gig has ended';
            message = 'This gig has already ended and can no longer be started. Return home to view your other gigs.';
            actions = [{ text: 'Return Home', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] }) }];
            break;
          case 'TOO_EARLY':
            title = 'Too Early to Check In';
            message = 'You can only check in up to 30 minutes before your gig starts.';
            break;
          case 'ALREADY_CHECKED_IN':
            title = 'Already Checked In';
            message = 'You have already checked in for this gig.';
            actions = [{ text: 'Go to Dashboard', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] }) }];
            break;
          case 'OUTSIDE_WAREHOUSE_GEOFENCE':
            title = 'Not at the Store';
            message = 'You must be physically present at the store (within 200m) to check in.';
            break;
          case 'INVALID_QR_TOKEN':
            title = 'Invalid QR Code';
            message = 'The scanned QR code is invalid or has expired. Please try scanning the monitor again.';
            break;
                    case 'DRIVER_UNAUTHORIZED_OR_SUSPENDED':
            title = 'Account Suspended';
            message = 'Your account is currently suspended or not authorized to take deliveries.';
            break;
          case 'SHIFT_NOT_SCHEDULED':
            title = 'Gig Unavailable';
            message = 'This gig is no longer available for check-in.';
            actions = [{ text: 'Back to Gigs', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DriverMainTabs' }] }) }];
            break;
          case 'WAREHOUSE_LOCATION_NOT_CONFIGURED':
            title = 'Location Error';
            message = 'The store location is missing. Please contact support.';
            break;
          default:
            message = `Check-in failed (${code}). Please try again.`;
            break;
        }

        Alert.alert(title, message, actions);
        setScannedQR(null);
        setStep('QR');
      }
    } catch (err: any) {
      if (err.message?.includes('Driver must have an assigned vehicle to go online')) {
        Alert.alert(
          'Vehicle not assigned',
          'A delivery vehicle must be assigned to your account before you can start this gig. Please complete your vehicle details.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Update Details', onPress: () => navigation.navigate('VehicleType') }
          ]
        );
      } else {
        Alert.alert('System Error', err.message);
      }
      setScannedQR(null);
      setStep('QR');
    }
  };

  if (!cameraPermission || hasLocationPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const bothPermissionsGranted = cameraPermission.granted && hasLocationPermission;
  const isLate = new Date() > new Date(shift?.shift_start);

  const renderPermissionsStep = () => (
    <View style={styles.permissionsContainer}>
      <Text style={styles.introText}>
        Allow location and camera access to continue with your secure store check-in.
      </Text>
      
      <View style={styles.gigCard}>
        <Text style={styles.gigStoreName}>{shift?.warehouses?.name || 'Assigned Store'}</Text>
        <Text style={styles.gigTime}>
          {new Date(shift?.shift_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - {new Date(shift?.shift_end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
        <View style={styles.statusRow}>
          <View style={styles.statusDotOffline} />
          <Text style={styles.statusText}>Driver status: Offline</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Permissions Required</Text>
      
      <View style={styles.permCard}>
        <View style={styles.permHeader}>
          <MapPin color={hasLocationPermission ? '#10b981' : '#9ca3af'} size={24} />
          <View style={styles.permInfo}>
            <Text style={styles.permTitle}>Location</Text>
            <Text style={styles.permDesc}>Used to verify that you are within the allowed check-in radius of the store.</Text>
            <Text style={[styles.permStatus, { color: hasLocationPermission ? '#10b981' : '#ef4444' }]}>
              Status: {hasLocationPermission ? 'Allowed' : 'Not Allowed'}
            </Text>
          </View>
        </View>
        {!hasLocationPermission && (
          <TouchableOpacity style={styles.permBtn} onPress={handleRequestLocation}>
            <Text style={styles.permBtnText}>Allow Location</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.permCard}>
        <View style={styles.permHeader}>
          <CameraIcon color={cameraPermission.granted ? '#10b981' : '#9ca3af'} size={24} />
          <View style={styles.permInfo}>
            <Text style={styles.permTitle}>Camera</Text>
            <Text style={styles.permDesc}>Used to scan the secure store QR code during check-in.</Text>
            <Text style={[styles.permStatus, { color: cameraPermission.granted ? '#10b981' : '#ef4444' }]}>
              Status: {cameraPermission.granted ? 'Allowed' : 'Not Allowed'}
            </Text>
          </View>
        </View>
        {!cameraPermission.granted && (
          <TouchableOpacity style={styles.permBtn} onPress={handleRequestCamera}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        )}
      </View>

      {bothPermissionsGranted && (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('QR')}>
          <Text style={styles.primaryBtnText}>Continue Check-In</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Check In for Your Gig</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {step === 'PERMISSIONS' && (
        <Text style={styles.subtitle}>
          Complete the steps below to verify that you are at the assigned FlashGO store.
        </Text>
      )}

      <View style={styles.content}>
        {isLate && (
          <View style={styles.lateWarningCard}>
            <View style={styles.lateWarningHeader}>
              <Text style={styles.lateWarningTitle}>⚠️ Late check-in</Text>
            </View>
            <Text style={styles.lateWarningText}>
              Your gig has already started. Successful check-in will apply a ₹20 late deduction.
            </Text>
          </View>
        )}

        {step === 'PERMISSIONS' && renderPermissionsStep()}


        {step === 'QR' && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeaderActive}>
              <Text style={styles.stepTitle}>1 Scan Store QR — Current step</Text>
              <Text style={styles.stepSubtitle}>Scan the rotating QR displayed at the FlashGO store.</Text>
            </View>
            <View style={styles.cameraFrame}>
              {isFocused && (
                <CameraView
                  style={styles.camera}
                  facing="back"
                  onBarcodeScanned={scannedQR ? undefined : handleBarCodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                />
              )}
            </View>
          </View>
        )}


        {step === 'SUBMITTING' && (
          <View style={styles.submittingContainer}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.submittingText}>Verifying check-in securely...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  lateWarningCard: {
    backgroundColor: '#381616',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  lateWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  lateWarningTitle: {
    color: '#fca5a5',
    fontSize: 16,
    fontWeight: '700',
  },
  lateWarningText: {
    color: '#fecaca',
    fontSize: 14,
    lineHeight: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: '#a1a1aa',
    fontSize: 14,
    paddingHorizontal: 24,
    paddingTop: 16,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  permissionsContainer: {
    width: '100%',
    flex: 1,
  },
  introText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  gigCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  gigStoreName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  gigTime: {
    color: '#a1a1aa',
    fontSize: 14,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDotOffline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9ca3af',
    marginRight: 8,
  },
  statusText: {
    color: '#d4d4d8',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  permCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262626',
  },
  permHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  permInfo: {
    flex: 1,
  },
  permTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  permDesc: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  permStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
  permBtn: {
    backgroundColor: '#3f3f46',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  permBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepContainer: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
  },
  stepHeader: {
    width: '100%',
    marginBottom: 16,
  },
  stepHeaderActive: {
    width: '100%',
    marginBottom: 24,
    marginTop: 16,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  stepTitleCompleted: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '600',
  },
  stepSubtitle: {
    color: '#a1a1aa',
    fontSize: 14,
  },
  cameraFrame: {
    width: 280,
    height: 280,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#262626',
    backgroundColor: '#000',
    marginBottom: 32,
  },
  camera: {
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
  primaryBtnText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: '700',
  },
  submittingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 100,
  },
  submittingText: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '600',
  }
});
