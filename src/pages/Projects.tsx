import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  Users,
  ShieldCheck,
  Video,
  AlertTriangle,
  MapPin,
  CheckCircle2,
  RefreshCw,
  X,
  UserCheck,
} from 'lucide-react';
import { fetchProjects, createProject, fetchInstitutions, createInstitution, DoSJEProject, Institution } from '../api/projects';
import { triggerRandomVC } from '../api/inspections';
import { useMonitoring } from '../context/MonitoringContext';

export const Projects: React.FC = () => {
  const { refreshData } = useMonitoring();
  const [projects, setProjects] = useState<DoSJEProject[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');

  // Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [scheme, setScheme] = useState('PM-AJAY Scheme');
  const [ngoInstitute, setNgoInstitute] = useState('');
  const [inchargeName, setInchargeName] = useState('');
  const [inchargePhone, setInchargePhone] = useState('');
  const [state, setState] = useState('Tamil Nadu');
  const [district, setDistrict] = useState('Coimbatore');
  const [locationAddress, setLocationAddress] = useState('');
  const [latitude, setLatitude] = useState('11.0168');
  const [longitude, setLongitude] = useState('76.9558');
  const [beneficiaries, setBeneficiaries] = useState('250');
  const [staffCount, setStaffCount] = useState('18');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [pList, iList] = await Promise.all([fetchProjects(), fetchInstitutions()]);
    setProjects(pList);
    setInstitutions(iList);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ngoInstitute.trim() || !inchargeName.trim()) return;

    try {
      setSubmitting(true);
      await createProject({
        name: name.trim(),
        scheme: scheme.trim(),
        ngo_institute: ngoInstitute.trim(),
        incharge_name: inchargeName.trim(),
        incharge_phone: inchargePhone.trim() || undefined,
        state: state.trim(),
        district: district.trim(),
        location_address: locationAddress.trim() || `${district}, ${state}`,
        latitude: parseFloat(latitude) || 11.0168,
        longitude: parseFloat(longitude) || 76.9558,
        registered_beneficiaries: parseInt(beneficiaries) || 0,
        staff_count: parseInt(staffCount) || 0,
      });

      setIsProjectModalOpen(false);
      setName('');
      setNgoInstitute('');
      setInchargeName('');
      await loadData();
      if (refreshData) await refreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.ngo_institute.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.scheme.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = stateFilter === 'ALL' || p.state === stateFilter;
    return matchesSearch && matchesState;
  });

  const states = ['ALL', ...Array.from(new Set(projects.map((p) => p.state)))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <span>DoSJE Projects & Institutions Monitoring</span>
          </h1>
          <p className="text-xs text-slate-400">
            Centralized monitoring of DoSJE schemes, NGOs, Institutes, Beneficiaries, and Compliance Status.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsProjectModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-blue-900/40"
          >
            <Plus className="w-4 h-4" />
            <span>Register Project</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Project Name, Scheme, NGO..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            {states.map((st) => (
              <option key={st} value={st}>
                {st === 'ALL' ? 'All States' : st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Projects Table / Empty State */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Project Name & Scheme</th>
                <th className="px-4 py-3">NGO / Institute</th>
                <th className="px-4 py-3">Incharge</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Beneficiaries & Staff</th>
                <th className="px-4 py-3">CCTV Status</th>
                <th className="px-4 py-3">Compliance</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-500">
                    <Building2 className="w-12 h-12 mx-auto text-slate-700 mb-2 stroke-1" />
                    <p className="font-bold text-white">No projects registered yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click <span className="text-blue-400 font-bold">'Register Project'</span> above to add DoSJE projects to the database.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProjects.map((proj) => (
                  <tr key={proj.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-white">{proj.name}</div>
                      <div className="text-[10px] text-blue-400 font-mono">{proj.scheme}</div>
                    </td>

                    <td className="px-4 py-3.5 font-medium text-slate-200">
                      {proj.ngo_institute}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="text-slate-200 font-semibold">{proj.incharge_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{proj.incharge_phone || 'N/A'}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="text-slate-300 font-medium">{proj.district}, {proj.state}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {proj.latitude.toFixed(4)}, {proj.longitude.toFixed(4)}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-[11px]">
                      <div><span className="text-emerald-400 font-bold">{proj.registered_beneficiaries}</span> Beneficiaries</div>
                      <div><span className="text-blue-400 font-bold">{proj.staff_count}</span> Staff</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        proj.cctv_count > 0
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {proj.cctv_count > 0 ? `${proj.cctv_count} Cameras Active` : 'CCTV SOURCE NOT CONFIGURED'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        proj.compliance_status === 'COMPLIANT'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {proj.compliance_status} ({100 - proj.risk_score}%)
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-1">
                      <button
                        onClick={() => triggerRandomVC(proj.id, 'INCHARGE')}
                        className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded text-[10px] font-bold transition border border-blue-500/30"
                        title="Initiate Random Surprise VC with Project Incharge"
                      >
                        Random VC
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Project Modal */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                Register New DoSJE Project
              </h2>
              <button onClick={() => setIsProjectModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Project Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PM-AJAY Smart Hostel Complex"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Scheme *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PM-AJAY Scheme"
                    value={scheme}
                    onChange={(e) => setScheme(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">NGO / Institute Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. National Welfare Foundation"
                    value={ngoInstitute}
                    onChange={(e) => setNgoInstitute(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Project Incharge *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. K. Arumugam"
                    value={inchargeName}
                    onChange={(e) => setInchargeName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">District *</label>
                  <input
                    type="text"
                    required
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Incharge Phone</label>
                  <input
                    type="text"
                    placeholder="+91 9876543210"
                    value={inchargePhone}
                    onChange={(e) => setInchargePhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Beneficiaries</label>
                  <input
                    type="number"
                    value={beneficiaries}
                    onChange={(e) => setBeneficiaries(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Staff Count</label>
                  <input
                    type="number"
                    value={staffCount}
                    onChange={(e) => setStaffCount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition"
                >
                  {submitting ? 'Registering...' : 'Save Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
