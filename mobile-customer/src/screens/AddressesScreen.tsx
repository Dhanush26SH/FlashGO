import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView, Modal, TouchableWithoutFeedback, Platform } from 'react-native';
import { MapPin, Home as HomeIcon, Briefcase, Trash2, Plus, ArrowLeft, Navigation } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { deleteAddress } from '../services/api';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import * as Location from 'expo-location';
import { reverseGeocode } from '../services/locationService';

export default function AddressesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { addresses, activeAddress, setActiveAddress, checkoutAddress, setCheckoutAddress, refreshAddresses } = useMobileAppContext();
  
  const [loading, setLoading] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const origin = route.params?.origin; // 'checkout_address' or undefined/'home'
  
  const activeAddressId = origin === 'checkout_address' 
    ? (checkoutAddress?.id || null) 
    : (activeAddress?.id || null);

  const handleSelectAddress = async (addr: any) => {
    try {
      setLoading(true);
      // Verify serviceability
      const { data, error } = await supabase.rpc('get_serving_warehouse', {
        p_lat: addr.lat,
        p_lng: addr.lng
      });
      if (error) throw error;
      
      if (!data) {
        Alert.alert('Out of delivery area', 'This address is currently outside our service area. Please select another location.');
        return;
      }
      
      if (origin === 'checkout_address') {
        setCheckoutAddress(addr);
      } else {
        setActiveAddress(addr);
      }
      
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: 'Cart' }
          ],
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        return;
      }

      console.log('Requesting fresh GPS...');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      console.log(`GPS_RAW ${location.coords.latitude} ${location.coords.longitude}`);

      const locationDetail = await reverseGeocode(location.coords.latitude, location.coords.longitude);
      console.log('Reverse Geocode:', locationDetail?.name, locationDetail?.formattedAddress);

      setShowAddSheet(false);
      
      console.log(`NAV_TO_CONFIRM ${location.coords.latitude} ${location.coords.longitude} checkout_address`);
      navigation.navigate('ConfirmLocation', {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        name: locationDetail?.name || 'Current Location',
        address: locationDetail?.formattedAddress || 'Unknown address',
        origin: 'checkout_address'
      });
    } catch (err: any) {
      Alert.alert('Location Error', err.message);
    } finally {
      setIsLocating(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete Address",
      "Are you sure you want to remove this address?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              setLoading(true);
              await deleteAddress(id);
              await refreshAddresses();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const isSelected = item.id === activeAddressId;
    let Icon = MapPin;
    if (item.label?.toLowerCase() === 'home') Icon = HomeIcon;
    if (item.label?.toLowerCase() === 'work') Icon = Briefcase;

    return (
      <TouchableOpacity 
        style={[styles.card, isSelected && styles.cardActive]} 
        onPress={() => handleSelectAddress(item)}
        disabled={loading}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Icon size={20} color={isSelected ? theme.colors.primary : "#4B5563"} />
          </View>
          <View style={styles.cardTitleContainer}>
            <Text style={styles.cardLabel}>{item.label || 'Saved Address'}</Text>
            {item.receiver_name && <Text style={styles.receiverText}>For {item.receiver_name}</Text>}
          </View>
          {isSelected && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>SELECTED</Text>
            </View>
          )}
        </View>

        <Text style={styles.addressLine} numberOfLines={2}>
          {item.flat_house_no ? `${item.flat_house_no}, ` : ''}
          {item.street_address || item.address_line}
        </Text>
        {(item.locality || item.city) && (
          <Text style={styles.addressLine} numberOfLines={1}>
            {[item.locality, item.city].filter(Boolean).join(', ')}
          </Text>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
            <Trash2 size={16} color="#EF4444" />
            <Text style={styles.deleteText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select delivery location</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={() => (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddSheet(true)}>
            <Plus size={20} color={theme.colors.primary} />
            <Text style={styles.addBtnText}>Add new address</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          !loading ? (
            <View style={styles.emptyState}>
              <MapPin size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No saved addresses</Text>
              <Text style={styles.emptySubtitle}>Add a delivery location to continue</Text>
            </View>
          ) : null
        )}
      />

      {/* Add New Address Sheet */}
      <Modal visible={showAddSheet} transparent animationType="fade">
        <View style={styles.sheetBackdrop}>
          <TouchableWithoutFeedback onPress={() => setShowAddSheet(false)}>
            <View style={styles.backdropTouch} />
          </TouchableWithoutFeedback>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>Where do you want this order delivered?</Text>
            
            <TouchableOpacity style={styles.sheetOption} onPress={handleUseCurrentLocation} disabled={isLocating}>
              <Navigation size={20} color={theme.colors.primary} style={{ marginRight: 12 }} />
              <Text style={styles.sheetOptionText}>Yes, deliver at my current location</Text>
              {isLocating && <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity style={styles.sheetOption} onPress={() => {
              setShowAddSheet(false);
              navigation.navigate('LocationSelector', { origin: 'checkout_address' });
            }}>
              <MapPin size={20} color={theme.colors.primary} style={{ marginRight: 12 }} />
              <Text style={styles.sheetOptionText}>No, at some other location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading && (
        <View style={styles.overlayLoader}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  listContent: { padding: 16, paddingBottom: 100 },
  addBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', marginBottom: 24, justifyContent: 'center' },
  addBtnText: { marginLeft: 8, fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  cardActive: { borderColor: theme.colors.primary, backgroundColor: '#F4FAF6' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  iconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitleContainer: { flex: 1, justifyContent: 'center' },
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  receiverText: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badge: { backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#0369A1' },
  addressLine: { fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  deleteText: { marginLeft: 4, fontSize: 13, fontWeight: '600', color: '#EF4444' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  overlayLoader: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheetContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 24 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  sheetOptionText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 8 }
});
