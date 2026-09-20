import React, { useState } from 'react';
import {
  FileText,
  Search,
  Shield,
  Clock,
  Terminal,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { exportToCSV } from '../lib/exportUtils';
import { StatusBadge } from '../components/common/Badge';
import { useMonitoring } from '../context/MonitoringContext';

export const AuditLogs: React.FC = () => {
  const { auditLogs } = useMonitoring();
  const [searchQuery, setSearchQuery] = useState('');
  const [resultFilter, setResultFilter] = useState('ALL');

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.officer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.target && log.target.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesResult = resultFilter === 'ALL' || log.result === resultFilter;
    return matchesSearch && matchesResult;
  });

  const handleExportCSV = () => {
    const exportRows = filteredLogs.map((l) => ({
      Timestamp: l.created_at,
      'Officer Name': l.officer_name,
      Action: l.action,
      Target: l.target || '',
      Result: l.result,
      'IP Address': l.ip_address || '',
    }));

    exportToCSV('GOV_IMMUTABLE_AUDIT_LOGS', exportRows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">
            Immutable Administrative Audit Ledger
          </h1>
          <p className="text-xs text-slate-400">
            Tamper-evident legal ledger of officer queries, geofence mutations, and security
            acknowledgements.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700 shadow"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit Manifest (CSV)</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search officer name, action or target..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs w-full sm:w-auto">
          <span className="text-slate-400">Result:</span>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Outcomes</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="DENIED">DENIED</option>
            <option value="FAILURE">FAILURE</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Cryptographic Event Log (Read-Only)
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Section 65B Certified</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Officer Name</th>
                <th className="px-4 py-3">Administrative Action</th>
                <th className="px-4 py-3">Action Target</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Network / Origin IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-xs">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3.5 text-slate-400">
                    {new Date(log.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>

                  <td className="px-4 py-3.5 font-sans font-bold text-white">
                    {log.officer_name}
                  </td>

                  <td className="px-4 py-3.5 text-blue-400 font-semibold">
                    {log.action}
                  </td>

                  <td className="px-4 py-3.5 font-sans text-slate-300">
                    {log.target || '--'}
                  </td>

                  <td className="px-4 py-3.5">
                    {log.result === 'SUCCESS' ? (
                      <span className="inline-flex items-center text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        SUCCESS
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-rose-400 font-bold">
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        {log.result}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-slate-400">
                    {log.ip_address || '10.14.88.21'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
