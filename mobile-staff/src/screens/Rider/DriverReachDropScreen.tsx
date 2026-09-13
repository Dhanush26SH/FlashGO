import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Phone, Map as MapIcon, ChevronLeft, MapPin } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import * as Location from 'expo-location';

interface ActiveDelivery {
  trip_id: string;
  order_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_lat: number;
  delivery_lng: number;
  total_item_count: number;
  warehouse_lat?: number;
  warehouse_lng?: number;
}

export default function DriverReachDropScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [delivery, setDelivery] = useState<ActiveDelivery | null>(null);
  const [arriving, setArriving] = useState(false);

  useEffect(() => {
    fetchDelivery();
  }, []);

  const fetchDelivery = async () => {
    try {
      const { data, error } = await supabase.rpc('driver_get_active_delivery');
      if (error) throw error;
      if (data?.success && data.trip && data.order) {
        setDelivery({
          trip_id: data.trip.id,
          order_id: data.order.id,
          customer_name: data.order.customer_name,
          customer_phone: data.order.customer_phone,
          delivery_address: data.order.delivery_address,
          delivery_lat: data.order.delivery_lat,
          delivery_lng: data.order.delivery_lng,
          total_item_count: data.order.total_item_count,
          warehouse_lat: data.warehouse.latitude,
          warehouse_lng: data.warehouse.longitude
        });
      } else {
        navigation.navigate('DriverOperationsMapScreen');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCall = () => {
    if (delivery?.customer_phone) {
      Linking.openURL(`tel:${delivery.customer_phone}`);
    }
  };

  const handleMap = () => {
    // Open full screen navigation map inside app
    navigation.navigate('NavigationScreen', { 
      mode: 'customer',
      destLat: delivery?.delivery_lat, 
      destLng: delivery?.delivery_lng,
      destinationName: delivery?.customer_name || 'Customer',
      destinationAddress: delivery?.delivery_address,
      orderId: delivery?.order_id,
      tripId: delivery?.trip_id,
      warehouseLat: delivery?.warehouse_lat,
      warehouseLng: delivery?.warehouse_lng
    });
  };

  const handleReachedDrop = async () => {
    if (!delivery) return;
    setArriving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
         Alert.alert('Permission needed', 'Location is required to mark arrival');
         setArriving(false);
         return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      
      const { data, error } = await supabase.rpc('driver_mark_arrived', {
        p_trip_id: delivery.trip_id,
        p_driver_lat: loc.coords.latitude,
        p_driver_lng: loc.coords.longitude,
        p_route_distance_meters: 2500 // In reality, this would be passed back from the Navigation map. We mock it for now.
      });

      if (error) throw error;
      if (data?.success) {
        // Continue to Drop Order
        navigation.replace('DriverDropOrderScreen');
      } else {
        if (data?.code === 'TOO_FAR') {
          Alert.alert('Too Far', `You must be within 150m to mark arrived. Current distance: ${data.distance_meters?.toFixed(0)}m`);
        } else {
          Alert.alert('Error', data?.code || 'Failed to mark arrival');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setArriving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Reach drop</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.customerCard}>
          <Text style={styles.customerName}>{delivery?.customer_name}</Text>
          <Text style={styles.address}>{delivery?.delivery_address}</Text>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
              <Phone color="#fff" size={20} />
              <Text style={styles.actionBtnText}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#3b82f6' }]} onPress={handleMap}>
              <MapIcon color="#fff" size={20} />
              <Text style={styles.actionBtnText}>Map</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity 
          style={styles.arriveBtn} 
          onPress={handleReachedDrop}
          disabled={arriving}
        >
          {arriving ? (
             <ActivityIndicator color="#000" />
          ) : (
             <Text style={styles.arriveBtnText}>Reached drop →</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  loadingContainer: { flex: 1, backgroundColor: '#09090b', justifyContent: 'center' },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
    alignItems: 'center'
  },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 16 },
  customerCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  customerName: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  address: { color: '#9ca3af', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f1f23',
    backgroundColor: '#09090b',
  },
  arriveBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  arriveBtnText: { color: '#000', fontSize: 17, fontWeight: 'bold' }
});
