import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { MonitoringProvider } from './context/MonitoringContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LiveMonitor } from './pages/LiveMonitor';
import { Users } from './pages/Users';
import { Attendance } from './pages/Attendance';
import { Verification } from './pages/Verification';
import { Geofences } from './pages/Geofences';
import { Assignments } from './pages/Assignments';
import { Alerts } from './pages/Alerts';
import { History } from './pages/History';
import { Analytics } from './pages/Analytics';
import { Reports } from './pages/Reports';
import { AuditLogs } from './pages/AuditLogs';
import { Settings } from './pages/Settings';
import { MobileTransmitter } from './pages/MobileTransmitter';
import { CCTVBroadcaster } from './pages/CCTVBroadcaster';

import { Projects } from './pages/Projects';
import { CCTV } from './pages/CCTV';
import { Inspections } from './pages/Inspections';
import { Anomalies } from './pages/Anomalies';
import { Compliance } from './pages/Compliance';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <MonitoringProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/transmitter" element={<MobileTransmitter />} />
              <Route path="/cctv-broadcaster" element={<CCTVBroadcaster />} />
              <Route path="/cctv-transmitter" element={<CCTVBroadcaster />} />

              {/* Protected Command Center Routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/monitor" element={<LiveMonitor />} />
                  <Route path="/monitoring" element={<LiveMonitor />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/cctv" element={<CCTV />} />
                  <Route path="/inspections" element={<Inspections />} />
                  <Route path="/anomalies" element={<Anomalies />} />
                  <Route path="/compliance" element={<Compliance />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/geofences" element={<Geofences />} />
                  <Route path="/assignments" element={<Assignments />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/verification" element={<Verification />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/audit-logs" element={<AuditLogs />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </MonitoringProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
