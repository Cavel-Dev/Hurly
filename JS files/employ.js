console.log('[DEBUG] employ.js loaded');

const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";

let supabaseClient = null;

function loadSupabase() {
  return new Promise((resolve) => {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      resolve(supabaseClient);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
    script.onload = () => {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadEmployees();
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

    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:90%;max-width:500px;box-shadow:0 8px 30px rgba(0,0,0,0.3);">
        <h2 style="margin-bottom:16px;">${this.escapeHtml(title)}</h2>
        <div style="margin:12px 0">
          <label style="display:block;margin-bottom:6px;">Full Name *</label>
          <input type="text" id="empName" value="${this.escapeHtml(employee.name || '')}" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">
        </div>
        <div style="margin:12px 0">
          <label style="display:block;margin-bottom:6px;">Position *</label>
          <input type="text" id="empPosition" value="${this.escapeHtml(employee.position || '')}" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">
        </div>
        <div style="margin:12px 0">
          <label style="display:block;margin-bottom:6px;">Email *</label>
          <input type="email" id="empEmail" value="${this.escapeHtml(employee.email || '')}" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">
        </div>
        <div style="margin:12px 0">
          <label style="display:block;margin-bottom:6px;">Phone</label>
          <input type="tel" id="empPhone" value="${this.escapeHtml(employee.phone || '')}" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">
        </div>
        <div style="margin:12px 0">
          <label style="display:block;margin-bottom:6px;">Status</label>
          <select id="empStatus" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">
            <option value="Active" ${employee.status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${employee.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
        <div style="margin:12px 0">
          <label style="display:block;margin-bottom:6px;">Document Status</label>
          <select id="empDocStatus" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;">
            <option value="Pending" ${employee.document_status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Complete" ${employee.document_status === 'Complete' ? 'selected' : ''}>Complete</option>
            <option value="In Progress" ${employee.document_status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;">
          <button id="modalCancel" style="flex:1;padding:10px;border:1px solid #999;background:#fff;border-radius:8px;">Cancel</button>
          <button id="modalSave" style="flex:1;padding:10px;border:0;background:#111;color:#fff;border-radius:8px;">${this.escapeHtml(actionText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('modalCancel').addEventListener('click', close);

    document.getElementById('modalSave').addEventListener('click', async () => {
      const name = document.getElementById('empName').value.trim();
      const position = document.getElementById('empPosition').value.trim();
      const email = document.getElementById('empEmail').value.trim();
      const phone = document.getElementById('empPhone').value.trim();
      const status = document.getElementById('empStatus').value;
      const documentStatus = document.getElementById('empDocStatus').value;

      if (!name || !position || !email) {
        alert('Please fill in required fields: Name, Position, Email');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
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
        alert('Failed to save employee. Please try again.');
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
        phone: data.phone
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
      alert('Failed to delete employee. Please try again.');
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
