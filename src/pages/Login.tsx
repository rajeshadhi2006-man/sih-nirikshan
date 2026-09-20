import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Lock,
  User,
  AlertCircle,
  CheckCircle,
  KeyRound,
  Database,
  Building,
  UserPlus,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, signUpWithSupabase } = useAuth();

  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [officerIdOrEmail, setOfficerIdOrEmail] = useState('GOV-CMD-9041');
  const [password, setPassword] = useState('GovSecret@2026');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('National Surveillance Directorate');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    if (mode === 'signin') {
      const res = await login(officerIdOrEmail, password);
      setIsSubmitting(false);

      if (res.success) {
        navigate('/dashboard');
      } else {
        setErrorMsg(res.error || 'Invalid credentials or security clearance.');
      }
    } else {
      if (!officerIdOrEmail.includes('@')) {
        setIsSubmitting(false);
        setErrorMsg('Please enter a valid email address to register in Supabase Auth.');
        return;
      }

      const res = await signUpWithSupabase(
        officerIdOrEmail,
        password,
        fullName || 'Authorized Officer',
        undefined,
        department
      );
      setIsSubmitting(false);

      if (res.success) {
        setSuccessMsg('Officer account successfully registered in Supabase! Entering Command Center...');
        setTimeout(() => {
          navigate('/dashboard');
        }, 1200);
      } else {
        setErrorMsg(res.error || 'Failed to register officer in Supabase.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl relative z-10">
        {/* National Emblem & Header */}
        <div className="text-center space-y-2 mb-5">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-blue-600/20 to-emerald-500/20 border border-amber-500/30 text-amber-400 shadow-inner">
            <Shield className="w-10 h-10" />
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-widest font-extrabold text-amber-400 block">
              Government of India • Ministry Directorate
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              National Monitoring Portal
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Command & Verification Console • Supabase Cloud Backend
            </p>
          </div>
        </div>

        {/* Live Supabase Connectivity Badge */}
        <div className="mb-4 p-2.5 rounded-xl bg-blue-950/40 border border-blue-800/60 text-blue-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-mono text-slate-300">
              Supabase Project: <span className="text-emerald-400 font-bold">ctmkpwwbdexwkakuqpat</span>
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            ONLINE
          </span>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 mb-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-2 rounded-lg flex items-center justify-center space-x-1.5 transition ${
              mode === 'signin'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg('');
              setSuccessMsg('');
              if (!officerIdOrEmail.includes('@')) {
                setOfficerIdOrEmail('officer@nic.in');
              }
            }}
            className={`py-2 rounded-lg flex items-center justify-center space-x-1.5 transition ${
              mode === 'register'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register Officer</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Full Legal Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-sans"
                  placeholder="e.g. Dr. Rajesh Sharma, IAS"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              {mode === 'register' ? 'Official Government Email' : 'Officer ID or Government Email'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type={mode === 'register' ? 'email' : 'text'}
                value={officerIdOrEmail}
                onChange={(e) => setOfficerIdOrEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                placeholder={mode === 'register' ? 'officer@nic.in' : 'e.g. GOV-CMD-9041 or officer@nic.in'}
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Assigned Department
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Building className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-sans"
                  placeholder="e.g. Disaster Management Authority"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Security Token / Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center space-x-2 text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
              />
              <span className="text-[11px]">Remember Authorized Terminal</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-900/40 transition flex items-center justify-center space-x-2 disabled:opacity-50 mt-2"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Connecting to Supabase...</span>
              </span>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>
                  {mode === 'signin' ? 'Sign In through Supabase' : 'Register Officer in Supabase'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
