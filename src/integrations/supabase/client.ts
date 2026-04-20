import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://yifxgiwmibjaornighvt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZnhnaXdtaWJqYW9ybmlnaHZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjMxNTgsImV4cCI6MjA4NzQzOTE1OH0.XXG4TypXvwhB8EFW63zfBXq4fn03dJ4g73ty9Tzco90';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
