import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { VideoCallModal } from '../common/VideoCallModal';
import { useMonitoring } from '../../context/MonitoringContext';

const routeTitleMap: Record<string, string> = {
  '/dashboard': 'Executive Overview',
  '/monitor': 'Real-Time Geospatial Monitor',
  '/projects': 'DoSJE Projects & Institutions',
  '/cctv': 'Live CCTV Surveillance Center',
  '/inspections': 'Surprise Inspections & AI Assignment',
  '/users': 'Personnel Directory',
  '/attendance': 'Muster Roll & Attendance',
  '/verification': 'Identity & Biometric Assurance',
  '/anomalies': 'AI Anomaly Detection & Risk Analysis',
  '/compliance': 'DoSJE Compliance & Audit Scoring',
  '/geofences': 'Geofence Operational Zones',
  '/alerts': 'Incident Dispatch Center',
  '/history': 'Breadcrumb Route History',
  '/analytics': 'Mission Analytics & Intelligence',
  '/reports': 'Official Intelligence & Audit Reports',
  '/audit-logs': 'Immutable Audit Ledger',
  '/settings': 'System Calibration & Parameters',
};

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { activeCall, endVideoCall } = useMonitoring();

  const currentTitle = routeTitleMap[location.pathname] || 'Government Monitoring Portal';

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          moduleTitle={currentTitle}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-slate-950">
          <Outlet />
        </main>
      </div>

      {/* Real-Time Video Call & Gemini AI Sentinel Modal */}
      <VideoCallModal call={activeCall} onEndCall={endVideoCall} />
    </div>
  );
};

