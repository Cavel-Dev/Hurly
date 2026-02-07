console.log('[DEBUG] reports.js loaded');
window.__reportsLoaded = true;

class Reports {
  constructor() {
    this.db = window.db || null;
    this.runs = [];
    this.filteredRuns = [];
    this.init();
    window.__reportsInstance = this;
  }

  init() {
    this.bindEvents();
    this.loadRuns();
    this.setDefaultDates();
    this.startAutoRefresh();
  }

  bindEvents() {
    const applyBtn = document.getElementById('applyReportFilter');
    const clearBtn = document.getElementById('clearReportFilter');
    const downloadBtn = document.getElementById('downloadPayrollBtn');

    if (applyBtn) {
      applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.applyFilter();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearFilter();
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.downloadPayrollPdf();
      });
      downloadBtn.onclick = (e) => {
        e.preventDefault();
        this.downloadPayrollPdf();
      };
    }
  }

  async loadRuns() {
    let runs = [];
    if (this.db && typeof this.db.getPayroll === 'function') {
      runs = await this.db.getPayroll();
    }
    const stored = this.readPayrollFromStorage();
    if (!runs || runs.length === 0) {
      runs = stored;
    } else if (stored.length) {
      const map = new Map();
      runs.forEach((r) => map.set(String(r.id), r));
      stored.forEach((r) => {
        if (!map.has(String(r.id))) map.set(String(r.id), r);
      });
      runs = Array.from(map.values());
    }
    this.runs = runs || [];
    if (!this._datesInitialized) {
      this.setDefaultDatesFromRuns();
      this._datesInitialized = true;
    }
    this.filteredRuns = [...this.runs];
    this.renderRuns();
    this.updateStats();
  }

  startAutoRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(() => {
      this.refreshRuns();
    }, 1500);
  }

  async refreshRuns() {
    if (!this.db || typeof this.db.getPayroll !== 'function') return;
    const latest = await this.db.getPayroll();
    const latestRuns = latest || [];
    if (latestRuns.length === this.runs.length) return;
    this.runs = latestRuns;
    this.applyFilter();
  }

  readPayrollFromStorage() {
    const candidates = ['huly_payroll', 'payroll'];
    for (const key of candidates) {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (err) {
        console.warn('Failed to read payroll data from', key, err);
      }
    }
    // Fallback: any key containing "payroll"
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.toLowerCase().includes('payroll')) continue;
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (err) {
      console.warn('Failed to scan payroll keys', err);
    }
    return [];
  }

  setDefaultDates() {
    const start = document.getElementById('reportStartDate');
    const end = document.getElementById('reportEndDate');
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    if (start) start.valueAsDate = first;
    if (end) end.valueAsDate = last;
  }

  setDefaultDatesFromRuns() {
    if (!this.runs.length) {
      this.setDefaultDates();
      return;
    }
    const dates = this.runs
      .map((r) => (r.created_at ? new Date(r.created_at) : null))
      .filter((d) => d && !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);
    if (!dates.length) {
      this.setDefaultDates();
      return;
    }
    const start = document.getElementById('reportStartDate');
    const end = document.getElementById('reportEndDate');
    if (start) start.valueAsDate = dates[0];
    if (end) end.valueAsDate = dates[dates.length - 1];
  }

  applyFilter() {
    const startInput = document.getElementById('reportStartDate');
    const endInput = document.getElementById('reportEndDate');
    const start = startInput?.value ? new Date(startInput.value) : null;
    const end = endInput?.value ? new Date(endInput.value) : null;

    this.filteredRuns = this.runs.filter((run) => {
      if (!run.created_at) return false;
      const created = new Date(run.created_at);
      if (Number.isNaN(created.getTime())) return false;
      if (start && created < start) return false;
      if (end) {
        const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
        if (created > endDay) return false;
      }
      return true;
    });

    this.renderRuns();
    this.updateStats();
  }

  clearFilter() {
    this.setDefaultDates();
    this.filteredRuns = [...this.runs];
    this.renderRuns();
    this.updateStats();
  }

  renderRuns() {
    const tbody = document.getElementById('reportsPayrollBody');
    if (!tbody) return;

    const activeRuns = this.filteredRuns.length ? this.filteredRuns : this.runs;

    if (!activeRuns.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:16px;text-align:center;color:#666;">No payroll runs found</td></tr>';
      return;
    }

    const rows = activeRuns
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .map((run) => `
        <tr>
          <td style="padding:10px 8px;">${this.escapeHtml(run.pay_period || 'N/A')}</td>
          <td style="padding:10px 8px;">${run.employees_count ?? 0}</td>
          <td style="padding:10px 8px;">${this.formatCurrency(run.total || 0)}</td>
          <td style="padding:10px 8px;">${this.escapeHtml(run.status || 'Pending')}</td>
          <td style="padding:10px 8px;">${this.formatDate(run.created_at)}</td>
        </tr>
      `);

    tbody.innerHTML = rows.join('');
  }

  updateStats() {
    const runsCount = document.getElementById('reportRunsCount');
    const totalPaid = document.getElementById('reportTotalPaid');
    const totalPending = document.getElementById('reportTotalPending');

    const activeRuns = this.filteredRuns.length ? this.filteredRuns : this.runs;

    const paid = activeRuns
      .filter((r) => String(r.status || '').toLowerCase() === 'paid')
      .reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
    const pending = activeRuns
      .filter((r) => String(r.status || '').toLowerCase() !== 'paid')
      .reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);

    if (runsCount) runsCount.textContent = String(activeRuns.length);
    if (totalPaid) totalPaid.textContent = this.formatCurrency(paid);
    if (totalPending) totalPending.textContent = this.formatCurrency(pending);
  }

  downloadPayrollPdf() {
    if (typeof html2pdf === 'undefined') {
      this.printReportPdf();
      return;
    }

    const reportEl = this.buildReportElement();
    const stamp = new Date().toISOString().split('T')[0];

    const options = {
      margin: [10, 10, 12, 10],
      filename: `payroll-report-${stamp}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    document.body.appendChild(reportEl);
    html2pdf().set(options).from(reportEl).save().then(() => {
      reportEl.remove();
    });
  }

  printReportPdf() {
    const reportEl = this.buildReportElement();
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
      alert('Unable to open print preview.');
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>Payroll Report</title></head><body>${reportEl.outerHTML}</body></html>`);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      iframe.remove();
    }, 500);
  }

  buildReportElement() {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:24px;font-family:Arial, sans-serif;color:#111;background:#fff;position:relative;';

    const periodText = this.getFilterLabel();
    const totals = this.getTotals();
    const company = this.getCompanyName();

    const wm = document.createElement('div');
    wm.textContent = `${company} CONFIDENTIAL`;
    wm.style.cssText = 'position:absolute;top:35%;left:-10%;width:120%;text-align:center;font-size:64px;font-weight:700;color:#000;opacity:0.08;transform:rotate(-25deg);pointer-events:none;';
    wrapper.appendChild(wm);

    wrapper.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px;">
        <div style="display:flex;gap:12px;align-items:center;">
          <img src="Assets/image.png" alt="Logo" style="height:48px;width:auto;object-fit:contain;">
          <div>
            <div style="font-size:20px;font-weight:700;">Payroll Report</div>
            <div style="font-size:12px;color:#444;">${this.escapeHtml(periodText)}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#444;">Generated</div>
          <div style="font-weight:600;">${new Date().toLocaleDateString('en-US')}</div>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="flex:1;border:1px solid #111;padding:10px;border-radius:8px;">
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">Runs</div>
          <div style="font-size:18px;font-weight:700;">${this.filteredRuns.length}</div>
        </div>
        <div style="flex:1;border:1px solid #111;padding:10px;border-radius:8px;">
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">Total Paid</div>
          <div style="font-size:18px;font-weight:700;">${this.formatCurrency(totals.paid)}</div>
        </div>
        <div style="flex:1;border:1px solid #111;padding:10px;border-radius:8px;">
          <div style="font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.4px;">Total Pending</div>
          <div style="font-size:18px;font-weight:700;">${this.formatCurrency(totals.pending)}</div>
        </div>
      </div>
    `;

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    table.innerHTML = `
      <thead>
        <tr style="background:#111;color:#fff;">
          <th style="padding:8px;text-align:left;">Run Date</th>
          <th style="padding:8px;text-align:left;">Pay Period</th>
          <th style="padding:8px;text-align:left;">Employee</th>
          <th style="padding:8px;text-align:left;">Task</th>
          <th style="padding:8px;text-align:left;">Shift</th>
          <th style="padding:8px;text-align:left;">Days</th>
          <th style="padding:8px;text-align:left;">Rate (JMD)</th>
          <th style="padding:8px;text-align:left;">Total (JMD)</th>
          <th style="padding:8px;text-align:left;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${this.renderPdfRows()}
      </tbody>
    `;

    wrapper.appendChild(table);
    return wrapper;
  }

  renderPdfRows() {
    const rows = [];
    const runs = this.filteredRuns
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    runs.forEach((run) => {
      const entries = Array.isArray(run.entries) ? run.entries : [];
      if (!entries.length) {
        rows.push(`
          <tr>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.formatDate(run.created_at)}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(run.pay_period || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;" colspan="7">No entries</td>
          </tr>
        `);
        return;
      }

      entries.forEach((entry) => {
        rows.push(`
          <tr>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.formatDate(run.created_at)}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(run.pay_period || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.employee_name || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.task_label || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.shift || '')}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${entry.days ?? entry.qty ?? 0}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.formatCurrency(entry.rate || 0)}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.formatCurrency(entry.total || 0)}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;">${this.escapeHtml(entry.status || 'Pending')}</td>
          </tr>
        `);
      });
    });

    return rows.join('');
  }

  getTotals() {
    const paid = this.filteredRuns
      .filter((r) => String(r.status || '').toLowerCase() === 'paid')
      .reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
    const pending = this.filteredRuns
      .filter((r) => String(r.status || '').toLowerCase() !== 'paid')
      .reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
    return { paid, pending };
  }

  getFilterLabel() {
    const startInput = document.getElementById('reportStartDate');
    const endInput = document.getElementById('reportEndDate');
    const start = startInput?.value ? new Date(startInput.value) : null;
    const end = endInput?.value ? new Date(endInput.value) : null;
    if (!start || !end) return 'All dates';
    return `${start.toLocaleDateString('en-US')} - ${end.toLocaleDateString('en-US')}`;
  }
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

  getCompanyName() {
    try {
      const raw = localStorage.getItem('huly_settings');
      const settings = raw ? JSON.parse(raw) : {};
      return settings?.company?.name || 'Hurly';
    } catch (e) {
      return 'Hurly';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.db) new Reports();
  });
} else {
  if (window.db) new Reports();
}
