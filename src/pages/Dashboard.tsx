// ========================================================================
// ENTERPRISE GOVERNMENT GPS MONITORING DASHBOARD
// ========================================================================
import React, { useMemo } from 'react';
import { useLiveLocations } from '../hooks/useLiveLocations';
import { StatusCards } from '../components/StatusCards';
import { UserSidebar } from '../components/UserSidebar';
import { TrackingPanel } from '../components/TrackingPanel';
import { LiveMap } from '../components/LiveMap';
import { Shield, Sparkles, AlertTriangle } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {
    usersList,
    animatedCoords,
    historyMap,
    geofences,
    selectedUserId,
    isLiveTracking,
    showRoute,
    setShowRoute,
    connectionState,
    connectionDetail,
    syncSecondsAgo,
    stats,
    isBrowserGpsActive,
    isSimulating,
    gpsErrorMessage,
    selectUser,
    stopFollowing,
    toggleBrowserGps,
    toggleSimulation,
    refreshLocations,
  } = useLiveLocations();

  // Calculate distance for active/selected user's route history
  const activeUserId = selectedUserId || usersList[0]?.user_id || '';
  const activeRoutePoints = (activeUserId && historyMap.get(activeUserId)) || [];

  const activeRouteDistanceKm = useMemo(() => {
    if (activeRoutePoints.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < activeRoutePoints.length - 1; i++) {
      const p1 = activeRoutePoints[i];
      const p2 = activeRoutePoints[i + 1];
      const R = 6371; // Earth radius in km
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
  }, [activeRoutePoints]);

  const activeSpeed = useMemo(() => {
    if (activeRoutePoints.length > 0) {
      return activeRoutePoints[activeRoutePoints.length - 1].speed.toFixed(1);
    }
    const user = usersList.find((u) => u.user_id === activeUserId);
    return user ? user.speed.toFixed(1) : '0.0';
  }, [activeRoutePoints, usersList, activeUserId]);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] space-y-3">
      {/* Top Government Mission Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl shrink-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-widest flex items-center gap-1">
              <Shield className="w-3 h-3" />
              National Command Directorate
            </span>
            <span className="text-xs text-slate-400 font-mono">Real-Time Telemetry Kernel v2.0</span>
          </div>
          <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
            Live Field Location & Geofence Verification Console
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl">
            Rapido/Uber-style sub-second GPS tracking with native device geolocation, server-side circular
            geofence boundary evaluation, and automated tactical intercept vectors.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="px-3 py-1 bg-emerald-950/70 border border-emerald-600/70 text-emerald-300 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            SIH COMMAND ACTIVE
          </span>
        </div>
      </div>

      {/* 8 Mission Status Metric KPI Cards */}
      <div className="shrink-0">
        <StatusCards stats={stats} />
      </div>

      {/* Geospatial Breadcrumb & Route History KPI Strip (from History Page) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md shrink-0">
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
            <span className="font-bold text-white">Route History Track:</span>
            <span className="font-mono text-blue-300 font-bold">{activeUserId || 'All Field Units'}</span>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Active GNSS Waypoint Trail & Real-Time Velocity Audit
          </span>
        </div>

        <div className="flex items-center space-x-6 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Recorded Distance
            </span>
            <span className="text-sm font-bold text-white">{activeRouteDistanceKm} km</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Status
            </span>
            <span className="text-sm font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {isBrowserGpsActive || activeRoutePoints.length > 0 || usersList.some((u) => u.status === 'online') ? 'Tracking Live' : 'Active Telemetry Standby'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Current Speed
            </span>
            <span className="text-sm font-bold text-blue-400">{activeSpeed} km/h</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-sans">
              Telemetry Fixes
            </span>
            <span className="text-sm font-bold text-white">{activeRoutePoints.length} pings</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Map & Sidebar Grid */}
      <div className="flex-1 flex flex-col md:flex-row rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 min-h-[550px] relative">
        {/* User Directory Sidebar */}
        <UserSidebar
          users={usersList}
          stats={stats}
          selectedUserId={selectedUserId}
          onSelectUser={(uId) => selectUser(uId, true)}
          isLiveTracking={isLiveTracking}
          onStopFollowing={stopFollowing}
        />

        {/* Map Viewport with HUD Controls */}
        <div className="flex-1 relative h-full w-full">
          {/* Tracking Panel HUD */}
          <TrackingPanel
            connectionState={connectionState}
            connectionDetail={connectionDetail}
            syncSecondsAgo={syncSecondsAgo}
            selectedUserId={selectedUserId}
            isLiveTracking={isLiveTracking}
            onStopFollowing={stopFollowing}
            showRoute={showRoute}
            onToggleRoute={() => setShowRoute((prev) => !prev)}
            isBrowserGpsActive={isBrowserGpsActive}
            onToggleBrowserGps={() => toggleBrowserGps('device-live-primary')}
            onRefresh={refreshLocations}
            gpsErrorMessage={gpsErrorMessage}
          />

          {/* Leaflet + OpenStreetMap Canvas */}
          <LiveMap
            users={usersList}
            animatedCoords={animatedCoords}
            historyMap={historyMap}
            geofences={geofences}
            selectedUserId={selectedUserId}
            onSelectUser={(uId) => selectUser(uId, true)}
            isLiveTracking={isLiveTracking}
            showRoute={showRoute}
          />
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
