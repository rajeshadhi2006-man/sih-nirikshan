-- ========================================================================
-- SMART INDIA HACKATHON (SIH) & DoSJE NATIONAL COMMAND SYSTEM
-- Complete Unified Supabase PostgreSQL Database Schema
-- Unified access for BOTH Government Web Dashboard and Flutter Mobile App (User & Officer)
-- Paste & Execute in Supabase SQL Editor: https://supabase.com/dashboard
-- ========================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================================================
-- 1. UNIFIED PERSONS ENROLLMENT, PROFILES, USERS & GOVERNMENT OFFICERS
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.persons (
    person_id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(64) UNIQUE NOT NULL,
    mobile VARCHAR(32),
    email VARCHAR(255),
    role VARCHAR(64) NOT NULL DEFAULT 'OFFICER',
    organization VARCHAR(255) NOT NULL DEFAULT 'Department of Social Justice and Empowerment',
    assigned_area VARCHAR(255),
    profile_photo_url TEXT,
    face_embedding TEXT,
    voice_embedding TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    officer_id VARCHAR(64) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(32),
    department VARCHAR(128) NOT NULL DEFAULT 'Field Operations',
    designation VARCHAR(128) NOT NULL DEFAULT 'Field Officer',
    role VARCHAR(64) NOT NULL DEFAULT 'OFFICER',
    is_active BOOLEAN NOT NULL DEFAULT true,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely drop legacy check constraint on profiles if table already existed
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ALTER COLUMN role TYPE VARCHAR(64);

CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    department TEXT NOT NULL DEFAULT 'Field Operations',
    designation TEXT DEFAULT 'Field Personnel',
    role TEXT NOT NULL DEFAULT 'OFFICER',
    status TEXT NOT NULL DEFAULT 'offline',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.government_officers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    officer_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    badge_number TEXT,
    rank TEXT,
    department TEXT NOT NULL DEFAULT 'Department of Social Justice and Empowerment',
    role TEXT NOT NULL DEFAULT 'OFFICER',
    is_super_admin INTEGER DEFAULT 0,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 2. GEOFENCES & ASSIGNMENTS
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id VARCHAR(64) REFERENCES public.persons(person_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    area_name VARCHAR(255),
    department VARCHAR(128) NOT NULL DEFAULT 'Command Center',
    description TEXT,
    center_latitude DOUBLE PRECISION NOT NULL,
    center_longitude DOUBLE PRECISION NOT NULL,
    radius_meters DOUBLE PRECISION NOT NULL,
    geometry_type VARCHAR(32) NOT NULL DEFAULT 'CIRCLE',
    polygon_coordinates JSONB DEFAULT '[]'::jsonb,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.geofence_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_id VARCHAR(64) NOT NULL,
    user_id TEXT,
    geofence_id UUID NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
    assignment_name VARCHAR(255) DEFAULT 'Perimeter Assignment',
    assigned_by VARCHAR(255) DEFAULT 'Command Officer',
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.geofence_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    geofence_id TEXT,
    event_type TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 3. LOCATION UPDATES & LIVE GPS TELEMETRY
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.locations (
    user_id TEXT PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION DEFAULT 5.0,
    speed DOUBLE PRECISION DEFAULT 0.0,
    heading DOUBLE PRECISION DEFAULT 0.0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'online',
    is_inside_geofence INTEGER DEFAULT 1,
    geofence_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.location_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,
    officer_id VARCHAR(64),
    full_name VARCHAR(255),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION DEFAULT 5.0,
    altitude DOUBLE PRECISION DEFAULT 0.0,
    speed DOUBLE PRECISION DEFAULT 0.0,
    heading DOUBLE PRECISION DEFAULT 0.0,
    geofence_id UUID REFERENCES public.geofences(id) ON DELETE SET NULL,
    geofence_name VARCHAR(255),
    geofence_status VARCHAR(32) NOT NULL DEFAULT 'INSIDE',
    is_inside_geofence BOOLEAN NOT NULL DEFAULT true,
    device_id VARCHAR(128),
    battery_percentage INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.location_history (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION DEFAULT 5.0,
    speed DOUBLE PRECISION DEFAULT 0.0,
    heading DOUBLE PRECISION DEFAULT 0.0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_inside_geofence INTEGER DEFAULT 1,
    geofence_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 4. ATTENDANCE RECORDS, MUSTER ROLL & SESSIONS
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    officer_id TEXT,
    date TEXT NOT NULL,
    check_in_time TEXT NOT NULL,
    check_out_time TEXT,
    entry_lat DOUBLE PRECISION,
    entry_lng DOUBLE PRECISION,
    exit_lat DOUBLE PRECISION,
    exit_lng DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'PRESENT',
    geofence_verified INTEGER DEFAULT 1,
    face_verified INTEGER DEFAULT 1,
    voice_verified INTEGER DEFAULT 1,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,
    officer_id VARCHAR(64),
    full_name VARCHAR(255),
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    geofence_id UUID REFERENCES public.geofences(id) ON DELETE SET NULL,
    face_verified BOOLEAN NOT NULL DEFAULT false,
    voice_verified BOOLEAN NOT NULL DEFAULT false,
    location_verified BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(32) NOT NULL DEFAULT 'PRESENT',
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.enrolled_attendance_users (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    authorized_location TEXT NOT NULL,
    geofence_id TEXT,
    geofence_center_lat DOUBLE PRECISION NOT NULL,
    geofence_center_lng DOUBLE PRECISION NOT NULL,
    geofence_radius DOUBLE PRECISION NOT NULL DEFAULT 200.0,
    enrollment_status TEXT NOT NULL DEFAULT 'ENROLLED',
    current_attendance_status TEXT NOT NULL DEFAULT 'OUTSIDE',
    last_gps_status TEXT DEFAULT 'ONLINE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
    attendance_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    geofence_id TEXT,
    entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entry_latitude DOUBLE PRECISION NOT NULL,
    entry_longitude DOUBLE PRECISION NOT NULL,
    entry_accuracy DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    exit_time TIMESTAMPTZ,
    exit_latitude DOUBLE PRECISION,
    exit_longitude DOUBLE PRECISION,
    exit_accuracy DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'PRESENT',
    duration_seconds INTEGER DEFAULT 0,
    duration_formatted TEXT DEFAULT '0m',
    date TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 5. VERIFICATION RECORDS (FACE, VOICE, LOCATION, MULTI-FACTOR FUSION)
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.verification_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,
    user_name VARCHAR(255),
    officer_id VARCHAR(64),
    verification_type VARCHAR(64) NOT NULL,
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING',
    failure_reason TEXT,
    details TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.verification_results (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    geofence_id TEXT,
    officer_id TEXT,
    face_result TEXT DEFAULT 'MODEL NOT CONNECTED',
    face_confidence DOUBLE PRECISION DEFAULT 0.0,
    voice_result TEXT DEFAULT 'MODEL NOT CONNECTED',
    voice_confidence DOUBLE PRECISION DEFAULT 0.0,
    gps_result TEXT DEFAULT 'VERIFIED',
    final_result TEXT NOT NULL DEFAULT 'PENDING',
    result TEXT NOT NULL DEFAULT 'PENDING',
    engine_mode TEXT DEFAULT 'PRODUCTION_AI',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata TEXT
);

-- ========================================================================
-- 6. ALERTS & INCIDENT DISPATCH
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128),
    user_name VARCHAR(255),
    officer_id VARCHAR(64),
    severity VARCHAR(32) NOT NULL DEFAULT 'HIGH',
    alert_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    geofence_id UUID REFERENCES public.geofences(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 7. AUDIT LOGS & DEVICES
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_id VARCHAR(64),
    officer_name VARCHAR(255) NOT NULL,
    action VARCHAR(128) NOT NULL,
    target VARCHAR(255),
    result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.devices (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    device_id TEXT UNIQUE NOT NULL,
    user_id TEXT,
    device_type TEXT NOT NULL DEFAULT 'FLUTTER_USER_APP',
    os_version TEXT,
    app_version TEXT,
    battery_level INTEGER DEFAULT 100,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 8. DoSJE PROJECTS, INSTITUTIONS & CCTV
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    scheme TEXT NOT NULL DEFAULT 'PM-AJAY',
    ngo_institute TEXT NOT NULL,
    incharge_name TEXT NOT NULL,
    incharge_phone TEXT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    location_address TEXT NOT NULL,
    latitude DOUBLE PRECISION DEFAULT 0.0,
    longitude DOUBLE PRECISION DEFAULT 0.0,
    registered_beneficiaries INTEGER DEFAULT 0,
    staff_count INTEGER DEFAULT 0,
    compliance_status TEXT NOT NULL DEFAULT 'COMPLIANT',
    risk_score DOUBLE PRECISION DEFAULT 0.0,
    geofence_id TEXT,
    cctv_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.institutions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'NGO',
    code TEXT UNIQUE NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    address TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    contact_phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cctv_cameras (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    camera_name TEXT NOT NULL,
    location_description TEXT,
    stream_url TEXT,
    status TEXT NOT NULL DEFAULT 'OFFLINE',
    last_heartbeat TIMESTAMPTZ,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 9. INSPECTIONS, REPORTS & EVIDENCE
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.inspection_teams (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    team_name TEXT NOT NULL,
    lead_officer_name TEXT NOT NULL,
    members_json JSONB DEFAULT '[]'::jsonb,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    availability_status TEXT NOT NULL DEFAULT 'AVAILABLE',
    current_workload INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inspections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    inspection_code TEXT UNIQUE NOT NULL,
    project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    ngo_institute TEXT NOT NULL,
    inspection_type TEXT NOT NULL DEFAULT 'SURPRISE',
    reason TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    deadline TIMESTAMPTZ,
    team_id TEXT,
    team_name TEXT,
    inspector_id TEXT,
    inspector_name TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    start_time TIMESTAMPTZ,
    completion_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inspection_reports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    inspection_id TEXT UNIQUE NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    inspector_id TEXT NOT NULL,
    inspector_name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION DEFAULT 5.0,
    geofence_status TEXT DEFAULT 'INSIDE',
    observations TEXT NOT NULL,
    compliance_findings TEXT,
    violations TEXT,
    beneficiary_verification_summary TEXT,
    staff_verification_summary TEXT,
    remarks TEXT,
    final_status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inspection_evidence (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    inspection_id TEXT NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL,
    file_url TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    inspector_id TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 10. AI ANOMALIES & VC CALL SESSIONS
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.anomalies (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
    reason TEXT NOT NULL,
    evidence_summary TEXT,
    recommended_action TEXT,
    status TEXT NOT NULL DEFAULT 'DETECTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vc_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    target_person_id TEXT NOT NULL,
    target_person_name TEXT NOT NULL,
    target_role TEXT NOT NULL DEFAULT 'INCHARGE',
    initiator_id TEXT DEFAULT 'COMMAND-OFFICER',
    status TEXT NOT NULL DEFAULT 'REQUESTED',
    call_type TEXT DEFAULT 'RANDOM_SURPRISE_VC',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    audit_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================================
-- 11. INDEXES FOR PERFORMANCE
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_geofences_active ON public.geofences (is_active);
CREATE INDEX IF NOT EXISTS idx_location_updates_user_id ON public.location_updates (user_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_created_at ON public.location_updates (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.alerts (status);
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON public.attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections (status);
CREATE INDEX IF NOT EXISTS idx_projects_state ON public.projects (state);

-- ========================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES FOR BOTH WEB & FLUTTER APPS
-- ========================================================================
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Unified read %I" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Unified read %I" ON public.%I FOR SELECT TO anon, authenticated USING (true);', tbl, tbl);
        
        EXECUTE format('DROP POLICY IF EXISTS "Unified insert %I" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Unified insert %I" ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true);', tbl, tbl);
        
        EXECUTE format('DROP POLICY IF EXISTS "Unified update %I" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Unified update %I" ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Unified delete %I" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Unified delete %I" ON public.%I FOR DELETE TO anon, authenticated USING (true);', tbl, tbl);
    END LOOP;
END
$$;

-- ========================================================================
-- 13. REALTIME REPLICATION PUBLICATION FOR BOTH APPS & WEB
-- ========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.geofences; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.geofence_assignments; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.location_updates; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.locations; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.verification_records; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.verification_results; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inspections; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inspection_reports; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inspection_evidence; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vc_sessions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.anomalies; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.devices; EXCEPTION WHEN OTHERS THEN NULL; END;
END
$$;

-- ========================================================================
-- 14. SUPABASE STORAGE BUCKETS (FOR EVIDENCE & BIOMETRICS)
-- ========================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('inspection-evidence', 'inspection-evidence', true),
  ('biometric-samples', 'biometric-samples', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS Access Policies
DROP POLICY IF EXISTS "Public Access to Inspection Evidence" ON storage.objects;
CREATE POLICY "Public Access to Inspection Evidence" ON storage.objects 
FOR ALL TO anon, authenticated USING (bucket_id IN ('inspection-evidence', 'biometric-samples', 'avatars')) 
WITH CHECK (bucket_id IN ('inspection-evidence', 'biometric-samples', 'avatars'));

-- ========================================================================
-- 15. INITIAL CORE SEED DATA
-- ========================================================================
INSERT INTO public.profiles (officer_id, full_name, email, phone, department, designation, role)
VALUES 
  ('CMD-001', 'Rajesh Sharma', 'rajesh.sharma@dosje.gov.in', '+91 9876543210', 'National Command', 'Chief Operations Officer', 'SUPER_ADMIN'),
  ('OFF-101', 'Vikramaditya Rao', 'vikram.rao@dosje.gov.in', '+91 9811223344', 'Field Operations', 'Senior Inspection Officer', 'INSPECTION_OFFICER'),
  ('USR-001', 'Amit Kumar Verma', 'amit.verma@field.gov.in', '+91 9822334455', 'Field Personnel', 'Field Executive', 'OFFICER')
ON CONFLICT (officer_id) DO NOTHING;

INSERT INTO public.users (user_id, full_name, email, phone, department, designation, role, status)
VALUES 
  ('USR-001', 'Amit Kumar Verma', 'amit.verma@field.gov.in', '+91 9822334455', 'Field Personnel', 'Field Executive', 'OFFICER', 'online'),
  ('USR-002', 'Pooja Sharma', 'pooja.sharma@field.gov.in', '+91 9833445566', 'Field Personnel', 'Technical Assistant', 'OFFICER', 'online'),
  ('USR-003', 'Rohan Patel', 'rohan.patel@field.gov.in', '+91 9844556677', 'Field Personnel', 'Project Assistant', 'OFFICER', 'offline')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.projects (id, name, scheme, ngo_institute, incharge_name, incharge_phone, state, district, location_address, latitude, longitude, registered_beneficiaries, staff_count, compliance_status, cctv_count)
VALUES 
  ('proj-delhi-01', 'DoSJE Skill Development & Residential Center', 'PM-AJAY', 'Samarthya Foundation', 'Dr. Arun Kumar', '+91 9811122233', 'Delhi', 'Central Delhi', 'Pusa Road, Karol Bagh, New Delhi', 28.6448, 77.2167, 120, 14, 'COMPLIANT', 1),
  ('proj-mumbai-01', 'Divyangjan Rehabilitation & Training Complex', 'Divyangjan Support', 'Prerna Sansthan', 'Sunita Deshmukh', '+91 9822233344', 'Maharashtra', 'Mumbai Suburban', 'Andheri East, Mumbai', 19.1136, 72.8697, 85, 10, 'COMPLIANT', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cctv_cameras (id, project_id, camera_name, location_description, stream_url, status)
VALUES 
  ('CCTV-01', 'proj-delhi-01', 'Main Entry Gate CAM-01', 'Front Gate & Reception Sector', '1', 'ONLINE')
ON CONFLICT (id) DO NOTHING;
