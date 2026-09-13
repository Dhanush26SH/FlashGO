export interface PhotonLocation {
  id: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  postcode?: string;
}

const PHOTON_BASE_URL = 'https://photon.komoot.io/api';

/**
 * Searches places via Photon API
 * @param query search text
 * @param biasLat optional latitude for search bias
 * @param biasLng optional longitude for search bias
 */
export async function searchPlaces(query: string, biasLat = 13.3409, biasLng = 74.7421): Promise<PhotonLocation[]> {
  if (!query || query.trim().length < 3) return [];
  
  try {
    // Biasing toward Udupi/Manipal (lon, lat) but allowing global searches
    const url = `${PHOTON_BASE_URL}/?q=${encodeURIComponent(query)}&limit=10&lon=${biasLng}&lat=${biasLat}`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Photon API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.features) return [];
    
    return data.features.map((feature: any) => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;
      
      const name = props.name || props.street || props.city || 'Unknown Place';
      
      const addressParts = [];
      if (props.street && props.name !== props.street) addressParts.push(props.street);
      if (props.locality) addressParts.push(props.locality);
      if (props.district) addressParts.push(props.district);
      if (props.city) addressParts.push(props.city);
      if (props.state) addressParts.push(props.state);
      
      const formattedAddress = addressParts.join(', ') || props.country || '';
      
      return {
        id: props.osm_id ? String(props.osm_id) : Math.random().toString(),
        name,
        formattedAddress,
        lat: coords[1],
        lng: coords[0],
        city: props.city,
        state: props.state,
        postcode: props.postcode
      };
    });
  } catch (error) {
    console.error('Error searching places:', error);
    return [];
  }
}

import * as Location from 'expo-location';

/**
 * Reverse geocodes coordinates via Photon API with native Expo Location fallback
 */
export async function reverseGeocode(lat: number, lng: number): Promise<PhotonLocation | null> {
  console.log(`REVERSE_GEOCODE_INPUT ${lat} ${lng}`);
  
  try {
    // Photon API expects /reverse directly, not /api/reverse
    const url = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`;
    const response = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
      // timeout after 5 seconds to fallback quickly
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const props = feature.properties;
        
        const name = props.name || props.street || props.locality || props.city || 'Unknown Place';
        
        const addressParts = [];
        if (props.street && props.name !== props.street) addressParts.push(props.street);
        if (props.locality) addressParts.push(props.locality);
        if (props.district) addressParts.push(props.district);
        if (props.city) addressParts.push(props.city);
        if (props.state) addressParts.push(props.state);
        
        const formattedAddress = addressParts.join(', ') || props.country || '';
        
        console.log(`REVERSE_GEOCODE_PROVIDER Photon`);
        const result = {
          id: props.osm_id ? String(props.osm_id) : Math.random().toString(),
          name,
          formattedAddress,
          lat,
          lng,
          city: props.city,
          state: props.state,
          postcode: props.postcode
        };
        console.log(`REVERSE_GEOCODE_RESULT ${result.name} ${result.city} ${result.state} ${result.formattedAddress}`);
        return result;
      }
    } else {
      console.warn(`Photon API error: ${response.status}. Falling back to native geocoder.`);
    }
  } catch (error) {
    console.warn('Error with Photon reverse geocoding, falling back:', error);
  }

  // Native Fallback
  try {
    const nativeResult = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (nativeResult && nativeResult.length > 0) {
      const loc = nativeResult[0];
      
      const name = loc.name || loc.street || loc.district || loc.city || 'Unknown Place';
      
      const addressParts = [];
      if (loc.street && loc.name !== loc.street) addressParts.push(loc.street);
      if (loc.district) addressParts.push(loc.district);
      if (loc.city) addressParts.push(loc.city);
      if (loc.region) addressParts.push(loc.region);
      
      const formattedAddress = addressParts.join(', ') || loc.country || '';
      
      console.log(`REVERSE_GEOCODE_PROVIDER Native`);
      const result = {
        id: Math.random().toString(),
        name,
        formattedAddress,
        lat,
        lng,
        city: loc.city || undefined,
        state: loc.region || undefined,
        postcode: loc.postalCode || undefined
      };
      console.log(`REVERSE_GEOCODE_RESULT ${result.name} ${result.city} ${result.state} ${result.formattedAddress}`);
      return result;
    }
  } catch (nativeError) {
    console.error('Native reverse geocoding also failed:', nativeError);
  }

  // Final fallback - retain coordinates but indicate unknown area
  console.log(`REVERSE_GEOCODE_PROVIDER Fallback`);
  const result = {
    id: Math.random().toString(),
    name: 'Unknown Place',
    formattedAddress: 'Coordinates only',
    lat,
    lng,
    city: undefined as string | undefined,
    state: undefined as string | undefined,
    postcode: undefined as string | undefined
  };
  console.log(`REVERSE_GEOCODE_RESULT ${result.name} ${result.city} ${result.state} ${result.formattedAddress}`);
  return result;
}
