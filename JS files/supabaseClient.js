// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Replace with your Supabase project URL and anon key
const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);