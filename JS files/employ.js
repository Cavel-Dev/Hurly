
console.log('[DEBUG] employ.js script loaded');
const SUPABASE_URL = "https://fyqsjyceeebarjuxztqg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cXNqeWNlZWViYXJqdXh6dHFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzQ4MTAsImV4cCI6MjA4MTUxMDgxMH0.LhOoDWcVwU_ht8SKuILFXPU9Gw8CHolAhO8Qgj3BMdI";
let supabase;

function startEmployeesAppWhenReady() {
  if (typeof supabase !== 'undefined' && supabase) {
    window.employeesApp = new Employees();
  } else {
    setTimeout(startEmployeesAppWhenReady, 100);
  }
}

if (window.supabase && window.supabase.createClient) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  document.addEventListener('DOMContentLoaded', startEmployeesAppWhenReady);
} else {
  // fallback: load if not present
  const supabaseScript = document.createElement('script');
  supabaseScript.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js";
  supabaseScript.onload = () => {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    document.addEventListener('DOMContentLoaded', startEmployeesAppWhenReady);
  };
  document.head.appendChild(supabaseScript);
}

class Employees {
  constructor() {
    console.log('[DEBUG] Employees constructor called');
    this.init();
  }

  init() {
    try {

  populateEmployeesTable(employees) {
    const tbody = document.querySelector('.employees-table tbody');
    if (!tbody) {
      console.error('❌ Table tbody not found!');
      return;
    }

    console.log('📊 Populating table with', employees.length, 'employees');
    tbody.innerHTML = '';
    
    if (!employees || employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: rgba(243, 246, 255, 0.50);">No employees found. Click "Add Employee" to get started.</td></tr>';
      return;
    }
    
    const self = this;
    employees.forEach(emp => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${emp.name || 'N/A'}</td>
        <td>${emp.position || 'N/A'}</td>
        <td><span class="badge badge-${emp.status === 'Active' ? 'success' : 'warning'}">${emp.status || 'Active'}</span></td>
        <td>${emp.document_status || 'Pending'}</td>
        <td>
          <button class="btn btn-secondary btn-sm edit-emp-btn" data-emp-id="${emp.id}" data-emp='${JSON.stringify(emp).replace(/'/g, "&apos;")}'>Edit</button>
          <button class="btn btn-danger btn-sm delete-emp-btn" data-emp-id="${emp.id}" style="margin-left: 8px;">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Add event listeners for edit buttons
    document.querySelectorAll('.edit-emp-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const empData = JSON.parse(e.target.getAttribute('data-emp').replace(/&apos;/g, "'"));
        console.log('✏️ Editing employee:', empData);
        self.showEditEmployeeModal(empData);
      });
    });

    // Add event listeners for delete buttons
    document.querySelectorAll('.delete-emp-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const empId = e.target.getAttribute('data-emp-id');
        const empRow = e.target.closest('tr');
        const empName = empRow.cells[0].textContent;
        
        if (confirm(`Are you sure you want to delete ${empName}?`)) {
          try {
            const { error } = await supabase
              .from('Employees')
              .delete()
              .eq('id', empId);
            if (error) throw error;
            await self.loadEmployees();
            console.log('✅ Employee deleted successfully');
          } catch (error) {
            console.error('❌ Error deleting employee:', error);
            alert('Failed to delete employee. Please try again.');
          }
        }
      });
    });
  }
  
  setupEventListeners() {
      console.log('[DEBUG] setupEventListeners called');
      console.log('[DEBUG] All buttons in DOM:', Array.from(document.querySelectorAll('button')).map(b => ({ id: b.id, class: b.className, text: b.textContent })));
    console.log('🔧 Setting up event listeners...');
    
    // Try multiple ways to find and bind the Add Employee button
    const possibleSelectors = [
      '#addEmployeeBtn',
      '[id="addEmployeeBtn"]',
      'button[id="addEmployeeBtn"]',
      '.btn-primary',
      'button:contains("Add Employee")'
    ];
    
    let addEmployeeBtn = null;
    
    for (const selector of possibleSelectors) {
      const btn = document.querySelector(selector);
      if (btn && (btn.id === 'addEmployeeBtn' || btn.textContent.includes('Add Employee'))) {
        addEmployeeBtn = btn;
        console.log('✅ Found Add Employee button using selector:', selector);
        break;
      }
    }
    
    if (!addEmployeeBtn) {
      console.error('❌ Add Employee button not found! Checked selectors:', possibleSelectors);
      console.log('📝 Available buttons:', Array.from(document.querySelectorAll('button')).map(b => ({ id: b.id, class: b.className, text: b.textContent })));
    } else {
      console.log('✅ Add Employee button found:', addEmployeeBtn);
      
      // Remove any existing listeners
      const newBtn = addEmployeeBtn.cloneNode(true);
      addEmployeeBtn.parentNode.replaceChild(newBtn, addEmployeeBtn);
      addEmployeeBtn = newBtn;
      
      // Add click listener
      addEmployeeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎉 ADD EMPLOYEE BUTTON CLICKED!');
        this.showAddEmployeeModal();
      });
      
      console.log('✅ Click listener attached to Add Employee button');
    }
    
    // Global click handler as backup
    document.body.addEventListener('click', (e) => {
      const target = e.target;
      if (target.id === 'addEmployeeBtn' || 
          target.closest('#addEmployeeBtn') || 
          (target.textContent && target.textContent.includes('Add Employee'))) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎉 ADD EMPLOYEE BUTTON CLICKED (via body listener)!');
        this.showAddEmployeeModal();
      }
    });
    
    // Setup search
    const employeeSearch = document.getElementById('employeeSearch');
    if (employeeSearch) {
      console.log('✅ Search input found');
      employeeSearch.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        console.log('🔍 Searching for:', searchTerm);
        
        try {
          const employees = await this.db.getEmployees();
          
          if (!searchTerm) {
            this.populateEmployeesTable(employees);
            return;
          }
          
          const filtered = employees.filter(emp => 
            (emp.name && emp.name.toLowerCase().includes(searchTerm)) ||
            (emp.position && emp.position.toLowerCase().includes(searchTerm)) ||
            (emp.email && emp.email.toLowerCase().includes(searchTerm))
          );
          
          console.log('🔍 Filtered employees:', filtered);
          this.populateEmployeesTable(filtered);
        } catch (error) {
          console.error('❌ Error searching employees:', error);
        }
      });
    } else {
      console.warn('⚠️ Search input not found');
    }
  }

  showAddEmployeeModal() {
    console.log('🎨 Opening Add Employee modal...');
    
    // Remove any existing modals
    const existingModal = document.getElementById('employeeModal');
    if (existingModal) {
      existingModal.remove();
    }
    
    const self = this;
    const modal = document.createElement('div');
    modal.id = 'employeeModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    `;
    
    modal.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .emp-modal-input, .emp-modal-select {
          width: 100%;
          padding: 12px 16px;
          background: #fff;
          border: 1px solid #000;
          border-radius: 12px;
          color: #000;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
          font-family: inherit;
        }
        .emp-modal-input::placeholder {
          color: #888;
        }
        .emp-modal-input:focus, .emp-modal-select:focus {
          outline: none;
          background: #f3f3f3;
          border-color: #000;
        }
        .emp-modal-select option {
          background: #fff;
          color: #000;
        }
        .modal-btn {
          flex: 1;
          padding: 12px 24px;
          background: #fff;
          border: 1px solid #000;
          border-radius: 12px;
          color: #000;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: inherit;
        }
        .modal-btn.primary {
          background: #000;
          color: #fff;
        }
        .modal-btn.primary:hover {
          background: #222;
        }
        .modal-btn:hover {
          background: #eee;
        }
      </style>
      <div style="
        background: #fff;
        border: 2px solid #000;
        border-radius: 16px;
        padding: 32px;
        width: 90%;
        max-width: 500px;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        animation: slideUp 0.3s ease;
      ">
        <h2 style="margin-bottom: 24px; font-size: 1.75rem; font-weight: 700; color: #000;">Add New Employee</h2>
        <div style="margin: 20px 0">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #000; font-size: 0.95rem;">Full Name: <span style="color: #EF4444;">*</span></label>
          <input type="text" id="empName" placeholder="Enter full name" class="emp-modal-input">
        </div>
        <div style="margin: 20px 0">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #000; font-size: 0.95rem;">Position: <span style="color: #EF4444;">*</span></label>
          <input type="text" id="empPosition" placeholder="Enter position" class="emp-modal-input">
        </div>
        <div style="margin: 20px 0">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #000; font-size: 0.95rem;">Email: <span style="color: #EF4444;">*</span></label>
          <input type="email" id="empEmail" placeholder="Enter email" class="emp-modal-input">
        </div>
        <div style="margin: 20px 0">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #000; font-size: 0.95rem;">Phone:</label>
          <input type="tel" id="empPhone" placeholder="Enter phone" class="emp-modal-input">
        </div>
        <div style="margin: 20px 0">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #000; font-size: 0.95rem;">Status:</label>
          <select id="empStatus" class="emp-modal-select">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div style="margin: 20px 0">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #000; font-size: 0.95rem;">Document Status:</label>
          <select id="empDocStatus" class="emp-modal-select">
            <option value="Pending">Pending</option>
            <option value="Complete">Complete</option>
            <option value="In Progress">In Progress</option>
          </select>
        </div>
        <div style="display: flex; gap: 12px; margin-top: 24px">
          <button id="modalCancel" class="modal-btn">Cancel</button>
          <button id="modalSave" class="modal-btn primary">Save Employee</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    console.log('✅ Modal added to DOM');

    // Focus first input
    setTimeout(() => {
      document.getElementById('empName')?.focus();
    }, 100);

    const cancelBtn = document.getElementById('modalCancel');
    const saveBtn = document.getElementById('modalSave');

    // Add hover effects
    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = 'rgba(255, 255, 255, 0.08)';
      this.style.borderColor = '#5B5DFF';
      this.style.transform = 'translateY(-1px)';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = 'rgba(255, 255, 255, 0.06)';
      this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
      this.style.transform = 'translateY(0)';
    });

    saveBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 30px rgba(255, 138, 61, 0.4)';
      this.style.filter = 'brightness(1.1)';
    });
    saveBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 20px rgba(255, 138, 61, 0.3)';
      this.style.filter = 'brightness(1)';
    });

    cancelBtn.addEventListener('click', () => {
      console.log('❌ Cancel clicked');
      modal.remove();
    });

    saveBtn.addEventListener('click', async () => {
      console.log('💾 Save clicked');
      const name = document.getElementById('empName').value.trim();
      const position = document.getElementById('empPosition').value.trim();
      const email = document.getElementById('empEmail').value.trim();
      const phone = document.getElementById('empPhone').value.trim();
      const status = document.getElementById('empStatus').value;
      const docStatus = document.getElementById('empDocStatus').value;

      if (!name || !position || !email) {
        alert('Please fill in all required fields (Name, Position, Email)');
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
      }

      try {
        console.log('💾 Creating employee:', { name, position, email, phone, status, docStatus });
        const { error } = await supabase
          .from('Employees')
          .insert([{ 
            Name: name, 
            Position: position, 
            Status: status, 
            Documents: docStatus,
            Email: email,
            Phone: phone,
            source: 'manual'
          }]);
        if (error) throw error;
        modal.remove();
        await self.loadEmployees();
        console.log('✅ Employee added successfully!');
        if (window.app && typeof window.app.showToast === 'function') window.app.showToast('Employee added', 'success');
      } catch (error) {
        console.error('❌ Error adding employee:', error);
        alert('Error adding employee: ' + error.message);
      }
    });
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  showEditEmployeeModal(employee) {
    console.log('✏️ Opening Edit Employee modal for:', employee);
    const self = this;
    const modal = document.createElement('div');
    modal.id = 'employeeEditModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      try {
        console.log('💾 Creating employee:', { name, position, email, phone, status, docStatus });
        const { error } = await supabase
          .from('Employees')
          .insert([{ 
            Name: name, 
            Position: position, 
            Status: status, 
            Documents: docStatus,
            Email: email,
            Phone: phone
          }]);
        if (error) throw error;
        await self.loadEmployees();
        modal.remove();
        console.log('✅ Employee added successfully!');
        if (window.app && typeof window.app.showToast === 'function') window.app.showToast('Employee added', 'success');
      } catch (error) {
        console.error('❌ Error adding employee:', error);
        alert('Error adding employee: ' + error.message);
      }
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .emp-modal-input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 12px;
          color: #F3F6FF;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
          font-family: inherit;
        }
        .emp-modal-input::placeholder {
          color: rgba(243, 246, 255, 0.50);
        }
        .emp-modal-input:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.08);
          border-color: #5B5DFF;
          box-shadow: 0 0 12px rgba(91, 93, 255, 0.2);
        }
        .emp-modal-select {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 12px;
          color: #F3F6FF;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
          font-family: inherit;
        }
        .emp-modal-select option {
          background: #090B16;
          color: #F3F6FF;
          padding: 8px;
        }
        .emp-modal-select:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.08);
          border-color: #5B5DFF;
          box-shadow: 0 0 12px rgba(91, 93, 255, 0.2);
        }
      </style>
      <div style="
        background: rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 16px;
        padding: 32px;
        width: 90%;
        max-width: 500px;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease;
      ">
        <h2 style="
          margin-bottom: 24px;
          font-size: 1.75rem;
          font-weight: 700;
          color: #F3F6FF;
          background: linear-gradient(135deg, #FFB86B, #FF8A3D);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">Edit Employee - ${employee.name}</h2>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Full Name: <span style="color: #EF4444;">*</span></label>
          <input type="text" id="editEmpName" value="${(employee.name || '').replace(/"/g, '&quot;')}" class="emp-modal-input">
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Position: <span style="color: #EF4444;">*</span></label>
          <input type="text" id="editEmpPosition" value="${(employee.position || '').replace(/"/g, '&quot;')}" class="emp-modal-input">
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Email: <span style="color: #EF4444;">*</span></label>
          <input type="email" id="editEmpEmail" value="${(employee.email || '').replace(/"/g, '&quot;')}" class="emp-modal-input">
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Phone:</label>
          <input type="tel" id="editEmpPhone" value="${(employee.phone || '').replace(/"/g, '&quot;')}" class="emp-modal-input">
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Status:</label>
          <select id="editEmpStatus" class="emp-modal-select">
            <option value="Active" ${employee.status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${employee.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
        
        <div style="margin: 20px 0">
          <label style="
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: rgba(243, 246, 255, 0.70);
            font-size: 0.95rem;
          ">Document Status:</label>
          <select id="editEmpDocStatus" class="emp-modal-select">
            <option value="Pending" ${employee.document_status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Complete" ${employee.document_status === 'Complete' ? 'selected' : ''}>Complete</option>
            <option value="In Progress" ${employee.document_status === 'In Progress' ? 'selected' : ''}>In Progress</option>
          </select>
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px">
          <button id="modalEditCancel" style="
            flex: 1;
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 12px;
            color: #F3F6FF;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: inherit;
          ">Cancel</button>
          <button id="modalUpdate" style="
            flex: 1;
            padding: 12px 24px;
            background: linear-gradient(135deg, #FFB86B, #FF8A3D);
            border: none;
            border-radius: 12px;
            color: #000;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(255, 138, 61, 0.3);
            font-family: inherit;
          ">Update Employee</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cancelBtn = document.getElementById('modalEditCancel');
    const updateBtn = document.getElementById('modalUpdate');

    // Add hover effects
    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = 'rgba(255, 255, 255, 0.08)';
      this.style.borderColor = '#5B5DFF';
      this.style.transform = 'translateY(-1px)';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = 'rgba(255, 255, 255, 0.06)';
      this.style.borderColor = 'rgba(255, 255, 255, 0.10)';
      this.style.transform = 'translateY(0)';
    });

    updateBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 30px rgba(255, 138, 61, 0.4)';
      this.style.filter = 'brightness(1.1)';
    });
    updateBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 20px rgba(255, 138, 61, 0.3)';
      this.style.filter = 'brightness(1)';
    });

    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });

    updateBtn.addEventListener('click', async () => {
      const name = document.getElementById('editEmpName').value.trim();
      const position = document.getElementById('editEmpPosition').value.trim();
      const email = document.getElementById('editEmpEmail').value.trim();
      const phone = document.getElementById('editEmpPhone').value.trim();
      const status = document.getElementById('editEmpStatus').value;
      const docStatus = document.getElementById('editEmpDocStatus').value;

      if (!name || !position || !email) {
        alert('Please fill in all required fields (Name, Position, Email)');
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
      }

      try {
        console.log('💾 Updating employee:', { id: employee.id, name, position, email, phone, status, docStatus });
        const { error } = await supabase
          .from('Employees')
          .update({
            Name: name,
            Position: position,
            Status: status,
            Documents: docStatus,
            Email: email,
            Phone: phone
          })
          .eq('id', employee.id);
        if (error) throw error;
        modal.remove();
        await self.loadEmployees();
        console.log('✅ Employee updated successfully');
      } catch (error) {
        console.error('❌ Error updating employee:', error);
        alert('Error updating employee: ' + error.message);
      }
    });
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
}

// Test if script is loading
console.log('🟢 employees.js script loaded!');

// (Initialization handled at the top with Supabase logic)

// Global test function for debugging
window.testAddEmployee = function() {
  console.log('🧪 Test function called');
  if (window.employeesApp) {
    window.employeesApp.showAddEmployeeModal();
  } else {
    console.error('❌ employeesApp not initialized');
  }
};

console.log('💡 TIP: Type testAddEmployee() in console to test the modal');
$(document).ready(function() {
    // Update date and time
    function updateDateTime() {
        const now = new Date();
        
        // Format date: Monday, December 30, 2024
        const dateOptions = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const dateString = now.toLocaleDateString('en-US', dateOptions);
        $('#currentDate').text(dateString);
        
        // Format time: 2:45 PM
        const timeOptions = { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        };
        const timeString = now.toLocaleTimeString('en-US', timeOptions);
        $('#currentTime').text(timeString);
    }
    
    // Update immediately
    updateDateTime();
    
    // Update every second
    setInterval(updateDateTime, 1000);
});