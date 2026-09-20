// ========================================================================
// OPERATIONAL STATUS CARDS COMPONENT (GOVERNMENT COMMAND CENTER)
// ========================================================================
import React from 'react';
import { TrackingStats } from '../types/location';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  CalendarCheck,
  Fingerprint,
  AlertTriangle,
  Radio,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';
import { useNotifications } from '../context/NotificationContext';

interface StatusCardsProps {
  stats?: TrackingStats;
}

export const StatusCards: React.FC<StatusCardsProps> = ({ stats }) => {
  const { users } = useMonitoring();
  const { alerts, activeCount } = useNotifications();

  // Calculated Real-Time Metrics matching Section 5 specifications:
  const totalUsers = users.length || stats?.totalUsers || 0;
  const insideCount = users.filter((u) => u.geofence_status === 'INSIDE').length;
  const outsideCount = users.filter((u) => u.geofence_status === 'OUTSIDE').length;
  
  const presentCount = users.filter(
    (u) => u.attendance_status === 'PRESENT'
  ).length;

  const verifiedToday = users.filter(
    (u) => u.verification?.overall === 'VERIFIED'
  ).length;

  const verificationFailures = users.filter(
    (u) => u.verification?.overall === 'FAILED'
  ).length;

  const totalAlerts = activeCount || alerts.filter((a) => a.status === 'ACTIVE').length || 0;
  
  const offlineDevices = users.filter((u) => u.status === 'OFFLINE').length || stats?.offlineCount || 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {/* 1. TOTAL USERS */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Total Users
          </span>
          <div className="p-1 rounded-md bg-blue-500/10 text-blue-400">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-white mt-1 font-mono">{totalUsers}</div>
        <div className="text-[9px] text-slate-400 truncate">Registered Enclave</div>
      </div>

      {/* 2. INSIDE GEOFENCE */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            Inside
          </span>
          <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-emerald-400 mt-1 font-mono">{insideCount}</div>
        <div className="text-[9px] text-slate-400 truncate">Within perimeter</div>
      </div>

      {/* 3. OUTSIDE GEOFENCE */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
            Outside
          </span>
          <div className="p-1 rounded-md bg-rose-500/10 text-rose-400">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-rose-400 mt-1 font-mono">{outsideCount}</div>
        <div className="text-[9px] text-slate-400 truncate">Boundary breach</div>
      </div>

      {/* 4. TODAY'S ATTENDANCE */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
            Attendance
          </span>
          <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400">
            <CalendarCheck className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-cyan-400 mt-1 font-mono">{presentCount}</div>
        <div className="text-[9px] text-slate-400 truncate">Muster active</div>
      </div>

      {/* 5. VERIFIED TODAY */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
            Verified
          </span>
          <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-indigo-400 mt-1 font-mono">{verifiedToday}</div>
        <div className="text-[9px] text-slate-400 truncate">Biometrics passed</div>
      </div>

      {/* 6. VERIFICATION FAILURES */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
            Failures
          </span>
          <div className="p-1 rounded-md bg-amber-500/10 text-amber-400">
            <Fingerprint className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-amber-400 mt-1 font-mono">{verificationFailures}</div>
        <div className="text-[9px] text-slate-400 truncate">Needs review</div>
      </div>

      {/* 7. ACTIVE ALERTS */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
            Alerts
          </span>
          <div className="p-1 rounded-md bg-red-500/10 text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-red-400 mt-1 font-mono">{totalAlerts}</div>
        <div className="text-[9px] text-slate-400 truncate">Critical dispatch</div>
      </div>

      {/* 8. OFFLINE DEVICES */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-md relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Offline
          </span>
          <div className="p-1 rounded-md bg-slate-800 text-slate-400">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-xl font-black text-slate-300 mt-1 font-mono">{offlineDevices}</div>
        <div className="text-[9px] text-slate-400 truncate">Signal timeout</div>
      </div>
    </div>
  );
};
