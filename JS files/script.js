// Custom cursor effect on login button
const loginButton = document.querySelector('.login-button');
const cursorHover = document.getElementById('cursorHover');
const mfaModal = document.getElementById('mfaModal');
const mfaClose = document.getElementById('mfaClose');
const mfaCancel = document.getElementById('mfaCancel');
const mfaVerify = document.getElementById('mfaVerify');
const mfaCode = document.getElementById('mfaCode');
const mfaSubtitle = document.getElementById('mfaSubtitle');
const mfaQrWrap = document.getElementById('mfaQrWrap');
const mfaQr = document.getElementById('mfaQr');
const mfaSecret = document.getElementById('mfaSecret');
const startMfaSetupBtn = document.getElementById('startMfaSetupBtn');
const mfaSetupModal = document.getElementById('mfaSetupModal');
const mfaSetupClose = document.getElementById('mfaSetupClose');
const mfaSetupCancel = document.getElementById('mfaSetupCancel');
const mfaSetupEnroll = document.getElementById('mfaSetupEnroll');
const mfaSetupVerifyTotp = document.getElementById('mfaSetupVerifyTotp');
const mfaSetupReenroll = document.getElementById('mfaSetupReenroll');
const mfaSetupEmail = document.getElementById('mfaSetupEmail');
const mfaSetupAdminCode = document.getElementById('mfaSetupAdminCode');
const mfaSetupPassword = document.getElementById('mfaSetupPassword');
const mfaSetupQrWrap = document.getElementById('mfaSetupQrWrap');
const mfaSetupQr = document.getElementById('mfaSetupQr');
const mfaSetupSecret = document.getElementById('mfaSetupSecret');
const mfaSetupCode = document.getElementById('mfaSetupCode');

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

const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";
if (!window.SUPABASE_URL) window.SUPABASE_URL = SUPABASE_URL;
if (!window.SUPABASE_ANON_KEY) window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

function loadSupabase() {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);
        if (window.__supabaseClient) {
            clearTimeout(timeout);
            resolve(window.__supabaseClient);
            return;
        }
        if (window.supabase && window.supabase.createClient) {
            window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            clearTimeout(timeout);
            resolve(window.__supabaseClient);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
        script.onload = () => {
            if (window.supabase && window.supabase.createClient) {
                window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                clearTimeout(timeout);
                resolve(window.__supabaseClient);
            } else {
                clearTimeout(timeout);
                resolve(null);
            }
        };
        script.onerror = () => {
            clearTimeout(timeout);
            resolve(null);
        };
        document.head.appendChild(script);
    });
}

async function authenticate(email, password) {
    const supabase = await loadSupabase();
    if (!supabase) throw new Error('Supabase client failed to load');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return null;
    return { user: data?.user || null, supabase };
}

if (!window.app) window.app = {};
if (!window.app.showToast) {
    window.app.showToast = (message, type = 'info') => {
        const existing = document.querySelector('.toast-container');
        const container = existing || (() => {
            const c = document.createElement('div');
            c.className = 'toast-container';
            document.body.appendChild(c);
            return c;
        })();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 200);
        }, 2500);
    };
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

function showContinueButton() {
    let btn = document.getElementById('continueBtn');
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'continueBtn';
    btn.className = 'login-button';
    btn.style.marginTop = '16px';
    btn.textContent = 'Continue to Dashboard';
    const form = document.querySelector('form');
    if (form) form.appendChild(btn);
    btn.addEventListener('click', () => {
        window.location.assign('dashboard.html');
    });
}

function openMfaModal({ subtitle, qr, secret }) {
    if (!mfaModal) return;
    if (mfaSubtitle) mfaSubtitle.textContent = subtitle || 'Enter the code from your authenticator app.';
    if (mfaCode) mfaCode.value = '';
    if (mfaQrWrap) mfaQrWrap.hidden = true;
    mfaModal.classList.add('active');
    mfaModal.setAttribute('aria-hidden', 'false');
}

function closeMfaModal() {
    if (!mfaModal) return;
    mfaModal.classList.remove('active');
    mfaModal.setAttribute('aria-hidden', 'true');
}

function openMfaSetupModal() {
    if (!mfaSetupModal) return;
    if (mfaSetupQrWrap) mfaSetupQrWrap.hidden = true;
    if (mfaSetupCode) mfaSetupCode.value = '';
    if (mfaSetupEmail) mfaSetupEmail.value = '';
    if (mfaSetupAdminCode) mfaSetupAdminCode.value = '';
    if (mfaSetupPassword) mfaSetupPassword.value = '';
    mfaSetupFactorId = null;
    mfaSetupModal.classList.add('active');
    mfaSetupModal.setAttribute('aria-hidden', 'false');
}

function closeMfaSetupModal() {
    if (!mfaSetupModal) return;
    mfaSetupModal.classList.remove('active');
    mfaSetupModal.setAttribute('aria-hidden', 'true');
    mfaSetupFactorId = null;
}

let mfaSetupFactorId = null;

function getFunctionsBase() {
    try {
        const url = window.SUPABASE_URL || 'https://ncqfvcymhvjcchrwelfg.supabase.co';
        const origin = new URL(url).origin;
        return `${origin}/functions/v1`;
    } catch (e) {
        return null;
    }
}

async function requireMfaEveryLogin(supabase) {
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;

    const totpFactors = factorsData?.totp || [];
    const verifiedTotp = totpFactors.filter((f) => f.status === 'verified');
    let factorId = verifiedTotp[0]?.id || null;
    let enrollQr = null;
    let enrollSecret = null;

    if (!factorId) {
        const existing = totpFactors.find((f) => f.status !== 'verified');
        if (existing?.id) {
            factorId = existing.id;
        } else {
            const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'Hurly Authenticator'
            });
            if (enrollError) throw enrollError;
            factorId = enrollData?.id || null;
            enrollQr = enrollData?.totp?.qr_code || enrollData?.totp?.qrCode || null;
            enrollSecret = enrollData?.totp?.secret || '';
        }
    }

    if (!factorId) throw new Error('MFA enrollment failed');

    return await new Promise((resolve) => {
        window.dispatchEvent(new CustomEvent('auth:loading', { detail: { state: 'end' } }));
        if (window.AuthOverlay && typeof window.AuthOverlay.hide === 'function') {
            window.AuthOverlay.hide();
        }
        const subtitle = enrollQr
            ? 'Scan the QR code in Google Authenticator, then enter the 6-digit code.'
            : 'Enter the code from your authenticator app to continue. If you never scanned a QR, re-enroll in Settings.';
        openMfaModal({ subtitle, qr: enrollQr, secret: enrollSecret });

        const onCancel = () => {
            closeMfaModal();
            resolve(false);
        };

        const onVerify = async () => {
            const code = (mfaCode?.value || '').replace(/\s+/g, '');
            if (!code) {
                window.app.showToast('Enter the 6-digit code.', 'error');
                return;
            }
            if (mfaVerify) mfaVerify.disabled = true;
            try {
                const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
                    factorId,
                    code
                });
                if (verifyError) {
                    window.app.showToast('Invalid code. Try again.', 'error');
                    return;
                }
                const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                if (!aal || aal.currentLevel !== 'aal2') {
                    window.app.showToast('MFA verification did not complete. Try again.', 'error');
                    return;
                }
                closeMfaModal();
                resolve(true);
            } catch (err) {
                window.app.showToast('MFA failed. Try again.', 'error');
            } finally {
                if (mfaVerify) mfaVerify.disabled = false;
            }
        };

        if (mfaCancel) mfaCancel.onclick = onCancel;
        if (mfaClose) mfaClose.onclick = onCancel;
        if (mfaVerify) mfaVerify.onclick = onVerify;
    });
}

async function startMfaSetupFlow() {
    const email = (mfaSetupEmail?.value || '').trim();
    const password = mfaSetupPassword?.value || '';
    const adminCode = (mfaSetupAdminCode?.value || '').trim();
    if (!email || !password) {
        window.app.showToast('Enter your email and password.', 'warn');
        return;
    }
    const base = getFunctionsBase();
    if (!base) {
        window.app.showToast('Functions endpoint not available.', 'error');
        return;
    }
    try {
        const res = await fetch(`${base}/mfa-setup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ action: 'check_admin', code: adminCode, email })
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            window.app.showToast(text || 'Unauthorized setup attempt detected.', 'error');
            return;
        }
    } catch (e) {
        window.app.showToast('Admin check failed.', 'error');
        return;
    }

    const supabase = await loadSupabase();
    if (!supabase) {
        window.app.showToast('Supabase client failed to load.', 'error');
        return;
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signInData?.user) {
        window.app.showToast(signInError?.message || 'Access denied. Please use the email on file.', 'error');
        return;
    }
    const session = signInData?.session || (await supabase.auth.getSession()).data?.session;
    if (!session?.access_token) {
        window.app.showToast('No active session. Confirm your email in Supabase Auth.', 'error');
        return;
    }

    try {
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const totpFactors = factorsData?.totp || [];
        const verifiedTotp = totpFactors.filter((f) => f.status === 'verified');
        if (verifiedTotp.length) {
            window.app.showToast('MFA is already enabled. Use Re-enroll to reset.', 'warn');
            return;
        }
        const existing = totpFactors.find((f) => f.status !== 'verified');
        let factorId = existing?.id || null;
        let secret = null;
        let qr = null;
        if (!factorId) {
            const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'Hurly Authenticator'
            });
            if (enrollError) throw enrollError;
            factorId = enrollData?.id || null;
            secret = enrollData?.totp?.secret || '';
            qr = enrollData?.totp?.qr_code || enrollData?.totp?.qrCode || null;
        } else {
            // Existing unverified factor won't return secret/QR; require re-enroll to regenerate.
            window.app.showToast('Existing MFA setup found. Click Re-enroll to generate a new QR.', 'warn');
            mfaSetupFactorId = factorId;
            return;
        }
        mfaSetupFactorId = factorId;

        if (mfaSetupQrWrap) {
            if (qr || secret) {
                mfaSetupQrWrap.hidden = false;
                let qrSrc = qr || '';
                if (!qrSrc && secret) {
                    const issuer = 'Hurly';
                    const label = `Hurly:${email}`;
                    const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}`;
                    qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
                }
                if (mfaSetupQr) {
                    mfaSetupQr.src = qrSrc;
                    mfaSetupQr.style.display = qrSrc ? 'block' : 'none';
                }
                if (mfaSetupSecret) {
                    mfaSetupSecret.innerHTML = '';
                    if (secret) {
                        const keyLine = document.createElement('div');
                        keyLine.textContent = `Manual setup key: ${secret}`;
                        mfaSetupSecret.appendChild(keyLine);
                    }
                    if (qrSrc) {
                        const link = document.createElement('a');
                        link.href = qrSrc;
                        link.target = '_blank';
                        link.rel = 'noreferrer';
                        link.textContent = 'Open QR in new tab';
                        link.style.display = 'inline-block';
                        link.style.marginTop = '6px';
                        link.style.color = '#9aa0a6';
                        mfaSetupSecret.appendChild(link);
                    }
                }
            } else {
                mfaSetupQrWrap.hidden = true;
            }
        }
        if (!qr && !secret) {
            console.warn('MFA enroll returned no qr/secret');
            window.app.showToast('No QR/secret returned. Try Re-enroll.', 'error');
        }

        window.app.showToast('Authenticator enrolled. Enter the code and click Verify Authenticator.', 'success');
    } catch (err) {
        window.app.showToast('Unable to start MFA: ' + (err.message || err), 'error');
    }
}

async function verifyMfaTotpCode() {
    if (!mfaSetupFactorId) {
        window.app.showToast('Generate the authenticator first.', 'warn');
        return;
    }
    const code = (mfaSetupCode?.value || '').replace(/\s+/g, '');
    if (!code) {
        window.app.showToast('Enter the 6-digit code.', 'warn');
        return;
    }
    const supabase = await loadSupabase();
    if (!supabase) {
        window.app.showToast('Supabase client failed to load.', 'error');
        return;
    }
    if (mfaSetupVerifyTotp) mfaSetupVerifyTotp.disabled = true;
    try {
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
            factorId: mfaSetupFactorId,
            code
        });
        if (verifyError) {
            window.app.showToast('Invalid code. Try again.', 'error');
            return;
        }
        window.app.showToast('Security enabled. You can log in now.', 'success');
        closeMfaSetupModal();
        await supabase.auth.signOut();
    } catch (err) {
        window.app.showToast('Verification failed: ' + err.message, 'error');
    } finally {
        if (mfaSetupVerifyTotp) mfaSetupVerifyTotp.disabled = false;
    }
}

async function reenrollMfa() {
    const email = (mfaSetupEmail?.value || '').trim();
    const password = mfaSetupPassword?.value || '';
    const adminCode = (mfaSetupAdminCode?.value || '').trim();
    if (!email || !password) {
        window.app.showToast('Enter your email and password.', 'warn');
        return;
    }
    const adminHash = getAdminCodeHash();
    if (!adminHash) {
        window.app.showToast('Admin code not set.', 'error');
        return;
    }
    const inputHash = await sha256(adminCode);
    if (inputHash !== adminHash) {
        window.app.showToast('Unauthorized setup attempt detected. Access denied.', 'error');
        return;
    }

    const supabase = await loadSupabase();
    if (!supabase) {
        window.app.showToast('Supabase client failed to load.', 'error');
        return;
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signInData?.user) {
        window.app.showToast(signInError?.message || 'Access denied. Please use the email on file.', 'error');
        return;
    }
    const session = signInData?.session || (await supabase.auth.getSession()).data?.session;
    if (!session?.access_token) {
        window.app.showToast('No active session. Confirm your email in Supabase Auth.', 'error');
        return;
    }

    try {
        const friendlyName = `Hurly Authenticator ${Date.now().toString(36)}`;
        const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName
        });
        if (enrollError) throw enrollError;
        const factorId = enrollData?.id || null;
        const secret = enrollData?.totp?.secret || '';
        const qr = enrollData?.totp?.qr_code || enrollData?.totp?.qrCode || null;
        if (!factorId) throw new Error('MFA enroll failed.');
        mfaSetupFactorId = factorId;
        if (mfaSetupQrWrap) {
            if (qr || secret) {
                mfaSetupQrWrap.hidden = false;
                if (mfaSetupQr) {
                    let qrSrc = qr || '';
                    if (!qrSrc && secret) {
                        const issuer = 'Hurly';
                        const label = `Hurly:${email}`;
                        const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}`;
                        qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
                    }
                    mfaSetupQr.src = qrSrc;
                    mfaSetupQr.style.display = qrSrc ? 'block' : 'none';
                }
                if (mfaSetupSecret) {
                    mfaSetupSecret.textContent = secret ? `Manual setup key: ${secret}` : '';
                }
            } else {
                mfaSetupQrWrap.hidden = true;
            }
        }
        window.app.showToast('New authenticator generated. Enter the code to verify.', 'success');
    } catch (err) {
        window.app.showToast('Re-enroll failed: ' + (err.message || err), 'error');
    }
}

(async () => {
    const form = document.querySelector('form');
    if (!form) return;
    if (startMfaSetupBtn) startMfaSetupBtn.addEventListener('click', openMfaSetupModal);
    if (mfaSetupClose) mfaSetupClose.addEventListener('click', closeMfaSetupModal);
    if (mfaSetupCancel) mfaSetupCancel.addEventListener('click', closeMfaSetupModal);
    if (mfaSetupEnroll) mfaSetupEnroll.addEventListener('click', startMfaSetupFlow);
    if (mfaSetupVerifyTotp) mfaSetupVerifyTotp.addEventListener('click', verifyMfaTotpCode);
    if (mfaSetupReenroll) mfaSetupReenroll.addEventListener('click', reenrollMfa);
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        window.dispatchEvent(new CustomEvent('auth:loading', { detail: { state: 'start' } }));
        if (loginButton) {
            loginButton.disabled = true;
            loginButton.textContent = 'Logging in...';
        }
        try {
            const auth = await authenticate(email, password);
            const user = auth?.user || null;
            if (!user) {
                window.app.showToast('Login failed: invalid email or password.', 'error');
                window.dispatchEvent(new CustomEvent('auth:loading', { detail: { state: 'end' } }));
                if (loginButton) {
                    loginButton.disabled = false;
                    loginButton.textContent = 'Log In';
                }
                return;
            }
            window.dispatchEvent(new CustomEvent('auth:loading', { detail: { state: 'end' } }));
            const supabase = auth?.supabase;
            if (!supabase) throw new Error('Supabase client failed to load');
            const mfaOk = await requireMfaEveryLogin(supabase);
            if (!mfaOk) {
                await supabase.auth.signOut();
                window.app.showToast('MFA required to continue.', 'error');
                window.dispatchEvent(new CustomEvent('auth:loading', { detail: { state: 'end' } }));
                if (loginButton) {
                    loginButton.disabled = false;
                    loginButton.textContent = 'Log In';
                }
                return;
            }
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                id: user.id,
                email: user.email,
                role: user.user_metadata?.role || 'user',
                name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
                loginAt: new Date().toISOString()
            }));
            localStorage.removeItem('huly_demo_mode');
            logAudit('login', { email: user.email, role: user.user_metadata?.role || 'user' });
            showLoginSuccess('Login successful');
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('auth:loading', { detail: { state: 'end' } }));
                const before = window.location.href;
                window.location.assign('dashboard.html');
                setTimeout(() => {
                    if (window.location.href === before) {
                        window.app.showToast('Redirect blocked. Use the Continue button.', 'warn');
                        showContinueButton();
                    }
                }, 800);
            }, 900);
        } catch (err) {
            window.app.showToast('Unexpected error: ' + err.message, 'error');
            window.dispatchEvent(new CustomEvent('auth:loading', { detail: { state: 'end' } }));
            if (loginButton) {
                loginButton.disabled = false;
                loginButton.textContent = 'Log In';
            }
        }
    });
})();
