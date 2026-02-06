// payroll.js
// Payroll class implementation for payroll page

// (Paste the provided Payroll class code here)

// The code is pasted below for clarity

class Payroll {
  constructor() {
    this.db = window.db;
    this.defaultDailyRate = 5000;
    // Compatibility aliases for different db API names
    if (this.db) {
      if (typeof this.db.getPayroll === 'function' && typeof this.db.getPayrollRuns !== 'function') {
        this.db.getPayrollRuns = this.db.getPayroll.bind(this.db);
      }
      if (typeof this.db.deletePayroll === 'function' && typeof this.db.deletePayrollRun !== 'function') {
        this.db.deletePayrollRun = this.db.deletePayroll.bind(this.db);
      }
      if (typeof this.db.createPayroll === 'function' && typeof this.db.createPayrollRun !== 'function') {
        this.db.createPayrollRun = this.db.createPayroll.bind(this.db);
      }
      // ensure both names exist (cover either implementation)
      if (typeof this.db.deletePayrollRun === 'function' && typeof this.db.deletePayroll !== 'function') {
        this.db.deletePayroll = this.db.deletePayrollRun.bind(this.db);
      }
    }
    console.log('Payroll system initialized');
    this.init();
  }
  // ...rest of the Payroll class code from user...
}

console.log('🟢 payroll.js loaded!');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded, initializing Payroll');
    if (window.db) {
      window.payrollApp = new Payroll();
    } else {
      console.error('❌ window.db not found!');
    }
  });
} else {
  console.log('📄 DOM ready, initializing Payroll');
  if (window.db) {
    window.payrollApp = new Payroll();
  } else {
    console.error('❌ window.db not found!');
  }
}
