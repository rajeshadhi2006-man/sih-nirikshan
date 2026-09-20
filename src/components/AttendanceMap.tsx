// ========================================================================
// ATTENDANCE GEOFENCE LEAFLET MAP WITH INTERACTIVE DRAWING & NATIVE GPS
// ========================================================================
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { LiveAttendanceRecord } from '../types/location';
import { Crosshair, Navigation, MapPin, Move, Maximize2, Check, X, Sliders } from 'lucide-react';

export interface DrawingGeofenceState {
  centerLat: number;
  centerLng: number;
  radius: number;
}

interface AttendanceMapProps {
  records: LiveAttendanceRecord[];
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  liveDeviceCoords?: { lat: number; lng: number; accuracy: number } | null;
  // Interactive Drawing Mode
  isDrawingMode?: boolean;
  drawingGeofence?: DrawingGeofenceState | null;
  onDrawingChange?: (geo: DrawingGeofenceState) => void;
}

// Controller to pan smoothly to selected coordinates
const MapPanController: React.FC<{ targetCoords: [number, number] | null }> = ({ targetCoords }) => {
  const map = useMap();
  useEffect(() => {
    if (targetCoords && !isNaN(targetCoords[0]) && !isNaN(targetCoords[1])) {
      map.panTo(targetCoords, { animate: true, duration: 1.0 });
    }
  }, [targetCoords, map]);
  return null;
};

// Map click listener
const MapEventsHandler: React.FC<{
  isDrawingMode?: boolean;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  onDrawingClick?: (coords: { lat: number; lng: number }) => void;
}> = ({ isDrawingMode, onMapClick, onDrawingClick }) => {
  useMapEvents({
    click(e) {
      if (isDrawingMode && onDrawingClick) {
        onDrawingClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else if (onMapClick) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
};

// Helper: compute edge handle coordinates given center and radius (meters)
function getEdgeCoords(lat: number, lng: number, radiusMeters: number): [number, number] {
  const deltaLng = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat, lng + deltaLng];
}

// Helper: calculate distance in meters between two lat/lng points
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Center drag anchor icon
const centerAnchorIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center cursor-move">
      <span class="absolute -inset-2 rounded-full bg-blue-500/40 animate-ping"></span>
      <div class="w-9 h-9 rounded-full bg-blue-600 border-2 border-white text-white flex items-center justify-center shadow-2xl relative z-10 font-bold text-xs">
        <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
        </svg>
      </div>
      <div class="absolute -bottom-6 bg-blue-950 text-blue-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-500/40 shadow whitespace-nowrap">
        CENTER (DRAG)
      </div>
    </div>
  `,
  className: 'custom-drag-center',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Perimeter radius resize handle icon
const radiusHandleIcon = (radiusM: number) =>
  L.divIcon({
    html: `
      <div class="relative flex items-center justify-center cursor-ew-resize">
        <span class="absolute -inset-1 rounded-full bg-amber-400/40 animate-pulse"></span>
        <div class="w-7 h-7 rounded-full bg-amber-500 border-2 border-white text-slate-950 flex items-center justify-center shadow-2xl relative z-10 font-bold text-[10px]">
          ↔
        </div>
        <div class="absolute -bottom-6 bg-slate-900 text-amber-300 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-500/40 shadow whitespace-nowrap">
          ${radiusM}m (DRAG TO RESIZE)
        </div>
      </div>
    `,
    className: 'custom-drag-edge',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

export const AttendanceMap: React.FC<AttendanceMapProps> = ({
  records,
  selectedUserId,
  onSelectUser,
  onMapClick,
  liveDeviceCoords,
  isDrawingMode = false,
  drawingGeofence = null,
  onDrawingChange,
}) => {
  const [mapMode, setMapMode] = useState<'OSM' | 'DARK' | 'SATELLITE'>('OSM');
  const [currentGpsCenter, setCurrentGpsCenter] = useState<[number, number] | null>(null);

  // Attempt to acquire real device GPS fix on initial load
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentGpsCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  const tileLayers = {
    OSM: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      subdomains: 'abc',
      maxZoom: 19,
      className: '',
    },
    DARK: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; CartoDB &copy; OpenStreetMap',
      subdomains: 'abcd',
      maxZoom: 20,
      className: '',
    },
    SATELLITE: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
      subdomains: 'abc',
      maxZoom: 19,
      className: '',
    },
  };

  const activeTile = tileLayers[mapMode];

  // Selected user coordinates for centering
  const selectedRecord = records.find((r) => r.user_id === selectedUserId);
  const targetCoords: [number, number] | null = selectedRecord
    ? [selectedRecord.latitude || selectedRecord.geofence_center_lat, selectedRecord.longitude || selectedRecord.geofence_center_lng]
    : liveDeviceCoords
    ? [liveDeviceCoords.lat, liveDeviceCoords.lng]
    : currentGpsCenter;

  const initialCenter: [number, number] =
    targetCoords ||
    (records.length > 0 && [records[0].geofence_center_lat, records[0].geofence_center_lng]) ||
    currentGpsCenter ||
    [11.0969, 77.0211];

  // Unique geofences from enrolled records
  const uniqueGeofences = Array.from(
    new Map(
      records.map((r) => [
        `${r.geofence_center_lat}_${r.geofence_center_lng}_${r.geofence_radius}`,
        {
          lat: r.geofence_center_lat,
          lng: r.geofence_center_lng,
          radius: r.geofence_radius,
          name: r.authorized_location,
        },
      ])
    ).values()
  );

  // Handle click while in Drawing Mode to place or move the drawn geofence
  const handleDrawingClick = (coords: { lat: number; lng: number }) => {
    if (!onDrawingChange) return;
    const currentRadius = drawingGeofence?.radius || 150;
    onDrawingChange({
      centerLat: coords.lat,
      centerLng: coords.lng,
      radius: currentRadius,
    });
  };

  // Center drag handler
  const handleCenterDrag = (e: any) => {
    if (!onDrawingChange || !drawingGeofence) return;
    const newPos = e.target.getLatLng();
    onDrawingChange({
      ...drawingGeofence,
      centerLat: newPos.lat,
      centerLng: newPos.lng,
    });
  };

  // Radius edge handle drag handler
  const handleEdgeDrag = (e: any) => {
    if (!onDrawingChange || !drawingGeofence) return;
    const newEdgePos = e.target.getLatLng();
    const newRadius = Math.max(
      30,
      calculateDistanceMeters(
        drawingGeofence.centerLat,
        drawingGeofence.centerLng,
        newEdgePos.lat,
        newEdgePos.lng
      )
    );
    onDrawingChange({
      ...drawingGeofence,
      radius: newRadius,
    });
  };

  // Compute live edge coordinate for the radius handle
  const edgeCoords = useMemo<[number, number] | null>(() => {
    if (!drawingGeofence) return null;
    return getEdgeCoords(drawingGeofence.centerLat, drawingGeofence.centerLng, drawingGeofence.radius);
  }, [drawingGeofence]);

  return (
    <div
      className={`relative w-full h-full min-h-[440px] rounded-2xl overflow-hidden border shadow-2xl bg-slate-950 transition-all ${
        isDrawingMode
          ? 'border-blue-500 ring-2 ring-blue-500/40 cursor-crosshair'
          : 'border-slate-800'
      }`}
    >
      {/* Top Map Mode Selector */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl text-[11px] font-semibold text-slate-300">
        <button
          onClick={() => setMapMode('OSM')}
          className={`px-2.5 py-1 rounded-lg transition ${
            mapMode === 'OSM' ? 'bg-blue-600 text-white font-bold shadow' : 'hover:text-white'
          }`}
        >
          OSM Standard
        </button>
        <button
          onClick={() => setMapMode('DARK')}
          className={`px-2.5 py-1 rounded-lg transition ${
            mapMode === 'DARK' ? 'bg-blue-600 text-white font-bold shadow' : 'hover:text-white'
          }`}
        >
          Tactical Dark
        </button>
        <button
          onClick={() => setMapMode('SATELLITE')}
          className={`px-2.5 py-1 rounded-lg transition ${
            mapMode === 'SATELLITE' ? 'bg-blue-600 text-white font-bold shadow' : 'hover:text-white'
          }`}
        >
          Satellite
        </button>
      </div>

      {/* Top Left: Locate Me Button */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
        <button
          onClick={() => {
            if ('geolocation' in navigator) {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setCurrentGpsCenter([pos.coords.latitude, pos.coords.longitude]);
                },
                (err) => alert(`GPS: ${err.message}`),
                { enableHighAccuracy: true }
              );
            }
          }}
          className="bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-cyan-400 font-bold shadow-xl flex items-center gap-1.5 transition"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Locate My Real GPS</span>
        </button>
      </div>

      {/* DRAWING MODE ACTIVE BANNER HUD */}
      {isDrawingMode && (
        <div className="absolute top-14 left-3 right-3 z-[1000] bg-blue-950/95 backdrop-blur-md border border-blue-500/60 p-3 rounded-xl shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center space-x-2.5 text-xs text-blue-100">
            <span className="p-1.5 bg-blue-500 text-white rounded-lg animate-pulse">
              <Move className="w-4 h-4" />
            </span>
            <div>
              <div className="font-black text-white text-xs flex items-center gap-2">
                <span>INTERACTIVE GEOFENCE DRAW MODE</span>
                <span className="bg-blue-500/30 text-blue-300 text-[10px] px-2 py-0.2 rounded-full border border-blue-400/40">
                  Step 1: Click map to place center • Step 2: Drag radius handle
                </span>
              </div>
              <p className="text-[11px] text-blue-200/80">
                {drawingGeofence ? (
                  <>
                    Center: <span className="font-mono text-white font-bold">{drawingGeofence.centerLat.toFixed(5)}, {drawingGeofence.centerLng.toFixed(5)}</span> • Radius: <span className="font-mono text-amber-300 font-black">{drawingGeofence.radius} meters</span>
                  </>
                ) : (
                  'Click anywhere on the map to drop the geofence perimeter center.'
                )}
              </p>
            </div>
          </div>

          {/* Quick Radius Slider directly in Draw Mode Banner */}
          {drawingGeofence && onDrawingChange && (
            <div className="flex items-center space-x-3 bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700/80">
              <span className="text-[11px] font-bold text-slate-300">Radius:</span>
              <input
                type="range"
                min="30"
                max="1000"
                step="10"
                value={drawingGeofence.radius}
                onChange={(e) =>
                  onDrawingChange({
                    ...drawingGeofence,
                    radius: parseInt(e.target.value),
                  })
                }
                className="w-24 accent-blue-500 cursor-pointer"
              />
              <span className="font-mono font-bold text-amber-300 text-xs w-12 text-right">
                {drawingGeofence.radius}m
              </span>
            </div>
          )}
        </div>
      )}

      {/* Geofence Legend Pill */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-2 text-xs shadow-xl flex items-center space-x-3">
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500/20 border-2 border-emerald-500 inline-block"></span>
          <span className="text-slate-300 text-[11px] font-medium">Authorized Geofence</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-ping"></span>
          <span className="text-emerald-400 text-[11px] font-bold">PRESENT</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
          <span className="text-amber-400 text-[11px] font-bold">LEAVE</span>
        </div>
      </div>

      <MapContainer
        center={initialCenter}
        zoom={16}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          key={mapMode}
          url={activeTile.url}
          subdomains={activeTile.subdomains}
          className={activeTile.className}
        />

        <MapPanController targetCoords={targetCoords} />
        <MapEventsHandler
          isDrawingMode={isDrawingMode}
          onMapClick={onMapClick}
          onDrawingClick={handleDrawingClick}
        />

        {/* ================================================================ */}
        {/* INTERACTIVE DRAWING OVERLAYS (CIRCLE + DRAGGABLE HANDLES) */}
        {/* ================================================================ */}
        {isDrawingMode && drawingGeofence && (
          <React.Fragment>
            {/* Drawn Geofence Circle Preview */}
            <Circle
              center={[drawingGeofence.centerLat, drawingGeofence.centerLng]}
              radius={drawingGeofence.radius}
              pathOptions={{
                color: '#2563eb',
                weight: 3,
                dashArray: '8, 6',
                fillColor: '#3b82f6',
                fillOpacity: 0.22,
              }}
            />

            {/* Draggable Center Anchor Marker */}
            <Marker
              position={[drawingGeofence.centerLat, drawingGeofence.centerLng]}
              icon={centerAnchorIcon}
              draggable={true}
              eventHandlers={{
                drag: handleCenterDrag,
              }}
            />

            {/* Draggable Radius Edge Resize Handle */}
            {edgeCoords && (
              <Marker
                position={edgeCoords}
                icon={radiusHandleIcon(drawingGeofence.radius)}
                draggable={true}
                eventHandlers={{
                  drag: handleEdgeDrag,
                }}
              />
            )}
          </React.Fragment>
        )}

        {/* Live Device Hardware Pin */}
        {liveDeviceCoords && (
          <React.Fragment>
            <Circle
              center={[liveDeviceCoords.lat, liveDeviceCoords.lng]}
              radius={Math.max(5, liveDeviceCoords.accuracy || 10)}
              pathOptions={{
                color: '#06b6d4',
                weight: 1.5,
                fillColor: '#06b6d4',
                fillOpacity: 0.2,
              }}
            />
            <Marker
              position={[liveDeviceCoords.lat, liveDeviceCoords.lng]}
              icon={L.divIcon({
                html: `
                  <div class="relative flex items-center justify-center">
                    <span class="absolute -inset-2 rounded-full bg-cyan-400/40 animate-ping"></span>
                    <div class="w-8 h-8 rounded-full bg-cyan-500 border-2 border-white text-white flex items-center justify-center shadow-2xl relative z-10 text-[11px] font-black">
                      GPS
                    </div>
                    <div class="absolute -bottom-5 bg-slate-900 text-[9px] font-mono text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/50 shadow whitespace-nowrap">
                      Real Device GPS
                    </div>
                  </div>
                `,
                className: 'custom-live-device-marker',
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -18],
              })}
            >
              <Popup className="attendance-leaflet-popup">
                <div className="p-1 min-w-[190px] text-xs text-slate-100">
                  <div className="font-bold text-cyan-400">Native Device GPS (Active)</div>
                  <div className="text-slate-300 font-mono text-[11px] mt-1">
                    {liveDeviceCoords.lat.toFixed(6)}, {liveDeviceCoords.lng.toFixed(6)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Accuracy: ±{Math.round(liveDeviceCoords.accuracy)}m
                  </div>
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        )}

        {/* Render Confirmed Authorized Geofence Circles */}
        {uniqueGeofences.map((g, idx) => (
          <React.Fragment key={`geo-${idx}`}>
            <Circle
              center={[g.lat, g.lng]}
              radius={g.radius}
              pathOptions={{
                color: '#10b981',
                weight: 2,
                dashArray: '6, 6',
                fillColor: '#10b981',
                fillOpacity: 0.12,
              }}
            />
            <Circle
              center={[g.lat, g.lng]}
              radius={4}
              pathOptions={{
                color: '#059669',
                weight: 2,
                fillColor: '#ffffff',
                fillOpacity: 1,
              }}
            />
          </React.Fragment>
        ))}

        {/* Render Enrolled Users */}
        {records.map((user) => {
          const uLat = user.latitude || user.geofence_center_lat;
          const uLng = user.longitude || user.geofence_center_lng;
          const isSelected = user.user_id === selectedUserId;
          const isPresent = user.status === 'PRESENT';
          const isUncertain = user.gps_status === 'GPS UNCERTAIN';
          const isSignalLost = user.gps_status === 'LOCATION SIGNAL LOST';

          let markerColor = 'bg-emerald-500 border-emerald-400 text-white';
          let pulseColor = 'bg-emerald-500/40';

          if (isUncertain) {
            markerColor = 'bg-purple-600 border-purple-400 text-white';
            pulseColor = 'bg-purple-500/40';
          } else if (isSignalLost) {
            markerColor = 'bg-slate-600 border-slate-400 text-white';
            pulseColor = '';
          } else if (user.status === 'LEAVE') {
            markerColor = 'bg-amber-500 border-amber-400 text-white';
            pulseColor = '';
          } else if (user.status === 'OUTSIDE') {
            markerColor = 'bg-slate-600 border-slate-400 text-slate-200';
            pulseColor = '';
          }

          const html = `
            <div class="relative flex items-center justify-center cursor-pointer transition-transform ${isSelected ? 'scale-125 z-50' : ''}">
              ${pulseColor ? `<span class="absolute -inset-1.5 rounded-full ${pulseColor} animate-ping"></span>` : ''}
              <div class="w-8 h-8 rounded-full ${markerColor} border-2 flex items-center justify-center shadow-lg relative z-10 text-[10px] font-black">
                ${isPresent ? '✓' : user.status === 'LEAVE' ? '➔' : '●'}
              </div>
              <div class="absolute -bottom-5 bg-slate-900/95 text-[9px] font-mono font-bold text-white px-1.5 py-0.2 rounded border border-slate-700 shadow whitespace-nowrap">
                ${user.user_id}
              </div>
            </div>
          `;

          const userIcon = L.divIcon({
            html,
            className: 'custom-attendance-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -18],
          });

          return (
            <React.Fragment key={user.user_id}>
              {user.accuracy && (
                <Circle
                  center={[uLat, uLng]}
                  radius={user.accuracy}
                  pathOptions={{
                    color: isUncertain ? '#a855f7' : isPresent ? '#10b981' : '#f59e0b',
                    weight: 1,
                    dashArray: '2, 4',
                    fillColor: isUncertain ? '#a855f7' : isPresent ? '#10b981' : '#f59e0b',
                    fillOpacity: 0.15,
                  }}
                />
              )}

              <Marker
                position={[uLat, uLng]}
                icon={userIcon}
                eventHandlers={{
                  click: () => onSelectUser(user.user_id),
                }}
              >
                <Popup className="attendance-leaflet-popup">
                  <div className="p-1 min-w-[210px] text-slate-100 font-sans leading-relaxed">
                    <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-2">
                      <div>
                        <span className="font-mono font-black text-sm text-blue-400">{user.user_id}</span>
                        <div className="text-xs font-semibold text-slate-200">{user.name}</div>
                      </div>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          isPresent
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : user.status === 'LEAVE'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        {user.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Position:</span>
                        <span className="font-bold text-white">
                          {isPresent ? 'Inside Geofence' : 'Outside Geofence'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-400">Accuracy:</span>
                        <span className="font-mono text-cyan-300">{Math.round(user.accuracy)}m</span>
                      </div>

                      {isPresent ? (
                        <>
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="text-slate-400">Entry:</span>
                            <span className="font-mono text-emerald-400 font-bold">{user.entry_time || '--'}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="text-slate-400">Duration:</span>
                            <span className="font-mono text-blue-300 font-bold">{user.duration || '--'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="text-slate-400">Exit:</span>
                            <span className="font-mono text-amber-400 font-bold">{user.exit_time || '--'}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="text-slate-400">Duration:</span>
                            <span className="font-mono text-blue-300 font-bold">{user.duration || '--'}</span>
                          </div>
                        </>
                      )}

                      <div className="pt-1.5 mt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">GPS Status:</span>
                        <span
                          className={`font-semibold ${
                            isUncertain
                              ? 'text-purple-400'
                              : isSignalLost
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {user.gps_status}
                        </span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
};
