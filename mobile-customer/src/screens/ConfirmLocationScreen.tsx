import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Platform } from 'react-native';
import { ArrowLeft, Navigation, MapPin } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { theme } from '../theme';
import { reverseGeocode } from '../services/locationService';
import { useMobileAppContext } from '../context/MobileAppContext';
import { supabase } from '../lib/supabase';

type ConfirmLocationRouteProp = RouteProp<RootStackParamList, 'ConfirmLocation'>;

export default function ConfirmLocationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ConfirmLocationRouteProp>();
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);

  const { setActiveAddress } = useMobileAppContext();

  const [currentLat, setCurrentLat] = useState(route.params.lat);
  const [currentLng, setCurrentLng] = useState(route.params.lng);
  const [currentName, setCurrentName] = useState(route.params.name);
  const [currentAddress, setCurrentAddress] = useState(route.params.address);

  // DEBUG LOG
  console.log(`CONFIRM_ROUTE ${route.params.lat} ${route.params.lng} ${route.params.origin}`);
  
  const [isResolving, setIsResolving] = useState(false);
  const [isServiceable, setIsServiceable] = useState<boolean | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  
  const resolveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const latestRequestRef = useRef<number>(0);

  // Memoize HTML content for Leaflet map to prevent remounts
  const mapHtml = React.useMemo(() => {
    console.log(`MAP_COORDS ${route.params.lat} ${route.params.lng}`);
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html { margin: 0; padding: 0; height: 100%; width: 100%; }
          #map { height: 100%; width: 100%; }
          .center-marker {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -100%);
            z-index: 1000;
            pointer-events: none;
            width: 32px;
            height: 32px;
          }
          .center-marker svg { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <div class="center-marker">
          <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#10b981" fill-opacity="0.2"></path>
            <circle cx="12" cy="10" r="3" fill="#10b981"></circle>
          </svg>
        </div>
        <script>
          var map = L.map('map', { zoomControl: false, attributionControl: true });
          let isProgrammatic = true;
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);

          map.setView([${route.params.lat}, ${route.params.lng}], 15);

          let moveTimeout;
          map.on('moveend', function() {
            if (isProgrammatic) {
              isProgrammatic = false;
              return;
            }
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
              var center = map.getCenter();
              var msg = JSON.stringify({
                type: 'onRegionChangeComplete',
                lat: center.lat,
                lng: center.lng
              });
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(msg);
              } else {
                window.parent.postMessage(msg, '*');
              }
            }, 600); // 600ms debounce within the webview
          });
          
          window.addEventListener('message', (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'setLocation') {
                isProgrammatic = true;
                map.setView([data.lat, data.lng], 15);
              }
            } catch (e) {}
          });
        </script>
      </body>
    </html>
  `;
  }, [route.params.lat, route.params.lng]);

  const webviewSource = React.useMemo(() => ({ html: mapHtml }), [mapHtml]);

  const checkServiceability = async (lat: number, lng: number) => {
    try {
      setIsResolving(true);
      const { data, error } = await supabase.rpc('get_serving_warehouse', {
        p_lat: lat,
        p_lng: lng
      });

      if (error) {
        throw error;
      }

      if (data) {
        setIsServiceable(true);
        setWarehouseId(data);
      } else {
        setIsServiceable(false);
        setWarehouseId(null);
      }
    } catch (error) {
      console.error('Serviceability check failed:', error);
      setIsServiceable(false);
    } finally {
      setIsResolving(false);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'onRegionChangeComplete') {
        const { lat, lng } = data;
        
        // Skip if coordinates are practically identical (prevent redundant API calls)
        const isSame = Math.abs(currentLat - lat) < 0.00001 && Math.abs(currentLng - lng) < 0.00001;
        if (isSame && currentName !== 'Unknown address' && currentName !== 'Unknown Place') {
          return; // Already resolved these coordinates
        }
        
        // Debounce external checks
        if (resolveDebounceRef.current) clearTimeout(resolveDebounceRef.current);
        
        resolveDebounceRef.current = setTimeout(async () => {
          setIsResolving(true);
          const reqId = Date.now();
          latestRequestRef.current = reqId;
          
          // Reverse geocode
          console.log(`REVERSE_GEOCODE_INPUT ${lat} ${lng}`);
          const locationDetail = await reverseGeocode(lat, lng);
          if (latestRequestRef.current !== reqId) return;

          console.log(`REVERSE_GEOCODE_RESULT ${locationDetail?.name} ${locationDetail?.city} ${locationDetail?.state} ${locationDetail?.formattedAddress}`);

          if (locationDetail) {
            setCurrentLat(lat);
            setCurrentLng(lng);
            setCurrentName(locationDetail.name);
            setCurrentAddress(locationDetail.formattedAddress);
          } else {
            setCurrentLat(lat);
            setCurrentLng(lng);
          }

          // Check serviceability
          console.log(`SERVICEABILITY_INPUT ${lat} ${lng}`);
          try {
            const { data: svcData, error } = await supabase.rpc('get_serving_warehouse', {
              p_lat: lat,
              p_lng: lng
            });
            if (latestRequestRef.current !== reqId) return;

            if (error) throw error;
            if (svcData) {
              setIsServiceable(true);
              setWarehouseId(svcData);
            } else {
              setIsServiceable(false);
              setWarehouseId(null);
            }
          } catch (err) {
            if (latestRequestRef.current !== reqId) return;
            console.error('Serviceability check failed:', err);
            setIsServiceable(false);
          } finally {
            if (latestRequestRef.current === reqId) {
              setIsResolving(false);
            }
          }
        }, 500);
      }
    } catch (e) {
      console.error('WebView message parsing error:', e);
    }
  };

  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  useEffect(() => {
    // Initial check
    checkServiceability(currentLat, currentLng);

    if (Platform.OS === 'web') {
      const handleWebMessage = (event: MessageEvent) => {
        try {
          if (typeof event.data === 'string' && event.data.includes('onRegionChangeComplete')) {
             handleMessageRef.current({ nativeEvent: { data: event.data } });
          }
        } catch(e){}
      };
      window.addEventListener('message', handleWebMessage as any);
      return () => window.removeEventListener('message', handleWebMessage as any);
    }
  }, []);

  const handleUseCurrentLocation = async () => {
    try {
      setIsResolving(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        setIsResolving(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = location.coords;

      // Update WebView Map
      if (Platform.OS === 'web' && iframeRef.current) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify({ type: 'setLocation', lat: latitude, lng: longitude }), '*');
      } else if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'setLocation', lat: ${latitude}, lng: ${longitude} }), '*');
        `);
      }

      const locationDetail = await reverseGeocode(latitude, longitude);
      
      setCurrentLat(latitude);
      setCurrentLng(longitude);
      if (locationDetail) {
        setCurrentName(locationDetail.name);
        setCurrentAddress(locationDetail.formattedAddress);
      } else {
        setCurrentName('Current Location');
        setCurrentAddress('Current Location');
      }

      await checkServiceability(latitude, longitude);
    } catch (err: any) {
      Alert.alert('Location Error', err.message);
      setIsResolving(false);
    }
  };

  const handleConfirmLocation = () => {
    if (route.params.origin === 'checkout_address') {
      navigation.navigate('AddressDetails', {
        lat: currentLat,
        lng: currentLng,
        name: currentName,
        address: currentAddress
      });
    } else {
      // Persist active address to central context for home browsing
      const finalAddress = {
        id: `custom_loc_${Date.now()}`,
        street_address: currentAddress || currentName,
        locality: currentName,
        city: '',
        state: '',
        postal_code: '',
        lat: currentLat,
        lng: currentLng,
        label: 'Selected Location',
        is_default: false
      };

      setActiveAddress(finalAddress);
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' as any }],
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm location</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <iframe
            ref={iframeRef}
            srcDoc={mapHtml}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={webviewSource}
            style={styles.webview}
            onMessage={handleMessage}
            scrollEnabled={false}
            bounces={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.locationInfo}>
          <View style={styles.iconCircleOutline}>
            <MapPin size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.addressTextCol}>
            <Text style={styles.addressLabel}>{currentName}</Text>
            <Text style={styles.addressDetail} numberOfLines={2}>{currentAddress}</Text>
          </View>
        </View>

        <View style={styles.statusBoxContainer}>
          {isResolving ? (
            <View style={styles.statusBox}>
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.statusText}>Checking serviceability...</Text>
            </View>
          ) : isServiceable ? (
            <View style={[styles.statusBox, styles.statusSuccess]}>
              <Text style={styles.statusSuccessText}>Serviceable area</Text>
            </View>
          ) : isServiceable === false ? (
            <View style={[styles.statusBox, styles.statusError]}>
              <Text style={styles.statusErrorText}>FlashGO isn't available here yet</Text>
              <Text style={styles.statusErrorSubText}>We're currently not delivering to this location. Please choose another delivery location to continue shopping.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          {isServiceable ? (
            <TouchableOpacity 
              style={styles.confirmBtn} 
              onPress={handleConfirmLocation}
              disabled={isResolving}
            >
              <Text style={styles.confirmBtnText}>Confirm Location</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.changeLocBtn} 
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.changeLocBtnText}>Select another location</Text>
            </TouchableOpacity>
          )}

          {route.params.origin !== 'checkout_address' && (
            <TouchableOpacity 
              style={styles.useCurrentBtn} 
              onPress={handleUseCurrentLocation}
              disabled={isResolving}
            >
              <Navigation size={18} color={theme.colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.useCurrentBtnText}>Use current location</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconCircleOutline: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginTop: 2,
  },
  addressTextCol: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  addressDetail: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  statusBoxContainer: {
    minHeight: 76,
    justifyContent: 'center',
    marginBottom: 12,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  statusSuccess: {
    backgroundColor: '#F4FAF6',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusSuccessText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  statusError: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusErrorText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 4,
  },
  statusErrorSubText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
  actions: {
    gap: 12,
  },
  confirmBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  changeLocBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  changeLocBtnText: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '700',
  },
  useCurrentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: '#ffffff',
  },
  useCurrentBtnText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '700',
  }
});
