import React, { useState } from 'react';
import {
  Search,
  Filter,
  UserCheck,
  Shield,
  Eye,
  Route,
  UserPlus,
  Edit,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Users as UsersIcon,
  Copy,
  Check,
  Smartphone,
  KeyRound,
  RefreshCw,
  Camera,
  Mic,
  MapPin,
  Radio,
  Activity,
  Wifi,
} from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/common/Badge';
import { MonitoredUser } from '../types';
import { formatTimeAgo, formatCoordinates } from '../lib/geofence';
import { UserDetailsDrawer } from '../components/users/UserDetailsDrawer';
import { EnrollmentModal } from '../components/EnrollmentModal';
import { useNavigate } from 'react-router-dom';
import { usersApi, UserCreatePayload } from '../api/users';
import { personsApi } from '../api/persons';

export const Users: React.FC = () => {
  const navigate = useNavigate();
  const { users, refreshData } = useMonitoring();
  const { role, hasRole } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [selectedUser, setSelectedUser] = useState<MonitoredUser | null>(null);

  // Delete Person Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<MonitoredUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionNotification, setActionNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleOpenDelete = (user: MonitoredUser) => {
    setUserToDelete(user);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    const targetId = userToDelete.officer_id || userToDelete.id;
    try {
      setDeleting(true);
      setDeleteError(null);

      try {
        await personsApi.deletePerson(targetId);
      } catch (err) {
        await usersApi.deleteUser(targetId);
      }

      setActionNotification({
        type: 'success',
        message: `Personnel "${userToDelete.full_name}" (${targetId}) deleted successfully from the roster and geofences.`
      });

      if (selectedUser?.id === userToDelete.id) {
        setSelectedUser(null);
      }

      if (refreshData) await refreshData();
      setIsDeleteModalOpen(false);
      setUserToDelete(null);

      setTimeout(() => setActionNotification(null), 4000);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete personnel record.');
    } finally {
      setDeleting(false);
    }
  };

  // Real-Time Live Online Toggle & GNSS Ping State
  const [pingingUserId, setPingingUserId] = useState<string | null>(null);

  const handleToggleOnline = async (user: MonitoredUser) => {
    const targetId = user.officer_id || user.id;
    const isCurrentlyOnline = user.status === 'ACTIVE' || Boolean(user.current_location);
    try {
      setPingingUserId(targetId);
      if (isCurrentlyOnline) {
        await usersApi.toggleOnline(targetId, false);
        setActionNotification({
          type: 'success',
          message: `Personnel "${user.full_name}" (${targetId}) set to Standby / Offline.`
        });
      } else {
        await usersApi.pingUser(targetId, {
          latitude: 11.016844,
          longitude: 76.955832,
        });
        setActionNotification({
          type: 'success',
          message: `Live Telemetry GNSS Ping broadcast for "${user.full_name}" (${targetId}) — Status is now LIVE ONLINE inside geofence.`
        });
      }
      if (refreshData) await refreshData();
      setTimeout(() => setActionNotification(null), 4000);
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: err.message || 'Failed to update personnel live telemetry state.'
      });
    } finally {
      setPingingUserId(null);
    }
  };


  // Unified Person Enrollment Modal State
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);

  // Add Person Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [userRole, setUserRole] = useState('OFFICER');
  const [department, setDepartment] = useState('Field Operations');
  const [designation, setDesignation] = useState('Field Officer');
  const [deviceId, setDeviceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Edit Person Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editRole, setEditRole] = useState('OFFICER');
  const [editStatus, setEditStatus] = useState('online');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canModify = hasRole(['SUPER_ADMIN', 'ADMIN']);

  const departments = ['ALL', ...Array.from(new Set(users.map((u) => u.department).filter(Boolean)))];
  const rolesList = ['ALL', 'OFFICER', 'INSPECTION_OFFICER', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'];

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyLoginCredentials = (user: MonitoredUser) => {
    const loginEmail = user.email || `${(user.officer_id || user.id).toLowerCase()}@field.gov.in`;
    const credText = 
`========================================
SIH SURVEILLANCE SYSTEM - USER APP LOGIN
========================================
Personnel Name : ${user.full_name}
Officer ID     : ${user.officer_id || user.id}
Login Email ID : ${loginEmail}
Assigned Role  : ${user.role || 'OFFICER'}
Department     : ${user.department}
Connection     : Supabase Cloud & Local Auth
Target App     : SIH USER Mobile Application
========================================`;
    navigator.clipboard.writeText(credText);
    setCopiedId(`cred-${user.id}`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleOpenEdit = (user: MonitoredUser) => {
    setEditingUserId(user.officer_id || user.id);
    setEditFullName(user.full_name);
    setEditEmail(user.email || `${(user.officer_id || user.id).toLowerCase()}@field.gov.in`);
    setEditPhone(user.phone || '');
    setEditDepartment(user.department || 'Field Operations');
    setEditDesignation(user.designation || 'Field Officer');
    setEditRole(user.role || 'OFFICER');
    setEditStatus(user.status || 'online');
    setFormError(null);
    setFormSuccess(null);
    setIsEditModalOpen(true);
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim() || !editEmail.trim()) {
      setFormError('Full Name and Login Email are required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      setFormSuccess(null);

      await usersApi.updateUser(editingUserId, {
        full_name: editFullName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim() || undefined,
        department: editDepartment.trim() || 'Field Operations',
        designation: editDesignation.trim() || 'Field Officer',
        role: editRole,
        status: editStatus,
      });

      setFormSuccess(`User ${editFullName} updated! Login email connected to ${editEmail.trim().toLowerCase()}.`);
      if (refreshData) await refreshData();
      setTimeout(() => {
        setIsEditModalOpen(false);
        setFormSuccess(null);
      }, 1500);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update user profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !userId.trim()) {
      setFormError('Full Name and User/Officer ID are required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      setFormSuccess(null);

      const resolvedEmail = email.trim() ? email.trim().toLowerCase() : `${userId.trim().toLowerCase()}@field.gov.in`;

      const payload: UserCreatePayload = {
        user_id: userId.trim().toUpperCase(),
        full_name: fullName.trim(),
        email: resolvedEmail,
        phone: phone.trim() || undefined,
        department: department.trim() || 'Field Operations',
        designation: designation.trim() || 'Field Officer',
        device_id: deviceId.trim() || `DEV-${userId.trim().toUpperCase()}`,
        status: 'online',
        role: userRole || 'OFFICER',
      };

      await usersApi.createUser(payload);
      setFormSuccess(`Personnel ${payload.full_name} (${payload.user_id}) registered with login email ${resolvedEmail}!`);
      
      // Reset form
      setFullName('');
      setUserId('');
      setEmail('');
      setPhone('');
      setDeviceId('');
      setUserRole('OFFICER');

      if (refreshData) await refreshData();
      setTimeout(() => {
        setIsAddModalOpen(false);
        setFormSuccess(null);
      }, 1500);
    } catch (err: any) {
      setFormError(err.message || 'Failed to register person');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      (user.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.officer_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.designation || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = departmentFilter === 'ALL' || user.department === departmentFilter;
    const matchesRole = roleFilter === 'ALL' || (user.role || 'OFFICER') === roleFilter;

    return matchesSearch && matchesDept && matchesRole;
  });

  const onlineCount = users.filter((u) => u.status === 'ACTIVE' || Boolean(u.current_location)).length;
  const insideGeofenceCount = users.filter((u) => u.geofence_status === 'INSIDE').length;
  const outsideGeofenceCount = users.filter((u) => u.geofence_status === 'OUTSIDE').length;
  const offlineCount = Math.max(0, users.length - onlineCount);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-wide">
              Personnel Directory & Access Control
            </h1>
            <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              User App Login Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage field personnel, link official Email IDs for mobile app login, and control operational access clearance.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => refreshData && refreshData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
            title="Refresh Personnel Roster"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl font-mono">
            Role: <span className="text-blue-400 font-bold">{role}</span>
          </span>

          <button
            onClick={() => setIsEnrollModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-blue-900/40 hover:scale-[1.02]"
          >
            <UserPlus className="w-4 h-4" />
            <span>Enroll Person (Biometrics + GPS)</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <span>Quick Add</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotification && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            actionNotification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
          } animate-in fade-in duration-200 shadow-lg`}
        >
          <div className="flex items-center gap-2">
            {actionNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{actionNotification.message}</span>
          </div>
          <button
            onClick={() => setActionNotification(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Executive Personnel KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Roster */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-lg relative overflow-hidden backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Personnel</span>
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <UsersIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{users.length}</span>
            <span className="text-[11px] text-slate-400">Enrolled Officers</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
            <Shield className="w-3 h-3 text-blue-400" />
            <span>State Security Registry</span>
          </div>
        </div>

        {/* Online / Active Now */}
        <div className="bg-gradient-to-br from-slate-900/90 via-emerald-950/30 to-slate-900/90 border border-emerald-500/40 rounded-2xl p-4 shadow-lg shadow-emerald-950/30 relative overflow-hidden backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              Active Online Now
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{onlineCount}</span>
            <span className="text-[11px] text-emerald-300/80">Streaming Live GPS</span>
          </div>
          <div className="mt-2 text-[10px] text-emerald-400/90 flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>Sub-second WebSockets Synchronized</span>
          </div>
        </div>

        {/* Inside Geofence */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-lg relative overflow-hidden backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Inside Perimeter</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-400">{insideGeofenceCount}</span>
            <span className="text-[11px] text-slate-400">In Authorized Zone</span>
          </div>
          <div className="mt-2 text-[10px] text-cyan-400/80 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-cyan-400" />
            <span>Autonomous Spatial Compliance</span>
          </div>
        </div>

        {/* Standby / Offline */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-lg relative overflow-hidden backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Standby / Inactive</span>
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-400">{offlineCount}</span>
            <span className="text-[11px] text-slate-500">Off-duty / Standby</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
            <span>Click 'Set Online' to transmit ping</span>
          </div>
        </div>
      </div>

      {/* Info Card: Email Connection Architecture */}
      <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-emerald-950/30 border border-blue-800/30 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-400 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white flex items-center gap-2">
              <span>Mobile User App Authentication Connection</span>
              <span className="text-[10px] bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                Supabase + Local Sync
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Every Email ID configured below connects the field officer directly to the Flutter Mobile App (<span className="font-mono text-emerald-400">SIH USER</span>). When logged in, GPS tracking, Geofencing, and Biometrics bind to this account.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0 font-mono text-[11px] text-slate-400">
          <span>Active Roster: <strong className="text-emerald-400">{users.length}</strong></span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, Officer ID, email..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Department Filter */}
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept === 'ALL' ? 'All Departments' : dept}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              {rolesList.map((r) => (
                <option key={r} value={r}>
                  {r === 'ALL' ? 'All Roles' : r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Officer ID & Role</th>
                <th className="px-4 py-3">Personnel Name & App Login Email</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Duty Status</th>
                <th className="px-4 py-3">Geofence Status</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    <UsersIcon className="w-10 h-10 mx-auto text-slate-700 mb-2 stroke-1" />
                    <p className="font-semibold text-slate-400">No personnel found.</p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Click 'Add Person' above to register authorized personnel with their mobile app login email.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const resolvedEmail = user.email || `${(user.officer_id || user.id).toLowerCase()}@field.gov.in`;
                  const isCopied = copiedId === user.id;
                  const isCredCopied = copiedId === `cred-${user.id}`;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-800/40 transition duration-150 group"
                    >
                      {/* Officer ID & Role */}
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-blue-400">
                          {user.officer_id || user.id}
                        </div>
                        <div className="mt-1">
                          <span className={`inline-block text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                            user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'
                              ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                              : user.role === 'INSPECTION_OFFICER'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {user.role || 'OFFICER'}
                          </span>
                        </div>
                      </td>

                      {/* Name & Login Email Connection */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white text-sm">{user.full_name}</div>
                        <div className="text-[11px] text-slate-400">{user.designation}</div>
                        
                        {/* Connected Mobile App Email */}
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-400 group-hover:border-emerald-500/40 transition">
                            <span>📧</span>
                            <span className="font-medium">{resolvedEmail}</span>
                            <button
                              onClick={() => copyToClipboard(resolvedEmail, user.id)}
                              title="Copy Login Email"
                              className="ml-1 text-slate-400 hover:text-white transition p-0.5"
                            >
                              {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          
                          <span className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
                            App Login
                          </span>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3.5 text-slate-300">
                        {user.department}
                      </td>

                      {/* Duty Status */}
                      <td className="px-4 py-3.5">
                        {user.status === 'ACTIVE' || user.current_location ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 font-bold text-[10px] shadow-sm shadow-emerald-950/60">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                            </span>
                            ONLINE NOW
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                            OFFLINE
                          </span>
                        )}
                      </td>

                      {/* Current Location / Geofence */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col space-y-1">
                          <StatusBadge status={user.geofence_status} size="sm" />
                          {user.assigned_geofence?.name && (
                            <span className="text-[10px] text-cyan-300 font-medium truncate max-w-[160px] flex items-center gap-1" title={user.assigned_geofence.name}>
                              📍 {user.assigned_geofence.name}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {user.current_location
                              ? `${user.current_location.latitude.toFixed(4)}°, ${user.current_location.longitude.toFixed(4)}° (±${Math.round(user.current_location.accuracy || 5)}m)`
                              : 'Awaiting Ping'}
                          </span>
                        </div>
                      </td>

                      {/* Verification */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col space-y-1">
                          <StatusBadge status={user.verification?.overall || 'PENDING'} size="sm" />
                          <div className="flex items-center gap-1 text-[9px] font-mono">
                            <span
                              className={`px-1 rounded border ${
                                user.verification?.face === 'VERIFIED'
                                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-700/50'
                                  : user.verification?.face === 'FAILED'
                                  ? 'bg-rose-950/70 text-rose-400 border-rose-700/50'
                                  : 'bg-slate-950 text-slate-400 border-slate-800'
                              }`}
                              title={`Face Verification: ${user.verification?.face || 'PENDING'}`}
                            >
                              📷 {user.verification?.face === 'VERIFIED' ? 'MATCH' : user.verification?.face === 'FAILED' ? 'MISMATCH' : 'FACE'}
                            </span>
                            <span
                              className={`px-1 rounded border ${
                                user.verification?.voice === 'VERIFIED'
                                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-700/50'
                                  : user.verification?.voice === 'FAILED'
                                  ? 'bg-rose-950/70 text-rose-400 border-rose-700/50'
                                  : 'bg-slate-950 text-slate-400 border-slate-800'
                              }`}
                              title={`Voice Verification: ${user.verification?.voice || 'PENDING'}`}
                            >
                              🎙️ {user.verification?.voice === 'VERIFIED' ? 'MATCH' : user.verification?.voice === 'FAILED' ? 'MISMATCH' : 'VOICE'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Last Seen */}
                      <td className="px-4 py-3.5 font-mono text-[11px]">
                        {user.current_location ? (
                          <div>
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                              <Radio className="w-3 h-3 animate-pulse text-emerald-400 shrink-0" />
                              <span>{formatTimeAgo(user.current_location.last_updated)}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Speed: {user.current_location.speed ? `${user.current_location.speed} km/h` : '0.0 km/h'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[10px] italic">Standby (No Telemetry)</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {/* Live Online Ping / Toggle */}
                        <button
                          onClick={() => handleToggleOnline(user)}
                          disabled={pingingUserId === (user.officer_id || user.id)}
                          className={`p-1.5 rounded-lg transition inline-flex items-center gap-1 text-[10px] font-bold border ${
                            user.status === 'ACTIVE' || user.current_location
                              ? 'bg-emerald-950/80 hover:bg-rose-950/80 text-emerald-300 hover:text-rose-300 border-emerald-500/50 hover:border-rose-500/50'
                              : 'bg-slate-800 hover:bg-emerald-950 text-slate-300 hover:text-emerald-300 border-slate-700 hover:border-emerald-500/50'
                          }`}
                          title={user.status === 'ACTIVE' || user.current_location ? 'Officer is ONLINE. Click to switch to Standby.' : 'Click to bring Officer ONLINE with Live GNSS fix'}
                        >
                          <Radio className={`w-3.5 h-3.5 ${pingingUserId === (user.officer_id || user.id) ? 'animate-spin text-blue-400' : (user.status === 'ACTIVE' || user.current_location ? 'text-emerald-400' : 'text-slate-400')}`} />
                          <span className="hidden xl:inline">
                            {pingingUserId === (user.officer_id || user.id) ? 'Pinging...' : (user.status === 'ACTIVE' || user.current_location ? 'Online' : 'Set Online')}
                          </span>
                        </button>

                        {/* Copy Login Credentials Slip */}
                        <button
                          onClick={() => copyLoginCredentials(user)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded transition"
                          title="Copy User App Login Credentials Card"
                        >
                          {isCredCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <KeyRound className="w-3.5 h-3.5" />}
                        </button>

                        {/* Edit Access / Email */}
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded transition"
                          title="Edit Access & Login Email"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* View Inspector Drawer */}
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition"
                          title="View Full Inspector"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Location History */}
                        <button
                          onClick={() => navigate(`/history?userId=${user.id}`)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded transition"
                          title="View Location History"
                        >
                          <Route className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Person Record */}
                        {canModify && (
                          <button
                            onClick={() => handleOpenDelete(user)}
                            className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400 rounded transition border border-transparent hover:border-rose-500/40"
                            title="Delete Person Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Person Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-400" />
                  Register Authorized Person
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Creates an authorized record with a connected login email for the User Mobile App.
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddUserSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vikramaditya Rao"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Officer / User ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. OFF-101"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 uppercase"
                  />
                </div>
              </div>

              {/* Login Email Connection */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-emerald-900/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-emerald-400 uppercase">
                    Official Login Email ID (User Mobile App Login) *
                  </label>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
                    App Connection
                  </span>
                </div>
                <input
                  type="email"
                  required
                  placeholder={userId ? `${userId.toLowerCase()}@field.gov.in` : "e.g. officer@field.gov.in"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400">
                  This Email ID allows the officer/personnel to log in to the <span className="text-emerald-400 font-mono">SIH USER</span> Flutter app.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Role & Clearance Level
                  </label>
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="OFFICER">OFFICER (Field Personnel)</option>
                    <option value="INSPECTION_OFFICER">INSPECTION_OFFICER (Field Inspector)</option>
                    <option value="SUPERVISOR">SUPERVISOR (Tactical Lead)</option>
                    <option value="ADMIN">ADMIN (Command Admin)</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN (National Director)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="Field Operations"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    placeholder="Senior Inspection Officer"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Mobile Device ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="DEV-OFF-101"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold transition shadow-lg shadow-emerald-900/30"
                >
                  {submitting ? 'Registering...' : 'Save & Connect Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Person & Login Email Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-400" />
                  Edit Personnel & Login Connection
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Update officer profile and sync connected login email to Supabase Cloud & Local Server.
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleEditUserSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Login Email Connection */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-900/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-amber-400 uppercase">
                    Connected Login Email (Mobile User App) *
                  </label>
                  <span className="text-[10px] text-amber-300 font-bold bg-amber-950 px-2 py-0.5 rounded border border-amber-500/30">
                    Active Sync
                  </span>
                </div>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-400">
                  Changing this updates the authentication email in both SQLite and Supabase PostgreSQL.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Role & Clearance
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="OFFICER">OFFICER</option>
                    <option value="INSPECTION_OFFICER">INSPECTION_OFFICER</option>
                    <option value="SUPERVISOR">SUPERVISOR</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Duty Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="online">Online / Active</option>
                    <option value="offline">Offline</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={editDesignation}
                    onChange={(e) => setEditDesignation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-bold transition shadow-lg shadow-amber-900/30"
                >
                  {submitting ? 'Updating...' : 'Save & Sync Cloud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Telemetry Details Drawer */}
      <UserDetailsDrawer
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onEdit={(u) => {
          setSelectedUser(null);
          handleOpenEdit(u);
        }}
        onDelete={
          canModify
            ? (u) => {
                setSelectedUser(null);
                handleOpenDelete(u);
              }
            : undefined
        }
      />

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Person Record</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Are you sure you want to permanently delete <strong className="text-white">{userToDelete.full_name}</strong> (<span className="font-mono text-cyan-400">{userToDelete.officer_id || userToDelete.id}</span>)?
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1">
              <p className="font-semibold text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                This action will permanently:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                <li>Remove biometric face & voice enrollment data</li>
                <li>Unbind and delete assigned working area geofences</li>
                <li>Revoke mobile user app authentication credentials</li>
                <li>Clear attendance and verification audit logs</li>
              </ul>
            </div>

            {deleteError && (
              <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setUserToDelete(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-900/40 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Person Enrollment Modal */}
      <EnrollmentModal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        onSuccess={async () => {
          if (refreshData) await refreshData();
          setIsEnrollModalOpen(false);
        }}
      />
    </div>
  );
};
