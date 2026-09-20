import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Users,
  CalendarCheck,
  Fingerprint,
  ShieldAlert,
  Route,
  BarChart3,
  FileText,
  FileSpreadsheet,
  Settings,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  UserCheck,
  Building2,
  Video,
  Cpu,
  ShieldCheck,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { criticalCount, unreadCount } = useNotifications();
  const { isDemoMode } = useAuth();

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/monitor', label: 'Live Monitor', icon: MapPin, highlight: true },
    { to: '/projects', label: 'Projects & Institutes', icon: Building2 },
    { to: '/cctv', label: 'CCTV Surveillance', icon: Video },
    { to: '/inspections', label: 'Surprise Inspections', icon: ShieldAlert },
    { to: '/users', label: 'Persons', icon: Users },
    { to: '/geofences', label: 'Geofences', icon: Layers },
    { to: '/assignments', label: 'Assignments', icon: UserCheck },
    { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { to: '/verification', label: 'Verification', icon: Fingerprint },
    { to: '/anomalies', label: 'Anomaly Detection', icon: Cpu },
    { to: '/compliance', label: 'Compliance', icon: ShieldCheck },
    {
      to: '/alerts',
      label: 'Alerts',
      icon: ShieldAlert,
      badge: unreadCount > 0 ? unreadCount : null,
      badgeCritical: criticalCount > 0,
    },
    { to: '/history', label: 'Location History', icon: Route },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/reports', label: 'Reports', icon: FileSpreadsheet },
    { to: '/audit-logs', label: 'Audit Logs', icon: FileText },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm transition-opacity"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 lg:static flex flex-col bg-slate-950 border-r border-slate-800 transition-all duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand / Emblem Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center space-x-3 overflow-hidden">
            {/* Government Emblem Symbol */}
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 via-blue-600/20 to-emerald-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>

            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 leading-tight">
                  Govt. of India
                </span>
                <span className="text-sm font-bold text-white tracking-wide leading-tight">
                  MONITOR PORTAL
                </span>
              </div>
            )}
          </div>

          {/* Collapse Toggle Button (Desktop Only) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-lg font-medium text-xs transition-all duration-150 group relative ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-900/40 border border-blue-500/50'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`w-4 h-4 shrink-0 transition ${
                        collapsed ? 'mx-auto' : 'mr-3'
                      } ${isActive ? 'text-white' : item.highlight ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'}`}
                    />

                    {!collapsed && (
                      <span className="truncate flex-1 tracking-wide">{item.label}</span>
                    )}

                    {/* Alert Badge */}
                    {item.badge !== undefined && item.badge !== null && !collapsed && (
                      <span
                        className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white ${
                          item.badgeCritical ? 'bg-rose-600 animate-pulse' : 'bg-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {/* Tooltip for collapsed view */}
                    {collapsed && (
                      <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded-md shadow-xl border border-slate-700 opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50">
                        {item.label}
                        {item.badge ? ` (${item.badge})` : ''}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom System Status */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80">
          {!collapsed ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Security Engine</span>
                <span className="flex items-center text-emerald-400 font-mono text-[10px]">
                  <CircleDot className="w-2.5 h-2.5 mr-1 animate-pulse" />
                  ONLINE
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                <span>Mode: {isDemoMode ? 'SIH DEMO' : 'SUPABASE'}</span>
                <span>v2.4.0</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title="Security Engine Active">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
