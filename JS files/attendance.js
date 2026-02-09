// Attendance Page JavaScript

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
            const today = new Date().toISOString().split('T')[0];
            $('#dateFilter').val(today);
        }
    } catch (e) {
        const today = new Date().toISOString().split('T')[0];
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
    this.realtimeChannel = null;
    this.filtersKey = 'huly_attendance_filters';
    this.init();
  }
  
  async init() {
    this.setupEventListeners();
    await this.ensureConnected();
    await this.loadAttendanceData(true);
    this.initRealtime();
  }

  async loadAttendanceData(withOverlay = false) {
    try {
      if (withOverlay) this.showLoading('Loading attendance...');
      const dateInput = document.getElementById('dateFilter');
      const allDates = Boolean(document.getElementById('attendanceAllDates')?.checked);
      const date = dateInput?.value || new Date().toISOString().split('T')[0];
      this.saveFilters({ date, allDates });
      
      let attendance = allDates
        ? await this.db.getAttendance({})
        : await this.db.getAttendance({ date });
      
      this.attendanceCache = attendance || [];
      this.updateDayBadge(allDates ? null : date);
      this.applySearchFilter();
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
      localStorage.setItem(this.filtersKey, JSON.stringify(filters));
    } catch (e) {}
  }

  updateDayBadge(dateValue) {
    const badge = document.getElementById('attendanceDayBadge');
    if (!badge) return;
    if (!dateValue) {
      badge.textContent = 'Date: All';
      return;
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
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
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #666;">No attendance records for this date</td></tr>';
      return;
    }
    
    attendance.forEach(record => {
      const row = document.createElement('tr');
      const statusBadgeClass = record.status === 'present' ? 'badge-success' : record.status === 'absent' ? 'badge-danger' : 'badge-warning';
      const statusIcon = record.status === 'present' ? 'ph-check-circle' : record.status === 'absent' ? 'ph-x-circle' : 'ph-clock';
      const statusText = record.status === 'present' ? 'Present' : record.status === 'absent' ? 'Absent' : 'Late';
      
      row.innerHTML = `
        <td>
          <input type="checkbox" class="attn-select" data-id="${record.id}">
        </td>
        <td>${record.employee_name || 'N/A'}</td>
        <td><span class="badge ${statusBadgeClass}"><i class="ph ${statusIcon}"></i>${statusText}</span></td>
        <td>${record.clock_in || '-'}</td>
        <td>${record.clock_out || '-'}</td>
        <td>${record.hours || '0'}</td>
        <td>${record.notes || '-'}</td>
        <td><button class="btn btn-secondary btn-sm edit-btn" data-id="${record.id}" data-name="${record.employee_name}" data-status="${record.status}" data-checkin="${record.clock_in}" data-checkout="${record.clock_out}" data-notes="${record.notes}">Edit</button></td>
      `;
      tbody.appendChild(row);
    });
  }
  
  setupEventListeners() {
    const addWorkerBtn = document.getElementById('addWorkerBtn');
    const rollCallBtn = document.getElementById('rollCallBtn');
    const clockInBtn = document.getElementById('clockInBtn');
    const deleteBtn = document.getElementById('deleteAttendanceBtn');
    const dateFilter = document.getElementById('dateFilter');
    const crewFilter = document.getElementById('crewFilter');
    const searchInput = document.getElementById('attendanceSearch');
    const allDatesToggle = document.getElementById('attendanceAllDates');
    
    if (dateFilter) {
      const saved = this.readFilters();
      if (saved?.date) {
        dateFilter.value = saved.date;
      } else {
        dateFilter.valueAsDate = new Date();
      }
      dateFilter.addEventListener('change', () => this.loadAttendanceData());
    }
    
    if (rollCallBtn) {
      rollCallBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Roll Call button clicked');
        this.showRollCallModal();
      });
    }

    if (addWorkerBtn) {
      addWorkerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Add Worker button clicked');
        this.showRollCallModal();
      });
    }
    
    if (clockInBtn) {
      clockInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Clock In button clicked');
        this.showClockInModal();
      });
    }

    if (crewFilter) {
      crewFilter.addEventListener('change', () => this.loadAttendanceData());
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
      if (e.target.classList.contains('edit-btn') || e.target.closest('.edit-btn')) {
        const btn = e.target.classList.contains('edit-btn') ? e.target : e.target.closest('.edit-btn');
        e.preventDefault();
        console.log('Edit button clicked');
        
        // Get data from the button's parent row
        const row = btn.closest('tr');
        if (row) {
          const cells = row.cells;
          const data = {
            id: btn.dataset.id || row.rowIndex,
            name: cells[0]?.textContent || 'N/A',
            status: btn.dataset.status || this.extractStatus(cells[1]),
            checkin: btn.dataset.checkin || cells[2]?.textContent || '',
            checkout: btn.dataset.checkout || cells[3]?.textContent || '',
            notes: btn.dataset.notes || cells[5]?.textContent || ''
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
        max-width: 500px;
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
        ">Edit Attendance - ${data.name}</h2>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Status:</label>
          <select id="editStatusSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
          ">
            <option value="present" ${data.status === 'present' ? 'selected' : ''}>Present</option>
            <option value="late" ${data.status === 'late' ? 'selected' : ''}>Late</option>
            <option value="absent" ${data.status === 'absent' ? 'selected' : ''}>Absent</option>
          </select>
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Check In:</label>
          <input type="time" id="editCheckIn" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
            color-scheme: dark;
          " value="${data.checkin || ''}">
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Check Out:</label>
          <input type="time" id="editCheckOut" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            transition: all 0.3s ease;
            color-scheme: dark;
          " value="${data.checkout || ''}">
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #999;
            font-size: 0.95rem;
          ">Notes:</label>
          <textarea id="editNotes" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            color: #fff;
            font-size: 1rem;
            resize: vertical;
            min-height: 80px;
            font-family: inherit;
            transition: all 0.3s ease;
          ">${data.notes || ''}</textarea>
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px">
          <button id="cancelEditBtn" class="btn btn-secondary" style="
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
          <button id="saveEditBtn" class="btn btn-primary" style="
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
          ">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Add hover effects
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

    const cancelBtn = document.getElementById('cancelEditBtn');
    const saveBtn = document.getElementById('saveEditBtn');

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

    saveBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = 'none';
      this.style.filter = 'brightness(1.1)';
    });
    saveBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = 'none';
      this.style.filter = 'brightness(1)';
    });

    // Cancel button handler
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });

    // Save button handler
    saveBtn.addEventListener('click', async () => {
      const status = document.getElementById('editStatusSelect').value;
      const checkIn = document.getElementById('editCheckIn').value;
      const checkOut = document.getElementById('editCheckOut').value;
      const notes = document.getElementById('editNotes').value;

      console.log('Saving attendance:', { id: data.id, status, checkIn, checkOut, notes });

      await self.db.updateAttendance(data.id, {
        status,
        clock_in: checkIn,
        clock_out: checkOut,
        notes
      });
      modal.remove();
      await self.loadAttendanceData();
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
        ">Roll Call</h2>
        
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

        <div style="margin: 18px 0; display:flex; align-items:center; gap:10px;">
          <input type="checkbox" id="clockOvertimeToggle" style="width:18px;height:18px;">
          <label for="clockOvertimeToggle" style="color:#bbb; font-size:0.95rem;">Log overtime (allow duplicate for same day)</label>
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
      const employeeSelect = document.getElementById('employeeSelect');
      const employeeId = employeeSelect.value;
      const employeeName = employeeSelect.options[employeeSelect.selectedIndex].text;
      const status = document.getElementById('statusSelect').value;
      const overtime = Boolean(document.getElementById('overtimeToggle')?.checked);
      
      // Don't proceed if no valid employee selected
      if (!employeeId || employeeName === 'Loading employees...' || employeeName === 'No employees found' || employeeName === 'Error loading employees') {
        notify('Please select a valid employee', 'warn');
        return;
      }
      
      const dateInput = document.getElementById('dateFilter');
      const selectedDate = dateInput?.value || new Date().toISOString().split('T')[0];
      const now = new Date(`${selectedDate}T00:00:00`);
      const crewFilter = document.getElementById('crewFilter');

      try {
        const existing = await self.db.getAttendance({ date: selectedDate });
        const already = (existing || []).some((r) => String(r.employee_id) === String(employeeId));
        if (already && !overtime) {
          notify('Attendance already recorded for this employee on this date. Use overtime to add another entry.', 'warn');
          return;
        }
      } catch (e) {
        console.warn('Attendance duplicate check failed', e);
      }

      const attendanceData = {
        employee_id: employeeId,
        employee_name: employeeName,
        status: status,
        date: selectedDate,
        clock_in: null,
        clock_out: null,
        hours: 8,
        notes: overtime ? 'Overtime entry' : '',
        site_id: crewFilter ? crewFilter.value : ''
      };
      
      console.log('Marking attendance:', attendanceData);
      
      try {
        await self.db.markAttendance(attendanceData);
        console.log('Attendance marked successfully');
        modal.remove();
        await self.loadAttendanceData();
        if (window.app && typeof window.app.showToast === 'function') window.app.showToast('Attendance marked', 'success');
      } catch (err) {
        console.error('Error marking attendance:', err);
        notify('Failed to mark attendance. Please try again.', 'error');
      }
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
      const employeeSelect = document.getElementById('employeeClockSelect');
      const employeeId = employeeSelect.value;
      const employeeName = employeeSelect.options[employeeSelect.selectedIndex].text;
      const time = document.getElementById('clockTime').value;
      const overtime = Boolean(document.getElementById('clockOvertimeToggle')?.checked);
      
      // Don't proceed if no valid employee selected
      if (!employeeId || employeeName === 'Loading employees...' || employeeName === 'No employees found' || employeeName === 'Error loading employees') {
        notify('Please select a valid employee', 'warn');
        return;
      }
      
      const dateInput = document.getElementById('dateFilter');
      const selectedDate = dateInput?.value || new Date().toISOString().split('T')[0];

      try {
        const existing = await self.db.getAttendance({ date: selectedDate });
        const already = (existing || []).some((r) => String(r.employee_id) === String(employeeId));
        if (already && !overtime) {
          notify('Attendance already recorded for this employee on this date. Use overtime to add another entry.', 'warn');
          return;
        }
      } catch (e) {
        console.warn('Attendance duplicate check failed', e);
      }

      const attendanceData = {
        employee_id: employeeId,
        employee_name: employeeName,
        status: 'present',
        date: selectedDate,
        clock_in: time || null,
        clock_out: null,
        hours: time ? 0 : 8,
        notes: overtime ? 'Overtime entry' : '',
        site_id: (document.getElementById('crewFilter') || {}).value || ''
      };
      
      console.log('Clocking in:', attendanceData);
      
      try {
        await self.db.markAttendance(attendanceData);
        console.log('Clocked in successfully');
        modal.remove();
        self.loadAttendanceData();
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

