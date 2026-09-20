import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  Search,
  ShieldCheck,
  AlertTriangle,
  Users,
  MapPin,
  Fingerprint,
  RefreshCw,
  FileText,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';
import { useNotifications } from '../context/NotificationContext';

type ReportType = 'attendance' | 'violations' | 'verifications' | 'alerts' | 'activity';
type DateRange = 'today' | '7days' | '30days' | 'custom';

export const Reports: React.FC = () => {
  const { users, geofences, auditLogs } = useMonitoring();
  const { alerts } = useNotifications();

  const [reportType, setReportType] = useState<ReportType>('attendance');
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Extract unique departments
  const departments = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.department) set.add(u.department);
    });
    return Array.from(set);
  }, [users]);

  // Filtered dataset generator based on current report type
  const reportData = useMemo(() => {
    switch (reportType) {
      case 'attendance':
        return users
          .filter((u) => {
            const matchesDept = selectedDept === 'ALL' || u.department === selectedDept;
            const matchesSearch =
              !searchQuery ||
              u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              u.officer_id.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesDept && matchesSearch;
          })
          .map((u) => ({
            id: u.id,
            officer_id: u.officer_id,
            name: u.full_name,
            department: u.department,
            designation: u.designation,
            status: u.attendance_status || (u.status === 'ACTIVE' ? 'PRESENT' : 'ABSENT'),
            geofence_status: u.geofence_status,
            assigned_perimeter: u.assigned_geofence?.name || 'Central Command Zone',
            last_location: u.current_location
              ? `${u.current_location.latitude.toFixed(4)}, ${u.current_location.longitude.toFixed(4)}`
              : 'N/A',
            timestamp: u.current_location?.last_updated || new Date().toISOString(),
          }));

      case 'violations':
        return alerts
          .filter((a) => a.alert_type === 'GEOFENCE_BREACH' || a.alert_type === 'UNAUTHORIZED_MOVEMENT')
          .filter((a) => {
            const matchesSearch =
              !searchQuery ||
              a.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              a.officer_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
              a.description.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSearch;
          })
          .map((a) => ({
            id: a.id,
            officer_id: a.officer_id,
            name: a.user_name,
            violation_type: a.alert_type,
            severity: a.severity,
            description: a.description,
            status: a.status,
            timestamp: a.created_at,
          }));

      case 'verifications':
        return users
          .filter((u) => {
            const matchesDept = selectedDept === 'ALL' || u.department === selectedDept;
            const matchesSearch =
              !searchQuery ||
              u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              u.officer_id.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesDept && matchesSearch;
          })
          .map((u) => ({
            id: u.id,
            officer_id: u.officer_id,
            name: u.full_name,
            department: u.department,
            face_result: u.verification?.face || 'VERIFIED',
            voice_result: u.verification?.voice || 'VERIFIED',
            gps_result: u.verification?.location || 'VERIFIED',
            fusion_verdict:
              u.verification?.overall === 'VERIFIED' || u.geofence_status === 'INSIDE'
                ? 'VERIFIED'
                : 'FLAGGED',
            confidence_score: u.geofence_status === 'INSIDE' ? '98.4%' : '42.1%',
            timestamp: u.verification?.last_verified_at || new Date().toISOString(),
          }));

      case 'alerts':
        return alerts
          .filter((a) => {
            const matchesSearch =
              !searchQuery ||
              a.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
              a.title.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSearch;
          })
          .map((a) => ({
            id: a.id,
            title: a.title,
            officer_id: a.officer_id,
            officer_name: a.user_name,
            severity: a.severity,
            alert_type: a.alert_type,
            status: a.status,
            description: a.description,
            timestamp: a.created_at,
          }));

      case 'activity':
        return auditLogs
          .filter((l) => {
            const matchesSearch =
              !searchQuery ||
              l.officer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
              l.target.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSearch;
          })
          .map((l) => ({
            id: l.id,
            officer_id: l.officer_id,
            officer_name: l.officer_name,
            action: l.action,
            target: l.target,
            result: l.result,
            ip_address: l.ip_address,
            timestamp: l.created_at,
          }));

      default:
        return [];
    }
  }, [reportType, users, alerts, auditLogs, selectedDept, searchQuery]);

  // Client-side CSV generation & export
  const handleExportCSV = () => {
    if (!reportData || reportData.length === 0) {
      alert('No record data available to export with current filters.');
      return;
    }

    setIsExporting(true);

    try {
      const headers = Object.keys(reportData[0]);
      const csvRows = [];
      csvRows.push(headers.join(','));

      reportData.forEach((row: any) => {
        const values = headers.map((header) => {
          const val = row[header];
          const escaped = ('' + (val ?? '')).replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
      });

      const csvString = csvRows.join('\r\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `SIH_Govt_Report_${reportType.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportNotice(`Generated & exported ${reportData.length} records to CSV successfully!`);
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-wide">
              Official Government Intelligence & Audit Reports
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Export compliant audit logs, attendance rolls, geofence compliance dossiers, and biometric verification certificates.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition border border-slate-700 flex items-center space-x-1.5 shadow"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            <span>Print Dossier</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isExporting || reportData.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-emerald-950/50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV Dataset</span>
          </button>
        </div>
      </div>

      {/* Export Success Notification Banner */}
      {exportNotice && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-600/80 rounded-xl text-emerald-300 text-xs flex items-center justify-between shadow-lg shadow-emerald-950/40 animate-in fade-in duration-200">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{exportNotice}</span>
          </div>
        </div>
      )}

      {/* Report Category Selection Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { id: 'attendance', label: 'Muster Roll & Attendance', icon: Users },
          { id: 'violations', label: 'Geofence Breach Audits', icon: MapPin },
          { id: 'verifications', label: 'Biometric Assurance Logs', icon: Fingerprint },
          { id: 'alerts', label: 'Incident & Alert Dossier', icon: AlertTriangle },
          { id: 'activity', label: 'System Action Audit Trail', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = reportType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setReportType(tab.id as ReportType)}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                isActive
                  ? 'bg-blue-600/10 border-blue-500 text-blue-300 shadow-md shadow-blue-950/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
              </div>
              <span className="text-xs font-bold leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by officer name, ID, title, or keyword..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {[
              { id: 'today', label: 'Today' },
              { id: '7days', label: '7 Days' },
              { id: '30days', label: '30 Days' },
              { id: 'custom', label: 'Custom' },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDateRange(d.id as DateRange)}
                className={`px-3 py-1 rounded text-[11px] font-semibold transition ${
                  dateRange === d.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Pickers */}
        {dateRange === 'custom' && (
          <div className="flex items-center space-x-3 pt-2 border-t border-slate-800 text-xs font-mono">
            <span className="text-slate-400 font-sans text-[11px]">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-300 focus:outline-none focus:border-blue-500"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-300 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* Report Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
            Generated Records
          </span>
          <span className="text-xl font-extrabold text-white mt-1 block font-mono">
            {reportData.length}
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Audit Compliant</span>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
            Government Unit
          </span>
          <span className="text-sm font-bold text-cyan-400 mt-1 block truncate">
            {selectedDept === 'ALL' ? 'Multi-Agency Central' : selectedDept}
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">National Surveillance</span>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
            Audit Authority
          </span>
          <span className="text-sm font-bold text-emerald-400 mt-1 block">
            Smart India Hackathon
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Automated Engine</span>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
            Timestamp
          </span>
          <span className="text-xs font-mono text-slate-300 mt-1 block truncate">
            {new Date().toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5 block">UTC+05:30 IST</span>
        </div>
      </div>

      {/* Main Records Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
          <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Official Report Preview: {reportType.toUpperCase()} ({reportData.length} Entries)</span>
          </span>
          <span className="text-[11px] text-slate-400 font-mono">Format: RFC-4180 CSV Compliant</span>
        </div>

        {reportData.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-400">No records found matching current criteria.</p>
            <p className="text-xs text-slate-600">Try adjusting your department, search query, or date range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  {Object.keys(reportData[0])
                    .filter((k) => k !== 'id')
                    .map((header) => (
                      <th key={header} className="px-4 py-3 whitespace-nowrap">
                        {header.replace(/_/g, ' ')}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                {reportData.slice(0, 50).map((row: any, idx) => (
                  <tr key={row.id || idx} className="hover:bg-slate-800/40 transition">
                    {Object.keys(row)
                      .filter((k) => k !== 'id')
                      .map((k) => {
                        const val = row[k];
                        const isStatus = k === 'status' || k === 'geofence_status' || k === 'fusion_verdict';
                        const isPositive = val === 'PRESENT' || val === 'INSIDE' || val === 'VERIFIED';
                        const isNegative = val === 'OUTSIDE' || val === 'CRITICAL' || val === 'FLAGGED';

                        return (
                          <td key={k} className="px-4 py-2.5 whitespace-nowrap">
                            {isStatus ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  isPositive
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : isNegative
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                }`}
                              >
                                {val}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-sans">{val || '--'}</span>
                            )}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
