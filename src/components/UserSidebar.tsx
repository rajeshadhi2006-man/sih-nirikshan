// ========================================================================
// GOVERNMENT MONITORING USER SIDEBAR COMPONENT
// ========================================================================
import React, { useState, useMemo } from 'react';
import { UserLocation, TrackingStats } from '../types/location';
import { Search, Navigation, Filter, UserCheck, AlertCircle, Crosshair, Video } from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';

interface UserSidebarProps {
  users: UserLocation[];
  stats: TrackingStats;
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
  isLiveTracking: boolean;
  onStopFollowing: () => void;
}

export const UserSidebar: React.FC<UserSidebarProps> = ({
  users,
  stats,
  selectedUserId,
  onSelectUser,
  isLiveTracking,
  onStopFollowing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'OFFLINE' | 'ERROR'>('ALL');
  const { initiateVideoCall } = useMonitoring();

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      const status = u.computed_status || (u.accuracy > 50 ? 'GPS ERROR' : u.status === 'offline' ? 'OFFLINE' : 'LIVE');

      if (statusFilter === 'LIVE') return status === 'LIVE' || status === 'RECENT';
      if (statusFilter === 'OFFLINE') return status === 'OFFLINE';
      if (statusFilter === 'ERROR') return status === 'GPS ERROR';
      return true;
    });
  }, [users, searchTerm, statusFilter]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-100 w-full sm:w-80 lg:w-96 shrink-0 select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-400" />
              <span>FIELD UNITS DIRECTORY</span>
            </h2>
            <p className="text-[11px] text-slate-400">Live GPS tracking and personnel status</p>
          </div>
        </div>

        {/* Live Follow Banner if active */}
        {selectedUserId && isLiveTracking && (
          <div className="p-2.5 rounded-xl bg-blue-950/60 border border-blue-500/40 flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              <div>
                <span className="text-[10px] font-bold text-blue-300 block leading-tight">LIVE TRACKING ACTIVE</span>
                <span className="text-xs font-mono font-bold text-white">{selectedUserId}</span>
              </div>
            </div>
            <button
              onClick={onStopFollowing}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-md border border-slate-700 transition"
            >
              Stop Following
            </button>
          </div>
        )}

        {/* Mini stats row */}
        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-mono font-bold">
          <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/60">
            <span className="text-slate-400 block text-[9px]">TOTAL</span>
            <span className="text-white text-xs">{stats.totalUsers}</span>
          </div>
          <div className="bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-500/30">
            <span className="text-emerald-400 block text-[9px]">LIVE</span>
            <span className="text-emerald-400 text-xs">{stats.liveCount}</span>
          </div>
          <div className="bg-slate-800/40 p-1.5 rounded-lg border border-slate-700/40">
            <span className="text-slate-400 block text-[9px]">OFFLINE</span>
            <span className="text-slate-300 text-xs">{stats.offlineCount}</span>
          </div>
          <div className="bg-rose-950/40 p-1.5 rounded-lg border border-rose-500/30">
            <span className="text-rose-400 block text-[9px]">ERROR</span>
            <span className="text-rose-400 text-xs">{stats.gpsErrorCount}</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search User ID or Officer Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8.5 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto text-[10px] font-bold">
          {(['ALL', 'LIVE', 'OFFLINE', 'ERROR'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === filter
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-slate-800/40">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            <UserCheck className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <span>No matching field personnel found.</span>
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isSelected = selectedUserId === u.user_id;
            const status =
              u.computed_status || (u.accuracy > 50 ? 'GPS ERROR' : u.status === 'offline' ? 'OFFLINE' : 'LIVE');

            let dotColor = 'bg-emerald-400';
            let dotPing = true;
            if (status === 'RECENT') {
              dotColor = 'bg-amber-400';
              dotPing = false;
            } else if (status === 'OFFLINE') {
              dotColor = 'bg-slate-500';
              dotPing = false;
            } else if (status === 'GPS ERROR') {
              dotColor = 'bg-rose-500';
              dotPing = true;
            }

            return (
              <div
                key={u.user_id}
                onClick={() => onSelectUser(u.user_id)}
                className={`p-3 rounded-xl cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-950/70 border border-blue-500/60 shadow-lg shadow-blue-950/40'
                    : 'bg-slate-950/50 hover:bg-slate-800/60 border border-slate-800/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="relative flex h-2.5 w-2.5">
                      {dotPing && (
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`}></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`}></span>
                    </span>

                    <div>
                      <span className="font-mono font-black text-xs text-white block">
                        ● {u.user_id}
                      </span>
                      {u.full_name && (
                        <span className="text-[11px] text-slate-300 block font-medium line-clamp-1">
                          {u.full_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        initiateVideoCall(u.user_id, false, 'OPERATOR_DISPATCH');
                      }}
                      className="p-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded border border-blue-500/30 transition"
                      title="Initiate Real-Time WebRTC Video Call & Gemini AI Vision"
                    >
                      <Video className="w-3.5 h-3.5 text-blue-400" />
                    </button>
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                        status === 'LIVE'
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                          : status === 'RECENT'
                          ? 'bg-amber-950/60 text-amber-400 border-amber-500/30'
                          : status === 'GPS ERROR'
                          ? 'bg-rose-950/60 text-rose-400 border-rose-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </div>

                {/* Sub-info: Accuracy, Speed, Updated X sec ago */}
                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{u.accuracy ? `${u.accuracy.toFixed(1)} m accuracy` : 'No accuracy'}</span>
                  <span>{u.speed ? `${u.speed.toFixed(1)} km/h` : '0 km/h'}</span>
                  <span>
                    {u.last_seen_seconds_ago !== undefined ? `Updated ${u.last_seen_seconds_ago}s ago` : 'Online'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
