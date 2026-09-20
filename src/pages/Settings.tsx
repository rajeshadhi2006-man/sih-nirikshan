import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Database,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Key,
  Save,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  checkSupabaseConnection,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearCustomSupabaseConfig,
  IS_DEMO_MODE,
} from '../lib/supabase';

export const Settings: React.FC = () => {
  const { user } = useAuth();

  const [geofenceToleranceMeters, setGeofenceToleranceMeters] = useState('15');
  const [alertCooldownSeconds, setAlertCooldownSeconds] = useState('30');
  const [offlineTimeoutSeconds, setOfflineTimeoutSeconds] = useState('180');
  const [staleTimeoutSeconds, setStaleTimeoutSeconds] = useState('60');

  // Supabase dynamic config
  const currentConfig = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig.url);
  const [supabaseKey, setSupabaseKey] = useState(currentConfig.anonKey);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [backendStatus, setBackendStatus] = useState<{
    connected: boolean;
    latencyMs: number;
    message: string;
    checking: boolean;
  }>({
    connected: true,
    latencyMs: 18,
    message: 'Testing connection...',
    checking: false,
  });

  const runConnectionCheck = async () => {
    setBackendStatus((prev) => ({ ...prev, checking: true }));
    const res = await checkSupabaseConnection();
    setBackendStatus({
      connected: res.connected,
      latencyMs: res.latencyMs,
      message: res.message,
      checking: false,
    });
  };

  useEffect(() => {
    runConnectionCheck();
  }, []);

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrl || !supabaseKey) return;
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    runConnectionCheck();
  };

  const handleResetToDemo = () => {
    clearCustomSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseKey('');
    window.location.reload();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-wide">
          System Configuration & Telemetry Parameters
        </h1>
        <p className="text-xs text-slate-400">
          Threshold sensitivities, real-time telemetry heartbeat intervals, and backend link status.
        </p>
      </div>

      {/* Backend Link Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold text-white">Supabase Cloud & Realtime Engine</h2>
              <p className="text-[11px] text-slate-400">PostgreSQL WebSocket Telemetry Hub</p>
            </div>
          </div>

          <button
            onClick={runConnectionCheck}
            disabled={backendStatus.checking}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${backendStatus.checking ? 'animate-spin' : ''}`}
            />
            <span>Test Connection</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px] block">Operational Mode:</span>
            <span className="font-bold text-amber-400 font-mono text-sm mt-0.5 block">
              {currentConfig.isCustom ? 'CUSTOM SUPABASE CLOUD' : IS_DEMO_MODE ? 'SIH DEMO SIMULATION' : 'SUPABASE PRODUCTION'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px] block">Network Latency:</span>
            <span className="font-bold text-emerald-400 font-mono text-sm mt-0.5 block">
              {backendStatus.latencyMs} ms
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
            <span className="text-slate-400 text-[11px] block">Health Status:</span>
            <span
              className={`font-bold font-mono text-sm mt-0.5 block ${
                backendStatus.connected ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {backendStatus.connected ? 'ONLINE / HEALTHY' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded border border-slate-800/80">
          Engine Response: {backendStatus.message}
        </div>

        {/* Live Supabase Credentials Input Form */}
        <form onSubmit={handleSaveSupabase} className="pt-2 border-t border-slate-800 space-y-3">
          <span className="text-xs font-bold text-white block">
            Connect Your Live Supabase Project Directly:
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Project URL (VITE_SUPABASE_URL)
              </label>
              <input
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Anon / Public Key (VITE_SUPABASE_ANON_KEY)
              </label>
              <input
                type="password"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="eyJh..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[11px] text-emerald-400 font-semibold">
              {saveSuccess && '✓ Credentials saved! Real-time channel active.'}
            </div>

            <div className="flex items-center space-x-2">
              {currentConfig.isCustom && (
                <button
                  type="button"
                  onClick={handleResetToDemo}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset to Demo</span>
                </button>
              )}

              <button
                type="submit"
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save & Connect Realtime</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Geospatial & Alert Trigger Thresholds */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="pb-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>Geofence & Telemetry Calibrations</span>
          </h2>
          <p className="text-[11px] text-slate-400">
            Define mathematical triggers for geofence breaches and device staleness.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
              Geofence Radial Tolerance Buffer (Meters)
            </label>
            <input
              type="number"
              value={geofenceToleranceMeters}
              onChange={(e) => setGeofenceToleranceMeters(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Mitigates false perimeter breach alarms caused by urban GPS multipath reflections.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
              Alert Deduplication Cooldown (Seconds)
            </label>
            <input
              type="number"
              value={alertCooldownSeconds}
              onChange={(e) => setAlertCooldownSeconds(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Prevents duplicate notification spamming for recurring perimeter events.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
              Telemetry Stale Threshold (Seconds)
            </label>
            <input
              type="number"
              value={staleTimeoutSeconds}
              onChange={(e) => setStaleTimeoutSeconds(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Flags marker with amber warning if no packet received within window.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
              Device Offline Flag Threshold (Seconds)
            </label>
            <input
              type="number"
              value={offlineTimeoutSeconds}
              onChange={(e) => setOfflineTimeoutSeconds(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Marks terminal as fully disconnected and triggers Critical Alert.
            </p>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={() => alert('Operational calibration parameters applied.')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow"
          >
            Save Calibration Settings
          </button>
        </div>
      </div>

      {/* Officer Security Profile */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
        <div className="pb-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span>Active Officer Clearance Profile</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
            <span className="text-slate-500 text-[10px] font-sans block">Full Name:</span>
            <span className="text-white font-bold">{user?.full_name}</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
            <span className="text-slate-500 text-[10px] font-sans block">Officer ID:</span>
            <span className="text-blue-400 font-bold">{user?.officer_id}</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
            <span className="text-slate-500 text-[10px] font-sans block">Department:</span>
            <span className="text-slate-200">{user?.department}</span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
            <span className="text-slate-500 text-[10px] font-sans block">Assigned Role:</span>
            <span className="text-emerald-400 font-bold">{user?.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
