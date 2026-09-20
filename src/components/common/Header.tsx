import React, { useState } from 'react';
import {
  Bell,
  Radio,
  LogOut,
  Shield,
  Volume2,
  VolumeX,
  Play,
  Pause,
  AlertTriangle,
  Menu,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMonitoring } from '../../context/MonitoringContext';
import { useNotifications } from '../../context/NotificationContext';
import { EnrollmentModal } from '../EnrollmentModal';
import { Link, useLocation } from 'react-router-dom';

interface HeaderProps {
  moduleTitle: string;
  onToggleMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ moduleTitle, onToggleMobileSidebar }) => {
  const location = useLocation();
  const isGeofencePage = location.pathname === '/geofences';
  const { user, logout, isDemoMode } = useAuth();
  const { isLive, realtimeStatus, isSimulationActive, toggleSimulation, refreshData } = useMonitoring();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const {
    alerts,
    unreadCount,
    criticalCount,
    soundEnabled,
    setSoundEnabled,
    acknowledgeAlert,
  } = useNotifications();

  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-16 bg-slate-900/95 border-b border-slate-800 px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
      {/* Left: Mobile Toggle & Module Name */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2">
          <div className="h-7 w-1 bg-blue-500 rounded-full hidden sm:block"></div>
          <div>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest block leading-tight">
              National Command Center
            </span>
            <h1 className="text-base sm:text-lg font-bold text-white leading-tight">
              {moduleTitle}
            </h1>
          </div>
        </div>
      </div>

      {/* Right: Telemetry Status, Demo Control, Notifications & Officer Menu */}
      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Real Mode vs Demo Mode Indicator (Section 29) */}
        {!isDemoMode ? (
          <div className="flex items-center space-x-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] font-black text-emerald-400 tracking-widest uppercase">
              REAL MODE
            </span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-full border border-amber-500/30">
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              DEMO MODE
            </span>
            <button
              onClick={toggleSimulation}
              className={`p-1 rounded-full text-xs font-medium flex items-center transition ${
                isSimulationActive
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              title={isSimulationActive ? 'Pause GPS Telemetry Simulation' : 'Resume Telemetry'}
            >
              {isSimulationActive ? (
                <Pause className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Play className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </button>
          </div>
        )}

        {/* Realtime Live Indicator (Step 20) */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
            realtimeStatus === 'LIVE'
              ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
              : realtimeStatus === 'RECONNECTING'
              ? 'bg-amber-950/60 border-amber-800/80 text-amber-400'
              : 'bg-rose-950/60 border-rose-800/80 text-rose-400'
          }`}
          title={`Supabase Realtime Status: ${realtimeStatus}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              realtimeStatus === 'LIVE'
                ? 'bg-emerald-400 animate-pulse'
                : realtimeStatus === 'RECONNECTING'
                ? 'bg-amber-400 animate-ping'
                : 'bg-rose-500'
            }`}
          ></span>
          <span className="tracking-wider font-mono">
            {realtimeStatus === 'LIVE'
              ? 'SYSTEM LIVE'
              : realtimeStatus === 'RECONNECTING'
              ? 'RECONNECTING'
              : 'OFFLINE'}
          </span>
          <Radio className="w-3 h-3 ml-0.5 opacity-80" />
        </div>

        {/* Manual Refresh Web Data Button */}
        <button
          type="button"
          onClick={async () => {
            setIsRefreshing(true);
            if (refreshData) await refreshData();
            setTimeout(() => setIsRefreshing(false), 600);
          }}
          className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
          title="Refresh All Web Portal & Telemetry Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline font-mono">REFRESH</span>
        </button>

        {/* Enroll Personnel Button */}
        {!isGeofencePage && (
          <button
            type="button"
            onClick={() => setIsEnrollModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition"
            title="Enroll New Personnel & Calibrate Geofence"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ENROLL OFFICER</span>
          </button>
        )}

        {/* Sound Alarm Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`p-2 rounded-lg border transition ${
            soundEnabled
              ? 'text-slate-300 border-slate-700 hover:bg-slate-800'
              : 'text-slate-500 border-slate-800 hover:bg-slate-800/50'
          }`}
          title={soundEnabled ? 'Security Alarm Audio Enabled' : 'Alarm Audio Muted'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 relative transition"
            title="Active Operational Alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span
                className={`absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
                  criticalCount > 0 ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-sm text-white">Alert Dispatch</span>
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                    {unreadCount} Active
                  </span>
                </div>
                <Link
                  to="/alerts"
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  View All
                </Link>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 py-2">
                {alerts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No active security alerts</p>
                ) : (
                  alerts.slice(0, 4).map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-2.5 rounded-lg border text-xs ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                          : alert.severity === 'WARNING'
                          ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                          : 'bg-blue-950/40 border-blue-800/80 text-blue-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="font-semibold flex items-center space-x-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{alert.title}</span>
                        </div>
                        <span className="text-[10px] opacity-75">
                          {new Date(alert.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] opacity-90 line-clamp-2">{alert.description}</p>
                      {alert.status === 'ACTIVE' && (
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={() => acknowledgeAlert(alert.id, user?.full_name)}
                            className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-2 py-0.5 rounded font-medium transition"
                          >
                            Acknowledge
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Officer Profile Pill */}
        <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
          <div className="hidden sm:block text-right">
            <div className="text-xs font-semibold text-white leading-tight">
              {user?.full_name || 'Officer On Duty'}
            </div>
            <div className="text-[10px] text-blue-400 font-mono flex items-center justify-end space-x-1">
              <Shield className="w-2.5 h-2.5" />
              <span>{user?.role || 'OFFICER'}</span>
            </div>
          </div>

          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-700 to-indigo-500 border border-blue-400/50 flex items-center justify-center text-white font-bold text-xs shadow-md">
            {user?.full_name
              ? user.full_name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
              : 'GO'}
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
            title="Sign Out of Portal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Personnel & Geofence Enrollment Modal */}
      <EnrollmentModal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        onSuccess={() => {
          if (refreshData) refreshData();
        }}
      />
    </header>
  );
};
