import fs from 'fs';

const content = fs.readFileSync('mail.txt', 'utf8');
const regex = /"([^"]+)"\s*<([^>]+)>/g;
let match;
const members = [];
const admins = ['DatTM3@fpt.com', 'NamLS2@fpt.com', 'ThanhLT80@fpt.com', 'AnLK2@fpt.com'].map(e => e.toLowerCase());

while ((match = regex.exec(content)) !== null) {
  const fullName = match[1].trim();
  const email = match[2].trim();
  const role = admins.includes(email.toLowerCase()) ? 'admin' : 'user';
  members.push({ fullName, email, role });
}

console.log('Total members parsed:', members.length);
console.log('Admins found:', members.filter(m => m.role === 'admin'));
console.log('Total users:', members.filter(m => m.role === 'user').length);
