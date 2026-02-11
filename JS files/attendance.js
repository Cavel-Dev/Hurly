// Attendance Page JavaScript

function getLocalDateString() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
}

function normalizeDateValue(raw) {
    if (!raw) return '';
    const str = String(raw);
    if (str.includes('T')) return str.split('T')[0];
    if (str.includes(' ')) return str.split(' ')[0];
    return str;
}

function localDateFromYMD(ymd) {
    if (!ymd) return null;
    const date = new Date(ymd + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? null : date;
}

$(document).ready(function() {
    // Update date and time
    function updateDateTime() {
        const now = new Date();
        
        // Format date: Monday, December 30, 2024
        const dateOptions = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const dateString = now.toLocaleDateString('en-US', dateOptions);
        $('#currentDate').text(dateString);
        
        // Format time: 2:45 PM
        const timeOptions = { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        };
        const timeString = now.toLocaleTimeString('en-US', timeOptions);
        $('#currentTime').text(timeString);
    }
    
    // Update immediately
    updateDateTime();
    
    // Update every second
    setInterval(updateDateTime, 1000);
    
    // Set today's date as default in date filter only if no saved filter exists
    try {
        const saved = localStorage.getItem('huly_attendance_filters');
        if (!saved && !$('#dateFilter').val()) {
            const today = getLocalDateString();
            $('#dateFilter').val(today);
        }
    } catch (e) {
        const today = getLocalDateString();
        $('#dateFilter').val(today);
    }
});

function notify(message, type = 'info') {
    if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast(message, type);
    } else {
        alert(message);
    }
}
class Attendance {
  constructor() {
    this.db = window.db;
    this.attendanceCache = [];
    this.employeeIndex = {};
    this.realtimeChannel = null;
    this.filtersKey = 'huly_attendance_filters';
    this.summarySentPrefix = 'huly_attendance_summary_sent_';
    this.mfaPrompting = false;
    this.init();
  }
  
  async init() {
    this.setupEventListeners();
    if (this.isDemoMode()) {
      ['addWorkerBtn', 'bulkAddAttendanceBtn', 'clockInBtn', 'deleteAttendanceBtn'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('disabled', 'true');
      });
    }
    await this.ensureConnected();
    await this.populateSites();
    await this.loadEmployeeIndex();
    this.clearFilters();
    await this.loadAttendanceData(true);
    this.initRealtime();
  }

  isDemoMode() {
    try {
      if (typeof window.isDemoMode === 'function') return window.isDemoMode();
      return localStorage.getItem('huly_demo_mode') === 'true';
    } catch (e) {
      return false;
    }
  }

  formatTimeInputValue(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    if (/^\d{1,2}:\d{2}$/.test(raw)) return raw;
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 5);
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toTimeString().slice(0, 5);
  }

  formatTimeCell(value) {
    const parsed = this.formatTimeInputValue(value);
    return parsed || '-';
  }

  isOvertimeRecord(record) {
    const hours = Number(record?.hours || 0);
    const notes = String(record?.notes || '').toLowerCase();
    return hours > 8 || notes.includes('overtime');
  }

  async refreshAfterInput() {
    await this.loadAttendanceData();
  }

  async sendNotifyEvent(payload) {
    try {
      const base = this.getFunctionsBase();
      if (!base) return false;
      let accessToken = '';
      if (this.db && typeof this.db.getSupabase === 'function') {
        const sb = await this.db.getSupabase();
        if (sb && sb.auth && typeof sb.auth.getSession === 'function') {
          const { data } = await sb.auth.getSession();
          accessToken = data?.session?.access_token || '';
        }
      }
      if (!accessToken) {
        console.warn('Notify skipped: no active access token');
        notify('Overtime saved, but notify auth token is missing. Please sign out/in and try again.', 'warn');
        return false;
      }
      const res = await fetch(`${base}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('Notify event rejected', res.status, text);
        if (res.status === 401) {
          notify('Overtime saved, but email alert is unauthorized. Please sign in again.', 'warn');
        } else {
          notify(`Overtime saved, but email alert failed (${res.status}).`, 'warn');
        }
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Notify event failed', e);
      return false;
    }
  }

  async notifyOvertimeAdded(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const normalized = entries.map((entry) => {
      const hours = Number(entry.overtimeHours || entry.hours || 0);
      return {
        employee_name: entry.employee_name || entry.name || '-',
        date: normalizeDateValue(entry.date || getLocalDateString()),
        overtime_hours: hours > 0 ? hours : 0
      };
    });
    const ok = await this.sendNotifyEvent({
      event: 'overtime_added',
      entries: normalized
    });
    if (!ok && window.app && typeof window.app.showToast === 'function') {
      window.app.showToast('Overtime saved, but email alert failed. Check Supabase function logs/secrets.', 'warn');
    }
  }

  async maybeSendEndOfDaySummary(attendance, dateValue, allDates) {
    try {
      if (allDates || this.isDemoMode()) return;
      const today = getLocalDateString();
      const targetDate = normalizeDateValue(dateValue || today);
      if (targetDate !== today) return;
      const hour = new Date().getHours();
      if (hour < 18) return;
      const sentKey = `${this.summarySentPrefix}${targetDate}`;
      if (localStorage.getItem(sentKey)) return;

      const list = Array.isArray(attendance) ? attendance : [];
      const flagged = list.filter((row) => this.isOvertimeRecord(row));
      await this.sendNotifyEvent({
        event: 'attendance_daily_summary',
        date: targetDate,
        total_records: list.length,
        overtime_records: flagged.length,
        flagged: flagged.map((row) => ({
          employee_name: row.employee_name || '-',
          hours: Number(row.hours || 0),
          notes: row.notes || '',
          overtime: this.isOvertimeRecord(row)
        }))
      });
      localStorage.setItem(sentKey, 'true');
    } catch (e) {
      console.warn('Daily summary notification failed', e);
    }
  }


  async loadEmployeeIndex() {
    try {
      if (!this.db || typeof this.db.getEmployees !== 'function') return;
      const employees = await this.db.getEmployees();
      const map = {};
      (employees || []).forEach((e) => {
        if (!e || !e.id) return;
        map[String(e.id)] = e;
      });
      this.employeeIndex = map;
    } catch (e) {
      console.warn('Failed to load employee index', e);
    }
  }

  async loadAttendanceData(withOverlay = false) {
    try {
      if (withOverlay) this.showLoading('Loading attendance...');
      const dateInput = document.getElementById('dateFilter');
      const allDates = Boolean(document.getElementById('attendanceAllDates')?.checked);
      const date = normalizeDateValue(dateInput?.value || getLocalDateString());
      this.saveFilters({ date, allDates });
      
      let attendance = allDates
        ? await this.db.getAttendance({})
        : await this.db.getAttendance({ date });

      if (!allDates && (!attendance || attendance.length === 0)) {
        try {
          const activeSite = localStorage.getItem('huly_active_site') || '';
          const retryKey = `huly_attendance_retry_${date}`;
          if (activeSite && !localStorage.getItem(retryKey) && this.db && typeof this.db.consolidateToSite === 'function') {
            localStorage.setItem(retryKey, 'true');
            await this.db.consolidateToSite(activeSite);
            attendance = await this.db.getAttendance({ date });
          }
        } catch (e) {
          console.warn('Attendance consolidation retry failed', e);
        }
        try {
          const all = await this.db.getAttendance({});
          const dated = (all || []).filter((r) => r.date || r.Date);
          if (dated.length) {
            const sorted = dated.sort((a, b) => new Date(normalizeDateValue(b.date || b.Date)) - new Date(normalizeDateValue(a.date || a.Date)));
            const latestDate = normalizeDateValue(sorted[0].date || sorted[0].Date);
            if (latestDate) {
              if (dateInput) dateInput.value = latestDate;
              attendance = dated.filter((r) => normalizeDateValue(r.date || r.Date) === latestDate);
              this.saveFilters({ date: latestDate, allDates: false, manual: false });
            }
          }
        } catch (e) {
          console.warn('Attendance fallback failed', e);
        }
      }

      this.attendanceCache = attendance || [];
      this.loadEmployeeIndex();
      this.updateDayBadge(allDates ? null : date);
      this.applySearchFilter();
      await this.maybeNotifyMissingAttendance(this.attendanceCache, date, allDates);
      await this.maybeSendEndOfDaySummary(this.attendanceCache, date, allDates);
      if (withOverlay) this.hideLoading();
    } catch (error) {
      console.error('Error loading attendance:', error);
      if (withOverlay) this.hideLoading();
    }
  }

  async ensureConnected() {
    try {
      if (this.db && typeof this.db.checkSupabaseConnection === 'function') {
        this.showLoading('Connecting to Supabase...');
        await this.db.checkSupabaseConnection();
      }
    } catch (e) {
      console.warn('Supabase connection check failed', e);
    } finally {
      this.hideLoading();
    }
  }

  showLoading(message) {
    if (window.AuthOverlay && typeof window.AuthOverlay.show === 'function') {
      window.AuthOverlay.show('Loading', message || 'Please wait...');
    }
  }

  hideLoading() {
    if (window.AuthOverlay && typeof window.AuthOverlay.hide === 'function') {
      window.AuthOverlay.hide();
    }
  }

  async populateSites() {
    const select = document.getElementById('crewFilter');
    if (!select || !this.db || typeof this.db.getSites !== 'function') return;
    try {
      const sites = await this.db.getSites();
      let active = localStorage.getItem('huly_active_site') || '';
      if (!active && sites.length) {
        const firstId = String(sites[0].id || '');
        if (firstId) {
          localStorage.setItem('huly_active_site', firstId);
          active = firstId;
        }
      }
      const hideAll = localStorage.getItem('huly_default_site_confirmed') === 'true';
      const options = [
        ...(hideAll ? [] : ['<option value="">All Sites</option>']),
        ...sites.map((site) => {
          const name = site.name || 'Unnamed Site';
          return `<option value="${site.id}">${name}</option>`;
        })
      ];
      select.innerHTML = options.join('');
      if (active) select.value = active;
    } catch (e) {
      console.warn('Failed to load sites', e);
    }
  }

  clearFilters() {
    try {
      localStorage.removeItem(this.filtersKey);
    } catch (e) {}
    const dateInput = document.getElementById('dateFilter');
    if (dateInput) {
      const today = getLocalDateString();
      dateInput.value = today;
    }
    const allDatesToggle = document.getElementById('attendanceAllDates');
    if (allDatesToggle) allDatesToggle.checked = false;
    const searchInput = document.getElementById('attendanceSearch');
    if (searchInput) searchInput.value = '';
    const crewFilter = document.getElementById('crewFilter');
    const activeSite = localStorage.getItem('huly_active_site') || '';
    if (crewFilter && activeSite) crewFilter.value = activeSite;
  }

  readFilters() {
    try {
      const raw = localStorage.getItem(this.filtersKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  saveFilters(filters) {
    try {
      const existing = this.readFilters() || {};
      const merged = { ...existing, ...filters };
      localStorage.setItem(this.filtersKey, JSON.stringify(merged));
    } catch (e) {}
  }

  updateDayBadge(dateValue) {
    const badge = document.getElementById('attendanceDayBadge');
    if (!badge) return;
    if (!dateValue) {
      badge.textContent = 'Date: All';
      return;
    }
    const normalized = normalizeDateValue(dateValue);
    const date = localDateFromYMD(normalized);
    if (!date) {
      badge.textContent = 'Date: --';
      return;
    }
    const label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    badge.textContent = `Date: ${label}`;
  }

  applySearchFilter() {
    const input = document.getElementById('attendanceSearch');
    const term = input?.value?.toLowerCase().trim() || '';
    if (!term) {
      this.populateAttendanceTable(this.attendanceCache);
      return;
    }
    const filtered = (this.attendanceCache || []).filter((row) => {
      const name = String(row.employee_name || '').toLowerCase();
      return name.includes(term);
    });
    this.populateAttendanceTable(filtered);
  }


  getFunctionsBase() {
    try {
      const url = window.SUPABASE_URL || 'https://ncqfvcymhvjcchrwelfg.supabase.co';
      const origin = new URL(url).origin;
      return `${origin}/functions/v1`;
    } catch (e) {
      return null;
    }
  }

  async promptMfaCode() {
    if (this.mfaPrompting) return null;
    this.mfaPrompting = true;
    return await new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1200;
      `;
      overlay.innerHTML = `
        <div style="
          background:#0e0e0e;
          border:1px solid #222;
          border-radius:16px;
          padding:28px;
          width:90%;
          max-width:420px;
          box-shadow:0 24px 60px rgba(0,0,0,0.55);
        ">
          <h3 style="margin:0 0 8px 0;color:#fff;font-size:1.25rem;">Verify MFA</h3>
          <p style="margin:0 0 18px 0;color:#aaa;font-size:0.95rem;">
            Enter your authenticator code to view a different date.
          </p>
          <input id="mfaDateCode" class="input" placeholder="123 456" style="
            width:100%;
            padding:12px 14px;
            background:#111;
            border:1px solid #222;
            border-radius:12px;
            color:#fff;
            font-size:1rem;
            letter-spacing:2px;
          "/>
          <div style="display:flex;gap:10px;margin-top:18px;">
            <button id="mfaDateCancel" class="btn btn-secondary" style="flex:1;">Cancel</button>
            <button id="mfaDateVerify" class="btn btn-primary" style="flex:1;">Verify</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const codeInput = overlay.querySelector('#mfaDateCode');
      const cancelBtn = overlay.querySelector('#mfaDateCancel');
      const verifyBtn = overlay.querySelector('#mfaDateVerify');
      const cleanup = (val) => {
        overlay.remove();
        this.mfaPrompting = false;
        resolve(val);
      };
      cancelBtn.addEventListener('click', () => cleanup(null));
      verifyBtn.addEventListener('click', () => cleanup((codeInput?.value || '').replace(/\s+/g, '')));
    });
  }

  async requireMfaForDateChange() {
    try {
      if (!this.db || typeof this.db.getSupabase !== 'function') {
        notify('Supabase not available for MFA.', 'error');
        return false;
      }
      const supabase = await this.db.getSupabase();
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        notify('MFA check failed.', 'error');
        return false;
      }
      const verifiedTotp = (factorsData?.totp || []).filter((f) => f.status === 'verified');
      const factorId = verifiedTotp[0]?.id || null;
      if (!factorId) {
        notify('MFA not enabled for this account.', 'warn');
        return false;
      }
      const code = await this.promptMfaCode();
      if (!code || code.length < 6) {
        notify('MFA verification cancelled.', 'warn');
        return false;
      }
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code
      });
      if (verifyError) {
        notify('Invalid authenticator code.', 'error');
        return false;
      }
      notify('MFA verified.', 'success');
      return true;
    } catch (e) {
      console.warn('MFA verification failed', e);
      notify('MFA verification failed.', 'error');
      return false;
    }
  }

  async maybeNotifyMissingAttendance(attendance, dateValue, allDates) {
    try {
      if (this.isDemoMode()) return;
      if (allDates) return;
      const today = getLocalDateString();
      if (dateValue !== today) return;
      const dt = new Date(dateValue + 'T00:00:00');
      const day = dt.getDay();
      if (day === 0 || day === 6) return; // Sunday or Saturday
      if (Array.isArray(attendance) && attendance.length > 0) return;

      const key = `huly_attendance_missing_${dateValue}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, 'true');

      const activeSite = localStorage.getItem('huly_active_site') || '';
      let siteName = '-';
      if (this.db && typeof this.db.getSites === 'function' && activeSite) {
        const sites = await this.db.getSites();
        const match = (sites || []).find(s => String(s.id) === String(activeSite));
        if (match?.name) siteName = match.name;
      }

      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('No attendance recorded for today.', 'warn');
      }

      await this.sendNotifyEvent({
        event: 'attendance_missing',
        date: dateValue,
        site: siteName
      });
    } catch (e) {
      console.warn('Attendance missing notification failed', e);
    }
  }


  async openAttendanceDrawer(employeeId, employeeName) {
    const drawer = document.getElementById('attendanceDrawer');
    const overlay = document.getElementById('attendanceDrawerOverlay');
    const nameEl = document.getElementById('attendanceDrawerName');
    const metaEl = document.getElementById('attendanceDrawerMeta');
    const list = document.getElementById('attendanceDrawerList');
    const closeBtn = document.getElementById('attendanceDrawerClose');
    if (!drawer || !overlay || !list) return;

    if (nameEl) nameEl.textContent = employeeName || 'Employee';
    if (metaEl) metaEl.textContent = 'Attendance summary';

    list.innerHTML = '<div class="drawer-empty">Loading attendance...</div>';

    const close = () => {
      drawer.classList.remove('show');
      overlay.classList.remove('show');
      drawer.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('aria-hidden', 'true');
    };

    drawer.classList.add('show');
    overlay.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');

    overlay.onclick = close;
    if (closeBtn) closeBtn.onclick = close;

    try {
      let records = [];
      if (this.db && typeof this.db.getSupabase === 'function') {
        const sb = await this.db.getSupabase();
        if (sb && this.db.supabaseHealthy) {
          const { data, error } = await sb
            .from('attendance')
            .select('*')
            .eq('employee_id', String(employeeId))
            .order('created_at', { ascending: false });
          if (!error && Array.isArray(data)) {
            records = data;
          }
        }
      }
      if (!records || records.length === 0) {
        const local = this.db?.getLocalTable ? this.db.getLocalTable('attendance') : [];
        records = (local || []).filter((r) => String(r.employee_id || r.employee_ID) === String(employeeId));
      }
      if (!records || records.length === 0) {
        list.innerHTML = '<div class="drawer-empty">No attendance records found.</div>';
        return;
      }
      const sorted = records.slice().sort((a, b) => new Date(normalizeDateValue(b.date || b.Date || 0)) - new Date(normalizeDateValue(a.date || a.Date || 0)));
      list.innerHTML = sorted.map((rec) => {
        const dateVal = normalizeDateValue(rec.date || rec.Date || '');
        const dateObj = localDateFromYMD(dateVal);
        const dayLabel = dateObj && !Number.isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
          : dateVal || 'Unknown date';
        const status = rec.status || 'present';
        const position = this.employeeIndex[String(rec.employee_id)]?.position || '?';
        const time = rec.clock_in || rec.clock_out ? `${rec.clock_in || '--'} - ${rec.clock_out || '--'}` : 'No times logged';
        const hours = rec.hours != null ? `${rec.hours} hrs` : '0 hrs';
        const notes = String(rec.notes || '').trim() || '-';
        const overtime = this.isOvertimeRecord(rec);
        return `
          <div class="drawer-card ${overtime ? 'drawer-card-overtime' : ''}">
            <strong>${dayLabel}</strong>
            <div class="drawer-meta">Role: ${position}</div>
            <div class="drawer-meta">Status: ${status}</div>
            <div class="drawer-meta">Time: ${time}</div>
            <div class="drawer-meta">${hours}${overtime ? ' | Overtime' : ''}</div>
            <div class="drawer-meta">Note: ${notes}</div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.warn('Failed to load attendance history', e);
      list.innerHTML = '<div class="drawer-empty">Unable to load attendance history.</div>';
    }
  }

  initRealtime() {
    if (!this.db || typeof this.db.getSupabase !== 'function' || !this.db.supabaseHealthy) return;
    this.db.getSupabase().then((sb) => {
      if (!sb || this.realtimeChannel) return;
      let timer = null;
      this.realtimeChannel = sb
        .channel('rt-attendance')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => this.loadAttendanceData(), 300);
        })
        .subscribe();
      window.addEventListener('beforeunload', () => {
        if (this.realtimeChannel) sb.removeChannel(this.realtimeChannel);
      });
    });
  }


  populateAttendanceTable(attendance) {
    const tbody = document.querySelector('.attendance-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!attendance || attendance.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-data">No attendance records for this date</td></tr>';
      return;
    }

    const sorted = (attendance || []).slice().sort((a, b) => {
      const da = new Date(normalizeDateValue(a.date || a.Date || 0)).getTime();
      const db = new Date(normalizeDateValue(b.date || b.Date || 0)).getTime();
      if (da !== db) return db - da;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    let currentDate = '';
    sorted.forEach(record => {
      const dateValue = normalizeDateValue(record.date || record.Date || '');
      if (dateValue && dateValue !== currentDate) {
        currentDate = dateValue;
        const dateObj = localDateFromYMD(dateValue);
        const label = Number.isNaN(dateObj.getTime())
          ? dateValue
          : dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        const dayRow = document.createElement('tr');
        dayRow.className = 'attendance-day-row';
        dayRow.innerHTML = `<td colspan="8">${label}</td>`;
        tbody.appendChild(dayRow);
      }

      const row = document.createElement('tr');
      const statusBadgeClass = record.status === 'present' ? 'badge-success' : record.status === 'absent' ? 'badge-danger' : 'badge-warning';
      const statusIcon = record.status === 'present' ? 'ph-check-circle' : record.status === 'absent' ? 'ph-x-circle' : 'ph-clock';
      const statusText = record.status === 'present' ? 'Present' : record.status === 'absent' ? 'Absent' : 'Late';
      const overtime = this.isOvertimeRecord(record);
      if (overtime) row.classList.add('attendance-overtime-row');
      const hoursValue = Number(record.hours || 0);
      const hoursText = Number.isFinite(hoursValue) ? String(hoursValue) : '0';
      const overtimeBadge = overtime ? '<span class="attendance-overtime-pill">OT</span>' : '';

      row.innerHTML = `
        <td>
          <input type="checkbox" class="attn-select" data-id="${record.id}">
        </td>
        <td>
          <button class="attendance-name-btn" data-employee-id="${record.employee_id}" data-employee-name="${record.employee_name || ''}">
            ${record.employee_name || 'N/A'}
          </button>
          <div class="attendance-position">${(this.employeeIndex[String(record.employee_id)]?.position) || '?'}</div>
        </td>
        <td><span class="badge ${statusBadgeClass}"><i class="ph ${statusIcon}"></i>${statusText}</span></td>
        <td>${this.formatTimeCell(record.clock_in)}</td>
        <td>${this.formatTimeCell(record.clock_out)}</td>
        <td>${hoursText} ${overtimeBadge}</td>
        <td>${record.notes || '-'}</td>
        <td><button class="btn btn-secondary btn-sm edit-btn" data-id="${record.id}" data-employee-id="${record.employee_id || ''}" data-name="${record.employee_name || ''}" data-status="${record.status || 'present'}" data-checkin="${this.formatTimeInputValue(record.clock_in)}" data-checkout="${this.formatTimeInputValue(record.clock_out)}" data-notes="${record.notes || ''}" data-date="${dateValue}" data-hours="${hoursText}">Edit</button></td>
      `;
      tbody.appendChild(row);
    });
  }

  setupEventListeners() {
    const addWorkerBtn = document.getElementById('addWorkerBtn');
    const bulkAddBtn = document.getElementById('bulkAddAttendanceBtn');
    const clockInBtn = document.getElementById('clockInBtn');
    const deleteBtn = document.getElementById('deleteAttendanceBtn');
    const dateFilter = document.getElementById('dateFilter');
    const crewFilter = document.getElementById('crewFilter');
    const searchInput = document.getElementById('attendanceSearch');
    const allDatesToggle = document.getElementById('attendanceAllDates');
    
    if (dateFilter) {
      const saved = this.readFilters();
      const today = getLocalDateString();
      if (saved?.date && saved?.manual) {
        dateFilter.value = normalizeDateValue(saved.date);
      } else {
        dateFilter.value = today;
      }
      dateFilter.addEventListener('change', async () => {
        const selected = normalizeDateValue(dateFilter.value || getLocalDateString());
        this.saveFilters({ date: selected, allDates: Boolean(allDatesToggle?.checked), manual: selected !== today });
        this.loadAttendanceData();
      });
    }
    
    if (addWorkerBtn) {
      addWorkerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.isDemoMode()) {
          notify('Demo mode is read-only.', 'warn');
          return;
        }
        console.log('Add Worker button clicked');
        this.showRollCallModal();
      });
    }

    if (bulkAddBtn) {
      bulkAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.isDemoMode()) {
          notify('Demo mode is read-only.', 'warn');
          return;
        }
        this.showBulkAddModal();
      });
    }
    
    if (clockInBtn) {
      clockInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.isDemoMode()) {
          notify('Demo mode is read-only.', 'warn');
          return;
        }
        console.log('Clock In button clicked');
        this.showClockInModal();
      });
    }

    if (crewFilter) {
      crewFilter.addEventListener('change', () => {
        const value = crewFilter.value || '';
        if (value) {
          localStorage.setItem('huly_active_site', value);
        } else {
          localStorage.removeItem('huly_active_site');
        }
        this.loadAttendanceData();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => this.applySearchFilter());
    }

    if (allDatesToggle) {
      const saved = this.readFilters();
      allDatesToggle.checked = Boolean(saved?.allDates);
      allDatesToggle.addEventListener('change', () => this.loadAttendanceData());
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (this.isDemoMode()) {
          notify('Demo mode is read-only.', 'warn');
          return;
        }
        const selected = Array.from(document.querySelectorAll('.attn-select:checked'))
          .map((el) => el.getAttribute('data-id'))
          .filter(Boolean);
        if (selected.length === 0) {
          notify('Select at least one record to delete.', 'warn');
          return;
        }
        if (!confirm(`Delete ${selected.length} attendance record(s)?`)) return;
        try {
          for (const id of selected) {
            await this.db.deleteAttendance(id);
          }
          await this.loadAttendanceData();
        } catch (err) {
          console.error('Error deleting attendance:', err);
          notify('Failed to delete attendance. Please try again.', 'error');
        }
      });
    }

    // Add event delegation for edit buttons (handles both static and dynamic buttons)
    document.addEventListener('click', (e) => {
      const nameBtn = e.target.closest('.attendance-name-btn');
      if (nameBtn) {
        const empId = nameBtn.getAttribute('data-employee-id');
        const empName = nameBtn.getAttribute('data-employee-name') || nameBtn.textContent || 'Employee';
        this.openAttendanceDrawer(empId, empName);
        return;
      }
      if (e.target.classList.contains('edit-btn') || e.target.closest('.edit-btn')) {
        const btn = e.target.classList.contains('edit-btn') ? e.target : e.target.closest('.edit-btn');
        e.preventDefault();
        console.log('Edit button clicked');
        
        // Get data from the button's parent row
        const row = btn.closest('tr');
        if (row) {
          const data = {
            id: btn.dataset.id || row.rowIndex,
            employeeId: btn.dataset.employeeId || '',
            name: btn.dataset.name || 'N/A',
            status: btn.dataset.status || 'present',
            date: btn.dataset.date || normalizeDateValue(document.getElementById('dateFilter')?.value || getLocalDateString()),
            checkin: btn.dataset.checkin || '',
            checkout: btn.dataset.checkout || '',
            hours: parseFloat(btn.dataset.hours || '0') || 0,
            notes: btn.dataset.notes || ''
          };
          this.showEditModal(data);
        }
      }
    });
  }

  extractStatus(statusCell) {
    if (!statusCell) return 'present';
    const text = statusCell.textContent.toLowerCase();
    if (text.includes('present')) return 'present';
    if (text.includes('late')) return 'late';
    if (text.includes('absent')) return 'absent';
    return 'present';
  }

  showEditModal(data) {
    const self = this;
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;
    const safeDate = normalizeDateValue(data.date || getLocalDateString());
    const safeCheckIn = this.formatTimeInputValue(data.checkin);
    const safeCheckOut = this.formatTimeInputValue(data.checkout);
    const safeHours = Number(data.hours || 0);
    const overtimeChecked = safeHours > 8 || String(data.notes || '').toLowerCase().includes('overtime');

    modal.innerHTML = `
      <div style="
        background: #111;
        border: 1px solid #222;
        border-radius: 16px;
        padding: 24px;
        width: 92%;
        max-width: 520px;
        max-height: 92vh;
        overflow-y: auto;
      ">
        <h2 style="margin:0 0 16px;color:#fff;">Edit Attendance - ${data.name || 'Employee'}</h2>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Date</label>
          <input type="date" id="editDate" class="input" value="${safeDate}" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;color-scheme:dark;">
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Status</label>
          <select id="editStatusSelect" class="input" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;">
            <option value="present" ${data.status === 'present' ? 'selected' : ''}>Present</option>
            <option value="late" ${data.status === 'late' ? 'selected' : ''}>Late</option>
            <option value="absent" ${data.status === 'absent' ? 'selected' : ''}>Absent</option>
          </select>
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Check In</label>
          <input type="time" id="editCheckIn" class="input" value="${safeCheckIn}" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;color-scheme:dark;">
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Check Out</label>
          <input type="time" id="editCheckOut" class="input" value="${safeCheckOut}" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;color-scheme:dark;">
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Hours</label>
          <input type="number" id="editHours" class="input" min="0" step="0.25" value="${safeHours}" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;">
        </div>
        <div style="margin: 12px 0;display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="editOvertimeToggle" style="width:18px;height:18px;" ${overtimeChecked ? 'checked' : ''}>
          <label for="editOvertimeToggle" style="color:#bbb;">This is an overtime record</label>
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Notes</label>
          <textarea id="editNotes" class="input" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;min-height:80px;">${data.notes || ''}</textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button id="cancelEditBtn" class="btn btn-secondary" style="flex:1;">Cancel</button>
          <button id="saveEditBtn" class="btn btn-primary" style="flex:1;">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cancelBtn = document.getElementById('cancelEditBtn');
    const saveBtn = document.getElementById('saveEditBtn');
    cancelBtn.addEventListener('click', () => modal.remove());

    saveBtn.addEventListener('click', async () => {
      if (self.isDemoMode()) {
        notify('Demo mode is read-only.', 'warn');
        return;
      }
      const status = document.getElementById('editStatusSelect').value;
      const date = normalizeDateValue(document.getElementById('editDate').value || getLocalDateString());
      const checkIn = document.getElementById('editCheckIn').value;
      const checkOut = document.getElementById('editCheckOut').value;
      const hours = parseFloat(document.getElementById('editHours').value || '0') || 0;
      const overtime = Boolean(document.getElementById('editOvertimeToggle')?.checked);
      const notes = document.getElementById('editNotes').value;

      try {
        const sameDay = await self.db.getAttendance({ date });
        const duplicate = (sameDay || []).find((r) =>
          String(r.employee_id || '') === String(data.employeeId || '')
          && String(r.id || '') !== String(data.id || '')
        );
        if (duplicate && !overtime) {
          notify('Duplicate blocked: this worker already has attendance for that date. Enable overtime to allow it.', 'warn');
          return;
        }
      } catch (e) {
        console.warn('Duplicate check on edit failed', e);
      }

      const finalNotes = overtime && !String(notes || '').toLowerCase().includes('overtime')
        ? `${notes ? `${notes} | ` : ''}Overtime`
        : notes;

      await self.db.updateAttendance(data.id, {
        date,
        status,
        clock_in: checkIn,
        clock_out: checkOut,
        notes: finalNotes,
        hours
      });

      if (overtime || hours > 8) {
        await self.notifyOvertimeAdded([{
          employee_name: data.name,
          date,
          overtimeHours: Math.max(0, hours - 8)
        }]);
      }

      modal.remove();
      await self.refreshAfterInput();
      if (window.app && typeof window.app.showToast === 'function') window.app.showToast('Attendance updated', 'success');
    });
  }

  showRollCallModal() {
    const self = this;
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    `;
    
    modal.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .modal-select option {
          background: #000;
          color: #fff;
          padding: 8px;
        }
        .modal-select option:hover {
          background: #111;
        }
      </style>
      <div style="
        background: #111;
        backdrop-filter: blur(20px);
        border: 1px solid #222;
        border-radius: 16px;
        padding: 32px;
        width: 90%;
        max-width: 450px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease;
      ">
        <h2 style="
          margin-bottom: 24px;
          font-size: 1.75rem;
          font-weight: 700;
          color: #fff;
          background: #000;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">Add Attendance</h2>

        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Date:</label>
          <input type="date" id="attendanceDateInput" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
            color-scheme: dark;
          ">
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Select Employee:</label>
          <select id="employeeSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
          ">
            <option style="background: #000; color: #fff;">Loading employees...</option>
          </select>
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Status:</label>
          <select id="statusSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
          ">
            <option value="present" style="background: #000; color: #fff;">Present</option>
            <option value="absent" style="background: #000; color: #fff;">Absent</option>
            <option value="late" style="background: #000; color: #fff;">Late</option>
          </select>
        </div>

        <div style="margin: 18px 0; display:flex; align-items:center; gap:10px;">
          <input type="checkbox" id="overtimeToggle" style="width:18px;height:18px;">
          <label for="overtimeToggle" style="color:#bbb; font-size:0.95rem;">Log overtime (allow duplicate for same day)</label>
        </div>

        <div style="margin: 18px 0;">
          <label style="display:block;margin-bottom:8px;font-weight:500;color:#999;font-size:0.95rem;">Overtime hours</label>
          <input type="number" id="overtimeHours" class="input" min="0" step="0.25" placeholder="0" style="width:100%;padding:12px 16px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;font-size:1rem;transition:all 0.3s ease;">
        </div>

        <div style="margin: 18px 0;">
          <label style="display:block;margin-bottom:8px;font-weight:500;color:#999;font-size:0.95rem;">Notes</label>
          <textarea id="attendanceNotesInput" class="input" placeholder="Add notes for this attendance record" style="width:100%;padding:12px 16px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;font-size:1rem;transition:all 0.3s ease;min-height:80px;resize:vertical;"></textarea>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 24px">
          <button id="cancelRollCall" class="btn btn-secondary" style="
            flex: 1;
            padding: 12px 24px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          ">Cancel</button>
          <button id="markRollCall" class="btn btn-primary" style="
            flex: 1;
            padding: 12px 24px;
            background: #000;
            border: none;
            border-radius: 12px;
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: none;
          ">Mark</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Add hover effects for inputs
    const inputs = modal.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', function() {
        this.style.background = '#111';
        this.style.borderColor = '#fff';
        this.style.boxShadow = '0 0 12px #111';
      });
      input.addEventListener('blur', function() {
        this.style.background = '#111';
        this.style.borderColor = '#222';
        this.style.boxShadow = 'none';
      });
    });

    const cancelBtn = document.getElementById('cancelRollCall');
    const markBtn = document.getElementById('markRollCall');
    const dateInput = document.getElementById('attendanceDateInput');
    if (dateInput) {
      dateInput.value = getLocalDateString();
    }

    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = '#111';
      this.style.borderColor = '#fff';
      this.style.transform = 'translateY(-1px)';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = '#111';
      this.style.borderColor = '#222';
      this.style.transform = 'translateY(0)';
    });

    markBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = 'none';
      this.style.filter = 'brightness(1.1)';
    });
    markBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = 'none';
      this.style.filter = 'brightness(1)';
    });

    // Load employees from database
    console.log('Loading employees from database...');
    this.db.getEmployees().then(employees => {
      console.log('Loaded employees:', employees);
      const select = document.getElementById('employeeSelect');
      
      if (!employees || employees.length === 0) {
        select.innerHTML = '<option style="background: #000; color: #fff;">No employees found</option>';
        return;
      }
      
      select.innerHTML = employees.map(e => 
        `<option value="${e.id}" style="background: #000; color: #fff;">${e.name || e.employee_name || 'Unknown'}</option>`
      ).join('');
    }).catch(err => {
      console.error('Error loading employees:', err);
      const select = document.getElementById('employeeSelect');
      select.innerHTML = '<option style="background: #000; color: #fff;">Error loading employees</option>';
    });

    // Cancel button handler
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });

    // Mark button handler
    markBtn.addEventListener('click', async () => {
      if (self.isDemoMode()) {
        notify('Demo mode is read-only.', 'warn');
        return;
      }
      const employeeSelect = document.getElementById('employeeSelect');
      const employeeId = employeeSelect.value;
      const employeeName = employeeSelect.options[employeeSelect.selectedIndex].text;
      const status = document.getElementById('statusSelect').value;
      const overtime = Boolean(document.getElementById('overtimeToggle')?.checked);
      const overtimeHours = parseFloat(document.getElementById('overtimeHours')?.value || '0') || 0;
      const customNotes = String(document.getElementById('attendanceNotesInput')?.value || '').trim();
      
      // Don't proceed if no valid employee selected
      if (!employeeId || employeeName === 'Loading employees...' || employeeName === 'No employees found' || employeeName === 'Error loading employees') {
        notify('Please select a valid employee', 'warn');
        return;
      }
      
      const selectedDate = normalizeDateValue(document.getElementById('attendanceDateInput')?.value || getLocalDateString());

      try {
        const existing = await self.db.getAttendance({ date: selectedDate });
        const record = (existing || []).find((r) => String(r.employee_id) === String(employeeId));
        if (record && !overtime) {
          notify('Duplicate blocked: this worker already has attendance for that date. Use overtime for an extra entry.', 'warn');
          return;
        }
      } catch (e) {
        console.warn('Attendance duplicate check failed', e);
      }

      if (overtime && overtimeHours <= 0) {
        notify('Enter overtime hours greater than 0 for overtime records.', 'warn');
        return;
      }

      const attendanceData = {
        employee_id: employeeId,
        employee_name: employeeName,
        status: status,
        date: selectedDate,
        clock_in: '07:00',
        clock_out: '15:00',
        hours: overtime ? overtimeHours : (8 + overtimeHours),
        notes: [customNotes, (overtime || overtimeHours > 0) ? `Overtime: ${overtimeHours} hrs` : ''].filter(Boolean).join(' | '),
        site_id: (localStorage.getItem('huly_active_site') || '')
      };
      
      console.log('Marking attendance:', attendanceData);
      
      try {
        await self.db.markAttendance(attendanceData);
        console.log('Attendance marked successfully');
        if (overtime || overtimeHours > 0) {
          await self.notifyOvertimeAdded([{
            employee_name: employeeName,
            date: selectedDate,
            overtimeHours
          }]);
        }
        modal.remove();
        await self.refreshAfterInput();
        if (window.app && typeof window.app.showToast === 'function') window.app.showToast('Attendance marked', 'success');
      } catch (err) {
        console.error('Error marking attendance:', err);
        notify('Failed to mark attendance. Please try again.', 'error');
      }
    });
  }

  showBulkAddModal() {
    const self = this;
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    modal.innerHTML = `
      <div style="background:#111;border:1px solid #222;border-radius:16px;padding:24px;width:92%;max-width:560px;max-height:92vh;overflow-y:auto;">
        <h2 style="margin:0 0 14px 0;color:#fff;">Bulk Add Attendance</h2>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Date</label>
          <input type="date" id="bulkDateInput" class="input" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;color-scheme:dark;" value="${getLocalDateString()}">
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Status</label>
          <select id="bulkStatusSelect" class="input" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;">
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
          </select>
        </div>
        <div style="margin: 12px 0;display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="bulkOvertimeToggle" style="width:18px;height:18px;">
          <label for="bulkOvertimeToggle" style="color:#bbb;">Allow overtime duplicate entries</label>
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Overtime Hours</label>
          <input type="number" id="bulkOvertimeHours" class="input" min="0" step="0.25" value="0" style="width:100%;padding:10px 12px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;">
        </div>
        <div style="margin: 12px 0;">
          <label style="display:block;margin-bottom:6px;color:#bbb;">Select Employees</label>
          <div id="bulkEmployeeList" style="max-height:220px;overflow:auto;border:1px solid #222;border-radius:12px;padding:10px;background:#0f0f0f;color:#ddd;">Loading employees...</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px;">
          <button id="bulkCancelBtn" class="btn btn-secondary" style="flex:1;">Cancel</button>
          <button id="bulkSaveBtn" class="btn btn-primary" style="flex:1;">Add Selected</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const list = modal.querySelector('#bulkEmployeeList');
    const cancelBtn = modal.querySelector('#bulkCancelBtn');
    const saveBtn = modal.querySelector('#bulkSaveBtn');

    this.db.getEmployees().then((employees) => {
      if (!Array.isArray(employees) || employees.length === 0) {
        list.innerHTML = 'No employees found.';
        return;
      }
      list.innerHTML = employees.map((emp) => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid #1b1b1b;">
          <input type="checkbox" class="bulk-emp-item" value="${emp.id}">
          <span>${emp.name || emp.employee_name || 'Unknown'}</span>
        </label>
      `).join('');
    }).catch(() => {
      list.innerHTML = 'Failed to load employees.';
    });

    cancelBtn.addEventListener('click', () => modal.remove());

    saveBtn.addEventListener('click', async () => {
      if (self.isDemoMode()) {
        notify('Demo mode is read-only.', 'warn');
        return;
      }
      const date = normalizeDateValue(modal.querySelector('#bulkDateInput')?.value || getLocalDateString());
      const status = modal.querySelector('#bulkStatusSelect')?.value || 'present';
      const overtime = Boolean(modal.querySelector('#bulkOvertimeToggle')?.checked);
      const overtimeHours = parseFloat(modal.querySelector('#bulkOvertimeHours')?.value || '0') || 0;
      const selected = Array.from(modal.querySelectorAll('.bulk-emp-item:checked')).map((el) => String(el.value || ''));

      if (!selected.length) {
        notify('Select at least one employee.', 'warn');
        return;
      }
      if (overtime && overtimeHours <= 0) {
        notify('Enter overtime hours greater than 0 for overtime records.', 'warn');
        return;
      }

      const employees = await self.db.getEmployees();
      const nameById = {};
      (employees || []).forEach((emp) => {
        nameById[String(emp.id)] = emp.name || emp.employee_name || 'Unknown';
      });

      let added = 0;
      let skipped = 0;
      const overtimeEntries = [];
      const existing = await self.db.getAttendance({ date });

      for (const employeeId of selected) {
        const duplicate = (existing || []).find((r) => String(r.employee_id) === String(employeeId));
        if (duplicate && !overtime) {
          skipped += 1;
          continue;
        }
        const entry = {
          employee_id: employeeId,
          employee_name: nameById[employeeId] || 'Unknown',
          status,
          date,
          clock_in: '07:00',
          clock_out: '15:00',
          hours: overtime ? overtimeHours : (8 + overtimeHours),
          notes: overtime || overtimeHours > 0 ? `Overtime: ${overtimeHours} hrs` : '',
          site_id: (localStorage.getItem('huly_active_site') || '')
        };
        await self.db.markAttendance(entry);
        added += 1;
        if (overtime || overtimeHours > 0) {
          overtimeEntries.push({
            employee_name: entry.employee_name,
            date,
            overtimeHours
          });
        }
      }

      if (overtimeEntries.length) {
        await self.notifyOvertimeAdded(overtimeEntries);
      }

      modal.remove();
      await self.refreshAfterInput();
      notify(`Bulk add complete: ${added} added, ${skipped} skipped (duplicates).`, added > 0 ? 'success' : 'warn');
    });
  }

  showClockInModal() {
    const self = this;
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    `;
    
    modal.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .modal-select option {
          background: #000;
          color: #fff;
          padding: 8px;
        }
        .modal-select option:hover {
          background: #111;
        }
      </style>
      <div style="
        background: #111;
        backdrop-filter: blur(20px);
        border: 1px solid #222;
        border-radius: 16px;
        padding: 32px;
        width: 90%;
        max-width: 450px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease;
      ">
        <h2 style="
          margin-bottom: 24px;
          font-size: 1.75rem;
          font-weight: 700;
          color: #fff;
          background: #000;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">Clock In/Out</h2>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Employee:</label>
          <select id="employeeClockSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
          ">
            <option style="background: #000; color: #fff;">Loading employees...</option>
          </select>
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Time:</label>
          <input type="time" id="clockTime" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
            color-scheme: dark;
          " value="${new Date().toTimeString().split(' ')[0].substring(0, 5)}">
        </div>

        <div style="margin: 18px 0; display:flex; align-items:center; gap:10px;">
          <input type="checkbox" id="clockOvertimeToggle" style="width:18px;height:18px;">
          <label for="clockOvertimeToggle" style="color:#bbb; font-size:0.95rem;">Log overtime (allow duplicate for same day)</label>
        </div>

        <div style="margin: 18px 0;">
          <label style="display:block;margin-bottom:8px;font-weight:500;color:#999;font-size:0.95rem;">Overtime hours</label>
          <input type="number" id="clockOvertimeHours" class="input" min="0" step="0.25" placeholder="0" style="width:100%;padding:12px 16px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;font-size:1rem;transition:all 0.3s ease;">
        </div>

        <div style="margin: 18px 0;">
          <label style="display:block;margin-bottom:8px;font-weight:500;color:#999;font-size:0.95rem;">Notes</label>
          <textarea id="clockNotesInput" class="input" placeholder="Add notes for this clock event" style="width:100%;padding:12px 16px;background:#111;border:1px solid #222;border-radius:12px;color:#fff;font-size:1rem;transition:all 0.3s ease;min-height:80px;resize:vertical;"></textarea>
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px">
          <button id="cancelClock" class="btn btn-secondary" style="
            flex: 1;
            padding: 12px 24px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          ">Cancel</button>
          <button id="confirmClock" class="btn btn-primary" style="
            flex: 1;
            padding: 12px 24px;
            background: #000;
            border: none;
            border-radius: 12px;
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: none;
          ">Clock In</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Add hover effects for inputs
    const inputs = modal.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', function() {
        this.style.background = '#111';
        this.style.borderColor = '#fff';
        this.style.boxShadow = '0 0 12px #111';
      });
      input.addEventListener('blur', function() {
        this.style.background = '#111';
        this.style.borderColor = '#222';
        this.style.boxShadow = 'none';
      });
    });

    const cancelBtn = document.getElementById('cancelClock');
    const confirmBtn = document.getElementById('confirmClock');

    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = '#111';
      this.style.borderColor = '#fff';
      this.style.transform = 'translateY(-1px)';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = '#111';
      this.style.borderColor = '#222';
      this.style.transform = 'translateY(0)';
    });

    confirmBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = 'none';
      this.style.filter = 'brightness(1.1)';
    });
    confirmBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = 'none';
      this.style.filter = 'brightness(1)';
    });

    // Load employees from database
    console.log('Loading employees for clock in...');
    this.db.getEmployees().then(employees => {
      console.log('Loaded employees:', employees);
      const select = document.getElementById('employeeClockSelect');
      
      if (!employees || employees.length === 0) {
        select.innerHTML = '<option style="background: #000; color: #fff;">No employees found</option>';
        return;
      }
      
      select.innerHTML = employees.map(e => 
        `<option value="${e.id}" style="background: #000; color: #fff;">${e.name || e.employee_name || 'Unknown'}</option>`
      ).join('');
    }).catch(err => {
      console.error('Error loading employees:', err);
      const select = document.getElementById('employeeClockSelect');
      select.innerHTML = '<option style="background: #000; color: #fff;">Error loading employees</option>';
    });

    // Cancel button handler
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });

    // Clock In button handler
    confirmBtn.addEventListener('click', async () => {
      if (self.isDemoMode()) {
        notify('Demo mode is read-only.', 'warn');
        return;
      }
      const employeeSelect = document.getElementById('employeeClockSelect');
      const employeeId = employeeSelect.value;
      const employeeName = employeeSelect.options[employeeSelect.selectedIndex].text;
      const time = document.getElementById('clockTime').value;
      const overtime = Boolean(document.getElementById('clockOvertimeToggle')?.checked);
      const overtimeHours = parseFloat(document.getElementById('clockOvertimeHours')?.value || '0') || 0;
      const customNotes = String(document.getElementById('clockNotesInput')?.value || '').trim();
      
      // Don't proceed if no valid employee selected
      if (!employeeId || employeeName === 'Loading employees...' || employeeName === 'No employees found' || employeeName === 'Error loading employees') {
        notify('Please select a valid employee', 'warn');
        return;
      }
      
      const dateInput = document.getElementById('dateFilter');
      const selectedDate = dateInput?.value || getLocalDateString();

      try {
        const existing = await self.db.getAttendance({ date: selectedDate });
        const record = (existing || []).find((r) => String(r.employee_id) === String(employeeId));
        if (record && !overtime) {
          const updates = { status: 'present' };
          if (overtimeHours > 0) {
            updates.hours = (record.hours || 8) + overtimeHours;
            updates.notes = `Overtime: ${overtimeHours} hrs`;
          }
          if (customNotes) {
            updates.notes = [String(record.notes || '').trim(), customNotes, updates.notes || ''].filter(Boolean).join(' | ');
          }
          if (time) {
            if (!record.clock_in) {
              updates.clock_in = time;
            } else if (!record.clock_out) {
              updates.clock_out = time;
            } else {
              notify('Clock in/out already recorded. Use overtime to add another entry.', 'warn');
              return;
            }
          }
          await self.db.updateAttendance(record.id, updates);
          if (overtimeHours > 0) {
            await self.notifyOvertimeAdded([{
              employee_name: employeeName,
              date: selectedDate,
              overtimeHours
            }]);
          }
          modal.remove();
          await self.refreshAfterInput();
          if (window.app && typeof window.app.showToast === 'function') window.app.showToast('Attendance updated', 'success');
          return;
        }
      } catch (e) {
        console.warn('Attendance duplicate check failed', e);
      }

      if (overtime && overtimeHours <= 0) {
        notify('Enter overtime hours greater than 0 for overtime records.', 'warn');
        return;
      }

      const attendanceData = {
        employee_id: employeeId,
        employee_name: employeeName,
        status: 'present',
        date: selectedDate,
        clock_in: time || '07:00',
        clock_out: time ? null : '15:00',
        hours: overtime ? overtimeHours : (8 + overtimeHours),
        notes: [customNotes, (overtime || overtimeHours > 0) ? `Overtime: ${overtimeHours} hrs` : ''].filter(Boolean).join(' | '),
        site_id: (localStorage.getItem('huly_active_site') || '')
      };
      
      console.log('Clocking in:', attendanceData);
      
      try {
        await self.db.markAttendance(attendanceData);
        console.log('Clocked in successfully');
        if (overtime || overtimeHours > 0) {
          await self.notifyOvertimeAdded([{
            employee_name: employeeName,
            date: selectedDate,
            overtimeHours
          }]);
        }
        modal.remove();
        await self.refreshAfterInput();
      } catch (err) {
        console.error('Error clocking in:', err);
        notify('Failed to clock in. Please try again.', 'error');
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Attendance');
    if (window.db) {
      window.attendanceApp = new Attendance();
    } else {
      console.error('window.db not found! Make sure your database is initialized first.');
    }
  });
} else {
  console.log('DOM already loaded, initializing Attendance');
  if (window.db) {
    window.attendanceApp = new Attendance();
  } else {
    console.error('window.db not found! Make sure your database is initialized first.');
  }
}

