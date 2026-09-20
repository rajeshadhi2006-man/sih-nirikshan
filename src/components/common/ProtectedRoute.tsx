import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-slate-400 font-mono text-xs tracking-widest uppercase">
          Authenticating Government Command Clearance...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return (
      <div className="p-8 text-center bg-slate-950 min-h-screen flex flex-col items-center justify-center">
        <div className="max-w-md bg-slate-900 border border-rose-800/60 p-6 rounded-xl text-rose-300">
          <h2 className="text-lg font-bold text-rose-400 mb-2">Clearance Restriction</h2>
          <p className="text-xs text-slate-300 mb-4">
            Your current assigned role ({role}) does not have administrative permission to modify
            this module.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
          >
            Return to Authorized View
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
