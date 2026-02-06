class Settings {
  constructor() {
    this.db = window.db;
    this.init();
  }
  
  init() {
    this.setupTabSwitching();
    this.loadSites();
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
    const tbody = document.querySelector('.table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const self = this;
    sites.forEach(site => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${site.name || 'N/A'}</td>
        <td>${site.location || 'N/A'}</td>
        <td><span class="badge badge-${site.status === 'Active' ? 'success' : 'warning'}">${site.status}</span></td>
        <td>${site.workers_count || 0}</td>
        <td>
          <button class="btn btn-secondary btn-sm edit-site-btn" data-site-id="${site.id}">Edit</button>
          <button class="btn btn-secondary btn-sm delete-site-btn" data-site-id="${site.id}" style="background:var(--danger)">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Add event listeners to new buttons
    document.querySelectorAll('.edit-site-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const siteId = e.target.getAttribute('data-site-id');
        alert('Edit feature coming soon for site: ' + siteId);
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
    const buttons = document.querySelectorAll('button');
    let addBtn = null;
    
    buttons.forEach(btn => {
      if (btn.textContent.includes('Add New Site')) {
        addBtn = btn;
      }
    });

    if (addBtn) {
      addBtn.addEventListener('click', () => this.showAddSiteModal());
    }
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
          <button class="modal-save" style="flex:1;padding:10px;background:#4FB8FF;color:white;border:none;border-radius:4px;cursor:pointer">Save Site</button>
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
        alert('Site added successfully!');
      } catch (error) {
        alert('Error adding site: ' + error.message);
      }
    });
  }

  setupTabSwitching() {
    const tabs = document.querySelectorAll('.settings-tab');
    const contents = document.querySelectorAll('.settings-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.style.display = 'none');
        
        tab.classList.add('active');
        const tabName = tab.getAttribute('data-tab');
        const tabContent = document.getElementById(tabName + 'Tab');
        if (tabContent) {
          tabContent.style.display = 'block';
        }
      });
    });
  }
}
console.log('🟢 settings.js loaded!');