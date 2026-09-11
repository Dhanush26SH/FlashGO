import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { MapPin, Navigation, ExternalLink, ChevronLeft } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function NavigationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { gig } = route.params;

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [distance, setDistance] = useState<string>('');
  const [eta, setEta] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const whLat = gig?.warehouses?.lat;
  const whLng = gig?.warehouses?.lng;

  const fetchRouteAndLocation = async () => {
    setLoading(true);
    setErrorMsg('');
    if (!whLat || !whLng) {
      setErrorMsg('Warehouse coordinates are missing.');
      setLoading(false);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied.');
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      
      setLocation(loc);

      // Fetch OSRM route
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${loc.coords.longitude},${loc.coords.latitude};${whLng},${whLat}?geometries=geojson&overview=full`;
      
      const response = await fetch(osrmUrl);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('OSRM routing failed to find a valid route.');
      }

      const routeData = data.routes[0];
      
      // Calculate friendly distance
      const distKm = routeData.distance / 1000;
      const distText = distKm < 1 ? `${Math.round(routeData.distance)} m` : `${distKm.toFixed(1)} km`;
      
      // Calculate ETA
      const durSec = routeData.duration;
      const durMin = Math.round(durSec / 60);
      const durText = durMin < 60 ? `${durMin} min` : `${Math.floor(durMin/60)} hr ${durMin%60} min`;

      setDistance(distText);
      setEta(durText);
      setRouteGeoJSON(routeData.geometry);
      setLoading(false);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to initialize navigation.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRouteAndLocation();
  }, [whLat, whLng]);

  const handleOpenExternalMaps = () => {
    if (!whLat || !whLng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${whLat},${whLng}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Failed to open maps.'));
  };

  const handleCheckIn = () => {
    navigation.replace('DriverCheckInScreen', { shift: gig });
  };

  const generateMapHTML = () => {
    if (!location || !whLat || !whLng) return '';

    const driverLat = location.coords.latitude;
    const driverLng = location.coords.longitude;
    const geoJSONString = routeGeoJSON ? JSON.stringify(routeGeoJSON) : 'null';

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
              }
              .wh-div-icon {
                  background-color: #10b981;
                  border: 3px solid #fff;
                  border-radius: 50%;
                  box-shadow: 0 0 10px rgba(0,0,0,0.5);
              }
          </style>
      </head>
      <body>
          <div id="map"></div>
          <script>
              const map = L.map('map', { zoomControl: false }).setView([${driverLat}, ${driverLng}], 13);
              
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '&copy; OpenStreetMap contributors',
                  maxZoom: 19
              }).addTo(map);

              const driverIcon = L.divIcon({ className: 'custom-div-icon', iconSize: [20, 20], iconAnchor: [10, 10] });
              const whIcon = L.divIcon({ className: 'wh-div-icon', iconSize: [24, 24], iconAnchor: [12, 12] });

              L.marker([${driverLat}, ${driverLng}], { icon: driverIcon }).addTo(map).bindPopup('You').openPopup();
              L.marker([${whLat}, ${whLng}], { icon: whIcon }).addTo(map).bindPopup('${gig?.warehouses?.name || 'Warehouse'}');

              const routeGeometry = ${geoJSONString};
              if (routeGeometry) {
                  const geoJsonLayer = L.geoJSON(routeGeometry, {
                      style: { color: '#3b82f6', weight: 5, opacity: 0.8 }
                  }).addTo(map);
                  map.fitBounds(geoJsonLayer.getBounds(), { padding: [40, 40] });
              } else {
                  map.fitBounds([
                      [${driverLat}, ${driverLng}],
                      [${whLat}, ${whLng}]
                  ], { padding: [40, 40] });
              }
          </script>
      </body>
      </html>
    `;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Navigation</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Map Area */}
      <View style={styles.mapContainer}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Calculating route...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchRouteAndLocation}>
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

        <Text style={styles.destinationText} numberOfLines={1}>
          <MapPin color="#10b981" size={16} /> {gig?.warehouses?.name || 'Warehouse'}
        </Text>
        
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCheckIn}>
            <Text style={styles.primaryBtnText}>Arrived / Check In</Text>
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
  destinationText: { color: '#e5e5e5', fontSize: 16, fontWeight: '500', marginBottom: 20 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#030712', fontSize: 16, fontWeight: '700' },
  externalBtn: {
    backgroundColor: '#262626',
    width: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
