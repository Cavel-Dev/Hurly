// Supabase + Local Database Service Module
const SUPABASE_URL = window.SUPABASE_URL || "https://ncqfvcymhvjcchrwelfg.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";
if (!window.SUPABASE_URL) window.SUPABASE_URL = SUPABASE_URL;
if (!window.SUPABASE_ANON_KEY) window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
let pendingBadgeState = null;

function normalizeDateValue(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  if (str.includes('T')) return str.split('T')[0];
  if (str.includes(' ')) return str.split(' ')[0];
  return str;
}

function createConnectionBadge() {
  let badge = document.getElementById('connectionBadge');
  if (badge) return badge;
  if (!document.body) return null;

  badge = document.createElement('div');
  badge.id = 'connectionBadge';
  badge.style.cssText = [
    'position: fixed',
    'top: 14px',
    'right: 14px',
    'padding: 6px 10px',
    'border-radius: 999px',
    'font-size: 12px',
    'font-weight: 600',
    'letter-spacing: 0.2px',
    'color: #fff',
    'background: #6b7280',
    'box-shadow: 0 6px 20px rgba(0,0,0,0.15)',
    'z-index: 9999',
    'pointer-events: none'
  ].join('; ');
  badge.textContent = 'Supabase: Connecting';
  document.body.appendChild(badge);
  return badge;
}

function setBadgeStatus(state, message) {
  pendingBadgeState = { state, message };
  const badge = createConnectionBadge();
  if (!badge) return;
  const map = {
    connecting: { text: 'Supabase: Connecting', color: '#6b7280' },
    connected: { text: 'Supabase: Connected', color: '#16a34a' },
    error: { text: 'Supabase: Error', color: '#dc2626' },
    local: { text: 'Local Storage', color: '#f59e0b' }
  };
  const chosen = map[state] || map.connecting;
  badge.textContent = message || chosen.text;
  badge.style.background = chosen.color;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (pendingBadgeState) {
      setBadgeStatus(pendingBadgeState.state, pendingBadgeState.message);
    }
  });
}

function loadSupabase() {
  return new Promise((resolve) => {
    if (window.__supabaseClient) {
      setBadgeStatus('connecting');
      resolve(window.__supabaseClient);
      return;
    }
    if (window.supabase && window.supabase.createClient) {
      setBadgeStatus('connecting');
      window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      resolve(window.__supabaseClient);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
    script.onload = () => {
      if (window.supabase && window.supabase.createClient) {
        setBadgeStatus('connecting');
        window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve(window.__supabaseClient);
      } else {
        resolve(null);
      }
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}
function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem('huly_session') || 'null');
  } catch (e) {
    return null;
  }
}

function auditLog(action, entity, details = {}) {
  try {
    const raw = localStorage.getItem('huly_audit');
    const list = raw ? JSON.parse(raw) : [];
    const user = getSessionUser();
    list.push({
      id: Date.now().toString(36),
      ts: new Date().toISOString(),
      actor: user ? { id: user.id, email: user.email, role: user.role } : null,
      action,
      entity,
      details
    });
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const pruned = list.filter(item => new Date(item.ts).getTime() >= cutoff);
    localStorage.setItem('huly_audit', JSON.stringify(pruned));
  } catch (e) {
    console.warn('Audit log failed', e);
  }
}

window.audit = { log: auditLog };

function getActiveSiteId() {
  try {
    return localStorage.getItem('huly_active_site') || '';
  } catch (e) {
    return '';
  }
}

function isDemoModeEnabled() {
  try {
    return localStorage.getItem('huly_demo_mode') === 'true';
  } catch (e) {
    return false;
  }
}

class DatabaseService {
  constructor() {
    this.storagePrefix = 'huly_';
    this.supabase = null;
    this.supabaseHealthy = false;
    this.demoMode = isDemoModeEnabled();
    this.supabaseReady = this.demoMode
      ? Promise.resolve(null)
      : loadSupabase().then(async (client) => {
          this.supabase = client;
          if (client) {
            console.log('Supabase client initialized');
            await this.checkSupabaseConnection();
            await this.migrateLocalToSupabase();
            await this.syncAllTables();
            await this.fixLegacySiteIds(getActiveSiteId());
          } else {
            console.warn('Supabase client unavailable, using Local Storage');
            setBadgeStatus('local');
          }
          return client;
        });
    this.initLocalStorage();
    if (this.demoMode) setBadgeStatus('local', 'Demo Mode');
    console.log('Database service initialized with Local Storage');
  }

  isDemoMode() {
    this.demoMode = isDemoModeEnabled();
    return this.demoMode;
  }

  assertWritable(action = 'write') {
    if (!this.isDemoMode()) return;
    throw new Error(`Demo mode is read-only. Cannot ${action}.`);
  }

  async getSupabase() {
    if (this.supabase) return this.supabase;
    return this.supabaseReady;
  }

  async checkSupabaseConnection() {
    if (this.isDemoMode()) return false;
    const sb = this.supabase || (await this.supabaseReady);
    if (!sb) {
      this.supabaseHealthy = false;
      setBadgeStatus('local');
      return false;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const url = `${SUPABASE_URL}/rest/v1/employees?select=id&limit=1`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      this.supabaseHealthy = true;
      setBadgeStatus('connected');
      return true;
    } catch (error) {
      console.error('Supabase connection check failed:', error);
      this.supabaseHealthy = false;
      setBadgeStatus('error', 'Supabase: Check schema');
      return false;
    }
  }

  async migrateLocalToSupabase() {
    if (this.isDemoMode()) return;
    const sb = await this.getSupabase();
    if (!sb) return;

    const flagKey = this.storagePrefix + 'supabase_migrated_v1';
    if (localStorage.getItem(flagKey)) return;

    const tables = [
      { key: 'sites', table: 'sites' },
      { key: 'employees', table: 'employees' },
      { key: 'attendance', table: 'attendance' },
      { key: 'payroll', table: 'payroll' }
    ];

    try {
      const normalizeRow = (table, row) => {
        if (!row || typeof row !== 'object') return null;
        const cleaned = {};
        const map = {
          sites: ['id', 'name', 'location', 'status', 'workers_count', 'created_at'],
          employees: ['id', 'name', 'position', 'status', 'document_status', 'email', 'phone', 'site_id', 'created_at'],
          attendance: ['id', 'employee_id', 'employee_name', 'date', 'status', 'site_id', 'created_at', 'clock_in', 'clock_out', 'notes', 'hours'],
          payroll: ['id', 'pay_period', 'site_id', 'employees_count', 'total_hours', 'total', 'status', 'created_at', 'entries', 'data']
        };

        if (table === 'attendance') {
          row = {
            ...row,
            employee_id: row.employee_id ?? row.employee_ID,
            employee_name: row.employee_name ?? row.Employee ?? row.Name,
            date: row.date ?? row.Date,
            status: row.status ?? row.Status,
            site_id: row.site_id ?? row.Worksite
          };

          const dateStr = typeof row.date === 'string' ? row.date : '';
          const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
          if (!isDateValid) {
            row.date = undefined;
          }

          const toIso = (timeValue) => {
            if (!isDateValid || typeof timeValue !== 'string') return null;
            const t = timeValue.trim();
            if (!t) return null;
            if (t.includes('T')) {
              const dt = new Date(t);
              return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
            }
            if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return null;
            const padded = t.length === 5 ? `${t}:00` : t;
            const dt = new Date(`${dateStr}T${padded}`);
            return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
          };

          const ci = toIso(row.clock_in);
          const co = toIso(row.clock_out);
          row.clock_in = ci ?? null;
          row.clock_out = co ?? null;

          if (row.created_at) {
            const created = new Date(row.created_at);
            if (Number.isNaN(created.getTime())) {
              row.created_at = undefined;
            }
          }
        }

        if (table === 'employees') {
          row = {
            ...row,
            name: row.name ?? row.employee_name ?? row.Name,
            position: row.position ?? row.Position,
            document_status: row.document_status ?? row.Documents
          };
        }

        if (table === 'sites') {
          row = {
            ...row,
            location: row.location ?? row.Location
          };
        }

        const allow = map[table] || [];
        allow.forEach((key) => {
          if (row[key] !== undefined) cleaned[key] = row[key];
        });

        if (!cleaned.id) return null;
        return cleaned;
      };

      for (const { key, table } of tables) {
        const raw = localStorage.getItem(this.storagePrefix + key);
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list) || list.length === 0) continue;
        const sanitized = list.map((row) => normalizeRow(table, row)).filter(Boolean);
        if (sanitized.length === 0) continue;
        const { error } = await sb.from(table).upsert(sanitized, { onConflict: 'id' });
        if (error) throw error;
      }
      localStorage.setItem(flagKey, new Date().toISOString());
      console.log('Local Storage migrated to Supabase');
    } catch (error) {
      console.error('Supabase migration failed:', error);
    }
  }

  initLocalStorage() {
    // Initialize default data if not exists
    if (!localStorage.getItem(this.storagePrefix + 'sites')) {
      localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify([]));
    }
    if (!localStorage.getItem(this.storagePrefix + 'employees')) {
      localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify([]));
    }
    if (!localStorage.getItem(this.storagePrefix + 'attendance')) {
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify([]));
    }
    if (!localStorage.getItem(this.storagePrefix + 'payroll')) {
      localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify([]));
    }
  }

  // Helper function to generate unique IDs
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }



  async fixLegacySiteIds(activeSite) {
    if (this.isDemoMode()) return;
    const target = activeSite || getActiveSiteId();
    if (!target) return;
    const legacyIds = ['All Crews', 'Crew A', 'Crew B', 'Crew C'];
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        for (const legacy of legacyIds) {
          await sb.from('attendance').update({ site_id: target }).eq('site_id', legacy);
        }
      }
    } catch (e) {
      console.warn('Legacy site_id fix failed', e);
    }
  }

  async syncAllTables() {
    if (this.isDemoMode()) return;
    const tables = ['sites', 'employees', 'attendance', 'payroll'];
    for (const table of tables) {
      await this.syncTable(table);
    }
  }

  async syncTable(table) {
    if (this.isDemoMode()) return;
    try {
      const sb = await this.getSupabase();
      if (!sb || !this.supabaseHealthy) return;
      const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      localStorage.setItem(this.storagePrefix + table, JSON.stringify(data || []));
    } catch (e) {
      console.warn(`Background sync failed for ${table}`, e);
    }
  }

  getLocalTable(table) {
    try {
      const raw = localStorage.getItem(this.storagePrefix + table);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // ============ SITES ============

  async getSites() {
    if (this.isDemoMode()) return [];
    try {
      const cached = this.getLocalTable('sites');
      if (cached && cached.length) {
        this.syncTable('sites');
        return cached;
      }
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { data, error } = await sb.from('sites').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(data || []));
        return data || [];
      }
      return cached || [];
    } catch (error) {
      console.error('Error fetching sites:', error);
      return [];
    }
  }

  async createSite(siteData) {
    this.assertWritable('create site');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const newSite = { id: this.generateId(), ...siteData, created_at: new Date().toISOString() };
        const { data, error } = await sb.from('sites').insert(newSite).select().single();
        if (error) throw error;
        if (window.audit) window.audit.log('create', 'site', { id: newSite.id, name: newSite.name });
        return data || newSite;
      }
      const sites = JSON.parse(localStorage.getItem(this.storagePrefix + 'sites') || '[]');
      const newSite = { id: this.generateId(), ...siteData, created_at: new Date().toISOString() };
      sites.push(newSite);
      localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(sites));
      if (window.audit) window.audit.log('create', 'site', { id: newSite.id, name: newSite.name });
      return newSite;
    } catch (error) {
      console.error('Error creating site:', error);
      throw error;
    }
  }

  async updateSite(siteId, siteData) {
    this.assertWritable('update site');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { data, error } = await sb.from('sites').update(siteData).eq('id', siteId).select().single();
        if (error) throw error;
        if (window.audit) window.audit.log('update', 'site', { id: siteId, changes: siteData });
        return data || null;
      }
      const sites = JSON.parse(localStorage.getItem(this.storagePrefix + 'sites') || '[]');
      const index = sites.findIndex(s => s.id === siteId);
      if (index !== -1) {
        sites[index] = { ...sites[index], ...siteData };
        localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(sites));
        if (window.audit) window.audit.log('update', 'site', { id: siteId, changes: siteData });
        return sites[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating site:', error);
      throw error;
    }
  }

  async deleteSite(siteId) {
    this.assertWritable('delete site');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { error } = await sb.from('sites').delete().eq('id', siteId);
        if (error) throw error;
        if (window.audit) window.audit.log('delete', 'site', { id: siteId });
        return true;
      }
      const sites = JSON.parse(localStorage.getItem(this.storagePrefix + 'sites') || '[]');
      const filtered = sites.filter(s => s.id !== siteId);
      localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'site', { id: siteId });
      return true;
    } catch (error) {
      console.error('Error deleting site:', error);
      throw error;
    }
  }

  // ============ EMPLOYEES ============
  async getEmployees(siteId = null) {
    if (this.isDemoMode()) return [];
    try {
      const activeSite = siteId || getActiveSiteId();
      const cached = this.getLocalTable('employees');
      if (cached && cached.length) {
        this.syncTable('employees');
        if (activeSite) {
          const filtered = cached.filter(e => !e.site_id || e.site_id === '' || e.site_id === activeSite);
          if (filtered.some(e => !e.site_id || e.site_id === '') && localStorage.getItem('huly_default_site_confirmed') === 'true') {
            this.backfillMissingSiteId(activeSite);
          }
          return filtered;
        }
        return cached;
      }
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        let query = sb.from('employees').select('*');
        if (activeSite) {
          query = query.or(`site_id.eq.${activeSite},site_id.is.null,site_id.eq.`);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify(data || []));
        return data || [];
      }
      if (activeSite) return cached.filter(e => !e.site_id || e.site_id === '' || e.site_id === activeSite);
      return cached;
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    }
  }

  async createEmployee(employeeData) {
    this.assertWritable('create employee');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const newEmployee = { id: this.generateId(), ...employeeData, created_at: new Date().toISOString() };
        const { data, error } = await sb.from('employees').insert(newEmployee).select().single();
        if (error) throw error;
        if (window.audit) window.audit.log('create', 'employee', { id: newEmployee.id, name: newEmployee.name });
        return data || newEmployee;
      }
      const employees = JSON.parse(localStorage.getItem(this.storagePrefix + 'employees') || '[]');
      const newEmployee = { id: this.generateId(), ...employeeData, created_at: new Date().toISOString() };
      employees.push(newEmployee);
      localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify(employees));
      if (window.audit) window.audit.log('create', 'employee', { id: newEmployee.id, name: newEmployee.name });
      return newEmployee;
    } catch (error) {
      console.error('Error creating employee:', error);
      throw error;
    }
  }

  async updateEmployee(employeeId, employeeData) {
    this.assertWritable('update employee');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { data, error } = await sb.from('employees').update(employeeData).eq('id', employeeId).select().single();
        if (error) throw error;
        const nextName = employeeData?.name ?? employeeData?.employee_name;
        if (nextName) {
          await this.syncAttendanceEmployeeName(employeeId, String(nextName));
        }
        if (window.audit) window.audit.log('update', 'employee', { id: employeeId, changes: employeeData });
        return data || null;
      }
      const employees = JSON.parse(localStorage.getItem(this.storagePrefix + 'employees') || '[]');
      const index = employees.findIndex(e => e.id === employeeId);
      if (index !== -1) {
        employees[index] = { ...employees[index], ...employeeData };
        localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify(employees));
        const nextName = employeeData?.name ?? employeeData?.employee_name;
        if (nextName) {
          await this.syncAttendanceEmployeeName(employeeId, String(nextName));
        }
        if (window.audit) window.audit.log('update', 'employee', { id: employeeId, changes: employeeData });
        return employees[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating employee:', error);
      throw error;
    }
  }

  async syncAttendanceEmployeeName(employeeId, employeeName) {
    const normalizedId = String(employeeId || '');
    const normalizedName = String(employeeName || '').trim();
    if (!normalizedId || !normalizedName) return;

    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { error } = await sb
          .from('attendance')
          .update({ employee_name: normalizedName })
          .eq('employee_id', normalizedId);
        if (error) console.warn('Supabase attendance name sync failed', error);
      }
    } catch (e) {
      console.warn('Attendance name sync failed', e);
    }

    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      let changed = false;
      const next = attendance.map((row) => {
        if (String(row.employee_id || row.employee_ID) !== normalizedId) return row;
        if (String(row.employee_name || '') === normalizedName) return row;
        changed = true;
        return { ...row, employee_name: normalizedName };
      });
      if (changed) {
        localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(next));
      }
    } catch (e) {
      console.warn('Local attendance name sync failed', e);
    }
  }

  async deleteEmployee(employeeId) {
    this.assertWritable('delete employee');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { error } = await sb.from('employees').delete().eq('id', employeeId);
        if (error) throw error;
        if (window.audit) window.audit.log('delete', 'employee', { id: employeeId });
        return true;
      }
      const employees = JSON.parse(localStorage.getItem(this.storagePrefix + 'employees') || '[]');
      const filtered = employees.filter(e => e.id !== employeeId);
      localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'employee', { id: employeeId });
      return true;
    } catch (error) {
      console.error('Error deleting employee:', error);
      throw error;
    }
  }

  // ============ ATTENDANCE ============
  async getAttendance(filters = {}) {
    if (this.isDemoMode()) return [];
    try {
      const activeSite = filters.siteId || getActiveSiteId();
      const normalizedDate = normalizeDateValue(filters.date);
      const cached = this.getLocalTable('attendance');
      if (cached && cached.length) {
        this.syncTable('attendance');
        let filtered = cached;
        if (normalizedDate) filtered = filtered.filter(a => {
          const d = normalizeDateValue(a.date || a.Date || '');
          return d === normalizedDate;
        });
        if (activeSite) {
          filtered = filtered.filter(a => !a.site_id || a.site_id === '' || (a.site_id || a.Worksite) === activeSite);
          if (filtered.some(a => !a.site_id || a.site_id === '') && localStorage.getItem('huly_default_site_confirmed') === 'true') {
            this.backfillMissingSiteId(activeSite);
          }
        }
        if (filters.employeeId) filtered = filtered.filter(a => String(a.employee_id || a.employee_ID) === String(filters.employeeId));
        return filtered.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
      }
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        let query = sb.from('attendance').select('*');
        if (normalizedDate) query = query.eq('date', normalizedDate);
        if (activeSite) query = query.or(`site_id.eq.${activeSite},site_id.is.null,site_id.eq.`);
        if (filters.employeeId) query = query.eq('employee_id', String(filters.employeeId));
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(data || []));
        return data || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching attendance from Local Storage:', error);
      return [];
    }
  }

  async markAttendance(attendanceData) {
    this.assertWritable('create attendance');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const dateStr = normalizeDateValue(attendanceData.date);
        const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
        const toIso = (timeValue) => {
          if (!isDateValid || typeof timeValue !== 'string') return null;
          const t = timeValue.trim();
          if (!t) return null;
          if (t.includes('T')) {
            const dt = new Date(t);
            return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
          }
          if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return null;
          const padded = t.length === 5 ? `${t}:00` : t;
          const dt = new Date(`${dateStr}T${padded}`);
          return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
        };

        const newRecord = {
          id: this.generateId(),
          employee_id: attendanceData.employee_id,
          employee_name: attendanceData.employee_name,
          date: dateStr || attendanceData.date,
          status: attendanceData.status,
          site_id: attendanceData.site_id || '',
          created_at: new Date().toISOString(),
          clock_in: toIso(attendanceData.clock_in),
          clock_out: toIso(attendanceData.clock_out),
          notes: attendanceData.notes || '',
          hours: typeof attendanceData.hours === 'number' ? attendanceData.hours : null
        };
        const { data, error } = await sb.from('attendance').insert(newRecord).select().single();
        if (error) throw error;
        if (window.audit) window.audit.log('create', 'attendance', { id: newRecord.id, employee_id: newRecord.employee_id, status: newRecord.status });
        return data || newRecord;
      }
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const newRecord = {
        id: this.generateId(),
        employee_id: attendanceData.employee_id,
        employee_name: attendanceData.employee_name,
        date: normalizeDateValue(attendanceData.date) || attendanceData.date,
        status: attendanceData.status,
        site_id: attendanceData.site_id || '',
        created_at: new Date().toISOString(),
        clock_in: attendanceData.clock_in || null,
        clock_out: attendanceData.clock_out || null,
        notes: attendanceData.notes || ''
      };
      attendance.push(newRecord);
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(attendance));
      if (window.audit) window.audit.log('create', 'attendance', { id: newRecord.id, employee_id: newRecord.employee_id, status: newRecord.status });
      return newRecord;
    } catch (error) {
      console.error('Error marking attendance in Local Storage:', error);
      throw error;
    }
  }

  async updateAttendance(attendanceId, attendanceData) {
    this.assertWritable('update attendance');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const dateStr = normalizeDateValue(attendanceData.date);
        const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
        const toIso = (timeValue) => {
          if (!isDateValid || typeof timeValue !== 'string') return null;
          const t = timeValue.trim();
          if (!t) return null;
          if (t.includes('T')) {
            const dt = new Date(t);
            return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
          }
          if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return null;
          const padded = t.length === 5 ? `${t}:00` : t;
          const dt = new Date(`${dateStr}T${padded}`);
          return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
        };

        const updates = {};
        if (attendanceData.status !== undefined) updates.status = attendanceData.status;
        if (attendanceData.notes !== undefined) updates.notes = attendanceData.notes || '';
        if (attendanceData.date !== undefined) updates.date = dateStr || attendanceData.date;
        if (attendanceData.clock_in !== undefined) updates.clock_in = toIso(attendanceData.clock_in);
        if (attendanceData.clock_out !== undefined) updates.clock_out = toIso(attendanceData.clock_out);
        if (attendanceData.hours !== undefined) {
          updates.hours = typeof attendanceData.hours === 'number' ? attendanceData.hours : null;
        }
        const { data, error } = await sb.from('attendance').update(updates).eq('id', attendanceId).select().single();
        if (error) throw error;
        if (window.audit) window.audit.log('update', 'attendance', { id: attendanceId, changes: attendanceData });
        return data || null;
      }
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const index = attendance.findIndex(a => String(a.id) === String(attendanceId));
      if (index === -1) return null;
      attendance[index] = {
        ...attendance[index],
        ...(attendanceData.status !== undefined ? { status: attendanceData.status } : {}),
        ...(attendanceData.notes !== undefined ? { notes: attendanceData.notes || '' } : {}),
        ...(attendanceData.date !== undefined ? { date: normalizeDateValue(attendanceData.date) || attendanceData.date } : {}),
        ...(attendanceData.clock_in !== undefined ? { clock_in: attendanceData.clock_in || null } : {}),
        ...(attendanceData.clock_out !== undefined ? { clock_out: attendanceData.clock_out || null } : {}),
        ...(attendanceData.hours !== undefined ? { hours: typeof attendanceData.hours === 'number' ? attendanceData.hours : null } : {})
      };
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(attendance));
      if (window.audit) window.audit.log('update', 'attendance', { id: attendanceId, changes: attendanceData });
      return attendance[index];
    } catch (error) {
      console.error('Error updating attendance in Local Storage:', error);
      throw error;
    }
  }

  async deleteAttendance(attendanceId) {
    this.assertWritable('delete attendance');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { error } = await sb.from('attendance').delete().eq('id', attendanceId);
        if (error) throw error;
        if (window.audit) window.audit.log('delete', 'attendance', { id: attendanceId });
        return true;
      }
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const filtered = attendance.filter(a => String(a.id) !== String(attendanceId));
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'attendance', { id: attendanceId });
      return true;
    } catch (error) {
      console.error('Error deleting attendance in Local Storage:', error);
      throw error;
    }
  }

  // ============ PAYROLL ============
  async getPayroll(filters = {}) {
    if (this.isDemoMode()) return [];
    try {
      const activeSite = filters.siteId || getActiveSiteId();
      const cached = this.getLocalTable('payroll');
      if (cached && cached.length) {
        this.syncTable('payroll');
        let filtered = cached;
        if (filters.period) filtered = filtered.filter(p => p.pay_period === filters.period);
        if (activeSite) {
          filtered = filtered.filter(p => !p.site_id || p.site_id === '' || p.site_id === activeSite);
          if (filtered.some(p => !p.site_id || p.site_id === '') && localStorage.getItem('huly_default_site_confirmed') === 'true') {
            this.backfillMissingSiteId(activeSite);
          }
        }
        return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        let query = sb.from('payroll').select('*');
        if (filters.period) query = query.eq('pay_period', filters.period);
        if (activeSite) query = query.or(`site_id.eq.${activeSite},site_id.is.null,site_id.eq.`);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify(data || []));
        return data || [];
      }
      return cached;
    } catch (error) {
      console.error('Error fetching payroll:', error);
      return [];
    }
  }

  async createPayrollRun(payrollData) {
    this.assertWritable('create payroll');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const newRecord = { id: this.generateId(), ...payrollData, created_at: new Date().toISOString() };
        const { data, error } = await sb.from('payroll').insert(newRecord).select().single();
        if (error) throw error;
        if (window.audit) window.audit.log('create', 'payroll', { id: newRecord.id, total: newRecord.total, status: newRecord.status });
        return data || newRecord;
      }
      const payroll = JSON.parse(localStorage.getItem(this.storagePrefix + 'payroll') || '[]');
      const newRecord = { id: this.generateId(), ...payrollData, created_at: new Date().toISOString() };
      payroll.push(newRecord);
      localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify(payroll));
      if (window.audit) window.audit.log('create', 'payroll', { id: newRecord.id, total: newRecord.total, status: newRecord.status });
      return newRecord;
    } catch (error) {
      console.error('Error creating payroll run:', error);
      throw error;
    }
  }

  async updatePayroll(payrollId, payrollData) {
    this.assertWritable('update payroll');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { data, error } = await sb.from('payroll').update(payrollData).eq('id', payrollId).select().single();
        if (error) throw error;
        if (window.audit) window.audit.log('update', 'payroll', { id: payrollId, changes: payrollData });
        return data || null;
      }
      const payroll = JSON.parse(localStorage.getItem(this.storagePrefix + 'payroll') || '[]');
      const index = payroll.findIndex(p => p.id === payrollId);
      if (index !== -1) {
        payroll[index] = { ...payroll[index], ...payrollData };
        localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify(payroll));
        if (window.audit) window.audit.log('update', 'payroll', { id: payrollId, changes: payrollData });
        return payroll[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating payroll:', error);
      throw error;
    }
  }

  async deletePayroll(payrollId) {
    this.assertWritable('delete payroll');
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        const { error } = await sb.from('payroll').delete().eq('id', payrollId);
        if (error) throw error;
        if (window.audit) window.audit.log('delete', 'payroll', { id: payrollId });
        return true;
      }
      const payroll = JSON.parse(localStorage.getItem(this.storagePrefix + 'payroll') || '[]');
      const filtered = payroll.filter(p => p.id !== payrollId);
      localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'payroll', { id: payrollId });
      return true;
    } catch (error) {
      console.error('Error deleting payroll:', error);
      throw error;
    }
  }

  async backfillMissingSiteId(siteId = null) {
    if (this.isDemoMode()) return { updatedLocal: 0, updatedSupabase: 0 };
    const targetSite = siteId || getActiveSiteId();
    if (!targetSite) {
      console.warn('No active site selected for backfill.');
      return { updatedLocal: 0, updatedSupabase: 0 };
    }

    let updatedLocal = 0;
    const tables = ['employees', 'attendance', 'payroll'];

    try {
      tables.forEach((key) => {
        const raw = localStorage.getItem(this.storagePrefix + key);
        if (!raw) return;
        const rows = JSON.parse(raw) || [];
        let changed = false;
        rows.forEach((row) => {
          if (!row.site_id) {
            row.site_id = targetSite;
            updatedLocal += 1;
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem(this.storagePrefix + key, JSON.stringify(rows));
        }
      });
    } catch (e) {
      console.warn('Local backfill failed', e);
    }

    let updatedSupabase = 0;
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        for (const table of tables) {
          // update null site_id
          const resNull = await sb.from(table).update({ site_id: targetSite }).is('site_id', null);
          if (!resNull.error) {
            updatedSupabase += resNull.count || 0;
          }
          // update empty string site_id
          const resEmpty = await sb.from(table).update({ site_id: targetSite }).eq('site_id', '');
          if (!resEmpty.error) {
            updatedSupabase += resEmpty.count || 0;
          }
        }
      }
    } catch (e) {
      console.warn('Supabase backfill failed', e);
    }

    return { updatedLocal, updatedSupabase };
  }

  async consolidateToSite(siteId) {
    if (this.isDemoMode()) return { updatedLocal: 0, updatedSupabase: 0 };
    const targetSite = siteId || getActiveSiteId();
    if (!targetSite) {
      console.warn('No target site for consolidation.');
      return { updatedLocal: 0, updatedSupabase: 0 };
    }

    let updatedLocal = 0;
    const tables = ['employees', 'attendance', 'payroll'];

    try {
      tables.forEach((key) => {
        const raw = localStorage.getItem(this.storagePrefix + key);
        if (!raw) return;
        const rows = JSON.parse(raw) || [];
        let changed = false;
        rows.forEach((row) => {
          if (row.site_id !== targetSite) {
            row.site_id = targetSite;
            updatedLocal += 1;
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem(this.storagePrefix + key, JSON.stringify(rows));
        }
      });

      const sitesRaw = localStorage.getItem(this.storagePrefix + 'sites');
      if (sitesRaw) {
        const sites = JSON.parse(sitesRaw) || [];
        const filtered = sites.filter((s) => String(s.id) === String(targetSite));
        if (filtered.length) {
          localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(filtered));
        }
      }
    } catch (e) {
      console.warn('Local consolidation failed', e);
    }

    let updatedSupabase = 0;
    try {
      const sb = await this.getSupabase();
      if (sb && this.supabaseHealthy) {
        for (const table of tables) {
          const res = await sb.from(table).update({ site_id: targetSite });
          if (!res.error) updatedSupabase += res.count || 0;
        }
        await sb.from('sites').delete().neq('id', targetSite);
      }
    } catch (e) {
      console.warn('Supabase consolidation failed', e);
    }

    return { updatedLocal, updatedSupabase };
  }
}

// Export global instance
window.db = new DatabaseService();

