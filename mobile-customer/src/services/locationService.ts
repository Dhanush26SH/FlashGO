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

/**
 * Reverse geocodes coordinates via Photon API
 */
export async function reverseGeocode(lat: number, lng: number): Promise<PhotonLocation | null> {
  try {
    const url = `${PHOTON_BASE_URL}/reverse?lon=${lng}&lat=${lat}`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Photon API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) return null;
    
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
    
    return {
      id: props.osm_id ? String(props.osm_id) : Math.random().toString(),
      name,
      formattedAddress,
      lat,
      lng,
      city: props.city,
      state: props.state,
      postcode: props.postcode
    };
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}
