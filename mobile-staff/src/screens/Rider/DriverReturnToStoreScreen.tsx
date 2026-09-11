import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MapPin, QrCode, ArrowLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import * as Location from 'expo-location';
import { CameraView, Camera } from 'expo-camera';

export default function DriverReturnToStoreScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchReturnTask();
  }, []);

  const fetchReturnTask = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('driver_return_tasks')
        .select(`
          id, 
          warehouse_id, 
          warehouses ( name, address, latitude, longitude )
        `)
        .eq('driver_id', user.id)
        .eq('status', 'required')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        navigation.replace('DriverOperationsMapScreen');
        return;
      }
      setTask(data);
    } catch (err) {
      console.error(err);
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
        p_lng: loc.coords.longitude
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
      destLat: task.warehouses.latitude, 
      destLng: task.warehouses.longitude,
      isReturn: true
    });
  };

  if (loading || !task) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
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
        <Text style={styles.title}>Return Required</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.infoText}>
          Return to {task.warehouses?.name} to receive new orders
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

        <TouchableOpacity style={styles.scanBtn} onPress={handleScanPress}>
          <QrCode color="#000" size={24} />
          <Text style={styles.scanBtnText}>Scan QR at Store</Text>
        </TouchableOpacity>
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
  processingText: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' }
});
