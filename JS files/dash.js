$(document).ready(function() {
    // Toggle sidebar collapse
    $('#toggleBtn').on('click', function() {
        $('#sidebar').toggleClass('collapsed');
    });

    // Handle active state on menu items
    $('.menu ul li a').on('click', function(e) {
        // Don't change active state for logout button
        if ($(this).attr('id') !== 'logoutBtn') {
            // Only prevent default if href is '#'
            if ($(this).attr('href') === '#') {
                e.preventDefault();
            }
            // Remove active class from all items
            $('.menu ul li').removeClass('active');
            // Reset all items to default styling
            $('.menu ul li a').css({
                'background': '',
                'color': ''
            });
            // Add active class to clicked item
            $(this).parent().addClass('active');
            // Apply active styling to clicked item
            $(this).css({
                'background': '#000',
                'color': '#fff'
            });
        }
    });

    // Black hover effect on mouse enter (only if not active)
    $('.menu ul li a').on('mouseenter', function() {
        if (!$(this).parent().hasClass('active')) {
            $(this).css({
                'background': '#000',
                'color': '#fff'
            });
        }
    });

    // Remove hover effect on mouse leave (only if not active)
    $('.menu ul li a').on('mouseleave', function() {
        if (!$(this).parent().hasClass('active')) {
            $(this).css({
                'background': '',
                'color': ''
            });
        }
    });

    // Logout functionality
    $('#logoutBtn').on('click', function(e) {
        e.preventDefault();
        
        // Clear any stored user data (localStorage, sessionStorage)
        // Note: Add your specific logout logic here
        
        // Display logout message
        console.log('User logged out successfully');
        
        // Redirect to login page immediately
        // Replace 'login.html' with your actual login page path
        window.location.href = 'login.html';
        
        // Alternative: If you're using an API, you can make an AJAX call
        /*
        $.ajax({
            url: '/api/logout',
            method: 'POST',
            success: function(response) {
                console.log('Logout successful');
                window.location.href = 'login.html';
            },
            error: function(error) {
                console.error('Logout failed:', error);
                alert('Logout failed. Please try again.');
            }
        });
        */
    });

    // Close sidebar on mobile when clicking outside
    $(document).on('click', function(e) {
        if ($(window).width() <= 768) {
            if (!$(e.target).closest('.sidebar').length && !$(e.target).closest('.toggle-btn').length) {
                $('#sidebar').removeClass('mobile-open');
            }
        }
    });

    // Smooth scroll effect for anchor links
    $('a[href^="#"]').on('click', function(e) {
        const target = $(this).attr('href');
        if (target !== '#') {
            e.preventDefault();
            $('html, body').animate({
                scrollTop: $(target).offset().top - 80
            }, 500);
        }
    });

    const activeSiteKey = 'huly_active_site';
    const siteSelect = document.getElementById('dashboardSiteSelect');
    const siteClearBtn = document.getElementById('dashboardSiteClear');

    async function populateDashboardSites() {
        if (!siteSelect || !window.db) return;
        const sites = await window.db.getSites();
        let activeSite = localStorage.getItem(activeSiteKey) || '';
        if (!activeSite && sites.length) {
            const firstId = String(sites[0].id || '');
            if (firstId) {
                localStorage.setItem(activeSiteKey, firstId);
                activeSite = firstId;
                const backfillDone = localStorage.getItem('huly_site_backfill_done');
                if (!backfillDone && window.db && typeof window.db.backfillMissingSiteId === 'function') {
                    try {
                        await window.db.backfillMissingSiteId(firstId);
                        localStorage.setItem('huly_site_backfill_done', 'true');
                    } catch (e) {
                        console.warn('Site backfill failed', e);
                    }
                }
            }
        }
        const hideAll = localStorage.getItem('huly_default_site_confirmed') === 'true';
        const options = [
            ...(hideAll ? [] : ['<option value="">All sites</option>']),
            ...sites.map(site => {
                const label = site.name ? site.name : `Site ${site.id || ''}`.trim();
                return `<option value="${site.id}">${label}</option>`;
            })
        ];
        siteSelect.innerHTML = options.join('');
        siteSelect.value = activeSite;
    }

    if (siteSelect) {
        siteSelect.addEventListener('change', () => {
            const value = siteSelect.value || '';
            if (value) {
                localStorage.setItem(activeSiteKey, value);
            } else {
                localStorage.removeItem(activeSiteKey);
            }
            updateDashboardSnapshot();
        });
    }

    if (siteClearBtn) {
        siteClearBtn.addEventListener('click', () => {
            localStorage.removeItem(activeSiteKey);
            if (siteSelect) siteSelect.value = '';
            updateDashboardSnapshot();
        });
    }

    let isUpdating = false;
    async function updateDashboardSnapshot() {
        if (isUpdating) return;
        isUpdating = true;
        const welcomeTitle = document.getElementById('welcomeTitle');
        if (welcomeTitle) {
            let name = 'Administrator';
            try {
                const settingsRaw = localStorage.getItem('huly_settings');
                if (settingsRaw) {
                    const settings = JSON.parse(settingsRaw);
                    if (settings?.company?.name) name = settings.company.name;
                }
            } catch (e) {}
            welcomeTitle.textContent = `Welcome, ${name}`;
        }

        const datePill = document.getElementById('dashboardDate');
        if (datePill) {
            const now = new Date();
            const dateText = now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            });
            datePill.querySelector('span').textContent = dateText;
        }

        if (!window.db) {
            isUpdating = false;
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const [employees, attendance, payrollRuns, sites] = await Promise.all([
            window.db.getEmployees(),
            window.db.getAttendance(),
            window.db.getPayroll(),
            window.db.getSites()
        ]);

        const employeeList = employees || [];
        const attendanceList = attendance || [];
        const payrollList = payrollRuns || [];
        const siteList = sites || [];

        const activeEmployees = employeeList.filter(e => {
            const status = e.status ?? e.Status ?? 'Active';
            return String(status).toLowerCase() === 'active';
        }).length;

        const docsPending = employeeList.filter(e => {
            const docStatus = e.document_status ?? e.Documents ?? e.documents ?? 'Pending';
            return String(docStatus).toLowerCase().includes('pending') || String(docStatus).toLowerCase().includes('progress');
        }).length;

        const attendanceToday = attendanceList.filter(a => a.date === today);
        const presentCount = attendanceToday.filter(a => String(a.status).toLowerCase() === 'present').length;
        const lateCount = attendanceToday.filter(a => String(a.status).toLowerCase() === 'late').length;
        const absentCount = attendanceToday.filter(a => String(a.status).toLowerCase() === 'absent').length;

        const latestPayroll = payrollList.length
            ? payrollList.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
            : null;
        const payrollTotal = latestPayroll ? parseFloat(latestPayroll.total) || 0 : 0;
        const payrollQty = latestPayroll ? parseFloat(latestPayroll.total_hours) || 0 : 0;
        const payrollStatus = latestPayroll?.status || 'Draft';

        const kpiEmployees = document.getElementById('kpiEmployees');
        const kpiActiveTag = document.getElementById('kpiActiveTag');
        const kpiAttendanceToday = document.getElementById('kpiAttendanceToday');
        const kpiAttendanceMeta = document.getElementById('kpiAttendanceMeta');
        const kpiPayrollEstimate = document.getElementById('kpiPayrollEstimate');
        const kpiPayrollMeta = document.getElementById('kpiPayrollMeta');
        const kpiPayrollQty = document.getElementById('kpiPayrollQty');
        const kpiPayrollQtyMeta = document.getElementById('kpiPayrollQtyMeta');
        const kpiPayrollStatus = document.getElementById('kpiPayrollStatus');
        const kpiPayrollStatusMeta = document.getElementById('kpiPayrollStatusMeta');
        const kpiSites = document.getElementById('kpiSites');
        const kpiDocsPending = document.getElementById('kpiDocsPending');
        const kpiAlerts = document.getElementById('kpiAlerts');

        if (kpiEmployees) kpiEmployees.textContent = employeeList.length.toLocaleString('en-US');
        if (kpiActiveTag) kpiActiveTag.textContent = `${activeEmployees} Active`;
        if (kpiAttendanceToday) kpiAttendanceToday.textContent = attendanceToday.length.toLocaleString('en-US');
        if (kpiAttendanceMeta) {
            kpiAttendanceMeta.textContent = `${presentCount} Present  ${lateCount} Late  ${absentCount} Absent`;
        }
        if (kpiPayrollEstimate) {
            kpiPayrollEstimate.textContent = new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD' }).format(payrollTotal || 0);
        }
        if (kpiPayrollMeta) {
            kpiPayrollMeta.textContent = latestPayroll?.pay_period ? `Latest run: ${latestPayroll.pay_period}` : (payrollList.length ? `${payrollList.length} runs tracked` : 'No payroll runs yet');
        }
        if (kpiPayrollQty) kpiPayrollQty.textContent = payrollQty.toLocaleString('en-US');
        if (kpiPayrollQtyMeta) kpiPayrollQtyMeta.textContent = latestPayroll ? 'Latest run quantity' : 'No payroll runs yet';
        if (kpiPayrollStatus) kpiPayrollStatus.textContent = payrollStatus;
        if (kpiPayrollStatusMeta) kpiPayrollStatusMeta.textContent = latestPayroll ? 'Latest run status' : 'No payroll runs yet';
        if (kpiSites) kpiSites.textContent = siteList.length.toLocaleString('en-US');
        if (kpiDocsPending) kpiDocsPending.textContent = docsPending.toLocaleString('en-US');
        if (kpiAlerts) kpiAlerts.textContent = docsPending > 0 || absentCount > 0 ? (docsPending + absentCount).toLocaleString('en-US') : '0';

        updateAttendanceTrend(attendanceList);
        updatePayrollProgress(payrollList);
        updatePayrollRuns(payrollList);
        updateRecentActivity(employeeList, attendanceList, payrollList);
        updateOperationsSnapshot(activeEmployees, attendanceToday.length, payrollList.length, docsPending);
        isUpdating = false;
    }

    function updateAttendanceTrend(attendanceList) {
        const container = document.getElementById('attendanceTrend');
        if (!container) return;

        const days = Array.from({ length: 7 }, (_, idx) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - idx));
            return date;
        });

        const counts = days.map(date => {
            const key = date.toISOString().split('T')[0];
            return attendanceList.filter(a => a.date === key).length;
        });

        const max = Math.max(1, ...counts);
        container.innerHTML = days.map((date, idx) => {
            const height = Math.round((counts[idx] / max) * 100);
            const label = date.toLocaleDateString('en-US', { weekday: 'short' });
            return `
                <div class="trend-bar" style="height: ${Math.max(20, height)}%;">
                    <span>${label}</span>
                </div>
            `;
        }).join('');
    }

    function updatePayrollProgress(payrollList) {
        const label = document.getElementById('payrollCurrentLabel');
        const status = document.getElementById('payrollStatus');
        const progress = document.getElementById('payrollProgress');
        const footnote = document.getElementById('payrollFootnote');

        if (!label || !status || !progress || !footnote) return;

        if (!payrollList.length) {
            label.textContent = '$0';
            status.textContent = 'Draft';
            status.className = 'status-chip status-warning';
            progress.style.width = '20%';
            footnote.textContent = 'No payroll data yet';
            return;
        }

        const latest = payrollList.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
        const total = parseFloat(latest.total) || 0;
        label.textContent = new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD' }).format(total);
        const statusText = latest.status || 'Draft';
        status.textContent = statusText;
        status.className = `status-chip ${statusText.toLowerCase() === 'final' ? 'status-success' : 'status-warning'}`;
        progress.style.width = statusText.toLowerCase() === 'final' ? '90%' : '55%';
        footnote.textContent = latest.pay_period ? `Latest run: ${latest.pay_period}` : 'Latest run ready for review';
    }

    
    function updatePayrollRuns(payrollList) {
        const list = document.getElementById('recentPayrollRuns');
        if (!list) return;

        if (!payrollList.length) {
            list.innerHTML = `
                <li class="snapshot-item">
                    <div>
                        <strong>No payroll runs yet</strong>
                        <div class="snapshot-meta">Create a payroll run to see updates</div>
                    </div>
                    <span class="status-chip status-warning">Pending</span>
                </li>
            `;
            return;
        }

        const items = payrollList
            .slice()
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 5)
            .map((run) => {
                const total = parseFloat(run.total) || 0;
                const status = (run.status || 'Draft').toLowerCase() === 'final' ? 'status-success' : 'status-warning';
                const label = run.pay_period || 'Payroll run';
                const created = run.created_at ? new Date(run.created_at).toLocaleDateString('en-US') : 'Unknown date';
                return `
                    <li class="snapshot-item">
                        <div>
                            <strong>${label}</strong>
                            <div class="snapshot-meta">${new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD' }).format(total)}  ${created}</div>
                        </div>
                        <span class="status-chip ${status}">${run.status || 'Draft'}</span>
                    </li>
                `;
            });

        list.innerHTML = items.join('');
    }
function updateRecentActivity(employeeList, attendanceList, payrollList) {
        const list = document.getElementById('recentActivity');
        if (!list) return;

        const items = [];

        employeeList.slice(-2).forEach(emp => {
            items.push({
                title: `Employee added: ${emp.name || emp.Name || 'New hire'}`,
                meta: 'Employee update',
                status: 'status-success'
            });
        });

        attendanceList.slice(-2).forEach(att => {
            items.push({
                title: `${att.employee_name || att.name || 'Employee'} marked ${att.status || 'present'}`,
                meta: att.date ? `Attendance on ${att.date}` : 'Attendance update',
                status: att.status === 'absent' ? 'status-danger' : 'status-success'
            });
        });

        payrollList.slice(-1).forEach(run => {
            items.push({
                title: `Payroll run ${run.status || 'Draft'}  ${run.pay_period || 'New period'}`,
                meta: 'Payroll activity',
                status: run.status === 'Final' ? 'status-success' : 'status-warning'
            });
        });

        const finalItems = items.slice(-5);
        if (!finalItems.length) {
            list.innerHTML = `
                <li class="snapshot-item">
                    <div>
                        <strong>No recent activity yet</strong>
                        <div class="snapshot-meta">Add employees, attendance, or payroll to see updates</div>
                    </div>
                    <span class="status-chip status-warning">Pending</span>
                </li>
            `;
            return;
        }

        list.innerHTML = finalItems.map(item => `
            <li class="snapshot-item">
                <div>
                    <strong>${item.title}</strong>
                    <div class="snapshot-meta">${item.meta}</div>
                </div>
                <span class="status-chip ${item.status}">${item.status === 'status-danger' ? 'Alert' : 'Update'}</span>
            </li>
        `).join('');
    }

    function updateOperationsSnapshot(activeEmployees, attendanceCount, payrollCount, docsPending) {
        const list = document.getElementById('operationsSnapshot');
        if (!list) return;

        const attendanceStatus = attendanceCount > 0 ? 'status-success' : 'status-warning';
        const payrollStatus = payrollCount > 0 ? 'status-success' : 'status-warning';
        const docsStatus = docsPending > 0 ? 'status-warning' : 'status-success';

        list.innerHTML = `
            <li class="snapshot-item">
                <div>
                    <strong>${activeEmployees} Active Employees</strong>
                    <div class="snapshot-meta">Workforce ready</div>
                </div>
                <span class="status-chip status-success">Healthy</span>
            </li>
            <li class="snapshot-item">
                <div>
                    <strong>${attendanceCount} Attendance Records</strong>
                    <div class="snapshot-meta">Today</div>
                </div>
                <span class="status-chip ${attendanceStatus}">${attendanceStatus === 'status-success' ? 'On Track' : 'Check'}</span>
            </li>
            <li class="snapshot-item">
                <div>
                    <strong>${payrollCount} Payroll Runs</strong>
                    <div class="snapshot-meta">This period</div>
                </div>
                <span class="status-chip ${payrollStatus}">${payrollStatus === 'status-success' ? 'Ready' : 'Review'}</span>
            </li>
            <li class="snapshot-item">
                <div>
                    <strong>${docsPending} Pending Documents</strong>
                    <div class="snapshot-meta">Needs follow-up</div>
                </div>
                <span class="status-chip ${docsStatus}">${docsStatus === 'status-warning' ? 'Action' : 'Clear'}</span>
            </li>
        `;
    }

    populateDashboardSites();
    updateDashboardSnapshot();
    setInterval(updateDashboardSnapshot, 1000);
});






















