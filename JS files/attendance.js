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
    
    // Set today's date as default in date filter
    const today = new Date().toISOString().split('T')[0];
    $('#filterDate').val(today);
});
class Attendance {
  constructor() {
    this.db = window.db;
    this.init();
  }
  
  init() {
    this.setupEventListeners();
    this.loadAttendanceData();
  }

  async loadAttendanceData() {
    try {
      const dateInput = document.getElementById('dateFilter');
      const date = dateInput?.value || new Date().toISOString().split('T')[0];
      
      let attendance = await this.db.getAttendance({ date });
      
      // If no data from database, use sample data from HTML table
      if (!attendance || attendance.length === 0) {
        const tbody = document.querySelector('.table tbody');
        if (tbody && tbody.children.length > 0) {
          // Extract existing rows as sample data
          attendance = Array.from(tbody.querySelectorAll('tr')).map((row, idx) => ({
            id: idx,
            employee_name: row.children[0]?.textContent || 'N/A',
            status: row.children[1]?.textContent?.toLowerCase().includes('present') ? 'present' : 
                    row.children[1]?.textContent?.toLowerCase().includes('late') ? 'late' : 'absent',
            clock_in: row.children[2]?.textContent || '',
            clock_out: row.children[3]?.textContent || '',
            hours: row.children[4]?.textContent || '0',
            notes: row.children[5]?.textContent || ''
          }));
        }
      }
      
      this.populateAttendanceTable(attendance);
    } catch (error) {
      console.error('Error loading attendance:', error);
    }
  }

  populateAttendanceTable(attendance) {
    const tbody = document.querySelector('.table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    if (!attendance || attendance.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: rgba(243, 246, 255, 0.50);">No attendance records for this date</td></tr>';
      return;
    }
    
    attendance.forEach(record => {
      const row = document.createElement('tr');
      const statusBadgeClass = record.status === 'present' ? 'badge-success' : record.status === 'absent' ? 'badge-danger' : 'badge-warning';
      const statusIcon = record.status === 'present' ? 'check_circle' : record.status === 'absent' ? 'cancel' : 'schedule';
      const statusText = record.status === 'present' ? 'Present' : record.status === 'absent' ? 'Absent' : 'Late';
      
      row.innerHTML = `
        <td>${record.employee_name || 'N/A'}</td>
        <td><span class="badge ${statusBadgeClass}"><span class="material-icons">${statusIcon}</span>${statusText}</span></td>
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
    const rollCallBtn = document.getElementById('rollCallBtn');
    const clockInBtn = document.getElementById('clockInBtn');
    const dateFilter = document.getElementById('dateFilter');
    const crewFilter = document.getElementById('crewFilter');
    
    if (dateFilter) {
      dateFilter.valueAsDate = new Date();
      dateFilter.addEventListener('change', () => this.loadAttendanceData());
    }
    
    if (rollCallBtn) {
      rollCallBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Roll Call button clicked');
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
      background: rgba(7, 10, 18, 0.85);
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
          background: #090B16;
          color: #F3F6FF;
          padding: 8px;
        }
        .modal-select option:hover {
          background: rgba(91, 93, 255, 0.2);
        }
      </style>
      <div style="
        background: rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.10);
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
          color: #F3F6FF;
          background: linear-gradient(135deg, #FFB86B, #FF8A3D);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">Edit Attendance - ${data.name}</h2>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Status:</label>
          <select id="editStatusSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
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
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Check In:</label>
          <input type="time" id="editCheckIn" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
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
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Check Out:</label>
          <input type="time" id="editCheckOut" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
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
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Notes:</label>
          <textarea id="editNotes" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
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
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          ">Cancel</button>
          <button id="saveEditBtn" class="btn btn-primary" style="
            flex: 1;
            padding: 12px 24px;
            background: linear-gradient(135deg, #FFB86B, #FF8A3D);
            border: none;
            border-radius: 12px;
            color: #000;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(255, 138, 61, 0.3);
          ">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Add hover effects
    const inputs = modal.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', function() {
        this.style.background = 'rgba(255, 255, 255, 0.08)';
        this.style.borderColor = '#5B5DFF';
        this.style.boxShadow = '0 0 12px rgba(91, 93, 255, 0.2)';
      });
      input.addEventListener('blur', function() {
        this.style.background = 'rgba(255, 255, 255, 0.05)';
        this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
        this.style.boxShadow = 'none';
      });
    });

    const cancelBtn = document.getElementById('cancelEditBtn');
    const saveBtn = document.getElementById('saveEditBtn');

    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = 'rgba(255, 255, 255, 0.08)';
      this.style.borderColor = '#5B5DFF';
      this.style.transform = 'translateY(-1px)';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = 'rgba(255, 255, 255, 0.06)';
      this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
      this.style.transform = 'translateY(0)';
    });

    saveBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 30px rgba(255, 138, 61, 0.4)';
      this.style.filter = 'brightness(1.1)';
    });
    saveBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 20px rgba(255, 138, 61, 0.3)';
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
      background: rgba(7, 10, 18, 0.85);
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
          background: #090B16;
          color: #F3F6FF;
          padding: 8px;
        }
        .modal-select option:hover {
          background: rgba(91, 93, 255, 0.2);
        }
      </style>
      <div style="
        background: rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.10);
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
          color: #F3F6FF;
          background: linear-gradient(135deg, #FFB86B, #FF8A3D);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">Roll Call</h2>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Select Employee:</label>
          <select id="employeeSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-size: 1rem;
            transition: all 0.3s ease;
          ">
            <option style="background: #090B16; color: #F3F6FF;">Loading employees...</option>
          </select>
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Status:</label>
          <select id="statusSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-size: 1rem;
            transition: all 0.3s ease;
          ">
            <option value="present" style="background: #090B16; color: #F3F6FF;">Present</option>
            <option value="absent" style="background: #090B16; color: #F3F6FF;">Absent</option>
            <option value="late" style="background: #090B16; color: #F3F6FF;">Late</option>
          </select>
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px">
          <button id="cancelRollCall" class="btn btn-secondary" style="
            flex: 1;
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          ">Cancel</button>
          <button id="markRollCall" class="btn btn-primary" style="
            flex: 1;
            padding: 12px 24px;
            background: linear-gradient(135deg, #FFB86B, #FF8A3D);
            border: none;
            border-radius: 12px;
            color: #000;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(255, 138, 61, 0.3);
          ">Mark</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Add hover effects for inputs
    const inputs = modal.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', function() {
        this.style.background = 'rgba(255, 255, 255, 0.08)';
        this.style.borderColor = '#5B5DFF';
        this.style.boxShadow = '0 0 12px rgba(91, 93, 255, 0.2)';
      });
      input.addEventListener('blur', function() {
        this.style.background = 'rgba(255, 255, 255, 0.05)';
        this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
        this.style.boxShadow = 'none';
      });
    });

    const cancelBtn = document.getElementById('cancelRollCall');
    const markBtn = document.getElementById('markRollCall');

    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = 'rgba(255, 255, 255, 0.08)';
      this.style.borderColor = '#5B5DFF';
      this.style.transform = 'translateY(-1px)';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = 'rgba(255, 255, 255, 0.06)';
      this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
      this.style.transform = 'translateY(0)';
    });

    markBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 30px rgba(255, 138, 61, 0.4)';
      this.style.filter = 'brightness(1.1)';
    });
    markBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 20px rgba(255, 138, 61, 0.3)';
      this.style.filter = 'brightness(1)';
    });

    // Load employees from database
    console.log('Loading employees from database...');
    this.db.getEmployees().then(employees => {
      console.log('Loaded employees:', employees);
      const select = document.getElementById('employeeSelect');
      
      if (!employees || employees.length === 0) {
        select.innerHTML = '<option style="background: #090B16; color: #F3F6FF;">No employees found</option>';
        return;
      }
      
      select.innerHTML = employees.map(e => 
        `<option value="${e.id}" style="background: #090B16; color: #F3F6FF;">${e.name || e.employee_name || 'Unknown'}</option>`
      ).join('');
    }).catch(err => {
      console.error('Error loading employees:', err);
      const select = document.getElementById('employeeSelect');
      select.innerHTML = '<option style="background: #090B16; color: #F3F6FF;">Error loading employees</option>';
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
      
      // Don't proceed if no valid employee selected
      if (!employeeId || employeeName === 'Loading employees...' || employeeName === 'No employees found' || employeeName === 'Error loading employees') {
        alert('Please select a valid employee');
        return;
      }
      
      const now = new Date();
      const attendanceData = {
        employee_id: employeeId,
        employee_name: employeeName,
        status: status,
        date: now.toISOString().split('T')[0],
        clock_in: status === 'absent' ? null : now.toTimeString().split(' ')[0].substring(0, 5),
        clock_out: null,
        hours: 0,
        notes: ''
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
        alert('Failed to mark attendance. Please try again.');
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
      background: rgba(7, 10, 18, 0.85);
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
          background: #090B16;
          color: #F3F6FF;
          padding: 8px;
        }
        .modal-select option:hover {
          background: rgba(91, 93, 255, 0.2);
        }
      </style>
      <div style="
        background: rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.10);
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
          color: #F3F6FF;
          background: linear-gradient(135deg, #FFB86B, #FF8A3D);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">Clock In/Out</h2>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Employee:</label>
          <select id="employeeClockSelect" class="input modal-select" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-size: 1rem;
            transition: all 0.3s ease;
          ">
            <option style="background: #090B16; color: #F3F6FF;">Loading employees...</option>
          </select>
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Time:</label>
          <input type="time" id="clockTime" class="input" style="
            width: 100%;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-size: 1rem;
            transition: all 0.3s ease;
            color-scheme: dark;
          " value="${new Date().toTimeString().split(' ')[0].substring(0, 5)}">
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px">
          <button id="cancelClock" class="btn btn-secondary" style="
            flex: 1;
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          ">Cancel</button>
          <button id="confirmClock" class="btn btn-primary" style="
            flex: 1;
            padding: 12px 24px;
            background: linear-gradient(135deg, #FFB86B, #FF8A3D);
            border: none;
            border-radius: 12px;
            color: #000;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(255, 138, 61, 0.3);
          ">Clock In</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Add hover effects for inputs
    const inputs = modal.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', function() {
        this.style.background = 'rgba(255, 255, 255, 0.08)';
        this.style.borderColor = '#5B5DFF';
        this.style.boxShadow = '0 0 12px rgba(91, 93, 255, 0.2)';
      });
      input.addEventListener('blur', function() {
        this.style.background = 'rgba(255, 255, 255, 0.05)';
        this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
        this.style.boxShadow = 'none';
      });
    });

    const cancelBtn = document.getElementById('cancelClock');
    const confirmBtn = document.getElementById('confirmClock');

    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = 'rgba(255, 255, 255, 0.08)';
      this.style.borderColor = '#5B5DFF';
      this.style.transform = 'translateY(-1px)';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = 'rgba(255, 255, 255, 0.06)';
      this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
      this.style.transform = 'translateY(0)';
    });

    confirmBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 30px rgba(255, 138, 61, 0.4)';
      this.style.filter = 'brightness(1.1)';
    });
    confirmBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 20px rgba(255, 138, 61, 0.3)';
      this.style.filter = 'brightness(1)';
    });

    // Load employees from database
    console.log('Loading employees for clock in...');
    this.db.getEmployees().then(employees => {
      console.log('Loaded employees:', employees);
      const select = document.getElementById('employeeClockSelect');
      
      if (!employees || employees.length === 0) {
        select.innerHTML = '<option style="background: #090B16; color: #F3F6FF;">No employees found</option>';
        return;
      }
      
      select.innerHTML = employees.map(e => 
        `<option value="${e.id}" style="background: #090B16; color: #F3F6FF;">${e.name || e.employee_name || 'Unknown'}</option>`
      ).join('');
    }).catch(err => {
      console.error('Error loading employees:', err);
      const select = document.getElementById('employeeClockSelect');
      select.innerHTML = '<option style="background: #090B16; color: #F3F6FF;">Error loading employees</option>';
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
      
      // Don't proceed if no valid employee selected
      if (!employeeId || employeeName === 'Loading employees...' || employeeName === 'No employees found' || employeeName === 'Error loading employees') {
        alert('Please select a valid employee');
        return;
      }
      
      const attendanceData = {
        employee_id: employeeId,
        employee_name: employeeName,
        status: 'present',
        date: new Date().toISOString().split('T')[0],
        clock_in: time,
        clock_out: null,
        hours: 0,
        notes: ''
      };
      
      console.log('Clocking in:', attendanceData);
      
      try {
        await self.db.markAttendance(attendanceData);
        console.log('Clocked in successfully');
        modal.remove();
        self.loadAttendanceData();
      } catch (err) {
        console.error('Error clocking in:', err);
        alert('Failed to clock in. Please try again.');
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