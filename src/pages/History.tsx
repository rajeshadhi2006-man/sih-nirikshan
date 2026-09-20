import React, { useState } from 'react';
import {
  Route,
  Calendar,
  Clock,
  Navigation,
  Compass,
  Zap,
  Activity,
  User,
  Radio,
  MapPin,
} from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useSearchParams } from 'react-router-dom';
import { locationsApi } from '../api/locations';


const startIcon = L.divIcon({
  html: `<div style="background:#10b981; color:white; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:12px; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.4); text-align:center;">START</div>`,
  className: 'custom-pin-start',
  iconSize: [48, 20],
  iconAnchor: [24, 10],
});

const endIcon = L.divIcon({
  html: `<div style="background:#3b82f6; color:white; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:12px; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.4); text-align:center;">CURRENT</div>`,
  className: 'custom-pin-end',
  iconSize: [58, 20],
  iconAnchor: [29, 10],
});

// Helper component to auto pan map to latest route point
const MapAutoRecenter: React.FC<{ coords: [number, number] | null }> = ({ coords }) => {
  const map = useMap();
  React.useEffect(() => {
    if (coords) {
      map.panTo(coords, { animate: true });
    }
  }, [coords, map]);
  return null;
};

function calculateTotalDistanceKm(points: { latitude: number; longitude: number }[]): number {
  if (points.length < 2) return 0;
  let dist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const R = 6371; // Earth radius km
    const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
    const dLng = ((p2.longitude - p1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.latitude * Math.PI) / 180) *
        Math.cos((p2.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    dist += R * c;
  }
  return Number(dist.toFixed(2));
}

export const History: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const { users, routeHistory } = useMonitoring();

  // Priority default to online officer or user with active telemetry
  const firstActiveOfficer = users.find((u) => u.status === 'ACTIVE' || Boolean(u.current_location)) || users[0];
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId || '');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  const activeUserId = selectedUserId || firstActiveOfficer?.id || firstActiveOfficer?.officer_id || '';
  const selectedUser = users.find((u) => u.id === activeUserId || u.officer_id === activeUserId) || firstActiveOfficer;

  // Real database history state
  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch recorded breadcrumb trail from backend database
  React.useEffect(() => {
    const targetLookup = activeUserId || selectedUser?.officer_id || selectedUser?.id;
    if (!targetLookup) return;

    let cancelled = false;
    setIsLoadingHistory(true);

    locationsApi.getUserLocation(targetLookup, true, 100)
      .then((data) => {
        if (!cancelled && data?.history && Array.isArray(data.history) && data.history.length > 0) {
          const pts = data.history.map((h: any) => ({
            latitude: Number(h.latitude),
            longitude: Number(h.longitude),
            accuracy: h.accuracy || 5,
            speed: h.speed || 0,
            heading: h.heading || 0,
            timestamp: h.timestamp
              ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : 'Logged Fix',
          }));
          // chronological order (oldest to newest) for polyline
          setDbHistory(pts.reverse());
        } else if (!cancelled) {
          setDbHistory([]);
        }
      })
      .catch(() => {
        if (!cancelled) setDbHistory([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeUserId, selectedUser?.officer_id, selectedUser?.id]);

  // Live WebSocket in-memory points
  const liveWsPoints = (activeUserId && (
    routeHistory[activeUserId] ||
    (selectedUser?.officer_id && routeHistory[selectedUser.officer_id]) ||
    (selectedUser?.id && routeHistory[selectedUser.id])
  )) || [];

  // Fallback to single latest current_location fix if no breadcrumb history logged yet
  const fallbackSinglePoint = selectedUser?.current_location
    ? [
        {
          latitude: Number(selectedUser.current_location.latitude),
          longitude: Number(selectedUser.current_location.longitude),
          timestamp: selectedUser.current_location.last_updated
            ? new Date(selectedUser.current_location.last_updated).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : 'Current Live Fix',
          speed: selectedUser.current_location.speed || 0,
          accuracy: selectedUser.current_location.accuracy || 5,
        },
      ]
    : [];

  // Unified route points
  const routePoints = dbHistory.length > 0
    ? [...dbHistory, ...liveWsPoints]
    : liveWsPoints.length > 0
    ? liveWsPoints
    : fallbackSinglePoint;

  const polylineCoords: [number, number][] = routePoints.map((p) => [p.latitude, p.longitude]);
  const defaultCenter: [number, number] = polylineCoords[polylineCoords.length - 1] || polylineCoords[0] || [11.0168, 76.9558];

  const totalDistanceKm = calculateTotalDistanceKm(routePoints);
  const avgSpeed = routePoints.length
    ? (
        routePoints.reduce((acc, p) => acc + (p.speed || 0), 0) / routePoints.length
      ).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-wide">
          Geospatial Breadcrumb & Route History
        </h1>
        <p className="text-xs text-slate-400">
          Real-time GNSS route recorder, trajectory velocity audit, and patrol corridor telemetry.
        </p>
      </div>

      {/* Selector & KPI Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
        {/* User & Date Selection */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs">
            <User className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={activeUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-transparent text-white focus:outline-none text-xs font-semibold"
            >
              {users.map((u) => {
                const isOnline = u.status === 'ACTIVE' || Boolean(u.current_location);
                return (
                  <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                    {isOnline ? '🟢 [ONLINE] ' : '⚪ '}{u.full_name} ({u.officer_id || u.id})
                  </option>
                );
              })}
              <option value="device-live-primary" className="bg-slate-900 text-emerald-400 font-bold">
                🟢 [ONLINE] Active Field Unit (This Device) - Hardware GNSS
              </option>
            </select>
          </div>


          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none text-xs"
            />
          </div>
        </div>

        {/* Real-time Telemetry Summary Stats */}
        <div className="flex items-center space-x-6 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Recorded Distance
            </span>
            <span className="text-base font-bold text-white">{totalDistanceKm} km</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Status
            </span>
            <span className="text-base font-bold text-emerald-400">
              {routePoints.length > 0 ? 'Tracking Live' : 'Idle'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Current Speed
            </span>
            <span className="text-base font-bold text-blue-400">{avgSpeed} m/s</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Telemetry Fixes
            </span>
            <span className="text-base font-bold text-white">{routePoints.length}</span>
          </div>
        </div>
      </div>

      {/* Route Visualizer Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl h-[520px] relative">
          <MapContainer
            center={defaultCenter}
            zoom={16}
            style={{ width: '100%', height: '100%' }}
            attributionControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapAutoRecenter coords={polylineCoords[polylineCoords.length - 1] || null} />

            {/* Polyline Route Trail */}
            {polylineCoords.length > 1 && (
              <Polyline
                positions={polylineCoords}
                pathOptions={{
                  color: '#2563eb',
                  weight: 5,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            )}

            {/* Start Pin (Origin) */}
            {polylineCoords.length > 1 && (
              <Marker position={polylineCoords[0]} icon={startIcon}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-emerald-400 block">Patrol Route Origin (START)</span>
                    <span>Time: {routePoints[0]?.timestamp}</span>
                    <div>Lat/Lng: {polylineCoords[0][0].toFixed(5)}, {polylineCoords[0][1].toFixed(5)}</div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* End / Current Pin */}
            {polylineCoords.length >= 1 && (
              <Marker position={polylineCoords[polylineCoords.length - 1]} icon={endIcon}>
                <Popup>
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-blue-400 block">Latest Real-Time GNSS Fix</span>
                    <div>Officer: {selectedUser?.full_name || activeUserId}</div>
                    <span>Time: {routePoints[routePoints.length - 1]?.timestamp}</span>
                    <div>Lat/Lng: {polylineCoords[polylineCoords.length - 1][0].toFixed(5)}, {polylineCoords[polylineCoords.length - 1][1].toFixed(5)}</div>
                    <div>Speed: {routePoints[routePoints.length - 1]?.speed || 0} km/h</div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {routePoints.length === 0 && (
            <div className="absolute inset-0 z-[1000] bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <Radio className="w-10 h-10 text-blue-400 animate-pulse mb-3" />
              <h3 className="text-sm font-bold text-white mb-1">Awaiting GNSS Route Telemetry</h3>
              <p className="text-xs text-slate-400 max-w-md">
                Allow location access in your browser or connect a mobile transmitter. As your device
                moves, real satellite breadcrumbs will appear automatically on this OpenStreetMap view.
              </p>
            </div>
          )}
        </div>

        {/* Route Waypoints Milestone Timeline */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[520px] shadow-xl">
          <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Real-Time GNSS Fixes
              </h2>
              <p className="text-[11px] text-slate-400">Streamed from live device hardware</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {routePoints.length} points
            </span>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2.5 font-mono text-xs">
            {routePoints.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs font-sans">
                No GPS movements logged yet. Telemetry will stream live once active.
              </div>
            ) : (
              [...routePoints].reverse().map((pt, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 flex items-center justify-center font-bold text-[10px]">
                      {routePoints.length - idx}
                    </span>
                    <div>
                      <span className="text-white font-bold block">{pt.timestamp}</span>
                      <span className="text-[10px] text-slate-400 font-sans">
                        {pt.latitude.toFixed(5)}, {pt.longitude.toFixed(5)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-emerald-400 font-semibold">{pt.speed || 0} m/s</span>
                    <span className="text-[10px] text-slate-500 block font-sans">±{pt.accuracy || 6}m</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
