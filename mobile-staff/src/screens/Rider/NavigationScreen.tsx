import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { MapPin, Navigation, ExternalLink, ChevronLeft, CheckCircle2 } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function NavigationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { profile } = useAuth() as any;
  const { 
    mode, 
    destLat: routeDestLat, 
    destLng: routeDestLng, 
    destinationName, 
    destinationAddress,
    isReturn
  } = route.params || {};

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [distance, setDistance] = useState<string>('');
  const [eta, setEta] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isTestMode, setIsTestMode] = useState(false);
  
  const destLat = Number(routeDestLat);
  const destLng = Number(routeDestLng);
  
  const warehouseLat = Number(route.params?.warehouseLat);
  const warehouseLng = Number(route.params?.warehouseLng);
  const canEnableTestMode = mode === 'customer' && Number.isFinite(warehouseLat) && Number.isFinite(warehouseLng);

  const hasValidDestination = Number.isFinite(destLat) && Number.isFinite(destLng);

  // Refs to track last calculation point to prevent over-querying OSRM
  const lastCalcCoords = useRef<{ lat: number, lng: number } | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const isMountedRef = useRef(true);

  // Haversine distance in meters
  const getDistanceFromLatLonInM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Radius of the earth in m
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
  };

  const calculateRoute = async (loc: Location.LocationObject) => {
    if (!hasValidDestination) return;
    
    // Check if we moved > 50m since last calculation
    if (lastCalcCoords.current) {
      const movedM = getDistanceFromLatLonInM(
        loc.coords.latitude, loc.coords.longitude,
        lastCalcCoords.current.lat, lastCalcCoords.current.lng
      );
      if (movedM < 50) return; // Skip recalculation
    }

    try {
      // If test mode is on, override the origin coordinates sent to OSRM
      const calcLat = isTestMode && canEnableTestMode ? warehouseLat : loc.coords.latitude;
      const calcLng = isTestMode && canEnableTestMode ? warehouseLng : loc.coords.longitude;
      
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${calcLng},${calcLat};${destLng},${destLat}?geometries=geojson&overview=full`;
      const response = await fetch(osrmUrl);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const routeData = data.routes[0];
        
        // Calculate friendly distance
        const distKm = routeData.distance / 1000;
        const distText = distKm < 1 ? `${Math.round(routeData.distance)} m` : `${distKm.toFixed(1)} km`;
        
        // Calculate ETA
        const durSec = routeData.duration;
        const durMin = Math.round(durSec / 60);
        const durText = durMin < 60 ? `${durMin} min` : `${Math.floor(durMin/60)} hr ${durMin%60} min`;

        if (isMountedRef.current) {
          setDistance(distText);
          setEta(durText);
          setRouteGeoJSON(routeData.geometry);
          lastCalcCoords.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      }
    } catch (err) {
      console.error('OSRM route fetch failed:', err);
    }
  };

  const startLiveTracking = async () => {
    setLoading(true);
    setErrorMsg('');
    if (!hasValidDestination) {
      setErrorMsg('Destination coordinates are missing or invalid.');
      setLoading(false);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied.');
      }

      // Initial fast fix
      const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (isMountedRef.current) setLocation(initialLoc);
      await calculateRoute(initialLoc);
      
      if (isMountedRef.current) setLoading(false);

      // Subscribe to continuous live location updates
      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 20, // Fire every 20m of movement
          timeInterval: 5000,   // Or every 5 seconds
        },
        async (loc) => {
          if (!isMountedRef.current) return;
          setLocation(loc);
          await calculateRoute(loc);
          
          // Publish telemetry to backend if we are a logged-in driver
          if (profile?.id) {
            try {
               await supabase.from('driver_sessions').update({
                  latest_lat: loc.coords.latitude,
                  latest_lng: loc.coords.longitude,
                  updated_at: new Date().toISOString(),
               }).eq('driver_id', profile.id);
            } catch (telemetryErr) {
               console.warn('Failed to publish telemetry:', telemetryErr);
            }
          }
        }
      );

    } catch (err: any) {
      console.error(err);
      if (isMountedRef.current) {
        setErrorMsg(err.message || 'Failed to initialize navigation.');
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    startLiveTracking();
    return () => {
      isMountedRef.current = false;
      if (locationSubRef.current) {
        locationSubRef.current.remove();
      }
    };
  }, [destLat, destLng]);

  // Recalculate route when test mode toggles
  useEffect(() => {
    if (location) {
      lastCalcCoords.current = null; // Force recalculation
      calculateRoute(location);
    }
  }, [isTestMode]);

  const handleOpenExternalMaps = () => {
    if (!hasValidDestination) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Failed to open maps.'));
  };

  const handlePrimaryAction = () => {
    if (mode === 'customer') {
      navigation.goBack(); // DriverReachDropScreen will handle the check-in / drop verification
    } else {
      if (isReturn) {
         navigation.replace('DriverReturnToStoreScreen');
      } else {
         navigation.replace('DriverCheckInScreen', { shift: route.params?.gig });
      }
    }
  };

  const generateMapHTML = () => {
    if (!location || !hasValidDestination) return '';

    const driverLat = (isTestMode && canEnableTestMode) ? warehouseLat : location.coords.latitude;
    const driverLng = (isTestMode && canEnableTestMode) ? warehouseLng : location.coords.longitude;
    const geoJSONString = routeGeoJSON ? JSON.stringify(routeGeoJSON) : 'null';

    // Different colors based on mode
    const isCustomer = mode === 'customer';
    const destColor = isCustomer ? '#f59e0b' : '#10b981'; // Amber for customer, Green for warehouse
    const destIconSize = isCustomer ? 20 : 24;

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
              body, html { margin: 0; padding: 0; width: 100%; height: 100%; }
              #map { width: 100%; height: 100%; }
              .custom-div-icon {
                  background-color: #3b82f6;
                  border: 3px solid #fff;
                  border-radius: 50%;
                  box-shadow: 0 0 10px rgba(0,0,0,0.5);
                  transition: transform 0.2s;
              }
              .dest-div-icon {
                  background-color: ${destColor};
                  border: 3px solid #fff;
                  border-radius: 50%;
                  box-shadow: 0 0 10px rgba(0,0,0,0.5);
              }
          </style>
      </head>
      <body>
          <div id="map"></div>
          <script>
              const map = L.map('map', { zoomControl: false }).setView([${driverLat}, ${driverLng}], 15);
              
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '&copy; OpenStreetMap contributors',
                  maxZoom: 19
              }).addTo(map);

              const driverIcon = L.divIcon({ className: 'custom-div-icon', iconSize: [20, 20], iconAnchor: [10, 10] });
              const destIcon = L.divIcon({ className: 'dest-div-icon', iconSize: [${destIconSize}, ${destIconSize}], iconAnchor: [${destIconSize/2}, ${destIconSize/2}] });

              // Driver Marker
              const driverMarker = L.marker([${driverLat}, ${driverLng}], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map).bindPopup('You').openPopup();
              L.marker([${destLat}, ${destLng}], { icon: destIcon }).addTo(map).bindPopup('${destinationName || 'Destination'}');

              const routeGeometry = ${geoJSONString};
              if (routeGeometry) {
                  const geoJsonLayer = L.geoJSON(routeGeometry, {
                      style: { color: '#3b82f6', weight: 5, opacity: 0.8 }
                  }).addTo(map);
              }
          </script>
      </body>
      </html>
    `;
  };

  const isCustomer = mode === 'customer';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isCustomer ? 'Delivery Route' : 'Navigation'}</Text>
        <View style={styles.headerRight}>
          {canEnableTestMode && (
             <TouchableOpacity 
               style={[styles.testModeBtn, isTestMode && styles.testModeBtnActive]}
               onPress={() => setIsTestMode(!isTestMode)}
             >
               <Text style={[styles.testModeText, isTestMode && styles.testModeTextActive]}>
                 {isTestMode ? 'TEST ON' : 'TEST OFF'}
               </Text>
             </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Test Mode Warning */}
      {isTestMode && (
        <View style={styles.testModeWarning}>
          <Text style={styles.testModeWarningText}>TEST ROUTE - Simulated origin: warehouse</Text>
        </View>
      )}

      {/* Map Area */}
      <View style={styles.mapContainer}>
        {loading && !routeGeoJSON ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Calculating route...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={startLiveTracking}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html: generateMapHTML() }}
            style={{ flex: 1 }}
            scrollEnabled={false}
            bounces={false}
          />
        )}
      </View>

      {/* Bottom Panel */}
      <View style={styles.bottomPanel}>
        <View style={styles.routeInfoRow}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>ETA</Text>
            <Text style={styles.infoValue}>{eta || '--'}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>DISTANCE</Text>
            <Text style={styles.infoValue}>{distance || '--'}</Text>
          </View>
        </View>

        <View style={styles.destinationBox}>
          <View style={styles.destIconWrapper}>
            <MapPin color={isCustomer ? "#f59e0b" : "#10b981"} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.destinationName} numberOfLines={1}>
              {destinationName || (isCustomer ? 'Customer' : 'Warehouse')}
            </Text>
            {destinationAddress && (
              <Text style={styles.destinationAddress} numberOfLines={1}>
                {destinationAddress}
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handlePrimaryAction}>
            {isCustomer ? (
               <View style={styles.btnContent}>
                  <CheckCircle2 color="#030712" size={20} />
                  <Text style={styles.primaryBtnText}>Reached drop</Text>
               </View>
            ) : (
               <Text style={styles.primaryBtnText}>Arrived / Check In</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.externalBtn} onPress={handleOpenExternalMaps}>
            <ExternalLink color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0a0a0a',
    zIndex: 10,
  },
  backBtn: { padding: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerRight: { minWidth: 60, alignItems: 'flex-end' },
  testModeBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: '#262626' },
  testModeBtnActive: { backgroundColor: '#fef08a' },
  testModeText: { color: '#9ca3af', fontSize: 10, fontWeight: 'bold' },
  testModeTextActive: { color: '#854d0e' },
  testModeWarning: { backgroundColor: '#fef08a', padding: 8, alignItems: 'center' },
  testModeWarningText: { color: '#854d0e', fontSize: 12, fontWeight: 'bold' },
  mapContainer: { flex: 1, backgroundColor: '#1c1c1e' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: '#9ca3af', marginTop: 12 },
  errorText: { color: '#ef4444', textAlign: 'center', marginBottom: 16 },
  retryBtn: { padding: 12, backgroundColor: '#374151', borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  bottomPanel: {
    padding: 24,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  routeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#171717',
    padding: 16,
    borderRadius: 12,
  },
  infoCol: { alignItems: 'center' },
  infoDivider: { width: 1, height: 30, backgroundColor: '#404040' },
  infoLabel: { color: '#a3a3a3', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  infoValue: { color: '#fff', fontSize: 24, fontWeight: '800' },
  destinationBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  destIconWrapper: { marginRight: 12, padding: 8, backgroundColor: '#171717', borderRadius: 8 },
  destinationName: { color: '#e5e5e5', fontSize: 16, fontWeight: '600' },
  destinationAddress: { color: '#9ca3af', fontSize: 14, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: '#030712', fontSize: 16, fontWeight: '700' },
  externalBtn: {
    backgroundColor: '#262626',
    width: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
