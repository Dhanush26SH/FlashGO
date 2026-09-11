import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TouchableWithoutFeedback, ActivityIndicator, Alert, TextInput } from 'react-native';
import { X, Search, MapPin, Navigation, Home as HomeIcon, Briefcase, ChevronRight } from 'lucide-react-native';
import * as Location from 'expo-location';
import { theme } from '../theme';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { searchPlaces, PhotonLocation, reverseGeocode } from '../services/locationService';
import { useMobileAppContext } from '../context/MobileAppContext';

export default function LocationSelectorSheet() {
  const { addresses: savedAddresses, activeAddress, setActiveAddress } = useMobileAppContext();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PhotonLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    let isMounted = true;
    if (debouncedQuery.trim().length >= 3) {
      setIsSearching(true);
      searchPlaces(debouncedQuery)
        .then(results => {
          if (isMounted) setSearchResults(results);
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    } else {
      setSearchResults([]);
    }
    return () => { isMounted = false; };
  }, [debouncedQuery]);

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to use your current location.');
        setIsLocating(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (geocode) {
        if (navigation.canGoBack()) navigation.goBack();
        navigation.navigate('ConfirmLocation', {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          name: geocode.name || 'Current Location',
          address: geocode.street || geocode.city || geocode.region || 'Current Location'
        });
      } else {
        Alert.alert('Error', 'Could not determine your address from GPS.');
      }
    } catch (err: any) {
      Alert.alert('Location Error', err.message);
    } finally {
      setIsLocating(false);
    }
  };

  const handleSearchPress = () => {
    if (navigation.canGoBack()) navigation.goBack();
    navigation.navigate('Addresses');
  };

  const handleSelectSearchResult = (result: PhotonLocation) => {
    if (navigation.canGoBack()) navigation.goBack();
    navigation.navigate('ConfirmLocation', {
      lat: result.lat,
      lng: result.lng,
      name: result.name,
      address: result.formattedAddress
    });
  };

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <View style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={() => {
          if (navigation.canGoBack()) navigation.goBack();
        }}>
          <View style={styles.backdropTouch} />
        </TouchableWithoutFeedback>

        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select delivery location</Text>
            <TouchableOpacity onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
            }} style={styles.closeBtn}>
              <X size={24} color="#111827" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Search Route */}
            <View style={styles.searchBox}>
              <Search size={20} color={theme.colors.primary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for area, street name..."
                placeholderTextColor="#6B7280"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={false}
              />
              {isSearching && <ActivityIndicator size="small" color={theme.colors.primary} />}
            </View>

            {searchQuery.length >= 3 && searchResults.length === 0 && !isSearching && (
              <View style={styles.emptyResults}>
                <Text style={styles.emptyResultsText}>No places found</Text>
              </View>
            )}

            {searchResults.map(result => (
              <TouchableOpacity 
                key={result.id} 
                style={styles.searchResultRow} 
                onPress={() => handleSelectSearchResult(result)}
              >
                <View style={styles.iconCircleOutlineGray}>
                  <MapPin size={18} color="#4B5563" />
                </View>
                <View style={styles.addressTextCol}>
                  <Text style={styles.addressLabel}>{result.name}</Text>
                  <Text style={styles.addressDetail} numberOfLines={1}>{result.formattedAddress}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {searchResults.length === 0 && (
              <>
                {/* Current Active Address */}
                {activeAddress && (
                  <View style={[styles.savedSection, { paddingBottom: 16 }]}>
                    <Text style={styles.sectionLabel}>Current delivery location</Text>
                    <View style={styles.savedAddressRow}>
                      <View style={styles.iconCircleOutline}>
                        <MapPin size={18} color={theme.colors.primary} />
                      </View>
                      <View style={styles.addressTextCol}>
                        <Text style={styles.addressLabel}>{activeAddress.locality || activeAddress.street_address}</Text>
                        <Text style={styles.addressDetail} numberOfLines={2}>
                          {[activeAddress.street_address, activeAddress.city, activeAddress.state].filter(Boolean).join(', ')}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Current Location Action */}
                <TouchableOpacity style={styles.actionRow} onPress={handleUseCurrentLocation} disabled={isLocating}>
                  <View style={styles.iconCircle}>
                    {isLocating ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Navigation size={20} color={theme.colors.primary} />}
                  </View>
                  <View style={styles.actionTextCol}>
                    <Text style={styles.actionTitle}>Use current location</Text>
                    <Text style={styles.actionSubtitle}>Using GPS</Text>
                  </View>
                  <ChevronRight size={20} color="#D1D5DB" />
                </TouchableOpacity>

                {/* Add New Address */}
                <TouchableOpacity style={styles.actionRow} onPress={handleSearchPress}>
                  <View style={styles.iconCircleOutline}>
                    <MapPin size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.actionTextCol}>
                    <Text style={styles.actionTitlePrimary}>Add new address</Text>
                  </View>
                  <ChevronRight size={20} color="#D1D5DB" />
                </TouchableOpacity>

                <View style={styles.divider} />
              </>
            )}

            {/* Saved Addresses */}
            {searchResults.length === 0 && savedAddresses.length > 0 && (
              <View style={styles.savedSection}>
                <Text style={styles.sectionLabel}>Saved addresses</Text>
                {savedAddresses.map((addr) => {
                  const isSelected = activeAddress?.id === addr.id;
                  let Icon = MapPin;
                  if (addr.label?.toLowerCase() === 'home') Icon = HomeIcon;
                  if (addr.label?.toLowerCase() === 'work') Icon = Briefcase;
                  
                  return (
                    <TouchableOpacity 
                      key={addr.id} 
                      style={[styles.savedAddressRow, isSelected && styles.savedAddressRowActive]} 
                      onPress={() => {
                        setActiveAddress(addr);
                        if (navigation.canGoBack()) navigation.goBack();
                      }}
                    >
                      <View style={styles.iconCircleOutlineGray}>
                        <Icon size={18} color={isSelected ? theme.colors.primary : "#4B5563"} />
                      </View>
                      <View style={styles.addressTextCol}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                          <Text style={styles.addressLabel}>{addr.label || 'Saved Address'}</Text>
                          {isSelected && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
                        </View>
                        <Text style={styles.addressSub}>{addr.locality ? `${addr.locality}, ` : ''}{addr.city || ''}</Text>
                        <Text style={styles.addressDetail} numberOfLines={1}>{addr.street_address}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: '#111827',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  emptyResults: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyResultsText: {
    color: '#6B7280',
    fontSize: 15,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
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
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 2,
  },
  actionTitlePrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  actionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  divider: {
    height: 8,
    backgroundColor: '#F9FAFB',
    marginHorizontal: -20,
    marginVertical: 16,
  },
  savedSection: {
    paddingBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  savedAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  savedAddressRowActive: {
    backgroundColor: '#F4FAF6',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  iconCircleOutlineGray: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginTop: 2,
  },
  addressTextCol: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  activeBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  activeBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  addressSub: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 2,
  },
  addressDetail: {
    fontSize: 13,
    color: '#9CA3AF',
  }
});
