import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MonitoredUser, Geofence, BreadcrumbPoint } from '../../types';
import { formatTimeAgo } from '../../lib/geofence';
import { StatusBadge } from '../common/Badge';
import { Shield, Navigation, Compass, ExternalLink, LocateFixed, Eye, Layers, Radio, Globe2, Search, X, Loader2, MapPin } from 'lucide-react';

// Validate coordinate boundaries to prevent invalid GPS from breaking Leaflet
export function isValidCoordinate(lat?: number, lng?: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Controller component that ONLY follows user when explicitly enabled or initial focus
function MapFollowController({
  selectedUser,
  followUser,
}: {
  selectedUser: MonitoredUser | null;
  followUser: boolean;
}) {
  const map = useMap();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedUser?.current_location) return;
    const { latitude, longitude } = selectedUser.current_location;
    if (!isValidCoordinate(latitude, longitude)) return;

    const isNewUserSelected = prevUserIdRef.current !== selectedUser.id;
    prevUserIdRef.current = selectedUser.id;

    if (isNewUserSelected || followUser) {
      map.panTo([latitude, longitude], {
        animate: true,
        duration: 0.8,
      });
    }
  }, [selectedUser, followUser, map]);

  return null;
}

// Automatically locate the real physical user on the real map if no devices yet
function MapAutoLocate({ hasUsers }: { hasUsers: boolean }) {
  const map = useMap();
  const locatedRef = useRef(false);

  useEffect(() => {
    if (!hasUsers && !locatedRef.current) {
      locatedRef.current = true;
      map.locate({ setView: true, maxZoom: 15 });
      map.on('locationfound', (e) => {
        map.flyTo(e.latlng, 15);
      });
    }
  }, [hasUsers, map]);

  return null;
}

// =====================================================================
// MAP FLY-TO CONTROLLER — receives a target lat/lng and flies map to it
// =====================================================================
function MapFlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { animate: true, duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

// =====================================================================
// NOMINATIM PLACE SEARCH RESULT TYPE
// =====================================================================
interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance: number;
}

// =====================================================================
// FLOATING PLACE SEARCH BAR — debounced Nominatim geocoding
// =====================================================================
function PlaceSearchBar({
  onSelect,
}: {
  onSelect: (lat: number, lng: number, name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=0`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'SIH-CommandCenter/2.0' },
      });
      if (!res.ok) throw new Error('Network error');
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
      setSelectedIdx(-1);
      if (data.length === 0) setError('No places found. Try a different name.');
    } catch {
      setError('Search failed. Check connection.');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      setError('');
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = selectedIdx >= 0 ? selectedIdx : 0;
      if (results[idx]) pick(results[idx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function pick(r: NominatimResult) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    const shortName = r.display_name.split(',').slice(0, 2).join(', ');
    setQuery(shortName);
    setOpen(false);
    onSelect(lat, lng, r.display_name);
  }

  // Icon by place type
  function placeIcon(r: NominatimResult) {
    const t = (r.type || r.class || '').toLowerCase();
    if (t.includes('city') || t.includes('town')) return '🏙️';
    if (t.includes('village') || t.includes('hamlet')) return '🏘️';
    if (t.includes('state') || t.includes('province')) return '🗺️';
    if (t.includes('country')) return '🌏';
    if (t.includes('road') || t.includes('street') || t.includes('highway')) return '🛣️';
    if (t.includes('hospital') || t.includes('clinic')) return '🏥';
    if (t.includes('school') || t.includes('university')) return '🎓';
    if (t.includes('park') || t.includes('forest')) return '🌿';
    if (t.includes('station')) return '🚉';
    if (t.includes('water') || t.includes('river') || t.includes('lake')) return '💧';
    return '📍';
  }

  return (
    <div ref={containerRef} className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] w-full max-w-md px-3" style={{ pointerEvents: 'auto' }}>
      {/* Search Input */}
      <div
        className={`flex items-center gap-2 bg-slate-900/95 backdrop-blur-lg border ${
          focused ? 'border-blue-500 shadow-lg shadow-blue-900/30' : 'border-slate-700'
        } rounded-xl px-3 py-2 transition-all duration-200 shadow-2xl`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
        ) : (
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="🔍  Search place, city, landmark..."
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none font-sans"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); setError(''); inputRef.current?.focus(); }}
            className="text-slate-500 hover:text-white transition p-0.5 rounded"
            tabIndex={-1}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {open && results.length > 0 && (
        <div className="mt-1.5 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-xl overflow-hidden shadow-2xl divide-y divide-slate-800">
          {results.map((r, i) => {
            const shortName = r.display_name.split(',').slice(0, 2).join(', ');
            const context = r.display_name.split(',').slice(2, 4).join(', ');
            return (
              <button
                key={r.place_id}
                onClick={() => pick(r)}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition ${
                  i === selectedIdx
                    ? 'bg-blue-600/30 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span className="text-base shrink-0 mt-0.5">{placeIcon(r)}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{shortName}</div>
                  {context && <div className="text-[11px] text-slate-500 truncate">{context.trim()}</div>}
                </div>
                <div className="ml-auto shrink-0 flex items-center gap-1 text-[10px] font-mono text-slate-600">
                  <MapPin className="w-3 h-3" />
                  <span>{parseFloat(r.lat).toFixed(3)}, {parseFloat(r.lon).toFixed(3)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Error / No results message */}
      {!open && error && query.length >= 2 && !loading && (
        <div className="mt-1.5 bg-slate-900/95 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-400 text-center shadow-xl">
          {error}
        </div>
      )}
    </div>
  );
}

// Configurable marker status thresholds (in seconds)
export function getMarkerStatus(
  lastUpdatedIso?: string,
  liveThresholdSec: number = 30,
  staleThresholdSec: number = 120
): 'LIVE' | 'STALE' | 'OFFLINE' {
  if (!lastUpdatedIso) return 'OFFLINE';
  const diffSec = (Date.now() - new Date(lastUpdatedIso).getTime()) / 1000;
  if (diffSec <= liveThresholdSec) return 'LIVE';
  if (diffSec <= staleThresholdSec) return 'STALE';
  return 'OFFLINE';
}

// Custom SVG marker with heading rotation, live pulse halo, and status colors
function createCustomUserIcon(
  user: MonitoredUser,
  isSelected: boolean,
  markerStatus: 'LIVE' | 'STALE' | 'OFFLINE'
) {
  const isOutside = user.geofence_status === 'OUTSIDE';

  let color = '#10b981'; // emerald/live
  let ringColor = 'rgba(16, 185, 129, 0.4)';

  if (isOutside) {
    color = '#ef4444'; // rose/violation
    ringColor = 'rgba(239, 68, 68, 0.6)';
  } else if (markerStatus === 'STALE') {
    color = '#f59e0b'; // amber/stale
    ringColor = 'rgba(245, 158, 11, 0.4)';
  } else if (markerStatus === 'OFFLINE') {
    color = '#64748b'; // slate/offline
    ringColor = 'rgba(100, 116, 139, 0.2)';
  }

  const heading = user.current_location?.heading || 0;
  const markerSize = isSelected ? 44 : 36;

  const html = `
    <div style="position: relative; width: ${markerSize}px; height: ${markerSize}px; display: flex; align-items: center; justify-content: center;">
      ${
        markerStatus === 'LIVE'
          ? `<div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${ringColor}; animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;"></div>`
          : ''
      }
      <div style="
        width: ${markerSize - 10}px;
        height: ${markerSize - 10}px;
        border-radius: 50%;
        background: #0f172a;
        border: 2.5px solid ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
        z-index: 2;
        position: relative;
      ">
        <svg style="transform: rotate(${heading}deg); transition: transform 0.3s ease;" width="14" height="14" viewBox="0 0 24 24" fill="${color}">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
        </svg>
      </div>
      ${
        isSelected
          ? `<div style="position: absolute; -top: 4px; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></div>`
          : ''
      }
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-user-marker',
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerSize / 2, markerSize / 2],
    popupAnchor: [0, -(markerSize / 2) - 4],
  });
}

export type TileLayerType = 'dark' | 'satellite' | 'osm' | 'voyager';

interface LiveMapProps {
  users: MonitoredUser[];
  geofences: Geofence[];
  selectedUser: MonitoredUser | null;
  onSelectUser: (user: MonitoredUser) => void;
  onOpenDetails: (user: MonitoredUser) => void;
  height?: string;
  defaultCenter?: [number, number];
  routeHistory?: Record<string, BreadcrumbPoint[]>;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  users,
  geofences,
  selectedUser,
  onSelectUser,
  onOpenDetails,
  height = '100%',
  defaultCenter = [20.5937, 78.9629],
  routeHistory,
}) => {
  const [followUser, setFollowUser] = useState(false);
  const [tileLayerType, setTileLayerType] = useState<TileLayerType>('dark');

  // Place search state
  const [searchTarget, setSearchTarget] = useState<[number, number] | null>(null);
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const searchPinIcon = L.divIcon({
    html: `<div style="background:linear-gradient(135deg,#6366f1,#2563eb);color:white;font-size:10px;font-weight:900;padding:3px 9px;border-radius:12px;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.5);text-align:center;letter-spacing:0.5px;white-space:nowrap;">📍 SEARCH RESULT</div>`,
    className: 'search-result-pin',
    iconSize: [130, 24],
    iconAnchor: [65, 12],
    popupAnchor: [0, -16],
  });

  function handlePlaceSelect(lat: number, lng: number, name: string) {
    setSearchTarget([lat, lng]);
    setSearchPin({ lat, lng, name });
  }

  // Compute map center from active selected user or first user
  const mapInitialCenter: [number, number] =
    selectedUser?.current_location &&
    isValidCoordinate(selectedUser.current_location.latitude, selectedUser.current_location.longitude)
      ? [selectedUser.current_location.latitude, selectedUser.current_location.longitude]
      : users[0]?.current_location &&
        isValidCoordinate(users[0].current_location.latitude, users[0].current_location.longitude)
      ? [users[0].current_location.latitude, users[0].current_location.longitude]
      : defaultCenter || [20.5937, 78.9629];

  return (
    <div className="relative z-0 w-full h-full rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950">
      <MapContainer
        center={mapInitialCenter}
        zoom={14}
        scrollWheelZoom={true}
        style={{ width: '100%', height }}
        attributionControl={true}
      >
        {/* High-Tech Tactical Defense / High-Res Satellite / OpenStreetMap Tile Options */}
        {tileLayerType === 'dark' ? (
          <>
            <TileLayer
              attribution='&copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, MapmyIndia'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            <TileLayer
              attribution=""
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
              opacity={0.85}
            />
          </>
        ) : tileLayerType === 'satellite' ? (
          <>
            <TileLayer
              attribution='&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            <TileLayer
              attribution=""
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
              opacity={0.85}
            />
          </>
        ) : tileLayerType === 'voyager' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles by Humanitarian OpenStreetMap Team'
            url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}

        {/* Dynamic real-time auto locate on user physical position */}
        <MapAutoLocate hasUsers={users.length > 0} />

        {/* Map Follow Controller */}
        <MapFollowController selectedUser={selectedUser} followUser={followUser} />

        {/* Geofences Rendering */}
        {geofences.map((geo) => {
          const lat = geo.center_latitude ?? geo.latitude;
          const lng = geo.center_longitude ?? geo.longitude;
          const rad = geo.radius_meters ?? geo.radius ?? 150;

          if (!isValidCoordinate(lat, lng)) return null;

          const hasBreach = users.some(
            (u) => (u.assigned_geofence?.id === geo.id || (u as any).geofence_id === geo.id) && u.geofence_status === 'OUTSIDE'
          );

          return (
            <React.Fragment key={geo.id}>
              <Circle
                center={[lat, lng]}
                radius={rad}
                pathOptions={{
                  color: hasBreach ? '#ef4444' : '#10b981',
                  fillColor: hasBreach ? '#ef4444' : '#10b981',
                  fillOpacity: hasBreach ? 0.16 : 0.08,
                  weight: hasBreach ? 2.5 : 1.5,
                  dashArray: hasBreach ? '6, 6' : undefined,
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-slate-100 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span>{geo.name || (geo as any).area_name || 'Operational Geofence'}</span>
                    </div>
                    {geo.description && <p className="text-slate-400 text-[11px]">{geo.description}</p>}
                    <div className="pt-1 border-t border-slate-800 flex justify-between text-[11px] text-slate-300">
                      <span>Radius: {rad}m</span>
                      <span className="font-mono text-emerald-400 font-semibold">Active Perimeter</span>
                    </div>
                  </div>
                </Popup>
              </Circle>
            </React.Fragment>
          );
        })}

        {/* Multiple Monitored Users */}
        {users.map((user) => {
          if (!user.current_location) return null;
          const { latitude, longitude, accuracy, last_updated } = user.current_location;

          // Protect against invalid GPS coordinates
          if (!isValidCoordinate(latitude, longitude)) return null;

          const isSelected = selectedUser?.id === user.id;
          const pos: [number, number] = [latitude, longitude];
          const markerStatus = getMarkerStatus(last_updated);

          return (
            <React.Fragment key={user.id}>
              {/* Accuracy Circle */}
              {isSelected && accuracy && (
                <Circle
                  center={pos}
                  radius={accuracy}
                  pathOptions={{
                    color: '#38bdf8',
                    fillColor: '#38bdf8',
                    fillOpacity: 0.15,
                    weight: 1,
                    dashArray: '4, 4',
                  }}
                />
              )}

              <Marker
                position={pos}
                icon={createCustomUserIcon(user, isSelected, markerStatus)}
                eventHandlers={{
                  click: () => onSelectUser(user),
                }}
              >
                <Popup>
                  <div className="min-w-[210px] text-xs space-y-2 p-1 font-sans">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <div>
                        <div className="font-bold text-sm text-white">USER: {user.full_name}</div>
                        <div className="text-[11px] text-blue-400 font-mono">ID: {user.officer_id}</div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          markerStatus === 'LIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : markerStatus === 'STALE'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        ● {markerStatus}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px] text-slate-300 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Latitude:</span>
                        <span className="text-white">{latitude.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Longitude:</span>
                        <span className="text-white">{longitude.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">GPS Accuracy:</span>
                        <span className="text-emerald-400">~{accuracy || 8}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Last Updated:</span>
                        <span className="text-amber-400">
                          {formatTimeAgo(last_updated)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex justify-end">
                      <button
                        onClick={() => onOpenDetails(user)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1 px-2.5 rounded text-[11px] flex items-center justify-center gap-1.5 transition shadow"
                      >
                        <span>Inspect Full Telemetry</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Real-time Breadcrumb Patrol Trajectory Polyline */}
        {selectedUser && routeHistory && (routeHistory[selectedUser.id]?.length ?? 0) > 1 && (
          <Polyline
            positions={routeHistory[selectedUser.id].map((pt) => [pt.latitude, pt.longitude])}
            pathOptions={{
              color: selectedUser.geofence_status === 'OUTSIDE' ? '#ef4444' : '#38bdf8',
              weight: 3.5,
              opacity: 0.85,
              dashArray: '4, 6',
            }}
          />
        )}
        {/* Fly-to controller for place search */}
        <MapFlyTo target={searchTarget} />

        {/* Search Result Pin Marker */}
        {searchPin && (
          <Marker position={[searchPin.lat, searchPin.lng]} icon={searchPinIcon}>
            <Popup>
              <div className="min-w-[180px] text-xs p-1">
                <div className="font-bold text-sm text-white flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  Search Result
                </div>
                <div className="text-slate-300 text-[11px] leading-relaxed">{searchPin.name.split(',').slice(0, 3).join(', ')}</div>
                <div className="mt-1.5 pt-1.5 border-t border-slate-800 font-mono text-[10px] text-slate-500">
                  {searchPin.lat.toFixed(5)}, {searchPin.lng.toFixed(5)}
                </div>
                <button
                  onClick={() => setSearchPin(null)}
                  className="mt-2 w-full text-center text-[11px] text-slate-500 hover:text-red-400 transition"
                >
                  ✕ Remove pin
                </button>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Map Control Bar Overlay: Follow User & Multi-Layer Style */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-wrap items-center gap-2">
        {selectedUser && (
          <button
            onClick={() => setFollowUser(!followUser)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg border ${
              followUser
                ? 'bg-blue-600 text-white border-blue-400 shadow-blue-900/40'
                : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
            title="When active, map smoothly follows the selected user's GPS marker"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>{followUser ? 'Tracking Lock' : 'Follow Unit'}</span>
          </button>
        )}

        {/* Tactical 4-Layer Selector */}
        <div className="flex items-center bg-slate-900/95 border border-slate-700/80 rounded-lg p-0.5 shadow-xl backdrop-blur-md">
          {(['dark', 'satellite', 'osm', 'voyager'] as TileLayerType[]).map((type) => (
            <button
              key={type}
              onClick={() => setTileLayerType(type)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition ${
                tileLayerType === type
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {type === 'dark'
                ? 'TACTICAL'
                : type === 'satellite'
                ? 'SATELLITE'
                : type === 'osm'
                ? 'OSM'
                : 'STREET'}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Unit Real-time HUD Telemetry Badge */}
      {selectedUser?.current_location && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-2.5 shadow-2xl text-xs flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
          <div>
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>{selectedUser.full_name}</span>
              <span className="text-[10px] font-mono text-blue-400">({selectedUser.officer_id})</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Lat: {selectedUser.current_location.latitude.toFixed(5)}</span>
              <span>•</span>
              <span>Lng: {selectedUser.current_location.longitude.toFixed(5)}</span>
              <span>•</span>
              <span className="text-amber-400 font-bold">
                {((selectedUser.current_location.speed || 0) * 3.6).toFixed(1)} km/h
              </span>
              <span>•</span>
              <span className="text-emerald-400">
                HDG: {selectedUser.current_location.heading || 0}°
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Place Search Bar — center top */}
      <PlaceSearchBar onSelect={handlePlaceSelect} />

      {/* Legend Overlay — pushed down to avoid overlap with search bar */}
      <div className="absolute top-16 left-3 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs shadow-xl hidden sm:flex items-center space-x-3">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-slate-300 font-medium">● LIVE (&lt;30s)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span className="text-amber-400 font-medium">● STALE</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
          <span className="text-slate-400 font-medium">● OFFLINE</span>
        </div>
      </div>

      {/* Awaiting Real GNSS Signal Overlay if no devices connected yet */}
      {users.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-sm p-6 text-center">
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-blue-400 mb-3 animate-pulse">
            <Radio className="w-8 h-8" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">
            Awaiting Real-Time GNSS / GPS Satellite Signal
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mb-3">
            Please click <strong>"Allow"</strong> when prompted for location access, or click{' '}
            <strong className="text-blue-400">"📱 Connect Phone GPS"</strong> above to stream
            telemetry live from your smartphone.
          </p>
          <div className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1 rounded-full animate-pulse">
            OpenStreetMap Engine Listening on WebSocket...
          </div>
        </div>
      )}
    </div>
  );
};
