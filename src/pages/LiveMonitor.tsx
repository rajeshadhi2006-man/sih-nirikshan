import React, { useState } from 'react';
import {
  Search,
  Filter,
  Shield,
  Radio,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Compass,
  ArrowRight,
  UserCheck,
  Maximize2,
  Sliders,
  LocateFixed,
  Send,
  Code2,
  Activity,
  Zap,
  UserPlus,
} from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';
import { useNotifications } from '../context/NotificationContext';
import { LiveMap } from '../components/map/LiveMap';
import { UserDetailsDrawer } from '../components/users/UserDetailsDrawer';
import { MonitoredUser } from '../types';
import { StatusBadge } from '../components/common/Badge';
import { formatTimeAgo, calculateDistanceMeters } from '../lib/geofence';
import { Modal } from '../components/common/Modal';
import { useSearchParams } from 'react-router-dom';
import { apiDispatchIntercept, apiVerifyBiometric } from '../lib/api';

type FilterType = 'ALL' | 'INSIDE' | 'OUTSIDE' | 'VERIFIED' | 'UNVERIFIED' | 'OFFLINE';

export const LiveMonitor: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialUserId = searchParams.get('user');

  const {
    users,
    geofences,
    selectedUser,
    selectedUserId,
    setSelectedUserId,
    triggerDemoBreach,
    restoreSafeGeofence,
    isSimulationActive,
    toggleSimulation,
    isLiveDeviceGpsActive,
    toggleLiveDeviceGps,
    liveDeviceGpsError,
    telemetryPacketCount,
    lastHeartbeat,
    broadcastLocationUpdate,
    routeHistory,
    addAuditLog,
    enrollOfficer,
  } = useMonitoring();

  const { addAlert } = useNotifications();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [inspectorUser, setInspectorUser] = useState<MonitoredUser | null>(null);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [dispatchBanner, setDispatchBanner] = useState<string | null>(null);

  // Enroll Form State
  const [newOfficerId, setNewOfficerId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDepartment, setNewDepartment] = useState('National Field Surveillance');
  const [newDesignation, setNewDesignation] = useState('Field Officer');

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficerId || !newFullName || !newEmail) return;

    const ok = await enrollOfficer({
      officer_id: newOfficerId.trim(),
      full_name: newFullName.trim(),
      email: newEmail.trim(),
      department: newDepartment.trim(),
      designation: newDesignation.trim(),
    });

    if (ok) {
      setIsEnrollModalOpen(false);
      setNewOfficerId('');
      setNewFullName('');
      setNewEmail('');
    }
  };

  const handleDispatchIntercept = async () => {
    try {
      const res = await apiDispatchIntercept(selectedUserId || undefined);
      if (res.success) {
        const bannerText = `Dispatched ${res.dispatched_officer} to intercept ${res.target_officer}. Vector: ${res.distance_meters}m | ETA: ~${res.eta_minutes} min.`;
        setDispatchBanner(bannerText);
        setTimeout(() => setDispatchBanner(null), 10000);
      }
    } catch (err: any) {
      console.warn('Dispatch API error:', err);
    }
  };

  const handleSimulateSpoof = async () => {
    const target = selectedUser || users[0];
    if (!target) return;
    try {
      await apiVerifyBiometric(target.id, 'FACE', true);
    } catch (err) {
      console.warn('Simulate spoof error:', err);
    }
  };

  // Manual coordinate sender state
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');

  React.useEffect(() => {
    if (selectedUser?.current_location && !customLat) {
      setCustomLat(selectedUser.current_location.latitude.toFixed(5));
      setCustomLng(selectedUser.current_location.longitude.toFixed(5));
    }
  }, [selectedUser, customLat]);

  // Set initial selected user from URL if provided
  React.useEffect(() => {
    if (initialUserId) {
      setSelectedUserId(initialUserId);
    }
  }, [initialUserId, setSelectedUserId]);

  // Filtering logic
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.officer_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.department.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    switch (activeFilter) {
      case 'INSIDE':
        return user.geofence_status === 'INSIDE';
      case 'OUTSIDE':
        return user.geofence_status === 'OUTSIDE';
      case 'VERIFIED':
        return user.verification?.overall === 'VERIFIED';
      case 'UNVERIFIED':
        return user.verification?.overall !== 'VERIFIED';
      case 'OFFLINE':
        return user.status === 'OFFLINE' || user.status === 'STALE';
      default:
        return true;
    }
  });

  const handleSendManualPing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    broadcastLocationUpdate(
      selectedUserId,
      parseFloat(customLat),
      parseFloat(customLng),
      5.0,
      1.5,
      90
    );
  };

  return (
    <div className="space-y-4">
      {/* Real-Time Telemetry Control Center Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        {/* Left: Telemetry Health Indicators */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono font-bold text-white tracking-wider">REAL-TIME TELEMETRY</span>
            <span className="text-slate-500 font-mono">|</span>
            <span className="text-emerald-400 font-mono font-semibold">
              {telemetryPacketCount} Pings Received
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 text-slate-400 font-mono">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>Tick: 1.8s</span>
          </div>
        </div>

        {/* Right: Live Hardware GPS & Presentation Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Connect Phone GPS Modal Toggle */}
          <button
            onClick={() => setIsPhoneModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-950 border border-blue-400/40"
            title="Connect your smartphone to transmit physical GPS to this map"
          >
            <span>📱 Connect Phone GPS</span>
          </button>

          {/* Hardware Device GPS Stream Button */}
          <button
            onClick={toggleLiveDeviceGps}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border shadow ${
              isLiveDeviceGpsActive
                ? 'bg-emerald-600 text-white border-emerald-400 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Streams your computer/phone real-world GPS position directly onto the map"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>{isLiveDeviceGpsActive ? 'Streaming Device GPS' : 'Use Device Live GPS'}</span>
          </button>

          {/* Continuous Movement Toggle */}
          <button
            onClick={toggleSimulation}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
              isSimulationActive
                ? 'bg-blue-950/80 text-blue-300 border-blue-800 hover:bg-blue-900/60'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggles automated natural field movement simulation"
          >
            {isSimulationActive ? 'Live Drift Active' : 'Drift Paused'}
          </button>

          {/* Enroll Field Officer Button */}
          <button
            onClick={() => setIsEnrollModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border border-emerald-400/40 shadow-md shadow-emerald-950"
            title="Dynamically enroll a new personnel into the Python database"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Enroll Officer</span>
          </button>

          {/* Breach Trigger Button */}
          <button
            onClick={() => triggerDemoBreach(selectedUserId || 'usr-1024')}
            className="px-3 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border border-rose-400/40 shadow-md shadow-rose-900/30"
            title="Simulates an instant geofence breach on the active personnel"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Simulate Breach</span>
          </button>

          {/* Tactical Intercept Dispatch Button */}
          <button
            onClick={handleDispatchIntercept}
            className="px-3 py-1.5 bg-amber-600/90 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border border-amber-400/40 shadow-md shadow-amber-900/30"
            title="Automatically dispatches the nearest active unit to intercept the breach"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Dispatch Intercept</span>
          </button>

          {/* AI Biometric Anti-Spoof Test */}
          <button
            onClick={handleSimulateSpoof}
            className="px-3 py-1.5 bg-purple-600/90 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border border-purple-400/40 shadow-md shadow-purple-900/30"
            title="Simulates 3D passive depth anti-spoofing attack detection"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Test AI Anti-Spoof</span>
          </button>

          <button
            onClick={() => restoreSafeGeofence(selectedUserId || 'usr-1024')}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition border border-slate-700"
            title="Resets personnel back to safe perimeter"
          >
            Reset
          </button>

          {/* API / Flutter helper */}
          <button
            onClick={() => setIsApiModalOpen(true)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg border border-slate-700 transition"
            title="View Real-Time API / Flutter Mobile Payload Specs"
          >
            <Code2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tactical Dispatch Notification Banner */}
      {dispatchBanner && (
        <div className="p-3 bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border border-amber-600/70 rounded-xl text-xs text-amber-200 flex items-center justify-between shadow-2xl animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-amber-300 block uppercase tracking-wider text-[11px]">
                Tactical Unit In-Transit
              </span>
              <span>{dispatchBanner}</span>
            </div>
          </div>
          <button
            onClick={() => setDispatchBanner(null)}
            className="text-[11px] font-bold px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded border border-amber-500/40 text-amber-300"
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* GPS Warning if error */}
      {liveDeviceGpsError && (
        <div className="p-3 bg-amber-950/60 border border-amber-800 rounded-lg text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{liveDeviceGpsError}</span>
          </div>
          <button
            onClick={() => toggleLiveDeviceGps()}
            className="text-[11px] underline text-amber-200 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split Interface: 70% OpenStreetMap Map + 30% Active Users List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-14rem)] min-h-[580px]">
        {/* Left Map View: 65% - 70% (8 Cols on Desktop) */}
        <div className="lg:col-span-8 h-full">
          <LiveMap
            users={users}
            geofences={geofences}
            selectedUser={selectedUser}
            onSelectUser={(user) => setSelectedUserId(user.id)}
            onOpenDetails={(user) => setInspectorUser(user)}
            routeHistory={routeHistory}
          />
        </div>

        {/* Right Active Users List: 30% - 35% (4 Cols on Desktop) */}
        <div className="lg:col-span-4 h-full bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-xl">
          {/* Header & Search */}
          <div className="p-3.5 border-b border-slate-800 space-y-3 bg-slate-950/60">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">Active Field Users</h2>
                <p className="text-[11px] text-slate-400">
                  {filteredUsers.length} of {users.length} displaying
                </p>
              </div>
              <span className="text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800/80 px-2 py-0.5 rounded">
                Live Stream
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user, ID or department..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'INSIDE', label: 'Inside Geofence' },
                  { id: 'OUTSIDE', label: 'Outside Geofence' },
                  { id: 'VERIFIED', label: 'Verified' },
                  { id: 'OFFLINE', label: 'Offline/Stale' },
                ] as { id: FilterType; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-2 py-0.5 rounded font-medium transition ${
                    activeFilter === f.id
                      ? 'bg-blue-600 text-white font-semibold shadow'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* User Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No personnel match the selected filters.
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedUserId === user.id;

                return (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                        : user.geofence_status === 'OUTSIDE'
                        ? 'bg-rose-950/30 border-rose-800/80 hover:border-rose-600'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            user.geofence_status === 'OUTSIDE'
                              ? 'bg-rose-500 animate-ping'
                              : user.status === 'ACTIVE'
                              ? 'bg-emerald-400 animate-pulse'
                              : 'bg-slate-500'
                          }`}
                        />
                        <div>
                          <h3 className="text-xs font-bold text-white leading-tight">
                            {user.full_name}
                          </h3>
                          <span className="text-[10px] text-blue-400 font-mono">
                            ID: {user.officer_id}
                          </span>
                        </div>
                      </div>

                      <StatusBadge status={user.geofence_status} size="sm" />
                    </div>

                    {/* Card Details */}
                    <div className="mt-2 text-[11px] text-slate-300 space-y-1 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Location:</span>
                        <span className="text-slate-200">
                          {user.geofence_status === 'INSIDE'
                            ? 'Inside Authorized Area'
                            : user.geofence_status === 'OUTSIDE'
                            ? '⚠ PERIMETER BREACH'
                            : 'Unknown'}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Coordinates:</span>
                        <span className="text-slate-300">
                          {user.current_location
                            ? `${user.current_location.latitude.toFixed(4)}, ${user.current_location.longitude.toFixed(4)}`
                            : '--'}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Accuracy / Speed:</span>
                        <span className="text-emerald-400">
                          ~{user.current_location?.accuracy || '--'} m |{' '}
                          {user.current_location?.speed || 0} m/s
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400 font-sans">Last update:</span>
                        <span className="text-amber-400 font-semibold">
                          {user.current_location
                            ? formatTimeAgo(user.current_location.last_updated)
                            : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-sans truncate max-w-[150px]">
                        {user.department}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUserId(user.id);
                          setInspectorUser(user);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-bold transition flex items-center gap-1 border border-slate-700"
                      >
                        <span>View</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Side Inspection Drawer */}
      <UserDetailsDrawer user={inspectorUser} onClose={() => setInspectorUser(null)} />

      {/* Developer Telemetry Debug Panel (Government Technical Oversight) */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-sans">
              Dev Diagnostics:
            </span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Realtime Status: CONNECTED
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-400">
            <span>
              Last GPS Received:{' '}
              <strong className="text-amber-400">
                {selectedUser?.current_location
                  ? formatTimeAgo(selectedUser.current_location.last_updated)
                  : 'just now'}
              </strong>
            </span>
            <span>
              Latitude:{' '}
              <strong className="text-white">
                {selectedUser?.current_location?.latitude.toFixed(5) || '11.0168'}
              </strong>
            </span>
            <span>
              Longitude:{' '}
              <strong className="text-white">
                {selectedUser?.current_location?.longitude.toFixed(5) || '76.9558'}
              </strong>
            </span>
            <span>
              Accuracy:{' '}
              <strong className="text-emerald-400">
                ~{selectedUser?.current_location?.accuracy || 8}m
              </strong>
            </span>
            <span>
              Events Received: <strong className="text-blue-400">{telemetryPacketCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Flutter & Supabase Telemetry Specs Modal */}
      <Modal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        title="Flutter Mobile App Real-Time Telemetry Specification"
        subtitle="Connect Flutter geolocation stream to this Supabase Command Center"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300">
            The dashboard receives live real-time location updates via Supabase WebSocket channels.
            In your Flutter mobile application, stream telemetry using either of these two methods:
          </p>

          <div>
            <span className="font-bold text-blue-400 uppercase tracking-wider text-[11px] block mb-1">
              Method 1: Supabase Realtime Broadcast (Zero DB Latency)
            </span>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto">
{`// In your Flutter Dart service:
final channel = supabase.channel('realtime_command_center');
await channel.subscribe();

// On every GPS position change:
channel.sendBroadcastMessage(
  event: 'location_update',
  payload: {
    'user_id': currentUser.id,
    'latitude': position.latitude,
    'longitude': position.longitude,
    'accuracy': position.accuracy,
    'speed': position.speed,
    'heading': position.heading,
  },
);`}
            </pre>
          </div>

          <div>
            <span className="font-bold text-blue-400 uppercase tracking-wider text-[11px] block mb-1">
              Method 2: Standard Database Table Insert
            </span>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 font-mono text-[11px] overflow-x-auto">
{`// Insert into location_updates:
await supabase.from('location_updates').insert({
  'user_id': 'usr-1024',
  'latitude': position.latitude,
  'longitude': position.longitude,
  'accuracy': position.accuracy,
  'speed': position.speed,
  'heading': position.heading,
});`}
            </pre>
          </div>

          {/* Quick Manual Test Sender */}
          <div className="pt-3 border-t border-slate-800">
            <span className="font-bold text-white block mb-2">
              Send Manual Real-Time Telemetry Packet Now:
            </span>
            <form onSubmit={handleSendManualPing} className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                placeholder="Latitude"
                className="w-32 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-white"
              />
              <input
                type="number"
                step="any"
                value={customLng}
                onChange={(e) => setCustomLng(e.target.value)}
                placeholder="Longitude"
                className="w-32 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-white"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Inject GPS</span>
              </button>
            </form>
          </div>
        </div>
      </Modal>

      {/* Connect Phone GPS Modal */}
      <Modal
        isOpen={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
        title="Connect Physical Smartphone to Live Map"
        subtitle="Stream real physical phone GPS directly to this OpenStreetMap dashboard"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300">
            You can transmit your phone's real, physical GPS coordinates directly to this command
            center.
          </p>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block">
              Step 1: Open on Your Smartphone (Connected to Same Wi-Fi)
            </span>
            <div className="p-2 bg-slate-900 border border-slate-700 rounded text-amber-400 font-mono text-xs break-all select-all">
              {window.location.origin}/transmitter
            </div>
            <p className="text-[11px] text-slate-400">
              Open this link on any mobile phone browser to transmit live GPS!
            </p>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
              Step 2: Instant Browser Testing on this PC
            </span>
            <button
              type="button"
              onClick={() => window.open('/transmitter', '_blank', 'width=420,height=680')}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition shadow"
            >
              Open Mobile Phone Transmitter in Pop-Up Window
            </button>
            <p className="text-[11px] text-slate-400">
              In the opened window, click <strong>"Start Transmitting My Real GPS"</strong>. As your
              hardware updates, this dashboard map marker will immediately move in real time!
            </p>
          </div>
        </div>
      </Modal>

      {/* Dynamic Enroll Officer Modal (Python Backend Sync) */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title="Enroll New Personnel into Python Database"
        subtitle="Registers officer profile dynamically into SQLite/PostgreSQL backend"
        maxWidth="md"
      >
        <form onSubmit={handleEnrollSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Officer Government ID</label>
            <input
              type="text"
              value={newOfficerId}
              onChange={(e) => setNewOfficerId(e.target.value)}
              placeholder="e.g. GOV-DL-5521"
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Full Name & Title</label>
            <input
              type="text"
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="e.g. Inspector Vikram Malhotra"
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Official Email Address</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. vikram.malhotra@nic.in"
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Department</label>
              <input
                type="text"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Designation</label>
              <input
                type="text"
                value={newDesignation}
                onChange={(e) => setNewDesignation(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsEnrollModalOpen(false)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow"
            >
              Enroll into System
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

