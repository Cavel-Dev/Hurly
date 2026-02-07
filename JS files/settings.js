class Settings {
  constructor() {
    this.db = window.db;
    this.settingsKey = 'huly_settings';
    this.init();
  }

  init() {
    this.loadCompanySettings();
    this.loadPayrollSettings();
    this.bindSettingsActions();
    this.loadSites();
  }

  bindSettingsActions() {
    const saveCompanyBtn = document.getElementById('saveCompanyBtn');
    const savePayrollBtn = document.getElementById('savePayrollSettingsBtn');
    const backupBtn = document.getElementById('backupDataBtn');
    const restoreInput = document.getElementById('restoreDataInput');
    if (saveCompanyBtn) saveCompanyBtn.addEventListener('click', () => this.saveCompanySettings());
    if (savePayrollBtn) savePayrollBtn.addEventListener('click', () => this.savePayrollSettings());
    if (backupBtn) backupBtn.addEventListener('click', () => this.downloadBackup());
    if (restoreInput) restoreInput.addEventListener('change', (e) => this.restoreBackup(e));
    this.setupAddSiteButton();
  }

  async loadSites() {
    try {
      const sites = await this.db.getSites();
      this.populateSitesTable(sites);
    } catch (error) {
      console.error('Error loading sites:', error);
    }
  }

  populateSitesTable(sites) {
    const tbody = document.getElementById('sitesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const self = this;
    if (!sites || sites.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:14px;text-align:center;color:#666;">No sites found</td></tr>';
      return;
    }

    sites.forEach(site => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${site.name || 'N/A'}</td>
        <td>${site.location || 'N/A'}</td>
        <td><span class="badge badge-${site.status === 'Active' ? 'success' : 'warning'}">${site.status}</span></td>
        <td>${site.workers_count || 0}</td>
        <td>
          <button class="btn btn-secondary btn-sm edit-site-btn" data-site-id="${site.id}">Edit</button>
          <button class="btn btn-secondary btn-sm delete-site-btn" data-site-id="${site.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    document.querySelectorAll('.edit-site-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const siteId = e.target.getAttribute('data-site-id');
        const site = (await self.db.getSites()).find(s => String(s.id) === String(siteId));
        if (site) self.showEditSiteModal(site);
      });
    });

    document.querySelectorAll('.delete-site-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const siteId = e.target.getAttribute('data-site-id');
        if (confirm('Are you sure you want to delete this site?')) {
          await self.db.deleteSite(siteId);
          await self.loadSites();
        }
      });
    });
  }

  setupAddSiteButton() {
    const addBtn = document.getElementById('addSiteBtn');
    if (addBtn) addBtn.addEventListener('click', () => this.showAddSiteModal());
  }

  showAddSiteModal() {
    const self = this;
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000';
    modal.innerHTML = `
      <div style="background:white;padding:30px;border-radius:8px;width:90%;max-width:500px;box-shadow:0 4px 12px rgba(0,0,0,0.15)">
        <h2>Add New Site</h2>
        <div style="margin:20px 0">
          <label style="display:block;margin-bottom:5px">Site Name:</label>
          <input type="text" id="siteName" placeholder="Enter site name" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box">
        </div>
        <div style="margin:20px 0">
          <label style="display:block;margin-bottom:5px">Location:</label>
          <input type="text" id="siteLocation" placeholder="Enter location" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box">
        </div>
        <div style="margin:20px 0">
          <label style="display:block;margin-bottom:5px">Status:</label>
          <select id="siteStatus" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box">
            <option value="Active">Active</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="modal-cancel" style="flex:1;padding:10px;background:#ccc;border:none;border-radius:4px;cursor:pointer">Cancel</button>
          <button class="modal-save" style="flex:1;padding:10px;background:#000;color:#fff;border:none;border-radius:4px;cursor:pointer">Save Site</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector('.modal-cancel');
    const saveBtn = modal.querySelector('.modal-save');

    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });

    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('siteName').value;
      const location = document.getElementById('siteLocation').value;
      const status = document.getElementById('siteStatus').value;

      if (!name || !location) {
        alert('Please fill in all fields');
        return;
      }

      try {
        await self.db.createSite({ name, location, status, workers_count: 0 });
        modal.remove();
        await self.loadSites();
      } catch (error) {
        alert('Error adding site: ' + error.message);
      }
    });
  }

  showEditSiteModal(site) {
    const self = this;
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000';
    modal.innerHTML = `
      <div style="background:white;padding:30px;border-radius:8px;width:90%;max-width:500px;box-shadow:0 4px 12px rgba(0,0,0,0.15)">
        <h2>Edit Site</h2>
        <div style="margin:20px 0">
          <label style="display:block;margin-bottom:5px">Site Name:</label>
          <input type="text" id="siteName" value="${this.escapeHtml(site.name || '')}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box">
        </div>
        <div style="margin:20px 0">
          <label style="display:block;margin-bottom:5px">Location:</label>
          <input type="text" id="siteLocation" value="${this.escapeHtml(site.location || '')}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box">
        </div>
        <div style="margin:20px 0">
          <label style="display:block;margin-bottom:5px">Status:</label>
          <select id="siteStatus" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box">
            <option value="Active" ${site.status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="On Hold" ${site.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
            <option value="Completed" ${site.status === 'Completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="modal-cancel" style="flex:1;padding:10px;background:#ccc;border:none;border-radius:4px;cursor:pointer">Cancel</button>
          <button class="modal-save" style="flex:1;padding:10px;background:#000;color:#fff;border:none;border-radius:4px;cursor:pointer">Save Changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector('.modal-cancel');
    const saveBtn = modal.querySelector('.modal-save');

    cancelBtn.addEventListener('click', () => modal.remove());
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('siteName').value;
      const location = document.getElementById('siteLocation').value;
      const status = document.getElementById('siteStatus').value;

      if (!name || !location) {
        alert('Please fill in all fields');
        return;
      }

      try {
        await self.db.updateSite(site.id, { name, location, status });
        modal.remove();
        await self.loadSites();
      } catch (error) {
        alert('Error updating site: ' + error.message);
      }
    });
  }

  loadCompanySettings() {
    try {
      const raw = localStorage.getItem(this.settingsKey);
      const data = raw ? JSON.parse(raw) : {};
      const company = data.company || {};
      const name = document.getElementById('companyNameInput');
      const email = document.getElementById('companyEmailInput');
      const phone = document.getElementById('companyPhoneInput');
      const address = document.getElementById('companyAddressInput');
      if (name) name.value = company.name || '';
      if (email) email.value = company.email || '';
      if (phone) phone.value = company.phone || '';
      if (address) address.value = company.address || '';
    } catch (e) {
      console.warn('Failed to load company settings', e);
    }
  }

  saveCompanySettings() {
    const name = document.getElementById('companyNameInput')?.value.trim() || '';
    const email = document.getElementById('companyEmailInput')?.value.trim() || '';
    const phone = document.getElementById('companyPhoneInput')?.value.trim() || '';
    const address = document.getElementById('companyAddressInput')?.value.trim() || '';

    const data = this.readSettings();
    data.company = { name, email, phone, address };
    localStorage.setItem(this.settingsKey, JSON.stringify(data));
    alert('Company settings saved.');
  }

  loadPayrollSettings() {
    const data = this.readSettings();
    const payroll = data.payroll || {};
    const rate = document.getElementById('defaultDailyRateInput');
    const period = document.getElementById('payPeriodTypeInput');
    if (rate) rate.value = payroll.defaultDailyRate ?? 5000;
    if (period) period.value = payroll.payPeriodType || 'semi-monthly';
  }

  savePayrollSettings() {
    const rate = parseFloat(document.getElementById('defaultDailyRateInput')?.value || '0') || 0;
    const period = document.getElementById('payPeriodTypeInput')?.value || 'semi-monthly';
    const data = this.readSettings();
    data.payroll = { defaultDailyRate: rate, payPeriodType: period };
    localStorage.setItem(this.settingsKey, JSON.stringify(data));
    alert('Payroll settings saved.');
  }

  readSettings() {
    try {
      const raw = localStorage.getItem(this.settingsKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  downloadBackup() {
    const payload = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith('huly_')) continue;
      if (key === 'huly_session') continue;
      payload[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `hurly-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  restoreBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'));
        Object.keys(data).forEach((key) => {
          if (!key.startsWith('huly_')) return;
          if (key === 'huly_session') return;
          localStorage.setItem(key, data[key]);
        });
        alert('Backup restored. Please refresh the page.');
      } catch (e) {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
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

console.log('[DEBUG] settings.js loaded');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.db) new Settings();
  });
} else {
  if (window.db) new Settings();
}
