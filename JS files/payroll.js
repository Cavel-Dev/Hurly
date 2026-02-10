console.log('[DEBUG] payroll.js loaded');

function notify(message, type = 'info') {
  if (window.app && typeof window.app.showToast === 'function') {
    window.app.showToast(message, type);
  } else {
    alert(message);
  }
}

class Payroll {
  constructor() {
    this.db = window.db || null;
    this.defaultDailyRate = 5000;
    this.runs = [];
    this.activeRun = null;
    this.rateSheet = this.buildRateSheet();
    this.role = this.getCurrentRole();
    this.realtimeChannel = null;
    this.init();
  }

  buildRateSheet() {
    return [
      { id: 'block_day', label: 'Block Work - Laying Only (Day)', unit: 'per 100 blocks', day: 9000 },
      { id: 'block_night', label: 'Block Work - With Labour (Night)', unit: 'per 100 blocks', night: 15000 },
      { id: 'rough_cast_day', label: 'Rough Cast (Day)', unit: 'per yard', day: 500 },
      { id: 'rough_cast_night', label: 'Rough Cast - With Labour (Night)', unit: 'per yard', night: 800 },
      { id: 'granite_day', label: 'Granite (Day)', unit: 'per yard', day: 500 },
      { id: 'granite_night', label: 'Granite - With Labour (Night)', unit: 'per yard', night: 800 },
      { id: 'decking', label: 'Form Work / Decking', unit: 'per square', day: 18000 },
      { id: 'belting', label: 'Form Work / Belting', unit: 'per running foot', day: 500 },
      { id: 'steel_ton', label: 'Steel Work - Steel', unit: 'per ton', day: 70000 },
      { id: 'steel_stirrup', label: 'Steel Work - Stirrup', unit: 'per stirrup', day: 700 },
      { id: 'boxing_day', label: 'Boxing (Day)', unit: 'per foot', day: 500 },
      { id: 'boxing_night', label: 'Boxing (Night)', unit: 'per foot', night: 550 },
      { id: 'misc_jam', label: 'Misc - Jam', unit: 'per running foot', day: 600 },
      { id: 'misc_arch', label: 'Misc - Arch', unit: 'per foot', day: 1100 },
      { id: 'misc_column', label: 'Misc - Column & Beam', unit: 'per sq. ft.', day: 700 },
      { id: 'labour_day', label: 'Labour (Day)', unit: 'per day', day: 5500 },
      { id: 'labour_night', label: 'Labour (Night)', unit: 'per hour', night: 700 },
      { id: 'labour_sunday', label: 'Labour (Sunday Full Day)', unit: 'per day', sunday: 6000 }
    ];
  }

  getOvertimeConfig() {
    try {
      const raw = localStorage.getItem('huly_settings');
      const settings = raw ? JSON.parse(raw) : {};
      const payroll = settings?.payroll || {};
      return {
        threshold: typeof payroll.overtimeThreshold === 'number' ? payroll.overtimeThreshold : 8,
        multiplier: typeof payroll.overtimeMultiplier === 'number' ? payroll.overtimeMultiplier : 1.5
      };
    } catch (e) {
      return { threshold: 8, multiplier: 1.5 };
    }
  }

  getHourlyRate() {
    try {
      const raw = localStorage.getItem('huly_settings');
      const settings = raw ? JSON.parse(raw) : {};
      const payroll = settings?.payroll || {};
      const daily = typeof payroll.defaultDailyRate === 'number' ? payroll.defaultDailyRate : this.defaultDailyRate;
      return daily / 8;
    } catch (e) {
      return this.defaultDailyRate / 8;
    }
  }

  getRateForTask(taskId, shift) {
    const task = this.rateSheet.find((t) => t.id === taskId);
    if (!task) return 0;
    if (shift === 'Sunday' && task.sunday) return task.sunday;
    if (shift === 'Night' && task.night) return task.night;
    return task.day || task.night || task.sunday || 0;
  }

  getUnitForTask(taskId) {
    const task = this.rateSheet.find((t) => t.id === taskId);
    return task?.unit || '';
  }

  parsePayPeriodDates(label) {
    if (!label) return null;
    const cleaned = label.replace(/\(.*?\)/g, '').trim();
    const parts = cleaned.split('-').map(p => p.trim());
    if (parts.length < 2) return null;
    const start = new Date(parts[0]);
    const end = new Date(parts[1]);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end };
  }

  async getAttendanceDays(employeeId, start, end) {
    if (!this.db || typeof this.db.getAttendance !== 'function') return 0;
    const records = await this.db.getAttendance();
    const days = new Set();
    records.forEach((rec) => {
      const id = rec.employee_id || rec.employee_ID;
      if (String(id) !== String(employeeId)) return;
      const status = String(rec.status || rec.Status || '').toLowerCase();
      if (status !== 'present' && status !== 'late') return;
      const dateStr = rec.date || rec.Date;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return;
      if (d >= start && d <= end) {
        days.add(d.toISOString().split('T')[0]);
      }
    });
    return days.size;
  }

  getCurrentPayPeriodRange(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    if (day <= 15) {
      const start = new Date(year, month, 1);
      const end = new Date(year, month, 15);
      return { start, end };
    }
    const start = new Date(year, month, 16);
    const end = new Date(year, month + 1, 0);
    return { start, end };
  }

  formatPayPeriod({ start, end }, suffix = '') {
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(start)} - ${fmt(end)}${suffix ? ` (${suffix})` : ''}`;
  }

  setPayPeriodOptions() {
    const selector = document.getElementById('payPeriodSelector');
    if (!selector) return;

    const now = new Date();
    const current = this.getCurrentPayPeriodRange(now);
    const previousEnd = new Date(current.start.getTime() - 24 * 60 * 60 * 1000);
    const previous = this.getCurrentPayPeriodRange(previousEnd);
    const beforeEnd = new Date(previous.start.getTime() - 24 * 60 * 60 * 1000);
    const before = this.getCurrentPayPeriodRange(beforeEnd);

    selector.innerHTML = `
      <option value="current">${this.formatPayPeriod(current, 'Current')}</option>
      <option value="previous">${this.formatPayPeriod(previous)}</option>
      <option value="before">${this.formatPayPeriod(before)}</option>
    `;
    selector.addEventListener('change', async () => {
      await this.updateSummary();
    });
  }

  async init() {
    this.setupEventListeners();
    this.setPayPeriodOptions();
    await this.loadPayrollRuns();
    await this.updateSummary();
    this.applyRoleGuards();
    this.initRealtime();
  }

  getCurrentRole() {
    try {
      const session = JSON.parse(localStorage.getItem('huly_session') || 'null');
      return session?.role || 'admin';
    } catch (e) {
      return 'admin';
    }
  }

  applyRoleGuards() {
    const createBtn = document.getElementById('createRunBtn');
    if (createBtn && this.role === 'manager') {
      createBtn.disabled = true;
      createBtn.style.opacity = '0.6';
      createBtn.title = 'Manager role cannot create payroll runs';
    }
  }

  setupEventListeners() {
    const createRunBtn = document.getElementById('createRunBtn');
    if (createRunBtn) {
      createRunBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.role === 'manager') {
          notify('Manager role cannot create payroll runs.', 'warn');
          return;
        }
        this.showCreateRunModal();
      });
    }

    document.body.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-payroll-btn');
      if (deleteBtn) {
        const runId = deleteBtn.getAttribute('data-run-id');
        if (confirm('Delete this payroll run?')) {
          this.deletePayrollRun(runId);
        }
      }

      const viewBtn = e.target.closest('.view-payroll-btn');
      if (viewBtn) {
        const runId = viewBtn.getAttribute('data-run-id');
        const run = this.runs.find((r) => String(r.id) === String(runId));
        if (run) this.showRunDetailsModal(run);
      }

      const pdfBtn = e.target.closest('#downloadPayrollPdfBtn');
      if (pdfBtn && this.activeRun) {
        console.log('[DEBUG] PDF button clicked');
        this.downloadPayrollPdf(this.activeRun);
      }

      const summaryBtn = e.target.closest('#downloadEmployeeSummaryBtn');
      if (summaryBtn && this.activeRun) {
        this.downloadEmployeeSummaryCsv(this.activeRun);
      }
    });
  }

  async getPayrollRuns() {
    if (this.db && typeof this.db.getPayrollRuns === 'function') {
      return await this.db.getPayrollRuns();
    }
    if (this.db && typeof this.db.getPayroll === 'function') {
      return await this.db.getPayroll();
    }
    return [];
  }

  async createPayrollRun(data) {
    let created = null;
    if (this.db && typeof this.db.createPayrollRun === 'function') {
      created = await this.db.createPayrollRun(data);
    } else if (this.db && typeof this.db.createPayroll === 'function') {
      created = await this.db.createPayroll(data);
    }

    // Mirror to localStorage to ensure Reports can read it
    try {
      const raw = localStorage.getItem('huly_payroll');
      const list = raw ? JSON.parse(raw) : [];
      if (created && Array.isArray(list)) {
        const exists = list.some((r) => String(r.id) === String(created.id));
        if (!exists) {
          list.push(created);
          localStorage.setItem('huly_payroll', JSON.stringify(list));
        }
      }
      localStorage.setItem('huly_payroll_updated', String(Date.now()));
    } catch (e) {
      console.warn('Payroll mirror save failed', e);
    }

    if (!created) throw new Error('Database not available');
    return created;
  }

  async updatePayrollRun(id, data) {
    if (this.db && typeof this.db.updatePayroll === 'function') {
      return await this.db.updatePayroll(id, data);
    }
    throw new Error('Database not available');
  }

  async deletePayrollRun(id) {
    if (this.db && typeof this.db.deletePayrollRun === 'function') {
      await this.db.deletePayrollRun(id);
    } else if (this.db && typeof this.db.deletePayroll === 'function') {
      await this.db.deletePayroll(id);
    }
    await this.loadPayrollRuns();
    await this.updateSummary();
  }

  async loadPayrollRuns() {
    try {
      const runs = await this.getPayrollRuns();
      this.runs = runs || [];
      this.populateRuns(this.runs);
    } catch (error) {
      console.error('Error loading payroll runs:', error);
      this.populateRuns([]);
    }
  }

  initRealtime() {
    if (!this.db || typeof this.db.getSupabase !== 'function' || !this.db.supabaseHealthy) return;
    this.db.getSupabase().then((sb) => {
      if (!sb || this.realtimeChannel) return;
      let timer = null;
      this.realtimeChannel = sb
        .channel('rt-payroll')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll' }, () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            await this.loadPayrollRuns();
            await this.updateSummary();
          }, 300);
        })
        .subscribe();
      window.addEventListener('beforeunload', () => {
        if (this.realtimeChannel) sb.removeChannel(this.realtimeChannel);
      });
    });
  }

  populateRuns(runs) {
    const tbody = document.querySelector('.table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!runs || runs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No payroll runs yet</td></tr>';
      return;
    }

    runs.forEach((run) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="padding:12px 8px;">${this.escapeHtml(run.pay_period || 'N/A')}</td>
        <td style="padding:12px 8px;">${run.employees_count ?? run.employees ?? 0}</td>
        <td style="padding:12px 8px;">${this.formatCurrency(run.total || 0)}</td>
        <td style="padding:12px 8px;">${this.escapeHtml(run.status || 'Draft')}</td>
        <td style="padding:12px 8px;">${this.formatDate(run.created_at)}</td>
        <td style="padding:12px 8px;">
          <button class="btn btn-secondary btn-sm view-payroll-btn" data-run-id="${run.id}">View</button>
          <button class="btn btn-secondary btn-sm delete-payroll-btn" data-run-id="${run.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  async showCreateRunModal() {
    const existing = document.getElementById('payrollModal');
    if (existing) existing.remove();

    const payPeriodSelector = document.getElementById('payPeriodSelector');
    const defaultPeriod = payPeriodSelector ? payPeriodSelector.options[payPeriodSelector.selectedIndex].text : this.formatPayPeriod(this.getCurrentPayPeriodRange(), 'Current');

    let employees = [];
    if (this.db && typeof this.db.getEmployees === 'function') {
      employees = await this.db.getEmployees();
    }
    const defaultTaskId = this.rateSheet[0]?.id || '';

    const modal = document.createElement('div');
    modal.id = 'payrollModal';
    modal.className = 'modal-overlay';

    const periodRange = this.parsePayPeriodDates(defaultPeriod);
    modal.innerHTML = `
      <div class="modal-card modal-full payroll-modal">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Create Payroll Run</h2>
            <div class="modal-sub">Rates in JMD</div>
          </div>
          <button class="icon-btn" id="payrollCloseBtn" aria-label="Close">x</button>
        </div>

        <div class="modal-body">
          <div class="modal-section">
            <div class="segmented" id="payrollModeToggle">
              <button type="button" class="active" data-mode="auto">Automatic</button>
              <button type="button" data-mode="manual">Manual</button>
            </div>
            <div class="inline-muted">Automatic uses attendance. Manual lets you enter payroll details yourself.</div>
          </div>

          <div class="modal-section">
            <label>Pay Period</label>
            <input type="text" id="payPeriodInput" value="${this.escapeHtml(defaultPeriod)}">
          </div>

          <div id="autoPanel">
            <div class="modal-section">
              <div class="modal-section-title">Employees</div>
              <div class="table-wrap modal-table-wrap">
                <table class="modal-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Name</th>
                      <th>Task</th>
                      <th>Shift</th>
                      <th>Sunday</th>
                      <th>Days</th>
                      <th>Rate</th>
                      <th>Override</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>OT Hours</th>
                      <th>Bonus</th>
                      <th>Deduction</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody id="payrollEmployeesBody">
                    ${(employees || []).map((emp) => `
                      <tr>
                        <td><input type="checkbox" class="emp-select" data-id="${emp.id}"></td>
                        <td>${this.escapeHtml(emp.name || emp.employee_name || 'N/A')}</td>
                        <td>
                          <select class="emp-task" data-id="${emp.id}">
                            ${this.rateSheet.map((t) => `<option value="${t.id}" ${t.id === defaultTaskId ? 'selected' : ''}>${this.escapeHtml(t.label)}</option>`).join('')}
                          </select>
                        </td>
                        <td>
                          <select class="emp-shift" data-id="${emp.id}">
                            <option value="Day">Day</option>
                            <option value="Night">Night</option>
                          </select>
                        </td>
                        <td><input type="checkbox" class="emp-sunday" data-id="${emp.id}"></td>
                        <td><input type="number" class="emp-days" data-id="${emp.id}" min="0" step="0.25" value="0"></td>
                        <td><input type="text" class="emp-rate" data-id="${emp.id}" value="0" readonly></td>
                        <td><input type="checkbox" class="emp-override" data-id="${emp.id}"></td>
                        <td><input type="number" class="emp-override-amount" data-id="${emp.id}" min="0" step="0.01" value="0"></td>
                        <td>
                          <select class="emp-status" data-id="${emp.id}">
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Paid">Paid</option>
                          </select>
                        </td>
                        <td><input type="number" class="emp-ot" data-id="${emp.id}" min="0" step="0.25" value="0"></td>
                        <td><input type="number" class="emp-bonus" data-id="${emp.id}" min="0" step="0.01" value="0"></td>
                        <td><input type="number" class="emp-deduction" data-id="${emp.id}" min="0" step="0.01" value="0"></td>
                        <td class="emp-total" data-id="${emp.id}">0</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              <div class="modal-row mt-12">
                <button type="button" id="selectAllEmployees" class="btn btn-outline btn-sm">Select All</button>
                <div class="pill">Selected: <span id="selectedCount">0</span></div>
                <div class="pill">Total Days: <span id="totalHoursValue">0</span></div>
              </div>
            </div>
          </div>

          <div id="manualPanel" class="is-hidden">
            <div class="modal-section">
              <div class="modal-section-title">Manual Entries</div>
              <div class="modal-row mb-12">
                <button type="button" id="addManualRow" class="btn btn-secondary btn-sm">Add Row</button>
                <div class="pill">Rows: <span id="manualRowCount">0</span></div>
                <div class="pill">Total Days: <span id="manualTotalDays">0</span></div>
              </div>
              <div class="table-wrap modal-table-wrap">
                <table class="modal-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Task</th>
                      <th>Shift</th>
                      <th>Days</th>
                      <th>Rate</th>
                      <th>OT Hours</th>
                      <th>Bonus</th>
                      <th>Deduction</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="manualEntriesBody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="modal-section form-grid">
            <div class="form-stack">
              <label>Estimated Total</label>
              <input type="number" id="totalInput" value="0" min="0" readonly>
            </div>
            <div class="form-stack">
              <label>Status</label>
              <select id="statusInput">
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button id="payrollCancel" class="btn btn-outline">Cancel</button>
          <button id="payrollSave" class="btn btn-primary">Create</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    if (periodRange) {
      const start = periodRange.start;
      const end = periodRange.end;
      const dayInputs = Array.from(modal.querySelectorAll('.emp-days'));
      for (const input of dayInputs) {
        const empId = input.getAttribute('data-id');
        const days = await this.getAttendanceDays(empId, start, end);
        input.value = days;
      }
    }

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('payrollCancel').addEventListener('click', close);
    document.getElementById('payrollCloseBtn').addEventListener('click', close);

    let mode = 'auto';
    const autoPanel = document.getElementById('autoPanel');
    const manualPanel = document.getElementById('manualPanel');
    const modeToggle = document.getElementById('payrollModeToggle');

    const setMode = (next) => {
      mode = next;
      Array.from(modeToggle.querySelectorAll('button')).forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
      });
      if (autoPanel) autoPanel.classList.toggle('is-hidden', mode !== 'auto');
      if (manualPanel) manualPanel.classList.toggle('is-hidden', mode !== 'manual');
      computeTotals();
    };

    if (modeToggle) {
      modeToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mode]');
        if (!btn) return;
        setMode(btn.getAttribute('data-mode'));
      });
    }

    const employeeOptions = (employees || [])
      .map((e) => `<option value="${e.id}">${this.escapeHtml(e.name || e.employee_name || 'Unknown')}</option>`)
      .join('');

    const addManualRow = (row = {}) => {
      const tbody = document.getElementById('manualEntriesBody');
      if (!tbody) return;
      const tr = document.createElement('tr');
      tr.className = 'manual-row';
      tr.innerHTML = `
        <td>
          <select class="manual-employee">
            <option value="">Select employee</option>
            ${employeeOptions}
          </select>
        </td>
        <td>
          <select class="manual-task">
            <option value="">Custom</option>
            ${this.rateSheet.map((t) => `<option value="${t.id}">${this.escapeHtml(t.label)}</option>`).join('')}
          </select>
        </td>
        <td>
          <select class="manual-shift">
            <option value="Day">Day</option>
            <option value="Night">Night</option>
            <option value="Sunday">Sunday</option>
          </select>
        </td>
        <td><input type="number" class="manual-days" min="0" step="0.25" value="${row.days || 0}"></td>
        <td><input type="number" class="manual-rate" min="0" step="0.01" value="${row.rate || 0}"></td>
        <td><input type="number" class="manual-ot" min="0" step="0.25" value="${row.overtime_hours || 0}"></td>
        <td><input type="number" class="manual-bonus" min="0" step="0.01" value="${row.bonus || 0}"></td>
        <td><input type="number" class="manual-deduction" min="0" step="0.01" value="${row.deduction || 0}"></td>
        <td><input type="number" class="manual-total" min="0" step="0.01" value="${row.total || 0}" readonly></td>
        <td>
          <select class="manual-status">
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Paid">Paid</option>
          </select>
        </td>
        <td><button type="button" class="icon-btn danger remove-manual">x</button></td>
      `;
      tbody.appendChild(tr);
      computeTotals();
    };

    const manualEntriesBody = document.getElementById('manualEntriesBody');
    if (manualEntriesBody) {
      manualEntriesBody.addEventListener('input', (e) => {
        const row = e.target.closest('.manual-row');
        if (!row) return;
        if (e.target.classList.contains('manual-task') || e.target.classList.contains('manual-shift')) {
          const taskId = row.querySelector('.manual-task')?.value || '';
          const shift = row.querySelector('.manual-shift')?.value || 'Day';
          if (taskId) {
            row.querySelector('.manual-rate').value = this.getRateForTask(taskId, shift);
          }
        }
        computeTotals();
      });
      manualEntriesBody.addEventListener('change', (e) => {
        const row = e.target.closest('.manual-row');
        if (row) {
          if (e.target.classList.contains('manual-task') || e.target.classList.contains('manual-shift')) {
            const taskId = row.querySelector('.manual-task')?.value || '';
            const shift = row.querySelector('.manual-shift')?.value || 'Day';
            if (taskId) {
              row.querySelector('.manual-rate').value = this.getRateForTask(taskId, shift);
            }
          }
        }
        computeTotals();
      });
      manualEntriesBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-manual');
        if (btn) {
          btn.closest('tr')?.remove();
          computeTotals();
        }
      });
    }

    const addManualBtn = document.getElementById('addManualRow');
    if (addManualBtn) addManualBtn.addEventListener('click', () => addManualRow());

    const computeAutoTotals = () => {
      const { threshold, multiplier } = this.getOvertimeConfig();
      const hourlyRate = this.getHourlyRate();
      const selects = Array.from(modal.querySelectorAll('.emp-select'));
      let selectedCount = 0;
      let totalQty = 0;
      let totalAmount = 0;

      selects.forEach((sel) => {
        const id = sel.getAttribute('data-id');
        const taskSelect = modal.querySelector(`.emp-task[data-id="${id}"]`);
        const shiftSelect = modal.querySelector(`.emp-shift[data-id="${id}"]`);
        const sundayToggle = modal.querySelector(`.emp-sunday[data-id="${id}"]`);
        const qtyInput = modal.querySelector(`.emp-days[data-id="${id}"]`);
        const rateInput = modal.querySelector(`.emp-rate[data-id="${id}"]`);
        const overrideToggle = modal.querySelector(`.emp-override[data-id="${id}"]`);
        const overrideAmountInput = modal.querySelector(`.emp-override-amount[data-id="${id}"]`);
        const overtimeInput = modal.querySelector(`.emp-ot[data-id="${id}"]`);
        const bonusInput = modal.querySelector(`.emp-bonus[data-id="${id}"]`);
        const deductionInput = modal.querySelector(`.emp-deduction[data-id="${id}"]`);
        const totalCell = modal.querySelector(`.emp-total[data-id="${id}"]`);

        const taskId = taskSelect?.value || '';
        const shift = shiftSelect?.value || 'Day';
        const isSunday = Boolean(sundayToggle?.checked);
        const effectiveShift = isSunday ? 'Sunday' : shift;
        const rate = this.getRateForTask(taskId, effectiveShift);
        const qty = parseFloat(qtyInput?.value || '0') || 0;
        const overrideEnabled = Boolean(overrideToggle?.checked);
        const overrideAmount = parseFloat(overrideAmountInput?.value || '0') || 0;
        const defaultHours = qty * 8;
        let overtimeHours = parseFloat(overtimeInput?.value || '0');
        if (!Number.isFinite(overtimeHours) || overtimeHours < 0) overtimeHours = 0;
        if (overtimeInput && overtimeInput.value === '') {
          overtimeHours = Math.max(0, defaultHours - threshold);
          overtimeInput.value = overtimeHours.toFixed(2);
        }
        const bonus = parseFloat(bonusInput?.value || '0') || 0;
        const deduction = parseFloat(deductionInput?.value || '0') || 0;
        const overtimeTotal = overtimeHours * hourlyRate * multiplier;
        const base = overrideEnabled ? overrideAmount : qty * rate;
        const rowTotal = base + overtimeTotal + bonus - deduction;

        if (rateInput) rateInput.value = overrideEnabled ? 'Manual' : this.formatCurrency(rate);
        if (totalCell) totalCell.textContent = this.formatCurrency(rowTotal);
        if (sel.checked) {
          selectedCount += 1;
          totalQty += qty;
          totalAmount += rowTotal;
        }
      });

      const selectedCountEl = document.getElementById('selectedCount');
      const totalHoursEl = document.getElementById('totalHoursValue');
      const totalInput = document.getElementById('totalInput');
      if (selectedCountEl) selectedCountEl.textContent = selectedCount;
      if (totalHoursEl) totalHoursEl.textContent = totalQty.toFixed(2);
      if (totalInput) totalInput.value = Math.round(totalAmount * 100) / 100;
    };

    const computeManualTotals = () => {
      const { multiplier } = this.getOvertimeConfig();
      const hourlyRate = this.getHourlyRate();
      const rows = Array.from(modal.querySelectorAll('.manual-row'));
      let totalAmount = 0;
      let totalDays = 0;
      rows.forEach((row) => {
        const days = parseFloat(row.querySelector('.manual-days')?.value || '0') || 0;
        const rate = parseFloat(row.querySelector('.manual-rate')?.value || '0') || 0;
        const overtimeHours = parseFloat(row.querySelector('.manual-ot')?.value || '0') || 0;
        const bonus = parseFloat(row.querySelector('.manual-bonus')?.value || '0') || 0;
        const deduction = parseFloat(row.querySelector('.manual-deduction')?.value || '0') || 0;
        const overtimeTotal = overtimeHours * hourlyRate * multiplier;
        const total = Math.round((days * rate + overtimeTotal + bonus - deduction) * 100) / 100;
        const totalInput = row.querySelector('.manual-total');
        if (totalInput) totalInput.value = total;
        totalDays += days;
        totalAmount += total;
      });
      const totalInput = document.getElementById('totalInput');
      if (totalInput) totalInput.value = Math.round(totalAmount * 100) / 100;
      const rowCountEl = document.getElementById('manualRowCount');
      const totalDaysEl = document.getElementById('manualTotalDays');
      if (rowCountEl) rowCountEl.textContent = rows.length;
      if (totalDaysEl) totalDaysEl.textContent = totalDays.toFixed(2);
    };

    const computeTotals = () => {
      if (mode === 'manual') return computeManualTotals();
      return computeAutoTotals();
    };

    modal.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('change', computeTotals);
      el.addEventListener('input', computeTotals);
    });

    const selectAllBtn = document.getElementById('selectAllEmployees');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const selected = modal.querySelectorAll('.emp-select:checked').length;
        const all = modal.querySelectorAll('.emp-select');
        all.forEach((box) => { box.checked = selected !== all.length; });
        computeTotals();
      });
    }

    addManualRow();
    computeTotals();

    document.getElementById('payrollSave').addEventListener('click', async () => {
      const period = document.getElementById('payPeriodInput').value.trim();
      const total = parseFloat(document.getElementById('totalInput').value || '0') || 0;
      const status = document.getElementById('statusInput').value;

      if (!period) {
        notify('Please enter a pay period', 'warn');
        return;
      }

      if (mode === 'manual') {
        const rows = Array.from(modal.querySelectorAll('.manual-row'));
        if (rows.length === 0) {
          notify('Add at least one manual row', 'warn');
          return;
        }
        const missingEmployee = rows.some((row) => !row.querySelector('.manual-employee')?.value);
        if (missingEmployee) {
          notify('Select an employee for each manual row.', 'warn');
          return;
        }
        const entries = rows.map((row) => {
          const empSelect = row.querySelector('.manual-employee');
          const employeeId = empSelect?.value || null;
          const employeeName = empSelect?.options?.[empSelect.selectedIndex]?.text || 'Manual Entry';
          const taskId = row.querySelector('.manual-task')?.value || '';
          const shift = row.querySelector('.manual-shift')?.value || 'Day';
          const days = parseFloat(row.querySelector('.manual-days')?.value || '0') || 0;
          const rate = parseFloat(row.querySelector('.manual-rate')?.value || '0') || 0;
          const overtimeHours = parseFloat(row.querySelector('.manual-ot')?.value || '0') || 0;
          const bonus = parseFloat(row.querySelector('.manual-bonus')?.value || '0') || 0;
          const deduction = parseFloat(row.querySelector('.manual-deduction')?.value || '0') || 0;
          const overtimeRate = this.getHourlyRate() * this.getOvertimeConfig().multiplier;
          const overtimeTotal = Math.round(overtimeHours * overtimeRate * 100) / 100;
          const rowTotal = Math.round(days * rate * 100) / 100;
          return {
            employee_id: employeeId,
            employee_name: employeeName,
            task_id: taskId,
            task_label: this.rateSheet.find((t) => t.id === taskId)?.label || 'Custom',
            shift,
            sunday: shift === 'Sunday',
            days,
            unit: this.getUnitForTask(taskId),
            rate,
            overtime_hours: overtimeHours,
            overtime_rate: overtimeRate,
            overtime_total: overtimeTotal,
            bonus,
            deduction,
            override: false,
            override_amount: 0,
            total: Math.round((rowTotal + overtimeTotal + bonus - deduction) * 100) / 100,
            status: row.querySelector('.manual-status')?.value || 'Pending'
          };
        });

        const totalHours = entries.reduce((sum, e) => sum + (e.days || 0), 0);
        await this.createPayrollRun({
          pay_period: period,
          employees_count: entries.length,
          total_hours: totalHours,
          total,
          status,
          entries
        });
      } else {
        const selectedIds = Array.from(modal.querySelectorAll('.emp-select:checked'))
          .map((el) => el.getAttribute('data-id'))
          .filter(Boolean);

        if (selectedIds.length === 0) {
          notify('Select at least one employee', 'warn');
          return;
        }

        if (Number.isNaN(total)) {
          notify('Please enter a valid total', 'warn');
          return;
        }

        const entries = selectedIds.map((id) => {
          const emp = (employees || []).find((e) => String(e.id) === String(id));
          const taskId = modal.querySelector(`.emp-task[data-id="${id}"]`)?.value || '';
          const shift = modal.querySelector(`.emp-shift[data-id="${id}"]`)?.value || 'Day';
          const isSunday = Boolean(modal.querySelector(`.emp-sunday[data-id="${id}"]`)?.checked);
          const qty = parseFloat(modal.querySelector(`.emp-days[data-id="${id}"]`)?.value || '0') || 0;
          const overrideEnabled = Boolean(modal.querySelector(`.emp-override[data-id="${id}"]`)?.checked);
          const overrideAmount = parseFloat(modal.querySelector(`.emp-override-amount[data-id="${id}"]`)?.value || '0') || 0;
          const overtimeHours = parseFloat(modal.querySelector(`.emp-ot[data-id="${id}"]`)?.value || '0') || 0;
          const bonus = parseFloat(modal.querySelector(`.emp-bonus[data-id="${id}"]`)?.value || '0') || 0;
          const deduction = parseFloat(modal.querySelector(`.emp-deduction[data-id="${id}"]`)?.value || '0') || 0;
          const effectiveShift = isSunday ? 'Sunday' : shift;
          const rate = this.getRateForTask(taskId, effectiveShift);
          const overtimeRate = this.getHourlyRate() * this.getOvertimeConfig().multiplier;
          const overtimeTotal = Math.round(overtimeHours * overtimeRate * 100) / 100;
          const base = overrideEnabled ? overrideAmount : Math.round(qty * rate * 100) / 100;
          const total = Math.round((base + overtimeTotal + bonus - deduction) * 100) / 100;
          return {
            employee_id: id,
            employee_name: emp?.name || emp?.employee_name || 'N/A',
            task_id: taskId,
            task_label: this.rateSheet.find((t) => t.id === taskId)?.label || '',
            shift,
            sunday: isSunday,
            days: qty,
            unit: this.getUnitForTask(taskId),
            rate,
            overtime_hours: overtimeHours,
            overtime_rate: overtimeRate,
            overtime_total: overtimeTotal,
            bonus,
            deduction,
            override: overrideEnabled,
            override_amount: overrideAmount,
            total,
            status: modal.querySelector(`.emp-status[data-id="${id}"]`)?.value || 'Pending'
          };
        });

        const totalHours = entries.reduce((sum, e) => sum + (e.days || 0), 0);
        await this.createPayrollRun({
          pay_period: period,
          site_id: localStorage.getItem('huly_active_site') || '',
          employees_count: selectedIds.length,
          total_hours: totalHours,
          total,
          status,
          entries
        });
      }

      close();
      await this.loadPayrollRuns();
      await this.updateSummary();
    });
  }

  async showRunDetailsModal(run) {
    const existing = document.getElementById('payrollDetailsModal');
    if (existing) existing.remove();

    this.activeRun = run;

    const modal = document.createElement('div');
    modal.id = 'payrollDetailsModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const entries = Array.isArray(run.entries) ? run.entries : [];
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px;width:94%;max-width:980px;box-shadow:0 8px 30px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:12px;">
          <div>
            <h2 style="margin:0;">Payroll Run</h2>
            <div style="font-size:12px;color:#444;">${this.escapeHtml(run.pay_period || '')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;">${this.formatCurrency(run.total || 0)}</div>
            <div style="font-size:12px;color:#444;">${this.formatDate(run.created_at)}</div>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:center;margin:12px 0;flex-wrap:wrap;">
          <label style="font-weight:600;">Run Status</label>
          <select id="runStatusInput" style="padding:8px;border:1px solid #ccc;border-radius:8px;">
            <option value="Pending" ${run.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Approved" ${run.status === 'Approved' ? 'selected' : ''}>Approved</option>
            <option value="Paid" ${run.status === 'Paid' ? 'selected' : ''}>Paid</option>
          </select>
          <button type="button" id="markAllApprovedBtn" style="margin-left:auto;padding:8px 12px;border:1px solid #111;background:#fff;border-radius:8px;">Mark All Approved</button>
          <button type="button" id="markAllPaidBtn" style="padding:8px 12px;border:1px solid #111;background:#fff;border-radius:8px;">Mark All Paid</button>
        </div>

        <div style="border:1px solid #ccc;border-radius:10px;max-height:360px;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f2f2f2;">
                <th style="text-align:left;padding:8px;">Employee</th>
                <th style="text-align:left;padding:8px;">Task</th>
                <th style="text-align:left;padding:8px;">Shift</th>
                <th style="text-align:left;padding:8px;">Days</th>
                <th style="text-align:left;padding:8px;">Rate</th>
                <th style="text-align:left;padding:8px;">Total</th>
                <th style="text-align:left;padding:8px;">Status</th>
              </tr>
            </thead>
            <tbody id="runEntriesBody">
              ${entries.map((entry, idx) => `
                <tr>
                  <td style="padding:8px;">${this.escapeHtml(entry.employee_name || 'N/A')}</td>
                  <td style="padding:8px;">${this.escapeHtml(entry.task_label || '')}</td>
                  <td style="padding:8px;">${this.escapeHtml(entry.shift || 'Day')}</td>
                  <td style="padding:8px;">${entry.days ?? entry.qty ?? 0}</td>
                  <td style="padding:8px;">${this.formatCurrency(entry.rate || 0)}</td>
                  <td style="padding:8px;">${this.formatCurrency(entry.total || 0)}</td>
                  <td style="padding:8px;">
                    <select class="entry-status" data-index="${idx}" style="padding:6px;border:1px solid #ccc;border-radius:6px;">
                      <option value="Pending" ${(entry.status || 'Pending') === 'Pending' ? 'selected' : ''}>Pending</option>
                      <option value="Approved" ${(entry.status || 'Pending') === 'Approved' ? 'selected' : ''}>Approved</option>
                      <option value="Paid" ${(entry.status || 'Pending') === 'Paid' ? 'selected' : ''}>Paid</option>
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
          <button id="downloadEmployeeSummaryBtn" style="flex:1;padding:10px;border:1px solid #111;background:#fff;border-radius:8px;">Download Summary (CSV)</button>
          <button id="downloadPayrollPdfBtn" onclick="window.payrollApp && window.payrollApp.downloadPayrollPdf(window.payrollApp.activeRun)" style="flex:1;padding:10px;border:1px solid #111;background:#fff;border-radius:8px;">Download PDF</button>
          <button id="runDetailsClose" style="flex:1;padding:10px;border:1px solid #999;background:#fff;border-radius:8px;">Close</button>
          <button id="runDetailsSave" style="flex:1;padding:10px;border:0;background:#111;color:#fff;border-radius:8px;">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
      modal.remove();
      this.activeRun = null;
    };
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('runDetailsClose').addEventListener('click', close);

    const downloadBtn = document.getElementById('downloadEmployeeSummaryBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadEmployeeSummaryCsv(run);
      });
      downloadBtn.onclick = () => this.downloadEmployeeSummaryCsv(run);
    }

    const pdfBtn = document.getElementById('downloadPayrollPdfBtn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        this.downloadPayrollPdf(run);
      });
      pdfBtn.onclick = () => this.downloadPayrollPdf(run);
    }

    const markAllBtn = document.getElementById('markAllPaidBtn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        modal.querySelectorAll('.entry-status').forEach((sel) => { sel.value = 'Paid'; });
      });
    }

    const markAllApprovedBtn = document.getElementById('markAllApprovedBtn');
    if (markAllApprovedBtn) {
      markAllApprovedBtn.addEventListener('click', () => {
        modal.querySelectorAll('.entry-status').forEach((sel) => { sel.value = 'Approved'; });
      });
    }

    const saveBtn = document.getElementById('runDetailsSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (this.role === 'manager') {
          notify('Manager role cannot change payroll status.', 'warn');
          return;
        }
      const status = document.getElementById('runStatusInput').value;
      const updatedEntries = entries.map((entry, idx) => {
        const statusEl = modal.querySelector(`.entry-status[data-index="${idx}"]`);
        return { ...entry, status: statusEl ? statusEl.value : (entry.status || 'Pending') };
      });

      await this.updatePayrollRun(run.id, { status, entries: updatedEntries });
      await this.loadPayrollRuns();
      await this.updateSummary();
      close();
      });
    }

    if (this.role === 'manager') {
      const runStatus = document.getElementById('runStatusInput');
      if (runStatus) runStatus.disabled = true;
      modal.querySelectorAll('.entry-status').forEach((sel) => { sel.disabled = true; });
      const markAllPaidBtn = document.getElementById('markAllPaidBtn');
      const markAllApprovedBtn = document.getElementById('markAllApprovedBtn');
      if (markAllPaidBtn) markAllPaidBtn.disabled = true;
      if (markAllApprovedBtn) markAllApprovedBtn.disabled = true;
    }
  }

  downloadEmployeeSummaryCsv(run) {
    const entries = Array.isArray(run.entries) ? run.entries : [];
    const map = new Map();

    entries.forEach((entry) => {
      const key = entry.employee_id || entry.employee_name || 'Unknown';
      if (!map.has(key)) {
        map.set(key, {
          employee: entry.employee_name || 'Unknown',
          total: 0,
          paid: 0,
          pending: 0,
          approved: 0
        });
      }
      const row = map.get(key);
      row.total += parseFloat(entry.total) || 0;
      const status = String(entry.status || 'Pending').toLowerCase();
      if (status === 'paid') row.paid += parseFloat(entry.total) || 0;
      else if (status === 'approved') row.approved += parseFloat(entry.total) || 0;
      else row.pending += parseFloat(entry.total) || 0;
    });

    const rows = [
      ['Employee', 'Total (JMD)', 'Paid (JMD)', 'Approved (JMD)', 'Pending (JMD)'].join(',')
    ];

    map.forEach((row) => {
      rows.push([
        this.csv(row.employee),
        row.total.toFixed(2),
        row.paid.toFixed(2),
        row.approved.toFixed(2),
        row.pending.toFixed(2)
      ].join(','));
    });

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `payroll-employee-summary-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  downloadPayrollPdf(run) {
    if (typeof html2pdf === 'undefined') {
      this.printPayrollPdf(run);
      return;
    }

    const reportEl = this.buildPayrollPdfElement(run);
    const stamp = new Date().toISOString().split('T')[0];
    const options = {
      margin: [10, 10, 12, 10],
      filename: `payroll-run-${stamp}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    document.body.appendChild(reportEl);
    html2pdf().set(options).from(reportEl).save().then(() => {
      reportEl.remove();
    });
  }

  printPayrollPdf(run) {
    const reportEl = this.buildPayrollPdfElement(run);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      notify('Unable to open print preview.', 'error');
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>Payroll PDF</title></head><body>${reportEl.outerHTML}</body></html>`);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      iframe.remove();
    }, 500);
  }
  buildPayrollPdfElement(run) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:24px;font-family:Arial, sans-serif;color:#111;background:#fff;position:relative;';

    const wm = document.createElement('div');
    const company = this.getCompanyName();
    wm.textContent = `${company} CONFIDENTIAL`;
    wm.style.cssText = 'position:absolute;top:35%;left:-10%;width:120%;text-align:center;font-size:64px;font-weight:700;color:#000;opacity:0.08;transform:rotate(-25deg);pointer-events:none;';
    wrapper.appendChild(wm);

    wrapper.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px;">
        <div>
          <div style="font-size:20px;font-weight:700;">Payroll Run</div>
          <div style="font-size:12px;color:#444;">${this.escapeHtml(run.pay_period || '')}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#444;">Generated</div>
          <div style="font-weight:600;">${new Date().toLocaleDateString('en-US')}</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="flex:1;border:1px solid #111;padding:10px;border-radius:8px;">
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">Employees</div>
          <div style="font-size:18px;font-weight:700;">${run.employees_count ?? (run.entries?.length || 0)}</div>
        </div>
        <div style="flex:1;border:1px solid #111;padding:10px;border-radius:8px;">
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">Total</div>
          <div style="font-size:18px;font-weight:700;">${this.formatCurrency(run.total || 0)}</div>
        </div>
        <div style="flex:1;border:1px solid #111;padding:10px;border-radius:8px;">
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">Status</div>
          <div style="font-size:18px;font-weight:700;">${this.escapeHtml(run.status || 'Pending')}</div>
        </div>
      </div>
    `;

    const entries = Array.isArray(run.entries) ? run.entries : [];
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    table.innerHTML = `
      <thead>
        <tr style="background:#111;color:#fff;">
          <th style="padding:8px;text-align:left;">Employee</th>
          <th style="padding:8px;text-align:left;">Task</th>
          <th style="padding:8px;text-align:left;">Shift</th>
          <th style="padding:8px;text-align:left;">Sunday</th>
          <th style="padding:8px;text-align:left;">Days</th>
          <th style="padding:8px;text-align:left;">Rate (JMD)</th>
          <th style="padding:8px;text-align:left;">Total (JMD)</th>
          <th style="padding:8px;text-align:left;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map((entry) => `
          <tr>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.employee_name || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.task_label || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.shift || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${entry.sunday ? 'Yes' : 'No'}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${entry.days ?? entry.qty ?? 0}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.formatCurrency(entry.rate || 0)}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.formatCurrency(entry.total || 0)}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.status || 'Pending')}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    wrapper.appendChild(table);
    return wrapper;
  }

  getCompanyName() {
    try {
      const raw = localStorage.getItem('huly_settings');
      const settings = raw ? JSON.parse(raw) : {};
      return settings?.company?.name || 'Hurly';
    } catch (e) {
      return 'Hurly';
    }
  }

  csv(value) {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  async updateSummary() {
    const kpiTotalHours = document.getElementById('kpiTotalHours');
    const kpiOvertime = document.getElementById('kpiOvertime');
    const kpiEstimate = document.getElementById('kpiEstimate');

    const runs = this.getRunsForSelectedPeriod();

    let totalHours = 0;
    let overtime = 0;
    let estimate = 0;

    runs.forEach((run) => {
      const runHours = parseFloat(run.total_hours);
      if (Number.isFinite(runHours)) {
        totalHours += runHours;
      } else if (Array.isArray(run.entries)) {
        totalHours += run.entries.reduce((sum, e) => sum + (parseFloat(e.days) || 0), 0);
      }

      if (Array.isArray(run.entries)) {
        overtime += run.entries.reduce((sum, e) => sum + (parseFloat(e.overtime_hours) || 0), 0);
      }

      estimate += parseFloat(run.total) || 0;
    });

    const draftTotal = runs
      .filter((run) => String(run.status || '').toLowerCase() === 'draft')
      .reduce((sum, run) => sum + (parseFloat(run.total) || 0), 0);

    if (kpiTotalHours) kpiTotalHours.textContent = totalHours.toLocaleString('en-US');
    if (kpiOvertime) kpiOvertime.textContent = overtime.toLocaleString('en-US');
    if (kpiEstimate) kpiEstimate.textContent = this.formatCurrency(draftTotal);
  }

  getRunsForSelectedPeriod() {
    const selector = document.getElementById('payPeriodSelector');
    const label = selector ? selector.options[selector.selectedIndex]?.text : '';
    if (!label) return this.runs || [];
    const normalized = label.replace(/\s+/g, ' ').trim();
    const matches = (this.runs || []).filter((run) => {
      const runLabel = String(run.pay_period || '').replace(/\s+/g, ' ').trim();
      return runLabel && runLabel === normalized;
    });
    return matches.length ? matches : (this.runs || []);
  }

  formatCurrency(value) {
    return new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD' }).format(value || 0);
  }

  formatDate(dateValue) {
    if (!dateValue) return '-';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US');
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.db) {
      window.payrollApp = new Payroll();
    } else {
      console.error('window.db not found');
    }
  });
} else {
  if (window.db) {
    window.payrollApp = new Payroll();
  } else {
    console.error('window.db not found');
  }
}






