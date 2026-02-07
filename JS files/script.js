// Custom cursor effect on login button
const loginButton = document.querySelector('.login-button');
const cursorHover = document.getElementById('cursorHover');

if (window.location.pathname.toLowerCase().endsWith('/loading.html')) {
    window.location.replace('dashboard.html');
}

if (loginButton && cursorHover) {
    loginButton.addEventListener('mouseenter', () => {
        cursorHover.style.opacity = '1';
        cursorHover.style.left = (loginButton.getBoundingClientRect().left + window.scrollX + loginButton.offsetWidth / 2 - 20) + 'px';
        cursorHover.style.top = (loginButton.getBoundingClientRect().top + window.scrollY + loginButton.offsetHeight / 2 - 20) + 'px';
    });

    loginButton.addEventListener('mouseleave', () => {
        cursorHover.style.opacity = '0';
    });

    loginButton.addEventListener('mousemove', (e) => {
        cursorHover.style.left = (e.clientX - 20) + 'px';
        cursorHover.style.top = (e.clientY - 20) + 'px';
    });
}

const USERS_KEY = 'huly_users';
const SESSION_KEY = 'huly_session';
const AUDIT_KEY = 'huly_audit';

function getAuditList() {
    try {
        const raw = localStorage.getItem(AUDIT_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function logAudit(action, details = {}) {
    const user = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    const entry = {
        id: Date.now().toString(36),
        ts: new Date().toISOString(),
        actor: user ? { id: user.id, email: user.email, role: user.role } : null,
        action,
        details
    };
    const list = getAuditList();
    list.push(entry);
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const pruned = list.filter(item => new Date(item.ts).getTime() >= cutoff);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(pruned));
}

async function hashPassword(password) {
    if (!window.crypto || !window.crypto.subtle) {
        return btoa(password);
    }
    const enc = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureDefaultUser() {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return;
    const defaultUser = {
        id: 'admin-1',
        email: 'admin@hurly.app',
        name: 'Administrator',
        role: 'admin',
        password: await hashPassword('admin123')
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([defaultUser]));
}

async function authenticate(email, password) {
    const raw = localStorage.getItem(USERS_KEY);
    const users = raw ? JSON.parse(raw) : [];
    const pass = await hashPassword(password);
    const user = users.find(u => String(u.email).toLowerCase() === String(email).toLowerCase());
    if (!user) return null;
    if (user.password === pass) return user;
    // Migration: allow plain-text stored passwords and upgrade to hash
    if (user.password === password) {
        user.password = pass;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        return user;
    }
    return null;
}

function showLoginSuccess(message) {
    const existing = document.getElementById('loginSuccessToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'loginSuccessToast';
    toast.textContent = message;
    toast.style.cssText = [
        'position: fixed',
        'top: 20px',
        'left: 50%',
        'transform: translateX(-50%)',
        'background: #000',
        'color: #fff',
        'padding: 12px 20px',
        'border-radius: 10px',
        'box-shadow: none',
        'font-size: 14px',
        'font-weight: 600',
        'letter-spacing: 0.2px',
        'z-index: 10000',
        'opacity: 0',
        'transition: opacity 200ms ease'
    ].join('; ');

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    return toast;
}

(async () => {
    await ensureDefaultUser();
    const form = document.querySelector('form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        if (loginButton) {
            loginButton.disabled = true;
            loginButton.textContent = 'Logging in...';
        }
        try {
            const user = await authenticate(email, password);
            if (!user) {
                alert('Login failed: invalid email or password.');
                if (loginButton) {
                    loginButton.disabled = false;
                    loginButton.textContent = 'Log In';
                }
                return;
            }
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name || 'User',
                loginAt: new Date().toISOString()
            }));
            logAudit('login', { email: user.email, role: user.role });
            showLoginSuccess('Login successful');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 900);
        } catch (err) {
            alert('Unexpected error: ' + err.message);
            if (loginButton) {
                loginButton.disabled = false;
                loginButton.textContent = 'Log In';
            }
        }
    });
})();
