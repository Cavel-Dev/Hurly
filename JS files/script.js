// Custom cursor effect on login button
const loginButton = document.querySelector('.login-button');
const cursorHover = document.getElementById('cursorHover');

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

// Supabase config
const SUPABASE_URL = "https://fyqsjyceeebarjuxztqg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cXNqeWNlZWViYXJqdXh6dHFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzQ4MTAsImV4cCI6MjA4MTUxMDgxMH0.LhOoDWcVwU_ht8SKuILFXPU9Gw8CHolAhO8Qgj3BMdI";

// Load Supabase client
const supabaseScript = document.createElement('script');
supabaseScript.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js";
supabaseScript.onload = () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            if (loginButton) {
                loginButton.disabled = true;
                loginButton.textContent = 'Logging in...';
            }
            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) {
                    alert('Login failed: ' + error.message);
                    if (loginButton) {
                        loginButton.disabled = false;
                        loginButton.textContent = 'Log In';
                    }
                } else {
                    window.location.href = 'loading.html';
                }
            } catch (err) {
                alert('Unexpected error: ' + err.message);
                if (loginButton) {
                    loginButton.disabled = false;
                    loginButton.textContent = 'Log In';
                }
            }
        });
    }
};
document.head.appendChild(supabaseScript);
