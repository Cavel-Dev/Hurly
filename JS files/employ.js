console.log('[DEBUG] employ.js loaded');

function notify(message, type = 'info') {
  if (window.app && typeof window.app.showToast === 'function') {
    window.app.showToast(message, type);
  } else {
    alert(message);
  }
}

const SB_URL = window.SUPABASE_URL || "https://ncqfvcymhvjcchrwelfg.supabase.co";
const SB_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";

let supabaseClient = null;

function loadSupabase() {
  return new Promise((resolve) => {
    if (window.__supabaseClient) {
      supabaseClient = window.__supabaseClient;
      resolve(supabaseClient);
      return;
    }
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
      window.__supabaseClient = supabaseClient;
      resolve(supabaseClient);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
    script.onload = () => {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
        window.__supabaseClient = supabaseClient;
        resolve(supabaseClient);
      } else {
        resolve(null);
      }
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

class Employees {
  constructor(options = {}) {
    this.supabase = null;
    this.db = window.db || null;
    this.employeeCache = [];
    this.realtimeChannel = null;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadEmployees();
    this.initRealtime();
    this.startDateTime();
  }

  startDateTime() {
    const dateEl = document.getElementById('currentDate');
    const timeEl = document.getElementById('currentTime');
    if (!dateEl && !timeEl) return;

    const update = () => {
      const now = new Date();
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
      if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
    };

    update();
    setInterval(update, 1000);
  }

  normalizeEmployee(row) {
    return {
      id: row.id,
      name: row.name ?? row.Name ?? row.employee_name ?? '',
      position: row.position ?? row.Position ?? '',
      status: row.status ?? row.Status ?? 'Active',
      document_status: row.document_status ?? row.Documents ?? row.documents ?? 'Pending',
      email: row.email ?? row.Email ?? '',
      phone: row.phone ?? row.Phone ?? ''
    };
  }

  async loadEmployees() {
    try {
      let employees = [];
      if (this.db && typeof this.db.getEmployees === 'function') {
        const data = await this.db.getEmployees();
        employees = (data || []).map((row) => this.normalizeEmployee(row));
      } else {
        console.error('Local database not available for employees');
      }

      this.employeeCache = employees;
      this.populateEmployeesTable(employees);
    } catch (error) {
      console.error('Error loading employees:', error);
      this.populateEmployeesTable([]);
    }
  }

  initRealtime() {
    if (!this.db || typeof this.db.getSupabase !== 'function' || !this.db.supabaseHealthy) return;
    this.db.getSupabase().then((sb) => {
      if (!sb || this.realtimeChannel) return;
      let timer = null;
      this.realtimeChannel = sb
        .channel('rt-employees')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => this.loadEmployees(), 300);
        })
        .subscribe();
      window.addEventListener('beforeunload', () => {
        if (this.realtimeChannel) sb.removeChannel(this.realtimeChannel);
      });
    });
  }

  populateEmployeesTable(employees) {
    const tbody = document.querySelector('.employees-table tbody');
    if (!tbody) {
      console.error('Table body not found');
      return;
    }

    tbody.innerHTML = '';

    if (!employees || employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No employees found. Click "Add Employee" to get started.</td></tr>';
      return;
    }

    employees.forEach((emp) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${this.escapeHtml(emp.name) || 'N/A'}</td>
        <td>${this.escapeHtml(emp.position) || 'N/A'}</td>
        <td><span class="badge badge-${emp.status === 'Active' ? 'success' : 'warning'}">${this.escapeHtml(emp.status || 'Active')}</span></td>
        <td>${this.escapeHtml(emp.document_status || 'Pending')}</td>
        <td>
          <button class="btn btn-secondary btn-sm edit-emp-btn" data-emp-id="${emp.id}">Edit</button>
          <button class="btn btn-danger btn-sm delete-emp-btn" data-emp-id="${emp.id}" style="margin-left: 8px;">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  setupEventListeners() {
    const addEmployeeBtn = document.getElementById('addEmployeeBtn');
    if (addEmployeeBtn) {
      addEmployeeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showAddEmployeeModal();
      });
    } else {
      console.warn('Add Employee button not found');
    }

    const searchInput = document.getElementById('employeeSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        if (!term) {
          this.populateEmployeesTable(this.employeeCache);
          return;
        }
        const filtered = this.employeeCache.filter((emp) => {
          return (
            (emp.name && emp.name.toLowerCase().includes(term)) ||
            (emp.position && emp.position.toLowerCase().includes(term)) ||
            (emp.email && emp.email.toLowerCase().includes(term))
          );
        });
        this.populateEmployeesTable(filtered);
      });
    }

    document.body.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-emp-btn');
      if (editBtn) {
        const empId = editBtn.getAttribute('data-emp-id');
        const emp = this.employeeCache.find((x) => String(x.id) === String(empId));
        if (emp) this.showEditEmployeeModal(emp);
        return;
      }

      const deleteBtn = e.target.closest('.delete-emp-btn');
      if (deleteBtn) {
        const empId = deleteBtn.getAttribute('data-emp-id');
        const emp = this.employeeCache.find((x) => String(x.id) === String(empId));
        const empName = emp?.name || 'this employee';
        if (confirm(`Are you sure you want to delete ${empName}?`)) {
          this.deleteEmployee(empId);
        }
      }
    });
  }

  showAddEmployeeModal() {
    this.openEmployeeModal({
      title: 'Add New Employee',
      actionText: 'Save Employee',
      employee: {
        name: '',
        position: '',
        email: '',
        phone: '',
        status: 'Active',
        document_status: 'Pending'
      },
      onSave: async (data) => {
        await this.createEmployee(data);
        await this.loadEmployees();
      }
    });
  }

  showEditEmployeeModal(employee) {
    this.openEmployeeModal({
      title: `Edit Employee - ${employee.name}`,
      actionText: 'Update Employee',
      employee,
      onSave: async (data) => {
        await this.updateEmployee(employee.id, data);
        await this.loadEmployees();
      }
    });
  }

  openEmployeeModal({ title, actionText, employee, onSave }) {
    const existing = document.getElementById('employeeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'employeeModal';
    modal.className = 'modal-overlay';

    modal.innerHTML = `
      <div class="modal-card" style="max-width:560px;">
        <div class="modal-header">
          <h2 class="modal-title">${this.escapeHtml(title)}</h2>
          <button class="icon-btn" id="employeeCloseBtn" aria-label="Close">x</button>
        </div>
        <div class="modal-body">
          <div class="form-stack">
            <label>Full Name *</label>
            <input type="text" id="empName" value="${this.escapeHtml(employee.name || '')}">
          </div>
          <div class="form-stack">
            <label>Position *</label>
            <input type="text" id="empPosition" value="${this.escapeHtml(employee.position || '')}">
          </div>
          <div class="form-stack">
            <label>Email *</label>
            <input type="email" id="empEmail" value="${this.escapeHtml(employee.email || '')}">
          </div>
          <div class="form-stack">
            <label>Phone</label>
            <input type="tel" id="empPhone" value="${this.escapeHtml(employee.phone || '')}">
          </div>
          <div class="form-stack">
            <label>Status</label>
            <select id="empStatus">
              <option value="Active" ${employee.status === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Inactive" ${employee.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
          <div class="form-stack">
            <label>Document Status</label>
            <select id="empDocStatus">
              <option value="Pending" ${employee.document_status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Complete" ${employee.document_status === 'Complete' ? 'selected' : ''}>Complete</option>
              <option value="In Progress" ${employee.document_status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button id="modalCancel" class="btn btn-outline">Cancel</button>
          <button id="modalSave" class="btn btn-primary">${this.escapeHtml(actionText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('modalCancel').addEventListener('click', close);
    const closeBtn = document.getElementById('employeeCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    document.getElementById('modalSave').addEventListener('click', async () => {
      const name = document.getElementById('empName').value.trim();
      const position = document.getElementById('empPosition').value.trim();
      const email = document.getElementById('empEmail').value.trim();
      const phone = document.getElementById('empPhone').value.trim();
      const status = document.getElementById('empStatus').value;
      const documentStatus = document.getElementById('empDocStatus').value;

      if (!name || !position || !email) {
        notify('Please fill in required fields: Name, Position, Email', 'warn');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        notify('Please enter a valid email address', 'warn');
        return;
      }

      try {
        await onSave({
          name,
          position,
          email,
          phone,
          status,
          document_status: documentStatus
        });
      } catch (error) {
        console.error('Error saving employee:', error);
        notify('Failed to save employee. Please try again.', 'error');
        return;
      }

      close();
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('Employee saved', 'success');
      }
    });
  }

  async createEmployee(data) {
    if (this.db && typeof this.db.createEmployee === 'function') {
      await this.db.createEmployee({
        name: data.name,
        position: data.position,
        status: data.status,
        document_status: data.document_status,
        email: data.email,
        phone: data.phone,
        site_id: localStorage.getItem('huly_active_site') || ''
      });
    }
  }

  async updateEmployee(id, data) {
    if (this.db && typeof this.db.updateEmployee === 'function') {
      await this.db.updateEmployee(id, {
        name: data.name,
        position: data.position,
        status: data.status,
        document_status: data.document_status,
        email: data.email,
        phone: data.phone
      });
    }
  }

  async deleteEmployee(id) {
    try {
      if (this.db && typeof this.db.deleteEmployee === 'function') {
        await this.db.deleteEmployee(id);
      } else {
        throw new Error('Local database not available');
      }
      await this.loadEmployees();
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('Employee deleted', 'success');
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      notify('Failed to delete employee. Please try again.', 'error');
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.employeesApp = new Employees();
  });
} else {
  window.employeesApp = new Employees();
}
