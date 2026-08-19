import fs from 'fs';
import { supabaseAdmin } from '../backend/src/config/supabase.js';

const DEFAULT_PASSWORD = 'Fpt@123456';
const ADMIN_EMAILS = [
  'DatTM3@fpt.com',
  'NamLS2@fpt.com',
  'ThanhLT80@fpt.com',
  'AnLK2@fpt.com'
].map(e => e.toLowerCase());

async function seedUsers() {
  console.log('🚀 Đang đọc danh sách thành viên từ mail.txt...');
  const content = fs.readFileSync('mail.txt', 'utf8');
  const regex = /"([^"]+)"\s*<([^>]+)>/g;
  let match;
  const members = [];

  while ((match = regex.exec(content)) !== null) {
    const fullName = match[1].trim();
    const email = match[2].trim();
    const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user';
    members.push({ fullName, email, role });
  }

  console.log(`📋 Tổng số thành viên tìm thấy: ${members.length}`);
  console.log(`👑 Số lượng Admin: ${members.filter(m => m.role === 'admin').length}`);
  console.log(`👁️ Số lượng User (Chỉ xem): ${members.filter(m => m.role === 'user').length}\n`);

  console.log('🔄 Đang lấy danh sách tài khoản hiện có trên Supabase...');
  const { data: existingUsersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (listErr) {
    console.error('❌ Lỗi lấy danh sách user từ Supabase:', listErr);
    return;
  }

  const existingMap = new Map(
    existingUsersData.users.map(u => [u.email?.toLowerCase(), u])
  );

  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (const member of members) {
    const lowerEmail = member.email.toLowerCase();
    const existing = existingMap.get(lowerEmail);

    if (!existing) {
      // Tạo mới tài khoản
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: member.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: member.fullName,
          role: member.role
        },
        app_metadata: {
          role: member.role
        }
      });

      if (error) {
        console.error(`❌ Lỗi tạo ${member.email}:`, error.message);
        errorCount++;
      } else {
        console.log(`✅ Đã tạo mới: ${member.email} [${member.role.toUpperCase()}] (${member.fullName})`);
        createdCount++;

        // Thử insert vào public.profiles nếu bảng tồn tại
        try {
          await supabaseAdmin.from('profiles').upsert({
            id: data.user.id,
            email: member.email,
            full_name: member.fullName,
            role: member.role
          });
        } catch (_) {}
      }
    } else {
      // Cập nhật metadata vai trò và họ tên
      const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        user_metadata: {
          ...existing.user_metadata,
          full_name: member.fullName,
          role: member.role
        },
        app_metadata: {
          ...existing.app_metadata,
          role: member.role
        }
      });

      if (error) {
        console.error(`❌ Lỗi cập nhật ${member.email}:`, error.message);
        errorCount++;
      } else {
        console.log(`🔄 Đã cập nhật: ${member.email} [${member.role.toUpperCase()}] (${member.fullName})`);
        updatedCount++;

        try {
          await supabaseAdmin.from('profiles').upsert({
            id: existing.id,
            email: member.email,
            full_name: member.fullName,
            role: member.role
          });
        } catch (_) {}
      }
    }
  }

  console.log('\n==================================================');
  console.log(`🎉 HOÀN TẤT ĐỒNG BỘ TÀI KHOẢN PHÒNG BAN:`);
  console.log(`   - Tạo mới: ${createdCount}`);
  console.log(`   - Cập nhật: ${updatedCount}`);
  console.log(`   - Lỗi: ${errorCount}`);
  console.log(`   - Mật khẩu mặc định: ${DEFAULT_PASSWORD}`);
  console.log('==================================================\n');
}

seedUsers().catch(err => {
  console.error('❌ Lỗi không xác định:', err);
});
