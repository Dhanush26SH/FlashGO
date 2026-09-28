import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { MapPin, QrCode, ArrowLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import * as Location from 'expo-location';
import { CameraView, Camera } from 'expo-camera';

export default function DriverReturnToStoreScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    if (isFocused) {
      fetchReturnTask();
    }
  }, [isFocused]);

  const fetchReturnTask = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('driver_return_tasks')
        .select(`
          id, 
          warehouse_id, 
          warehouses ( name, address, lat, lng )
        `)
        .eq('driver_id', user.id)
        .eq('status', 'required')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        navigation.replace('DriverOperationsMapScreen');
        return;
      }
      
      const { data: statusData, error: statusError } = await supabase.rpc('driver_get_return_handover_status', { p_task_id: data.id });
      
      if (!statusError && statusData) {
        if (statusData.intake_status === 'scanning' || statusData.qr_consumed) {
          navigation.replace('DriverReturnHandoverScreen', { taskId: data.id });
          return;
        }
      }

      setTask(data);
    } catch (err: any) {
      console.error(err);
      setErrorState('Unable to load return task');
    } finally {
      setLoading(false);
    }
  };

  const handleScanPress = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
    if (status === 'granted') {
      setShowScanner(true);
    } else {
      Alert.alert('Permission needed', 'Camera access is required to scan the warehouse QR.');
    }
  };

  const handleBarCodeScanned = async ({ type, data }: any) => {
    if (processing) return;
    setProcessing(true);
    
    try {
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
         throw new Error('Location permission is required.');
      }
      
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      
      const { data: res, error } = await supabase.rpc('driver_complete_return_to_store', {
        p_qr_token: data,
        p_lat: loc.coords.latitude,
        p_lng: loc.coords.longitude,
        p_is_demo: isDemoMode
      });
      
      if (error) throw error;
      
      if (res?.success) {
        setShowScanner(false);
        navigation.replace('DriverOperationsMapScreen');
      } else {
        Alert.alert('Return Failed', res?.code || 'Invalid QR or too far from warehouse.');
        setProcessing(false);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setProcessing(false);
    }
  };

  const handleMap = () => {
    if (!task?.warehouses) return;
    navigation.navigate('NavigationScreen', { 
      mode: 'warehouse',
      destLat: task.warehouses.lat, 
      destLng: task.warehouses.lng,
      destinationName: task.warehouses.name || 'Warehouse',
      destinationAddress: task.warehouses.address,
      isReturn: true
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (errorState || !task) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: '#ef4444', fontSize: 16, marginBottom: 16 }}>{errorState || 'Task not found'}</Text>
        <TouchableOpacity style={styles.mapBtn} onPress={() => { setLoading(true); setErrorState(null); fetchReturnTask(); }}>
          <Text style={styles.mapBtnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 24 }} onPress={() => navigation.replace('DriverOperationsMapScreen')}>
          <Text style={{ color: '#9ca3af' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showScanner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowScanner(false)} style={{ position: 'absolute', left: 16, top: 16 }}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
          <Text style={styles.title}>Scan Store QR</Text>
        </View>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={processing ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
          {processing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.processingText}>Verifying return location...</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Return to Store</Text>
        <View style={styles.demoToggleWrapper}>
          <Text style={styles.demoToggleLabel}>Demo</Text>
          <Switch
            value={isDemoMode}
            onValueChange={setIsDemoMode}
            trackColor={{ false: '#3f3f46', true: '#10b981' }}
            thumbColor={isDemoMode ? '#fff' : '#a1a1aa'}
          />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.infoText}>
          Return to {task.warehouses?.name || 'Store'} to get your next order.
        </Text>

        <View style={styles.storeCard}>
          <View style={styles.storeRow}>
            <MapPin color="#3b82f6" size={24} />
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={styles.storeName}>{task.warehouses?.name}</Text>
              <Text style={styles.storeAddress}>{task.warehouses?.address}</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.mapBtn} onPress={handleMap}>
            <Text style={styles.mapBtnText}>Open Map Navigation</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={[styles.scanBtn, { backgroundColor: '#10b981', marginBottom: 16 }]} onPress={handleScanPress}>
          <QrCode color="#000" size={24} />
          <Text style={[styles.scanBtnText, { color: '#000' }]}>Scan Store QR</Text>
        </TouchableOpacity>

        {task.return_type === 'merchandise' && (
          <TouchableOpacity 
            style={[styles.scanBtn, { backgroundColor: '#3b82f6' }]} 
            onPress={async () => {
              if (processing) return;
              setProcessing(true);
              try {
                const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
                if (locStatus !== 'granted') throw new Error('Location permission is required.');
                
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                
                const { data: res, error } = await supabase.rpc('driver_verify_warehouse_arrival', {
                  p_task_id: task.id,
                  p_lat: loc.coords.latitude,
                  p_lng: loc.coords.longitude,
                  p_is_demo: isDemoMode
                });
                
                if (error) throw error;
                
                if (res?.success) {
                  navigation.navigate('DriverReturnHandoverScreen', { taskId: task.id });
                } else {
                  Alert.alert('Too Far', 'You must be at the warehouse to start handover.');
                }
              } catch (err: any) {
                Alert.alert('Error', err.message);
              } finally {
                setProcessing(false);
              }
            }}
          >
            <QrCode color="#fff" size={24} />
            <Text style={[styles.scanBtnText, { color: '#fff' }]}>Handover Failed Items</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  loadingContainer: { flex: 1, backgroundColor: '#09090b', justifyContent: 'center' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f1f23', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 24 },
  infoText: { color: '#e5e7eb', fontSize: 20, fontWeight: 'bold', lineHeight: 28, textAlign: 'center', marginBottom: 32 },
  
  storeCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  storeRow: { flexDirection: 'row', alignItems: 'center' },
  storeName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  storeAddress: { color: '#9ca3af', fontSize: 14, marginTop: 4 },
  
  mapBtn: {
    marginTop: 20,
    backgroundColor: '#1e3a8a30',
    borderWidth: 1,
    borderColor: '#3b82f680',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  mapBtnText: { color: '#60a5fa', fontSize: 16, fontWeight: '600' },

  scanBtn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  scanBtnText: { color: '#000', fontSize: 17, fontWeight: 'bold' },

  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  processingText: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' },
  demoToggleWrapper: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  demoToggleLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600'
  }
});
