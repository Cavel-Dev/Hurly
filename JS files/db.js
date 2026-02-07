// Local Database Service Module
function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem('huly_session') || 'null');
  } catch (e) {
    return null;
  }
}

function auditLog(action, entity, details = {}) {
  try {
    const raw = localStorage.getItem('huly_audit');
    const list = raw ? JSON.parse(raw) : [];
    const user = getSessionUser();
    list.push({
      id: Date.now().toString(36),
      ts: new Date().toISOString(),
      actor: user ? { id: user.id, email: user.email, role: user.role } : null,
      action,
      entity,
      details
    });
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const pruned = list.filter(item => new Date(item.ts).getTime() >= cutoff);
    localStorage.setItem('huly_audit', JSON.stringify(pruned));
  } catch (e) {
    console.warn('Audit log failed', e);
  }
}

window.audit = { log: auditLog };

class DatabaseService {
  constructor() {
    this.storagePrefix = 'huly_';
    this.initLocalStorage();
    console.log('Database service initialized with Local Storage');
  }

  initLocalStorage() {
    // Initialize default data if not exists
    if (!localStorage.getItem(this.storagePrefix + 'employees')) {
      localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify([]));
    }
    if (!localStorage.getItem(this.storagePrefix + 'attendance')) {
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify([]));
    }
    if (!localStorage.getItem(this.storagePrefix + 'payroll')) {
      localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify([]));
    }
  }

  // Helper function to generate unique IDs
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // ============ SITES ============
  async getSites() {
    try {
      const sites = localStorage.getItem(this.storagePrefix + 'sites');
      return sites ? JSON.parse(sites) : [];
    } catch (error) {
      console.error('Error fetching sites:', error);
      return [];
    }
  }

  async createSite(siteData) {
    try {
      const sites = JSON.parse(localStorage.getItem(this.storagePrefix + 'sites') || '[]');
      const newSite = { id: this.generateId(), ...siteData, created_at: new Date().toISOString() };
      sites.push(newSite);
      localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(sites));
      if (window.audit) window.audit.log('create', 'site', { id: newSite.id, name: newSite.name });
      return newSite;
    } catch (error) {
      console.error('Error creating site:', error);
      throw error;
    }
  }

  async updateSite(siteId, siteData) {
    try {
      const sites = JSON.parse(localStorage.getItem(this.storagePrefix + 'sites') || '[]');
      const index = sites.findIndex(s => s.id === siteId);
      if (index !== -1) {
        sites[index] = { ...sites[index], ...siteData };
        localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(sites));
        if (window.audit) window.audit.log('update', 'site', { id: siteId, changes: siteData });
        return sites[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating site:', error);
      throw error;
    }
  }

  async deleteSite(siteId) {
    try {
      const sites = JSON.parse(localStorage.getItem(this.storagePrefix + 'sites') || '[]');
      const filtered = sites.filter(s => s.id !== siteId);
      localStorage.setItem(this.storagePrefix + 'sites', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'site', { id: siteId });
      return true;
    } catch (error) {
      console.error('Error deleting site:', error);
      throw error;
    }
  }

  // ============ EMPLOYEES ============
  async getEmployees(siteId = null) {
    try {
      const employees = JSON.parse(localStorage.getItem(this.storagePrefix + 'employees') || '[]');
      if (siteId) {
        return employees.filter(e => e.site_id === siteId);
      }
      return employees;
    } catch (error) {
      console.error('Error fetching employees:', error);
      return [];
    }
  }

  async createEmployee(employeeData) {
    try {
      const employees = JSON.parse(localStorage.getItem(this.storagePrefix + 'employees') || '[]');
      const newEmployee = { id: this.generateId(), ...employeeData, created_at: new Date().toISOString() };
      employees.push(newEmployee);
      localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify(employees));
      if (window.audit) window.audit.log('create', 'employee', { id: newEmployee.id, name: newEmployee.name });
      return newEmployee;
    } catch (error) {
      console.error('Error creating employee:', error);
      throw error;
    }
  }

  async updateEmployee(employeeId, employeeData) {
    try {
      const employees = JSON.parse(localStorage.getItem(this.storagePrefix + 'employees') || '[]');
      const index = employees.findIndex(e => e.id === employeeId);
      if (index !== -1) {
        employees[index] = { ...employees[index], ...employeeData };
        localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify(employees));
        if (window.audit) window.audit.log('update', 'employee', { id: employeeId, changes: employeeData });
        return employees[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating employee:', error);
      throw error;
    }
  }

  async deleteEmployee(employeeId) {
    try {
      const employees = JSON.parse(localStorage.getItem(this.storagePrefix + 'employees') || '[]');
      const filtered = employees.filter(e => e.id !== employeeId);
      localStorage.setItem(this.storagePrefix + 'employees', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'employee', { id: employeeId });
      return true;
    } catch (error) {
      console.error('Error deleting employee:', error);
      throw error;
    }
  }

  // ============ ATTENDANCE ============
  async getAttendance(filters = {}) {
    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      let filtered = attendance;
      if (filters.date) filtered = filtered.filter(a => a.date === filters.date || a.Date === filters.date);
      if (filters.siteId) filtered = filtered.filter(a => (a.site_id || a.Worksite) === filters.siteId);
      if (filters.employeeId) filtered = filtered.filter(a => String(a.employee_id || a.employee_ID) === String(filters.employeeId));
      return filtered.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
    } catch (error) {
      console.error('Error fetching attendance from Local Storage:', error);
      return [];
    }
  }

  async markAttendance(attendanceData) {
    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const newRecord = {
        id: this.generateId(),
        employee_id: attendanceData.employee_id,
        employee_name: attendanceData.employee_name,
        date: attendanceData.date,
        status: attendanceData.status,
        site_id: attendanceData.site_id || '',
        created_at: new Date().toISOString(),
        clock_in: attendanceData.clock_in || null,
        clock_out: attendanceData.clock_out || null,
        notes: attendanceData.notes || ''
      };
      attendance.push(newRecord);
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(attendance));
      if (window.audit) window.audit.log('create', 'attendance', { id: newRecord.id, employee_id: newRecord.employee_id, status: newRecord.status });
      return newRecord;
    } catch (error) {
      console.error('Error marking attendance in Local Storage:', error);
      throw error;
    }
  }

  async updateAttendance(attendanceId, attendanceData) {
    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const index = attendance.findIndex(a => String(a.id) === String(attendanceId));
      if (index === -1) return null;
      attendance[index] = {
        ...attendance[index],
        status: attendanceData.status,
        notes: attendanceData.notes || '',
        clock_in: attendanceData.clock_in || null,
        clock_out: attendanceData.clock_out || null
      };
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(attendance));
      if (window.audit) window.audit.log('update', 'attendance', { id: attendanceId, changes: attendanceData });
      return attendance[index];
    } catch (error) {
      console.error('Error updating attendance in Local Storage:', error);
      throw error;
    }
  }

  async deleteAttendance(attendanceId) {
    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const filtered = attendance.filter(a => String(a.id) !== String(attendanceId));
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'attendance', { id: attendanceId });
      return true;
    } catch (error) {
      console.error('Error deleting attendance in Local Storage:', error);
      throw error;
    }
  }

  // ============ PAYROLL ============
  async getPayroll(filters = {}) {
    try {
      const payroll = JSON.parse(localStorage.getItem(this.storagePrefix + 'payroll') || '[]');
      let filtered = payroll;

      if (filters.period) {
        filtered = filtered.filter(p => p.pay_period === filters.period);
      }
      if (filters.siteId) {
        filtered = filtered.filter(p => p.site_id === filters.siteId);
      }

      return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      console.error('Error fetching payroll:', error);
      return [];
    }
  }

  async createPayrollRun(payrollData) {
    try {
      const payroll = JSON.parse(localStorage.getItem(this.storagePrefix + 'payroll') || '[]');
      const newRecord = { id: this.generateId(), ...payrollData, created_at: new Date().toISOString() };
      payroll.push(newRecord);
      localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify(payroll));
      if (window.audit) window.audit.log('create', 'payroll', { id: newRecord.id, total: newRecord.total, status: newRecord.status });
      return newRecord;
    } catch (error) {
      console.error('Error creating payroll run:', error);
      throw error;
    }
  }

  async updatePayroll(payrollId, payrollData) {
    try {
      const payroll = JSON.parse(localStorage.getItem(this.storagePrefix + 'payroll') || '[]');
      const index = payroll.findIndex(p => p.id === payrollId);
      if (index !== -1) {
        payroll[index] = { ...payroll[index], ...payrollData };
        localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify(payroll));
        if (window.audit) window.audit.log('update', 'payroll', { id: payrollId, changes: payrollData });
        return payroll[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating payroll:', error);
      throw error;
    }
  }

  async deletePayroll(payrollId) {
    try {
      const payroll = JSON.parse(localStorage.getItem(this.storagePrefix + 'payroll') || '[]');
      const filtered = payroll.filter(p => p.id !== payrollId);
      localStorage.setItem(this.storagePrefix + 'payroll', JSON.stringify(filtered));
      if (window.audit) window.audit.log('delete', 'payroll', { id: payrollId });
      return true;
    } catch (error) {
      console.error('Error deleting payroll:', error);
      throw error;
    }
  }
}

// Export global instance
window.db = new DatabaseService();


