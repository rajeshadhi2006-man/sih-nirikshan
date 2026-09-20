// ========================================================================
// TRACKING PANEL HUD (COMMAND BAR WITH CONNECTION, GPS & SIMULATOR)
// ========================================================================
import React from 'react';
import { ConnectionState } from '../types/location';
import { Radio, Play, Square, Navigation, Crosshair, Route, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface TrackingPanelProps {
  connectionState: ConnectionState;
  connectionDetail?: string;
  syncSecondsAgo: number;
  selectedUserId: string | null;
  isLiveTracking: boolean;
  onStopFollowing: () => void;
  showRoute: boolean;
  onToggleRoute: () => void;
  isBrowserGpsActive: boolean;
  onToggleBrowserGps: () => void;
  onRefresh?: () => void;
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
  gpsErrorMessage?: string | null;
}

export const TrackingPanel: React.FC<TrackingPanelProps> = ({
  connectionState,
  connectionDetail,
  syncSecondsAgo,
  selectedUserId,
  isLiveTracking,
  onStopFollowing,
  showRoute,
  onToggleRoute,
  isBrowserGpsActive,
  onToggleBrowserGps,
  onRefresh,
  gpsErrorMessage,
}) => {
  return (
    <div className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none">
      <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        {/* Left Side: Connection & Sync Badges */}
        <div className="flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-2 rounded-xl shadow-xl">
          {/* Live indicator dot */}
          <div className="flex items-center space-x-1.5 border-r border-slate-800 pr-3">
            <span className="relative flex h-2.5 w-2.5">
              {connectionState === 'CONNECTED' ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </>
              ) : connectionState === 'RECONNECTING' ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              )}
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-white">
              LIVE CONNECTION
            </span>
          </div>

          {/* WebSocket Status */}
          <div className="text-[11px] font-mono flex items-center space-x-1.5">
            {connectionState === 'CONNECTED' ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5" /> WebSocket: CONNECTED
              </span>
            ) : connectionState === 'RECONNECTING' ? (
              <span className="text-amber-400 font-bold flex items-center gap-1 animate-pulse">
                <Radio className="w-3.5 h-3.5" /> {connectionDetail || 'RECONNECTING...'}
              </span>
            ) : (
              <span className="text-rose-400 font-bold flex items-center gap-1">
                <WifiOff className="w-3.5 h-3.5" /> CONNECTION LOST
              </span>
            )}
          </div>

          {/* Last Synchronization */}
          <div className="text-[10px] text-slate-400 pl-2 border-l border-slate-800 font-mono hidden md:block">
            Last sync: <span className="text-slate-200">{syncSecondsAgo}s ago</span>
          </div>
        </div>

        {/* Center / Right: Operational Action Buttons */}
        <div className="flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1.5 rounded-xl shadow-xl">
          {/* Live Follow Badge */}
          {selectedUserId && isLiveTracking && (
            <div className="flex items-center space-x-2 px-2.5 py-1 bg-blue-950/80 border border-blue-500/40 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
              <span className="text-[11px] text-blue-300 font-mono font-bold">
                Following: {selectedUserId}
              </span>
              <button
                onClick={onStopFollowing}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-bold px-2 py-0.5 rounded border border-slate-700 transition"
              >
                Stop
              </button>
            </div>
          )}

          {/* SHOW ROUTE Toggle */}
          <button
            onClick={onToggleRoute}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${
              showRoute
                ? 'bg-blue-600/90 border-blue-400/40 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Toggle recent movement polyline route for tracked users"
          >
            <Route className="w-3.5 h-3.5" />
            <span>SHOW ROUTE</span>
          </button>

          {/* BROWSER GPS Toggle */}
          <button
            onClick={onToggleBrowserGps}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${
              isBrowserGpsActive
                ? 'bg-emerald-600/90 border-emerald-400/40 text-white shadow-lg shadow-emerald-900/30 animate-pulse'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Beam this device's real hardware GPS fix directly into the live command map"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{isBrowserGpsActive ? 'STOP REAL GPS' : 'TRANSMIT REAL GPS'}</span>
          </button>

          {/* REAL-TIME SYNC Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Force real-time resynchronization with telemetry database"
            >
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>LIVE SYNC</span>
            </button>
          )}
        </div>
      </div>

      {/* GPS Error Notification if any */}
      {gpsErrorMessage && (
        <div className="mt-2 bg-rose-950/90 backdrop-blur border border-rose-600/60 p-2.5 rounded-xl shadow-xl flex items-center justify-between text-xs text-rose-200 pointer-events-auto max-w-xl">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{gpsErrorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};
