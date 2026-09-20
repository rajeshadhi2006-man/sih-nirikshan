// ========================================================================
// PERSON -> GEOFENCE ASSIGNMENTS CONSOLE
// AUTHORIZE PERSONNEL FOR MANDATORY GEOFENCE ATTENDANCE
// ========================================================================
import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Layers,
  Users,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { assignmentsApi, GeofenceAssignment } from '../api/assignments';
import { usersApi } from '../api/users';
import { geofencesApi } from '../api/geofences';
import { personsApi } from '../api/persons';

export const Assignments: React.FC = () => {
  const [assignments, setAssignments] = useState<GeofenceAssignment[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const [assignmentsData, usersData, geofencesData, personsData] = await Promise.all([
        assignmentsApi.getAssignments().catch(() => []),
        usersApi.getUsers().catch(() => []),
        geofencesApi.getGeofences().catch(() => []),
        personsApi.getPersons().catch(() => []),
      ]);

      // Merge users & persons so all enrolled personnel are available for assignment
      const mergedUsersMap = new Map<string, any>();
      (personsData || []).forEach((p: any) => {
        const pid = p.person_id || p.id;
        mergedUsersMap.set(pid, {
          user_id: pid,
          id: pid,
          full_name: p.full_name,
          department: p.organization || p.department || 'Field Operations',
          designation: p.assigned_area || p.designation || 'Field Officer',
          email: p.email,
          phone: p.mobile,
          role: p.role || 'OFFICER',
        });
      });
      (usersData || []).forEach((u: any) => {
        const uid = u.user_id || u.id;
        if (!mergedUsersMap.has(uid)) {
          mergedUsersMap.set(uid, u);
        }
      });

      const validUsers = Array.from(mergedUsersMap.values());
      const validGeofences = Array.isArray(geofencesData) ? geofencesData : [];
      const validAssignments = Array.isArray(assignmentsData) ? assignmentsData : [];

      setAssignments(validAssignments);
      setUsers(validUsers);
      setGeofences(validGeofences);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedGeofenceId) {
      setErrorMessage('Please select both a registered person and an active geofence.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      await assignmentsApi.createAssignment({
        user_id: selectedUserId,
        geofence_id: selectedGeofenceId,
        assigned_by: 'Command Officer',
      });
      setSuccessMessage('Authorization assignment saved successfully!');
      setSelectedUserId('');
      setSelectedGeofenceId('');
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create assignment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentActive: number | boolean) => {
    try {
      const newActive = typeof currentActive === 'number' ? currentActive === 0 : !currentActive;
      await assignmentsApi.updateAssignment(id, newActive);
      await fetchData();
    } catch (err: any) {
      alert(`Failed to update assignment: ${err.message}`);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (confirm('Are you sure you want to revoke this person-to-geofence authorization?')) {
      try {
        await assignmentsApi.deleteAssignment(id);
        await fetchData();
      } catch (err: any) {
        alert(`Failed to delete assignment: ${err.message}`);
      }
    }
  };

  const filteredAssignments = assignments.filter((asgn) => {
    const q = searchQuery.toLowerCase();
    return (
      (asgn.user_name || '').toLowerCase().includes(q) ||
      (asgn.user_id || '').toLowerCase().includes(q) ||
      (asgn.geofence_name || '').toLowerCase().includes(q) ||
      (asgn.user_department || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">
              Person → Geofence Assignments
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authorize registered personnel for mandatory automatic attendance within designated operational geofences.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition border border-slate-700/80 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-400 text-xs font-medium">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Alert */}
      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-emerald-400 text-xs font-medium">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-md">
        <h2 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4" />
          Create New Authorization Assignment
        </h2>
        <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Person Select */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select Person (Registered Personnel)
            </label>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 text-white rounded-xl text-xs py-2.5 px-3 focus:outline-none transition appearance-none cursor-pointer"
              >
                <option value="">-- Select Person ({users.length} available) --</option>
                {users.map((u) => {
                  const uid = u.user_id || u.officer_id || u.id;
                  const uname = u.full_name || u.name || uid;
                  const udept = u.department || 'Field Ops';
                  return (
                    <option key={uid} value={uid}>
                      {uname} ({uid}) - {udept}
                    </option>
                  );
                })}
              </select>
              <Users className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
            </div>
            {users.length === 0 && (
              <p className="text-[10px] text-amber-400/80 mt-1">
                No users registered yet. Please add personnel under Persons first.
              </p>
            )}
          </div>

          {/* Geofence Select */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select Geofence (Operational Boundary)
            </label>
            <div className="relative">
              <select
                value={selectedGeofenceId}
                onChange={(e) => setSelectedGeofenceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 text-white rounded-xl text-xs py-2.5 px-3 focus:outline-none transition appearance-none cursor-pointer"
              >
                <option value="">-- Select Geofence ({geofences.length} available) --</option>
                {geofences.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.radius_meters}m) - {g.department || 'Command'}
                  </option>
                ))}
              </select>
              <ShieldCheck className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
            </div>
            {geofences.length === 0 && (
              <p className="text-[10px] text-amber-400/80 mt-1">
                No geofences created yet. Please create a geofence under Geofences first.
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting || users.length === 0 || geofences.length === 0}
              className="w-full h-[42px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs tracking-wider uppercase transition shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Assigning...' : 'Assign Person → Geofence'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Assignments Table Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search assignments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl text-xs pl-9 pr-3 py-2 focus:outline-none focus:border-amber-500 transition"
            />
          </div>
          <div className="text-xs font-medium text-slate-400 self-end sm:self-center">
            Active Assignments:{' '}
            <span className="font-bold text-emerald-400">
              {assignments.filter((a) => a.active).length}
            </span>{' '}
            / {assignments.length}
          </div>
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <ShieldAlert className="w-12 h-12 mx-auto text-slate-600 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-300">
              {assignments.length === 0
                ? 'No assignments created yet.'
                : 'No assignments match your search criteria.'}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Assignments authorize personnel for automatic attendance verification upon entering a designated geofence. Use the form above to pair a person with a geofence.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Authorized Person</th>
                  <th className="py-3.5 px-4">Geofence Perimeter</th>
                  <th className="py-3.5 px-4">Assigned By</th>
                  <th className="py-3.5 px-4">Assigned At</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredAssignments.map((asgn) => {
                  const isActive = !!asgn.active;
                  return (
                    <tr key={asgn.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">
                          {asgn.user_name || asgn.user_id}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          ID: {asgn.user_id} | {asgn.user_department || 'Field Operations'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-amber-400">
                          {asgn.geofence_name || asgn.geofence_id}
                        </div>
                        {asgn.geofence_radius && (
                          <div className="text-[11px] text-slate-400">
                            Radius: {asgn.geofence_radius}m
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {asgn.assigned_by || 'Command Officer'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {asgn.assigned_at ? new Date(asgn.assigned_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {isActive ? 'ACTIVE' : 'REVOKED'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleToggleStatus(asgn.id, asgn.active)}
                          title={isActive ? 'Deactivate assignment' : 'Activate assignment'}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition inline-flex items-center"
                        >
                          {isActive ? (
                            <ToggleRight className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteAssignment(asgn.id)}
                          title="Revoke / Delete Assignment"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition inline-flex items-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Assignments;
