// Supabase Configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ymbvqbeosxiaxzlkknqy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltYnZxYmVvc3hpYXh6bGtrbnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzODIxMTAsImV4cCI6MjA5Nzk1ODExMH0.d2mDVgFJkR-9luw8SnK0zXF467ZZOrOBZjdi_Smmfsc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
