import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, AlertTriangle, CheckCircle2, Search, Filter, Cpu } from 'lucide-react';
import { fetchAnomalies, Anomaly } from '../api/anomalies';

export const Anomalies: React.FC = () => {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [indicator, setIndicator] = useState('OK');
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState('ALL');

  const loadData = async () => {
    setLoading(true);
    const res = await fetchAnomalies();
    setAnomalies(res.anomalies || []);
    setIndicator(res.indicator || 'INSUFFICIENT_DATA');
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = anomalies.filter((a) => riskFilter === 'ALL' || a.risk_level === riskFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <Cpu className="w-5 h-5 text-rose-400" />
            <span>AI Anomaly Detection & Threat Analysis</span>
          </h1>
          <p className="text-xs text-slate-400">
            Real-time pattern analysis evaluating GPS inconsistencies, CCTV downtime, proxy patterns, and inspection flags.
          </p>
        </div>

        <button
          onClick={loadData}
          className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Re-analyze</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-300">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>Risk Level:</span>
          {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRiskFilter(r)}
              className={`px-3 py-1 rounded-lg transition ${
                riskFilter === r ? 'bg-rose-600 text-white font-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <span className="text-xs font-mono text-cyan-400">
          Status: <span className="font-bold">{indicator}</span>
        </span>
      </div>

      {/* Anomalies List / Empty State */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {filtered.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 stroke-1" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider font-mono">
              {indicator === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : 'NO ANOMALIES DETECTED'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              All monitored field telemetry, CCTV heartbeats, and inspection patterns are operating within normal security parameters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((a) => (
              <div key={a.id} className="p-4 hover:bg-slate-800/40 transition space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className={`w-4 h-4 ${
                      a.risk_level === 'CRITICAL' ? 'text-rose-500 animate-pulse' : 'text-amber-400'
                    }`} />
                    <span className="font-bold text-white text-sm">{a.entity_name}</span>
                    <span className="text-[10px] font-mono text-slate-500">({a.entity_type})</span>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                    a.risk_level === 'CRITICAL' || a.risk_level === 'HIGH'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    {a.risk_level} RISK
                  </span>
                </div>

                <p className="text-xs text-slate-300 font-medium">{a.reason}</p>

                {a.recommended_action && (
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-cyan-300 font-mono">
                    <span className="font-bold text-cyan-400">Recommended Action: </span>
                    {a.recommended_action}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
