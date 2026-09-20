// ========================================================================
// LEAFLET FULL-SCREEN INTERACTIVE MAP WITH OPENSTREETMAP & SMOOTH MARKERS
// ========================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Circle, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { UserLocation, CircularGeofence, LocationBreadcrumb } from '../types/location';
import { UserMarker } from './UserMarker';
import { GeofenceOverlay } from './Geofence';
import { Layers, Maximize2, Minimize2, MapPin, Flag } from 'lucide-react';

const startPinIcon = L.divIcon({
  html: `<div style="background:#10b981; color:white; font-size:10px; font-weight:900; padding:2px 8px; border-radius:12px; border:2px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.5); text-align:center; letter-spacing:0.5px;">START</div>`,
  className: 'custom-pin-start',
  iconSize: [54, 22],
  iconAnchor: [27, 11],
  popupAnchor: [0, -12],
});

const currentPinIcon = L.divIcon({
  html: `<div style="background:#2563eb; color:white; font-size:10px; font-weight:900; padding:2px 8px; border-radius:12px; border:2px solid white; box-shadow:0 3px 8px rgba(0,0,0,0.5); text-align:center; letter-spacing:0.5px;">CURRENT</div>`,
  className: 'custom-pin-end',
  iconSize: [66, 22],
  iconAnchor: [33, 11],
  popupAnchor: [0, -12],
});

interface LiveMapProps {
  users: UserLocation[];
  animatedCoords: Record<string, { lat: number; lng: number; heading: number }>;
  historyMap: Map<string, LocationBreadcrumb[]>;
  geofences: CircularGeofence[];
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
  isLiveTracking: boolean;
  showRoute: boolean;
}

// Helper component inside MapContainer to smoothly follow the selected user
const MapController: React.FC<{
  selectedUserId: string | null;
  isLiveTracking: boolean;
  animatedCoords: Record<string, { lat: number; lng: number; heading: number }>;
  users: UserLocation[];
}> = ({ selectedUserId, isLiveTracking, animatedCoords, users }) => {
  const map = useMap();

  useEffect(() => {
    if (!selectedUserId || !isLiveTracking) return;

    const animPos = animatedCoords[selectedUserId];
    if (animPos) {
      map.panTo([animPos.lat, animPos.lng], {
        animate: true,
        duration: 1.2,
        easeLinearity: 0.25,
      });
    } else {
      const user = users.find((u) => u.user_id === selectedUserId);
      if (user) {
        map.panTo([user.latitude, user.longitude], { animate: true });
      }
    }
  }, [selectedUserId, isLiveTracking, animatedCoords, users, map]);

  return null;
};

export type TileLayerMode = 'SATELLITE' | 'DARK' | 'OSM' | 'VOYAGER';

export const LiveMap: React.FC<LiveMapProps> = ({
  users,
  animatedCoords,
  historyMap,
  geofences,
  selectedUserId,
  onSelectUser,
  isLiveTracking,
  showRoute,
}) => {
  const [tileMode, setTileMode] = useState<TileLayerMode>('OSM');
  const [showLabelsOnSatellite, setShowLabelsOnSatellite] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [deviceGpsCenter, setDeviceGpsCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDeviceGpsCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // Real device location as primary default center, or first active user location
  const defaultCenter = useMemo<[number, number]>(() => {
    if (users.length > 0 && users[0].latitude && users[0].longitude) {
      return [users[0].latitude, users[0].longitude];
    }
    if (geofences.length > 0 && geofences[0].center_latitude && geofences[0].center_longitude) {
      return [geofences[0].center_latitude, geofences[0].center_longitude];
    }
    if (deviceGpsCenter) {
      return deviceGpsCenter;
    }
    return [11.0969, 77.0211]; // Live telemetry center fallback
  }, [users, geofences, deviceGpsCenter]);

  const tileConfig = useMemo(() => {
    switch (tileMode) {
      case 'SATELLITE':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          attribution:
            '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
          maxZoom: 19,
        };
      case 'DARK':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          attribution:
            '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, MapmyIndia',
          maxZoom: 19,
        };
      case 'VOYAGER':
        return {
          url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by Humanitarian OpenStreetMap Team',
          maxZoom: 19,
        };
      case 'OSM':
      default:
        return {
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        };
    }
  }, [tileMode]);

  return (
    <div className={`relative w-full h-full min-h-[500px] ${isFullscreen ? 'fixed inset-0 z-[2000]' : ''}`}>
      <MapContainer
        center={defaultCenter}
        zoom={15}
        scrollWheelZoom={true}
        className="w-full h-full z-0 bg-slate-950"
      >
        <TileLayer
          key={tileMode}
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          maxZoom={tileConfig.maxZoom}
        />

        {/* High-Resolution Reference Labels for Satellite View */}
        {tileMode === 'SATELLITE' && showLabelsOnSatellite && (
          <TileLayer
            attribution=""
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            opacity={0.85}
          />
        )}

        {/* High-Resolution Reference Labels for Dark Tactical View */}
        {tileMode === 'DARK' && showLabelsOnSatellite && (
          <TileLayer
            attribution=""
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            opacity={0.9}
          />
        )}

        {/* Dynamic Center & Live Tracking Controller */}
        <MapController
          selectedUserId={selectedUserId}
          isLiveTracking={isLiveTracking}
          animatedCoords={animatedCoords}
          users={users}
        />

        {/* Circular Geofences */}
        {geofences.map((geo) => (
          <GeofenceOverlay key={geo.id} geofence={geo} />
        ))}

        {/* Breadcrumb Route Polylines with START and CURRENT Badges */}
        {showRoute &&
          Array.from(historyMap.entries()).map(([userId, history]) => {
            if (!history || history.length < 2) return null;
            const isSelected = selectedUserId === userId || (!selectedUserId && users.length === 1);
            const positions = history.map((h) => [h.latitude, h.longitude] as [number, number]);

            return (
              <React.Fragment key={`route-${userId}`}>
                {/* Thick Vibrant Polyline Route Trail */}
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: isSelected ? '#2563eb' : '#64748b',
                    weight: isSelected ? 5 : 3,
                    opacity: isSelected ? 0.95 : 0.45,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />

                {/* START Pin Badge */}
                {isSelected && (
                  <Marker position={positions[0]} icon={startPinIcon}>
                    <Popup className="custom-leaflet-popup">
                      <div className="p-1 text-xs font-mono text-slate-100">
                        <strong className="text-emerald-400 font-sans block text-xs">Patrol Origin (START)</strong>
                        <div className="text-[11px] text-slate-300 mt-1">User: <span className="font-bold text-white">{userId}</span></div>
                        <div className="text-[10px] text-slate-400">Time: {history[0].timestamp ? new Date(history[0].timestamp).toLocaleTimeString() : 'Origin'}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Coords: {positions[0][0].toFixed(5)}, {positions[0][1].toFixed(5)}</div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* CURRENT Pin Badge */}
                {isSelected && (
                  <Marker position={positions[positions.length - 1]} icon={currentPinIcon}>
                    <Popup className="custom-leaflet-popup">
                      <div className="p-1 text-xs font-mono text-slate-100">
                        <strong className="text-blue-400 font-sans block text-xs">Latest Fix (CURRENT)</strong>
                        <div className="text-[11px] text-slate-300 mt-1">User: <span className="font-bold text-white">{userId}</span></div>
                        <div className="text-[10px] text-slate-400">Speed: {history[history.length - 1].speed} km/h</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Coords: {positions[positions.length - 1][0].toFixed(5)}, {positions[positions.length - 1][1].toFixed(5)}</div>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </React.Fragment>
            );
          })}

        {/* Accuracy Circles around users */}
        {users.map((user) => {
          const animPos = animatedCoords[user.user_id];
          const lat = animPos ? animPos.lat : user.latitude;
          const lng = animPos ? animPos.lng : user.longitude;
          const accuracy = user.accuracy || 5;

          // Don't draw accuracy circle for offline users, invalid coordinates, or absurd accuracy
          if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng) || user.status === 'offline' || accuracy > 100) return null;

          return (
            <Circle
              key={`accuracy-${user.user_id}`}
              center={[lat, lng]}
              radius={accuracy}
              pathOptions={{
                color: user.user_id === selectedUserId ? '#3b82f6' : '#10b981',
                fillColor: user.user_id === selectedUserId ? '#3b82f6' : '#10b981',
                fillOpacity: 0.08,
                weight: 1,
              }}
            />
          );
        })}

        {/* Live Moving User Markers */}
        {users.map((user) => (
          <UserMarker
            key={user.user_id}
            user={user}
            animatedPos={animatedCoords[user.user_id]}
            isSelected={selectedUserId === user.user_id}
            onSelect={onSelectUser}
          />
        ))}
      </MapContainer>

      {/* Floating Bottom-Right Controls: Multi-Layer Satellite Switcher & Fullscreen */}
      <div className="absolute bottom-6 right-6 z-[1000] flex flex-col items-end space-y-2">
        {tileMode === 'SATELLITE' && (
          <button
            onClick={() => setShowLabelsOnSatellite((l) => !l)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg backdrop-blur border transition shadow flex items-center space-x-1.5 ${
              showLabelsOnSatellite
                ? 'bg-blue-600/90 border-blue-400 text-white'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <span>🏷️ {showLabelsOnSatellite ? 'Labels: ON' : 'Labels: OFF'}</span>
          </button>
        )}

        <div className="flex items-center space-x-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-800 p-1.5 rounded-xl shadow-2xl">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setTileMode('SATELLITE')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center space-x-1.5 transition ${
                tileMode === 'SATELLITE'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Real-Time High-Resolution Satellite World Imagery"
            >
              <span>🛰️ Satellite</span>
            </button>

            <button
              onClick={() => setTileMode('DARK')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center space-x-1.5 transition ${
                tileMode === 'DARK'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Tactical Dark Base Map"
            >
              <span>🛡️ Dark</span>
            </button>

            <button
              onClick={() => setTileMode('OSM')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center space-x-1.5 transition ${
                tileMode === 'OSM'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Standard OpenStreetMap Vector Layer"
            >
              <span>🗺️ OSM</span>
            </button>

            <button
              onClick={() => setTileMode('VOYAGER')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center space-x-1.5 transition ${
                tileMode === 'VOYAGER'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Street Navigation Carto Voyager Layer"
            >
              <span>🧭 Street</span>
            </button>
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            title="Toggle Fullscreen Map"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
