import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Plus,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  FileText,
  Users,
  Video,
  X,
  Navigation,
  UserCheck,
  Trash2,
  Building,
  Check,
} from 'lucide-react';
import {
  fetchInspections,
  initiateSurpriseInspection,
  manualAssignInspection,
  deleteInspection,
  triggerAIAssignment,
  submitInspectionReport,
  fetchInspectionTeams,
  createInspectionTeam,
  deleteInspectionTeam,
  triggerRandomVC,
  Inspection,
  InspectionTeam,
} from '../api/inspections';
import { fetchProjects, DoSJEProject } from '../api/projects';
import { useMonitoring } from '../context/MonitoringContext';
import { realtimeWS } from '../lib/api';

export const Inspections: React.FC = () => {
  const { refreshData } = useMonitoring();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [teams, setTeams] = useState<InspectionTeam[]>([]);
  const [projects, setProjects] = useState<DoSJEProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'ALL' | 'TEAMS'>('ALL');

  // Modals
  const [isSurpriseModalOpen, setIsSurpriseModalOpen] = useState(false);
  const [isManualAssignModalOpen, setIsManualAssignModalOpen] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [targetInspectionToAssign, setTargetInspectionToAssign] = useState<Inspection | null>(null);

  // Surprise Inspection Form States
  const [projectId, setProjectId] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [assignImmediately, setAssignImmediately] = useState(false);
  const [immediateAssignMode, setImmediateAssignMode] = useState<'REGISTERED' | 'CUSTOM'>('CUSTOM');
  const [immediateTeamId, setImmediateTeamId] = useState('');
  const [immediateTeamName, setImmediateTeamName] = useState('');
  const [immediateLeadOfficer, setImmediateLeadOfficer] = useState('');
  const [immediateInspectorId, setImmediateInspectorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dedicated Manual Assignment Modal Form States
  const [manualAssignMode, setManualAssignMode] = useState<'REGISTERED' | 'CUSTOM'>('CUSTOM');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [manualTeamName, setManualTeamName] = useState('');
  const [manualLeadOfficer, setManualLeadOfficer] = useState('');
  const [manualInspectorId, setManualInspectorId] = useState('');

  // Team Creation Form States
  const [newTeamName, setNewTeamName] = useState('');
  const [newLeadOfficer, setNewLeadOfficer] = useState('');
  const [newMembers, setNewMembers] = useState('');
  const [newState, setNewState] = useState('Tamil Nadu');
  const [newDistrict, setNewDistrict] = useState('Coimbatore');

  // Report Form States (Zero predefined defaults)
  const [inspectorId, setInspectorId] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [accuracy, setAccuracy] = useState('');
  const [observations, setObservations] = useState('');
  const [complianceFindings, setComplianceFindings] = useState('');
  const [violations, setViolations] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [iList, tList, pList] = await Promise.all([
        fetchInspections(),
        fetchInspectionTeams(),
        fetchProjects(),
      ]);
      setInspections(iList);
      setTeams(tList);
      setProjects(pList);
      if (pList.length > 0 && !projectId) {
        setProjectId(pList[0].id);
      }
    } catch (err) {
      console.error('Error loading inspection data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Real-time WebSocket event subscription for instant synchronization
    const unsubscribe = realtimeWS.subscribe((msg: any) => {
      if (
        msg.event === 'INSPECTION_CREATED' ||
        msg.event === 'INSPECTION_ASSIGNED' ||
        msg.event === 'INSPECTION_COMPLETED' ||
        msg.event === 'INSPECTION_DELETED' ||
        msg.type === 'INSPECTION_CREATED' ||
        msg.type === 'INSPECTION_ASSIGNED' ||
        msg.type === 'INSPECTION_COMPLETED' ||
        msg.type === 'INSPECTION_DELETED'
      ) {
        loadData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const acquireRealGps = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(6));
          setLongitude(pos.coords.longitude.toFixed(6));
          setAccuracy(Math.round(pos.coords.accuracy).toString());
        },
        (err) => {
          console.warn('Geolocation warning:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  // Open Manual Assign Modal for a specific inspection
  const handleOpenManualAssign = (insp: Inspection) => {
    setTargetInspectionToAssign(insp);
    const hasTeams = teams.length > 0;
    setManualAssignMode(hasTeams ? 'REGISTERED' : 'CUSTOM');
    if (hasTeams) {
      setSelectedTeamId(teams[0].id);
      setManualTeamName(teams[0].team_name);
      setManualLeadOfficer(teams[0].lead_officer_name);
    } else {
      setSelectedTeamId('');
      setManualTeamName(insp.team_name || '');
      setManualLeadOfficer(insp.inspector_name || '');
    }
    setManualInspectorId(insp.inspector_id || '');
    setIsManualAssignModalOpen(true);
  };

  // Submit Manual Assignment
  const handleConfirmManualAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInspectionToAssign) return;

    let finalTeamName = manualTeamName.trim();
    let finalLeadOfficer = manualLeadOfficer.trim();
    let teamIdToPass: string | undefined = undefined;

    if (manualAssignMode === 'REGISTERED') {
      const found = teams.find((t) => t.id === selectedTeamId);
      if (found) {
        finalTeamName = found.team_name;
        finalLeadOfficer = found.lead_officer_name;
        teamIdToPass = found.id;
      }
    }

    if (!finalTeamName || !finalLeadOfficer) {
      alert('Please provide Team Name and Lead Officer Name.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await manualAssignInspection(targetInspectionToAssign.id, {
        team_id: teamIdToPass,
        team_name: finalTeamName,
        lead_officer_name: finalLeadOfficer,
        inspector_id: manualInspectorId.trim() || undefined,
      });

      setIsManualAssignModalOpen(false);
      setTargetInspectionToAssign(null);
      setAiMessage(`✓ Inspection ${res.inspection.inspection_code} manually assigned to ${res.inspection.team_name} (Lead: ${res.inspection.inspector_name})`);
      await loadData();
      if (refreshData) await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to manually assign inspection.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Report Modal (Zero Predefined Strings)
  const handleOpenReportModal = (insp: Inspection) => {
    setSelectedInspection(insp);
    setInspectorId(insp.inspector_id || '');
    setInspectorName(insp.inspector_name || '');
    setObservations('');
    setComplianceFindings('');
    setViolations('');
    setLatitude('');
    setLongitude('');
    setAccuracy('');
    acquireRealGps();
    setIsReportModalOpen(true);
  };

  // Initiate Surprise Inspection
  const handleInitiateSurprise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !reason.trim()) return;

    try {
      setSubmitting(true);

      let teamPayload: any = {};
      if (assignImmediately) {
        if (immediateAssignMode === 'REGISTERED' && immediateTeamId) {
          const found = teams.find((t) => t.id === immediateTeamId);
          if (found) {
            teamPayload.team_id = found.id;
            teamPayload.team_name = found.team_name;
            teamPayload.lead_officer_name = found.lead_officer_name;
          }
        } else if (immediateTeamName.trim() && immediateLeadOfficer.trim()) {
          teamPayload.team_name = immediateTeamName.trim();
          teamPayload.lead_officer_name = immediateLeadOfficer.trim();
        }
        if (immediateInspectorId.trim()) {
          teamPayload.inspector_id = immediateInspectorId.trim();
        }
      }

      const res = await initiateSurpriseInspection({
        project_id: projectId,
        reason: reason.trim(),
        priority,
        ...teamPayload,
      });

      setIsSurpriseModalOpen(false);
      setReason('');
      setAssignImmediately(false);
      setImmediateTeamName('');
      setImmediateLeadOfficer('');
      setImmediateInspectorId('');

      if (res) {
        setAiMessage(`✓ Surprise inspection ${res.inspection_code} initiated (${res.status}).`);
      }
      await loadData();
      if (refreshData) await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to initiate surprise inspection.');
    } finally {
      setSubmitting(false);
    }
  };

  // AI Dynamic Assignment Engine
  const handleRunAIAssignment = async (inspectionId?: string) => {
    try {
      setLoading(true);
      setAiMessage('AI Engine calculating optimal assignment based on real workload and proximity...');
      const res = await triggerAIAssignment({ inspection_id: inspectionId });
      if (res && res.ai_match_explanation) {
        setAiMessage(`🤖 ${res.ai_match_explanation}`);
      }
      await loadData();
    } catch (err: any) {
      setAiMessage(err.response?.data?.detail || 'No inspection teams available for AI assignment. Please register an inspection squad or assign manually.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Inspection
  const handleDeleteInspection = async (id: string, code: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete inspection ${code}?`)) return;
    try {
      await deleteInspection(id);
      setAiMessage(`✓ Inspection ${code} deleted.`);
      await loadData();
      if (refreshData) await refreshData();
    } catch (err) {
      alert('Failed to delete inspection.');
    }
  };

  // Create Inspection Team
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newLeadOfficer.trim()) return;

    try {
      setSubmitting(true);
      const membersArray = newMembers
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      const res = await createInspectionTeam({
        team_name: newTeamName.trim(),
        lead_officer_name: newLeadOfficer.trim(),
        members: membersArray.length > 0 ? membersArray : [newLeadOfficer.trim()],
        state: newState.trim() || 'Tamil Nadu',
        district: newDistrict.trim() || 'Coimbatore',
      });

      if (res) {
        setIsCreateTeamModalOpen(false);
        setNewTeamName('');
        setNewLeadOfficer('');
        setNewMembers('');
        setAiMessage(`✓ Official Inspection Squad "${res.team_name}" successfully registered.`);
        await loadData();
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create inspection team.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Team
  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!window.confirm(`Are you sure you want to delete inspection squad "${teamName}"?`)) return;
    try {
      await deleteInspectionTeam(teamId);
      setAiMessage(`✓ Inspection squad "${teamName}" deleted.`);
      await loadData();
    } catch (err) {
      alert('Failed to delete inspection squad.');
    }
  };

  // Submit Geo-Tagged Report
  const handleSubmitReportForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInspection || !latitude || !longitude || !observations.trim() || !inspectorName.trim()) {
      alert('Please fill Inspector Name, Observations, and ensure GPS coordinates are set.');
      return;
    }

    try {
      setSubmitting(true);
      await submitInspectionReport(selectedInspection.id, {
        inspector_id: inspectorId.trim() || 'INSP-UNASSIGNED',
        inspector_name: inspectorName.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: parseFloat(accuracy) || 5.0,
        observations: observations.trim(),
        compliance_findings: complianceFindings.trim() || undefined,
        violations: violations.trim() || undefined,
      });

      setIsReportModalOpen(false);
      setSelectedInspection(null);
      setObservations('');
      setComplianceFindings('');
      setViolations('');
      setAiMessage(`✓ Geo-tagged inspection report successfully filed for ${selectedInspection.inspection_code}.`);
      await loadData();
      if (refreshData) await refreshData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to submit inspection report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <span>DoSJE Surprise Inspection & AI Assignment Management</span>
          </h1>
          <p className="text-xs text-slate-400">
            Real-time inspection workflow, dynamic AI team assignment engine, and geo-tagged audit reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleRunAIAssignment()}
            disabled={loading || inspections.length === 0}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-purple-950/40 disabled:opacity-50"
            title="Automatically assign pending inspections using AI matching"
          >
            <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
            <span>AI Auto-Assign</span>
          </button>

          <button
            onClick={() => setIsSurpriseModalOpen(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-lg shadow-amber-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>Surprise Inspection</span>
          </button>
        </div>
      </div>

      {/* AI / Notification Banner */}
      {aiMessage && (
        <div className="p-3.5 bg-purple-950/50 border border-purple-800/80 rounded-xl text-xs text-purple-200 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-medium">{aiMessage}</span>
          </div>
          <button onClick={() => setAiMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Selector */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs font-bold">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-4 py-2 rounded-xl transition ${
              activeTab === 'ALL'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            All Inspections ({inspections.length})
          </button>
          <button
            onClick={() => setActiveTab('TEAMS')}
            className={`px-4 py-2 rounded-xl transition ${
              activeTab === 'TEAMS'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            Inspection Teams ({teams.length})
          </button>
        </div>

        <button
          onClick={loadData}
          className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition hover:border-slate-700"
          title="Refresh Inspections"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'ALL' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 font-mono">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Target Center / NGO</th>
                  <th className="px-4 py-3">Type & Reason</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Assigned Team / Officer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {inspections.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-500">
                      <ShieldAlert className="w-12 h-12 mx-auto text-slate-700 mb-2 stroke-1" />
                      <p className="font-bold text-white">No active inspections recorded.</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Zero predefined values active. Click <span className="text-amber-400 font-bold">'Surprise Inspection'</span> to initiate a real audit and enter assignments manually.
                      </p>
                    </td>
                  </tr>
                ) : (
                  inspections.map((insp) => (
                    <tr key={insp.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3.5 font-mono font-bold text-amber-400">
                        {insp.inspection_code}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white">{insp.project_name}</div>
                        <div className="text-[10px] text-slate-400">{insp.ngo_institute}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-800 mr-2">
                          {insp.inspection_type}
                        </span>
                        <span className="text-[11px] text-slate-300">{insp.reason}</span>
                      </td>

                      <td className="px-4 py-3.5 font-mono">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            insp.priority === 'CRITICAL' || insp.priority === 'HIGH'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {insp.priority}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-[11px]">
                        {insp.team_name ? (
                          <div>
                            <div className="text-emerald-400 font-bold flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{insp.team_name}</span>
                            </div>
                            {insp.inspector_name && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Lead: {insp.inspector_name} {insp.inspector_id ? `(${insp.inspector_id})` : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleOpenManualAssign(insp)}
                              className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 rounded text-[10px] font-bold transition border border-amber-500/40 flex items-center space-x-1"
                              title="Enter assignment manually"
                            >
                              <UserCheck className="w-3 h-3 text-amber-300" />
                              <span>Assign Manually</span>
                            </button>
                            <button
                              onClick={() => handleRunAIAssignment(insp.id)}
                              className="px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded text-[10px] font-bold transition border border-purple-500/30 flex items-center space-x-1"
                              title="Assign using AI matching engine"
                            >
                              <Sparkles className="w-3 h-3 text-cyan-300" />
                              <span>AI</span>
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 font-mono">
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-bold border ${
                            insp.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : insp.status === 'ASSIGNED' || insp.status === 'IN_PROGRESS'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {insp.status}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {insp.status !== 'COMPLETED' && (
                          <button
                            onClick={() => handleOpenReportModal(insp)}
                            className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded text-[10px] font-bold transition border border-emerald-500/30"
                          >
                            Submit Report
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenManualAssign(insp)}
                          className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded text-[10px] font-bold transition border border-blue-500/30"
                          title="Change / re-enter assignment manually"
                        >
                          Re-Assign
                        </button>
                        <button
                          onClick={() => triggerRandomVC(insp.project_id, 'INCHARGE')}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition border border-slate-700"
                        >
                          VC Call
                        </button>
                        <button
                          onClick={() => handleDeleteInspection(insp.id, insp.inspection_code)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Delete Inspection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>Registered DoSJE Flying Squads & Inspection Teams</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage official ground squads available for manual assignment and dynamic AI matching.
              </p>
            </div>
            <button
              onClick={() => setIsCreateTeamModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Register New Team</span>
            </button>
          </div>

          {teams.length === 0 ? (
            <div className="p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
              <Users className="w-10 h-10 mx-auto text-slate-600 stroke-1" />
              <p className="text-white font-bold text-sm">No inspection squads registered yet.</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                All predefined fake teams have been cleared. Register your real ground inspection teams to dispatch surprise audits.
              </p>
              <button
                onClick={() => setIsCreateTeamModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Register Inspection Squad</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map((t) => (
                <div key={t.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5 shadow-lg relative group">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{t.team_name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {t.availability_status}
                      </span>
                      <button
                        onClick={() => handleDeleteTeam(t.id, t.team_name)}
                        className="text-slate-500 hover:text-rose-400 transition p-1"
                        title="Delete Team"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Lead Officer: <span className="text-blue-400 font-bold">{t.lead_officer_name}</span>
                  </p>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Jurisdiction: {t.district}, {t.state} | Current Workload: {t.current_workload} active
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Inspection Team Assignment Modal */}
      {isManualAssignModalOpen && targetInspectionToAssign && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  <span>Manual Inspection Team Assignment</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Directly enter or select the assigned officer/squad for this audit.
                </p>
              </div>
              <button onClick={() => setIsManualAssignModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmManualAssignment} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="font-bold text-white block">{targetInspectionToAssign.project_name}</span>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Code: <span className="font-mono text-amber-400 font-bold">{targetInspectionToAssign.inspection_code}</span></span>
                  <span>Priority: <span className="font-mono text-rose-400 font-bold">{targetInspectionToAssign.priority}</span></span>
                </div>
              </div>

              {/* Assignment Mode Toggle */}
              <div className="flex items-center space-x-2 border border-slate-800 rounded-xl p-1 bg-slate-950">
                <button
                  type="button"
                  onClick={() => setManualAssignMode('CUSTOM')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    manualAssignMode === 'CUSTOM' ? 'bg-amber-600 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Enter Details Manually
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (teams.length === 0) {
                      alert('No registered teams exist yet. Please register a team in the "Inspection Teams" tab or enter details manually.');
                      return;
                    }
                    setManualAssignMode('REGISTERED');
                  }}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    manualAssignMode === 'REGISTERED' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Select Registered Squad ({teams.length})
                </button>
              </div>

              {manualAssignMode === 'REGISTERED' && teams.length > 0 ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Registered Squad *</label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => {
                      setSelectedTeamId(e.target.value);
                      const sel = teams.find((t) => t.id === e.target.value);
                      if (sel) {
                        setManualTeamName(sel.team_name);
                        setManualLeadOfficer(sel.lead_officer_name);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    required
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.team_name} — Lead: {t.lead_officer_name} ({t.district}, {t.state})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Assigned Team / Squad Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Coimbatore Regional Flying Squad"
                      value={manualTeamName}
                      onChange={(e) => setManualTeamName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Lead Inspector / Officer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Inspector V. Murugan"
                      value={manualLeadOfficer}
                      onChange={(e) => setManualLeadOfficer(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Inspector Official / Badge ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. DOSJE-OFFICER-102"
                  value={manualInspectorId}
                  onChange={(e) => setManualInspectorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 font-mono"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualAssignModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl font-bold transition shadow-lg shadow-amber-950/40"
                >
                  {submitting ? 'Assigning...' : '✓ Confirm Manual Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Surprise Inspection Modal */}
      {isSurpriseModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                Initiate Surprise Inspection
              </h2>
              <button onClick={() => setIsSurpriseModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInitiateSurprise} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Target Project *</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.ngo_institute})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Inspection Reason *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Surprise verification of beneficiary presence, facial recognition logs & facility standards"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              {/* Assignment Choice */}
              <div className="pt-2 border-t border-slate-800/80">
                <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={assignImmediately}
                    onChange={(e) => setAssignImmediately(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <span className="font-semibold text-xs">Assign team / officer manually right now</span>
                </label>
              </div>

              {assignImmediately && (
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setImmediateAssignMode('CUSTOM')}
                      className={`px-3 py-1 rounded text-[11px] font-bold ${
                        immediateAssignMode === 'CUSTOM' ? 'bg-amber-600 text-slate-950' : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      Enter Details
                    </button>
                    {teams.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setImmediateAssignMode('REGISTERED')}
                        className={`px-3 py-1 rounded text-[11px] font-bold ${
                          immediateAssignMode === 'REGISTERED' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        Pick Registered Squad
                      </button>
                    )}
                  </div>

                  {immediateAssignMode === 'REGISTERED' && teams.length > 0 ? (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Squad</label>
                      <select
                        value={immediateTeamId}
                        onChange={(e) => setImmediateTeamId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                      >
                        <option value="">-- Select Team --</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.team_name} (Lead: {t.lead_officer_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Squad Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Flying Squad A"
                          value={immediateTeamName}
                          onChange={(e) => setImmediateTeamName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Lead Officer</label>
                        <input
                          type="text"
                          placeholder="e.g. Officer V. Murugan"
                          value={immediateLeadOfficer}
                          onChange={(e) => setImmediateLeadOfficer(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Officer Badge ID (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. DOSJE-OFFICER-042"
                      value={immediateInspectorId}
                      onChange={(e) => setImmediateInspectorId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSurpriseModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xl font-bold transition"
                >
                  {submitting ? 'Initiating...' : 'Dispatch Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Inspection Team Modal */}
      {isCreateTeamModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Register Official Inspection Squad
              </h2>
              <button onClick={() => setIsCreateTeamModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Squad / Team Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coimbatore Regional Flying Inspection Squad"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Lead Officer / Commander *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inspector V. Murugan"
                  value={newLeadOfficer}
                  onChange={(e) => setNewLeadOfficer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">State *</label>
                  <input
                    type="text"
                    required
                    placeholder="Tamil Nadu"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">District *</label>
                  <input
                    type="text"
                    required
                    placeholder="Coimbatore"
                    value={newDistrict}
                    onChange={(e) => setNewDistrict(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Team Members (Comma-Separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Officer K. Rajesh, Inspector S. Priya"
                  value={newMembers}
                  onChange={(e) => setNewMembers(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateTeamModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition shadow"
                >
                  {submitting ? 'Registering...' : 'Register Squad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Geo-Tagged Report Modal */}
      {isReportModalOpen && selectedInspection && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Submit Geo-Tagged Inspection Report
              </h2>
              <button onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReportForm} className="space-y-3.5 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="font-bold text-white block">{selectedInspection.project_name}</span>
                <span className="text-[10px] text-amber-400 font-mono">Code: {selectedInspection.inspection_code}</span>
              </div>

              {/* Inspector Identity Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Inspector / Officer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter reporting officer name"
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Inspector Badge ID</label>
                  <input
                    type="text"
                    placeholder="e.g. DOSJE-OFFICER-042"
                    value={inspectorId}
                    onChange={(e) => setInspectorId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Geo-Tag Device GPS Coordinates */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold block">Device GPS Fix (Geo-Tag):</span>
                  <button
                    type="button"
                    onClick={acquireRealGps}
                    className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded text-[10px] font-bold"
                  >
                    Acquire Device GPS
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 11.0168"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-mono">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 76.9558"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-mono text-xs"
                    />
                  </div>
                </div>
                {accuracy && (
                  <span className="text-[10px] text-emerald-400 font-mono block">GPS Horizontal Accuracy: ±{accuracy}m</span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Inspection Observations *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record physical inspection observations, beneficiary attendance verification & facility conditions..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Compliance Findings (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fully compliant with DoSJE infrastructure guidelines"
                  value={complianceFindings}
                  onChange={(e) => setComplianceFindings(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Violations / Anomalies Detected (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. None detected / 2 unauthorized staff substitutions observed"
                  value={violations}
                  onChange={(e) => setViolations(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !latitude || !longitude}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition shadow-lg shadow-emerald-900/30 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

