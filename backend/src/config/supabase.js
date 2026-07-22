import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Đọc file .env ở thư mục gốc của project (nếu chạy từ backend)
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
// Dự phòng đọc trực tiếp (nếu được copy vào cùng thư mục)
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing Supabase credentials in .env');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
