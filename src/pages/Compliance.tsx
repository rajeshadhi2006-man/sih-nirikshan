import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Award, CheckCircle2, AlertTriangle, Building2 } from 'lucide-react';
import { fetchCompliance, ProjectCompliance } from '../api/anomalies';

export const Compliance: React.FC = () => {
  const [complianceList, setComplianceList] = useState<ProjectCompliance[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchCompliance();
    setComplianceList(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>DoSJE Compliance & Audit Scoring</span>
          </h1>
          <p className="text-xs text-slate-400">
            Real-time compliance rating evaluated from actual database inspection logs, CCTV uptime & attendance verification.
          </p>
        </div>

        <button
          onClick={loadData}
          className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Recalculate</span>
        </button>
      </div>

      {/* Compliance Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {complianceList.length === 0 ? (
          <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center text-slate-500 space-y-2 shadow-xl">
            <Award className="w-12 h-12 mx-auto text-slate-700 stroke-1" />
            <h3 className="text-base font-bold text-white">No compliance records found.</h3>
            <p className="text-xs text-slate-400">Register DoSJE projects to begin real-time compliance tracking.</p>
          </div>
        ) : (
          complianceList.map((c) => (
            <div key={c.project_id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <span className="font-bold text-white text-sm block">{c.project_name}</span>
                  <span className="text-[10px] text-blue-400 font-mono">{c.ngo_institute}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  c.compliance_score >= 85 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}>
                  {c.compliance_score}% SCORE
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">INSPECTIONS</span>
                  <span className="text-white font-bold text-xs">{c.completed_inspections} / {c.total_inspections}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">CCTV UPTIME</span>
                  <span className="text-emerald-400 font-bold text-xs">{c.cctv_availability_pct}%</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-400 block">ANOMALIES</span>
                  <span className="text-rose-400 font-bold text-xs">{c.anomaly_count}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Location: {c.district}, {c.state}</span>
                <span className="text-emerald-400 font-bold">{c.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
