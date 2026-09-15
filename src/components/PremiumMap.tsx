import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

export interface MapWarehouse {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

export interface MapDriver {
  id: string;
  lat: number;
  lng: number;
  name: string;
  isStale: boolean;
}

export interface MapDestination {
  id: string;
  lat: number;
  lng: number;
  address: string;
  tripId: string;
}

interface PremiumMapProps {
  warehouses?: MapWarehouse[];
  drivers?: MapDriver[];
  destinations?: MapDestination[];
  // Legacy Props
  riderLat?: number;
  riderLng?: number;
  destLat?: number;
  destLng?: number;
  destAddress?: string;
  isSimulating?: boolean;
  isStandby?: boolean;
}

// Custom Icons
const createCustomIcon = (emoji: string, color: string, bgColor: string, pulse: boolean = false) => {
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div style="
        background-color: ${bgColor};
        color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        ${pulse ? 'animation: pulse-ring 2s infinite;' : ''}
      ">
        ${emoji}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const warehouseIcon = createCustomIcon('🏢', '#ffffff', '#10b981');
const riderIconLive = createCustomIcon('⚡', '#0f172a', '#f59e0b');
const riderIconStale = createCustomIcon('⚡', '#ffffff', '#94a3b8');
const customerIcon = createCustomIcon('🏠', '#ffffff', '#ef4444', true);

// Component to recenter map when coordinates change
const MapUpdater = ({ 
  warehouses, drivers, destinations, riderLat, riderLng, destLat, destLng, whseLat, whseLng, isStandby
}: PremiumMapProps & { whseLat?: number, whseLng?: number }) => {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    let hasPoints = false;

    if (warehouses && warehouses.length > 0) {
      warehouses.forEach(w => { bounds.extend([w.lat, w.lng]); hasPoints = true; });
      drivers?.forEach(d => { bounds.extend([d.lat, d.lng]); hasPoints = true; });
      destinations?.forEach(d => { bounds.extend([d.lat, d.lng]); hasPoints = true; });
    } else if (!isStandby && whseLat && whseLng && destLat && destLng && riderLat && riderLng) {
      bounds.extend([whseLat, whseLng]);
      bounds.extend([destLat, destLng]);
      bounds.extend([riderLat, riderLng]);
      hasPoints = true;
    }

    if (hasPoints) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [warehouses, drivers, destinations, riderLat, riderLng, destLat, destLng, whseLat, whseLng, isStandby, map]);
  return null;
};

export const PremiumMap: React.FC<PremiumMapProps> = ({
  warehouses,
  drivers,
  destinations,
  riderLat = 13.3427,
  riderLng = 74.7472,
  destLat = 13.3327,
  destLng = 74.7572,
  destAddress = 'Customer Address',
  isSimulating = false,
  isStandby = false
}) => {
  const isV2 = warehouses !== undefined;

  const [eta, setEta] = useState('7 mins');
  const [distance, setDistance] = useState('1.8 km');

  // Hardcode fixed warehouse location (Udupi Bus Stand) for legacy mode
  const whseLat = 13.3427;
  const whseLng = 74.7472;

  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    if (isV2 || isStandby) return;
    const latDiff = destLat - riderLat;
    const lngDiff = destLng - riderLng;
    const calcDist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 110; 
    setDistance(calcDist.toFixed(1) + ' km');
    
    const calcEta = Math.ceil(calcDist * 3.5);
    setEta(calcEta <= 0 ? 'Arrived!' : `${calcEta} mins`);
  }, [riderLat, riderLng, destLat, destLng, isStandby, isV2]);

  return (
    <div style={mapOuterContainerStyle}>
      <MapContainer 
        center={[13.3427, 74.7472]} 
        zoom={isStandby ? 12 : 13} 
        style={canvasStyle}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapUpdater 
          warehouses={warehouses}
          drivers={drivers}
          destinations={destinations}
          riderLat={riderLat}
          riderLng={riderLng}
          destLat={destLat}
          destLng={destLng}
          whseLat={whseLat}
          whseLng={whseLng}
          isStandby={isStandby}
        />

        {isV2 ? (
          <React.Fragment>
            {warehouses?.map(w => (
              <Marker key={w.id} position={[w.lat, w.lng]} icon={warehouseIcon}>
                <Popup>{w.name}</Popup>
              </Marker>
            ))}

            {destinations?.map(d => (
              <Marker key={d.id} position={[d.lat, d.lng]} icon={customerIcon}>
                <Popup>{d.address}</Popup>
              </Marker>
            ))}

            {drivers?.map(d => (
              <Marker key={d.id} position={[d.lat, d.lng]} icon={d.isStale ? riderIconStale : riderIconLive}>
                <Popup>{d.name} {d.isStale ? '(Stale GPS)' : '(Live)'}</Popup>
              </Marker>
            ))}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Marker position={[whseLat, whseLng]} icon={warehouseIcon}>
              <Popup>FlashGO Hub</Popup>
            </Marker>

            {isStandby && (
              <Circle 
                center={[whseLat, whseLng]} 
                radius={6000} 
                pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.1, weight: 2, dashArray: '8, 8' }} 
              />
            )}

            {!isStandby && (
              <React.Fragment>
                <Marker position={[destLat, destLng]} icon={customerIcon}>
                  <Popup>{destAddress}</Popup>
                </Marker>

                <Marker position={[riderLat, riderLng]} icon={riderIconLive}>
                  <Popup>Courier on route</Popup>
                </Marker>

                <Polyline 
                  positions={[
                    [whseLat, whseLng],
                    [riderLat, riderLng],
                    [destLat, destLng]
                  ]} 
                  color="#10b981"
                  weight={4}
                  dashArray="8, 8"
                />
              </React.Fragment>
            )}
          </React.Fragment>
        )}
      </MapContainer>

      {/* Futuristic Telemetry HUD Widget (Legacy Only) */}
      {!isV2 && !isStandby && (
        <div style={hudStyle} className="glass-panel">
          <div style={hudRowStyle}>
            <div style={hudColStyle}>
              <div style={hudLabelStyle}>VEHICLE STATUS</div>
              <div style={hudValStyle(isSimulating)}>
                {isSimulating ? '● ON ROUTE' : '● IDLE / REST'}
              </div>
            </div>
            
            <div style={hudColStyle}>
              <div style={hudLabelStyle}>DISTANCE LEFT</div>
              <div style={{ ...hudValStyle(false), color: 'var(--accent)' }}>{distance}</div>
            </div>

            <div style={hudColStyle}>
              <div style={hudLabelStyle}>EST. TELEMETRY ETA</div>
              <div style={{ ...hudValStyle(false), color: '#10b981' }}>{eta}</div>
            </div>
          </div>

          <div style={destRowStyle}>
            <MapPin size={12} color="#ef4444" style={{ flexShrink: 0 }} />
            <div style={addressTextStyle}>{destAddress}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- STYLING WIDGETS ---
const mapOuterContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: 'var(--border-radius-md)',
  overflow: 'hidden',
  border: '1px solid var(--border-light)',
  boxShadow: 'var(--shadow-md)',
  zIndex: 1, // To keep leaflet from overlapping panels
};

const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  zIndex: 1,
};

const hudStyle: React.CSSProperties = {
  position: 'absolute',
  top: '16px',
  left: '16px',
  right: '16px',
  padding: '12px 16px',
  backgroundColor: 'rgba(15, 23, 42, 0.85)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 'var(--border-radius-sm)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  pointerEvents: 'none',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  zIndex: 1000,
};

const hudRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
};

const hudColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const hudLabelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.05em',
};

const hudValStyle = (active: boolean): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 800,
  color: active ? '#10b981' : '#94a3b8',
  fontFamily: 'monospace',
});

const destRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  paddingTop: '6px',
  marginTop: '4px',
};

const addressTextStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#e2e8f0',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  width: '100%',
};
