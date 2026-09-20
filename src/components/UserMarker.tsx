// ========================================================================
// PROFESSIONAL USER MARKER WITH HEADING ROTATION & STATUS STATES
// ========================================================================
import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { UserLocation, MarkerStatus } from '../types/location';
import { Navigation, ShieldCheck, AlertTriangle, Clock, Radio } from 'lucide-react';

interface UserMarkerProps {
  user: UserLocation;
  animatedPos?: { lat: number; lng: number; heading: number };
  isSelected: boolean;
  onSelect: (userId: string) => void;
}

export const UserMarker: React.FC<UserMarkerProps> = ({
  user,
  animatedPos,
  isSelected,
  onSelect,
}) => {
  const lat = animatedPos ? animatedPos.lat : user.latitude;
  const lng = animatedPos ? animatedPos.lng : user.longitude;
  const heading = animatedPos ? animatedPos.heading : user.heading || 0;

  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  // Determine visual state
  const status: MarkerStatus = useMemo(() => {
    if (user.accuracy > 50) return 'GPS ERROR';
    if (user.status === 'offline') return 'OFFLINE';
    if (user.last_seen_seconds_ago !== undefined && user.last_seen_seconds_ago > 30) {
      return 'OFFLINE';
    }
    if (user.last_seen_seconds_ago !== undefined && user.last_seen_seconds_ago > 10) {
      return 'RECENT';
    }
    return 'LIVE';
  }, [user.accuracy, user.status, user.last_seen_seconds_ago]);

  // Create custom DivIcon with heading arrow and status styling
  const customIcon = useMemo(() => {
    let colorClass = 'bg-emerald-500 text-emerald-400 border-emerald-400 shadow-emerald-500/50';
    let pulseHtml = '<span class="absolute -inset-1 rounded-full bg-emerald-500/40 animate-ping"></span>';

    if (status === 'RECENT') {
      colorClass = 'bg-amber-500 text-amber-400 border-amber-400 shadow-amber-500/50';
      pulseHtml = '';
    } else if (status === 'OFFLINE') {
      colorClass = 'bg-slate-500 text-slate-400 border-slate-400 shadow-slate-500/30';
      pulseHtml = '';
    } else if (status === 'GPS ERROR') {
      colorClass = 'bg-rose-600 text-rose-400 border-rose-400 shadow-rose-600/50';
      pulseHtml = '<span class="absolute -inset-1 rounded-full bg-rose-500/50 animate-ping"></span>';
    }

    const selectedRing = isSelected
      ? 'ring-4 ring-blue-500 ring-offset-2 ring-offset-slate-900 scale-110'
      : '';

    const html = `
      <div class="relative flex items-center justify-center cursor-pointer transition-all transform ${selectedRing}">
        ${pulseHtml}
        <div class="w-10 h-10 rounded-full ${colorClass} bg-slate-900 border-2 flex items-center justify-center shadow-xl relative z-10">
          <div style="transform: rotate(${heading}deg);" class="transition-transform duration-300 flex items-center justify-center">
            <svg class="w-5 h-5 text-current fill-current drop-shadow" viewBox="0 0 24 24">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
            </svg>
          </div>
        </div>
        <div class="absolute -bottom-6 bg-slate-900/90 text-[10px] font-mono font-bold text-white px-1.5 py-0.5 rounded border border-slate-700 shadow whitespace-nowrap pointer-events-none">
          ${user.user_id}
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-user-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -24],
    });
  }, [status, heading, isSelected, user.user_id]);

  return (
    <Marker
      position={[lat, lng]}
      icon={customIcon}
      eventHandlers={{
        click: () => onSelect(user.user_id),
      }}
    >
      <Popup className="custom-leaflet-popup">
        <div className="p-1 min-w-[220px] text-slate-100 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-2">
            <div>
              <div className="text-xs font-black tracking-wide text-white flex items-center gap-1.5">
                <span className="font-mono text-blue-400">{user.user_id}</span>
                {user.full_name && <span className="text-slate-300 font-normal">({user.full_name})</span>}
              </div>
              <span className="text-[10px] text-slate-400">{user.department || 'Field Operations'}</span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase border ${
                status === 'LIVE'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                  : status === 'RECENT'
                  ? 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                  : status === 'GPS ERROR'
                  ? 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {status}
            </span>
          </div>

          {/* Telemetry Metrics */}
          <div className="grid grid-cols-2 gap-2 text-xs py-1">
            <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block">GPS Accuracy</span>
              <span className="font-mono font-bold text-white">±{user.accuracy.toFixed(1)} m</span>
            </div>
            <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block">Speed</span>
              <span className="font-mono font-bold text-white">{user.speed.toFixed(1)} km/h</span>
            </div>
          </div>

          {/* Geofence & Coordinates */}
          <div className="space-y-1 mt-1 text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Geofence Status:</span>
              <span
                className={`font-bold font-mono ${
                  user.is_inside_geofence !== false ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {user.is_inside_geofence !== false ? 'INSIDE PERIMETER' : 'OUTSIDE BOUNDARY'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
              <span>Coordinates:</span>
              <span>
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Heading:</span>
              <span className="font-mono">{Math.round(heading)}° Azimuth</span>
            </div>
          </div>

          {/* Footer Last Updated */}
          <div className="text-[10px] text-slate-400 mt-2 text-right">
            Updated: {user.last_seen_seconds_ago !== undefined ? `${user.last_seen_seconds_ago} sec ago` : 'just now'}
          </div>
        </div>
      </Popup>
    </Marker>
  );
};
