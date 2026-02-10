function notify(message, type = 'info') {
  if (window.app && typeof window.app.showToast === 'function') {
    window.app.showToast(message, type);
  } else {
    alert(message);
  }
}

class Settings {
  constructor() {
    this.db = window.db;
    this.settingsKey = 'huly_settings';
    this.realtimeChannel = null;
    this.init();
  }

  init() {
    this.loadCompanySettings();
    this.loadPayrollSettings();
    this.bindSettingsActions();
    this.loadSites();
    this.initRealtime();
    this.showMfaSetupNotice();
  }

  bindSettingsActions() {
    const saveCompanyBtn = document.getElementById('saveCompanyBtn');
    const savePayrollBtn = document.getElementById('savePayrollSettingsBtn');
    const backupBtn = document.getElementById('backupDataBtn');
    const restoreInput = document.getElementById('restoreDataInput');
    const resetBtn = document.getElementById('resetAllDataBtn');
    const enableMfaBtn = document.getElementById('enableMfaBtn');
    if (saveCompanyBtn) saveCompanyBtn.addEventListener('click', () => this.saveCompanySettings());
    if (savePayrollBtn) savePayrollBtn.addEventListener('click', () => this.savePayrollSettings());
    if (backupBtn) backupBtn.addEventListener('click', () => this.downloadBackup());
    if (restoreInput) restoreInput.addEventListener('change', (e) => this.restoreBackup(e));
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetAllData());
    if (enableMfaBtn) enableMfaBtn.addEventListener('click', () => this.enableMfa());
    this.setupAddSiteButton();
    this.bindActiveSiteSelector();
  }

  showMfaSetupNotice() {
    const pending = localStorage.getItem('huly_mfa_setup_pending');
    if (!pending) return;
    localStorage.removeItem('huly_mfa_setup_pending');
    if (window.AuthOverlay && typeof window.AuthOverlay.hide === 'function') {
      window.AuthOverlay.hide();
    }
    notify('Security setup required: enable MFA to continue using the app.', 'warn');
  }

  async loadSites() {
    try {
      const sites = await this.db.getSites();
      this.populateSitesTable(sites);
      await this.populateActiveSiteSelect(sites);
    } catch (error) {
      console.error('Error loading sites:', error);
    }
  }

  initRealtime() {
    if (!this.db || typeof this.db.getSupabase !== 'function' || !this.db.supabaseHealthy) return;
    this.db.getSupabase().then((sb) => {
      if (!sb || this.realtimeChannel) return;
      let timer = null;
      this.realtimeChannel = sb
        .channel('rt-sites')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => this.loadSites(), 300);
        })
        .subscribe();
      window.addEventListener('beforeunload', () => {
        if (this.realtimeChannel) sb.removeChannel(this.realtimeChannel);
      });
    });
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

  bindActiveSiteSelector() {
    const select = document.getElementById('activeSiteSelect');
    const clearBtn = document.getElementById('clearActiveSiteBtn');
    if (select) {
      select.addEventListener('change', (e) => {
        const value = e.target.value || '';
        if (value) {
          localStorage.setItem('huly_active_site', value);
          notify('Active site updated.', 'success');
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('huly_active_site');
        if (select) select.value = '';
        notify('Active site cleared.', 'success');
      });
    }
  }

  async populateActiveSiteSelect(sites) {
    const select = document.getElementById('activeSiteSelect');
    if (!select) return;
    const current = localStorage.getItem('huly_active_site') || '';
    const rows = Array.isArray(sites) ? sites : [];
    if (!current && rows.length) {
      const firstId = String(rows[0].id || '');
      if (firstId) {
        localStorage.setItem('huly_active_site', firstId);
        const backfillDone = localStorage.getItem('huly_site_backfill_done');
        if (!backfillDone && this.db && typeof this.db.backfillMissingSiteId === 'function') {
          try {
            await this.db.backfillMissingSiteId(firstId);
            localStorage.setItem('huly_site_backfill_done', 'true');
          } catch (e) {
            console.warn('Site backfill failed', e);
          }
        }
      }
    }
    const currentEffective = localStorage.getItem('huly_active_site') || '';
    const hideAll = localStorage.getItem('huly_default_site_confirmed') === 'true';
    const baseOption = hideAll ? '' : `<option value="">All sites</option>`;
    select.innerHTML = baseOption + rows.map((site) => `
      <option value="${site.id}" ${String(site.id) === String(currentEffective) ? 'selected' : ''}>
        ${this.escapeHtml(site.name || 'Unnamed Site')}
      </option>
    `).join('');
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
        notify('Please fill in all fields', 'warn');
        return;
      }

      try {
        await self.db.createSite({ name, location, status, workers_count: 0 });
        modal.remove();
        await self.loadSites();
      } catch (error) {
        notify('Error adding site: ' + error.message, 'error');
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
        notify('Please fill in all fields', 'warn');
        return;
      }

      try {
        await self.db.updateSite(site.id, { name, location, status });
        modal.remove();
        await self.loadSites();
      } catch (error) {
        notify('Error updating site: ' + error.message, 'error');
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
    notify('Company settings saved.', 'success');
  }

  loadPayrollSettings() {
    const data = this.readSettings();
    const payroll = data.payroll || {};
    const rate = document.getElementById('defaultDailyRateInput');
    const period = document.getElementById('payPeriodTypeInput');
    const threshold = document.getElementById('overtimeThresholdInput');
    const multiplier = document.getElementById('overtimeMultiplierInput');
    if (rate) rate.value = payroll.defaultDailyRate ?? 5000;
    if (period) period.value = payroll.payPeriodType || 'semi-monthly';
    if (threshold) threshold.value = payroll.overtimeThreshold ?? 8;
    if (multiplier) multiplier.value = payroll.overtimeMultiplier ?? 1.5;
  }

  savePayrollSettings() {
    const rate = parseFloat(document.getElementById('defaultDailyRateInput')?.value || '0') || 0;
    const period = document.getElementById('payPeriodTypeInput')?.value || 'semi-monthly';
    const threshold = parseFloat(document.getElementById('overtimeThresholdInput')?.value || '0') || 0;
    const multiplier = parseFloat(document.getElementById('overtimeMultiplierInput')?.value || '0') || 0;
    const data = this.readSettings();
    data.payroll = {
      defaultDailyRate: rate,
      payPeriodType: period,
      overtimeThreshold: threshold,
      overtimeMultiplier: multiplier
    };
    localStorage.setItem(this.settingsKey, JSON.stringify(data));
    notify('Payroll settings saved.', 'success');
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
        notify('Backup restored. Please refresh the page.', 'success');
      } catch (e) {
        notify('Invalid backup file.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  async resetAllData() {
    const first = confirm('This will permanently delete ALL data (employees, attendance, payroll, sites, settings). Continue?');
    if (!first) return;
    const second = confirm('Are you absolutely sure? This cannot be undone.');
    if (!second) return;

    try {
      if (this.db && typeof this.db.getSupabase === 'function' && this.db.supabaseHealthy) {
        const sb = await this.db.getSupabase();
        if (sb) {
          const tables = ['attendance', 'payroll', 'employees', 'sites'];
          for (const table of tables) {
            await sb.from(table).delete().neq('id', '');
          }
        }
      }
    } catch (e) {
      console.warn('Supabase delete failed (continuing with local reset):', e);
    }

    try {
      const keep = ['huly_session'];
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('huly_') && !keep.includes(key)) {
          keys.push(key);
        }
      }
      keys.forEach((key) => localStorage.removeItem(key));
      notify('All data deleted. The app will reload.', 'success');
      window.location.reload();
    } catch (e) {
      notify('Reset failed: ' + e.message, 'error');
    }
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async enableMfa() {
    if (!this.db || typeof this.db.getSupabase !== 'function' || !this.db.supabaseHealthy) {
      notify('Supabase is not connected. Try again.', 'error');
      return;
    }

    const sb = await this.db.getSupabase();
    if (!sb) {
      notify('Supabase client not available.', 'error');
      return;
    }

    try {
      const { data: factorsData, error: factorsError } = await sb.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const totpFactors = factorsData?.totp || [];
      const verifiedTotp = totpFactors.filter((f) => f.status === 'verified');
      if (verifiedTotp.length) {
        notify('MFA is already enabled for this account.', 'success');
        return;
      }

      const existing = totpFactors.find((f) => f.status !== 'verified');
      if (existing?.id) {
        this.openMfaModal({ factorId: existing.id, qr: null, secret: '', supabase: sb });
        return;
      }

      const { data: enrollData, error: enrollError } = await sb.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Hurly Authenticator'
      });
      if (enrollError) throw enrollError;

      const factorId = enrollData?.id;
      const qr = enrollData?.totp?.qr_code || enrollData?.totp?.qrCode || null;
      const secret = enrollData?.totp?.secret || '';
      if (!factorId) throw new Error('MFA enrollment failed.');

      this.openMfaModal({ factorId, qr, secret, supabase: sb });
    } catch (e) {
      notify('Unable to start MFA: ' + e.message, 'error');
    }
  }

  openMfaModal({ factorId, qr, secret, supabase }) {
    const modal = document.getElementById('mfaModal');
    const qrWrap = document.getElementById('mfaQrWrap');
    const qrImg = document.getElementById('mfaQr');
    const secretEl = document.getElementById('mfaSecret');
    const codeInput = document.getElementById('mfaCode');
    const verifyBtn = document.getElementById('mfaVerifyBtn');
    const reenrollBtn = document.getElementById('mfaReenrollBtn');
    const closeBtn = document.getElementById('mfaCloseBtn');
    const cancelBtn = document.getElementById('mfaCancelBtn');

    if (!modal || !verifyBtn || !codeInput) return;

    if (qrWrap && qrImg) {
      if (qr) {
        qrWrap.style.display = 'grid';
        qrImg.src = qr;
        if (secretEl) secretEl.textContent = secret || '';
      } else {
        qrWrap.style.display = 'none';
      }
    }

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');

    const closeModal = () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      if (codeInput) codeInput.value = '';
    };

    const onVerify = async () => {
      const code = String(codeInput.value || '').replace(/\s+/g, '');
      if (!code) {
        notify('Enter the 6-digit code.', 'warn');
        return;
      }
      verifyBtn.disabled = true;
      try {
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code
        });
        if (verifyError) {
          notify('Invalid code. Try again.', 'error');
          return;
        }
        notify('MFA enabled successfully.', 'success');
        closeModal();
      } catch (e) {
        notify('MFA verification failed: ' + e.message, 'error');
      } finally {
        verifyBtn.disabled = false;
      }
    };

    verifyBtn.onclick = onVerify;
    if (reenrollBtn) {
      reenrollBtn.onclick = async () => {
        try {
          const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
          if (factorsError) throw factorsError;
          const totpFactors = factorsData?.totp || [];
          const target = totpFactors.find((f) => f.friendly_name === 'Hurly Authenticator') || totpFactors[0];
          if (target?.id) {
            const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: target.id });
            if (unenrollError) throw unenrollError;
          }
          closeModal();
          this.enableMfa();
        } catch (e) {
          notify('Re-enroll failed: ' + e.message, 'error');
        }
      };
    }
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
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
