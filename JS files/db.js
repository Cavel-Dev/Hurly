// Local Database Service Module
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

      if (filters.date) {
        filtered = filtered.filter(a => a.date === filters.date);
      }
      if (filters.siteId) {
        filtered = filtered.filter(a => a.site_id === filters.siteId);
      }
      if (filters.employeeId) {
        filtered = filtered.filter(a => a.employee_id === filters.employeeId);
      }

      return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      console.error('Error fetching attendance:', error);
      return [];
    }
  }

  async markAttendance(attendanceData) {
    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const newRecord = { id: this.generateId(), ...attendanceData, created_at: new Date().toISOString() };
      attendance.push(newRecord);
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(attendance));
      return newRecord;
    } catch (error) {
      console.error('Error marking attendance:', error);
      throw error;
    }
  }

  async updateAttendance(attendanceId, attendanceData) {
    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const index = attendance.findIndex(a => a.id === attendanceId);
      if (index !== -1) {
        attendance[index] = { ...attendance[index], ...attendanceData };
        localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(attendance));
        return attendance[index];
      }
      return null;
    } catch (error) {
      console.error('Error updating attendance:', error);
      throw error;
    }
  }

  async deleteAttendance(attendanceId) {
    try {
      const attendance = JSON.parse(localStorage.getItem(this.storagePrefix + 'attendance') || '[]');
      const filtered = attendance.filter(a => a.id !== attendanceId);
      localStorage.setItem(this.storagePrefix + 'attendance', JSON.stringify(filtered));
      return true;
    } catch (error) {
      console.error('Error deleting attendance:', error);
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
      return true;
    } catch (error) {
      console.error('Error deleting payroll:', error);
      throw error;
    }
  }
}

// Export global instance
window.db = new DatabaseService();

