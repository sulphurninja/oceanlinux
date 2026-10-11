/**
 * One-shot: seed (or repair) an admin account.
 * Usage: node scripts/seed-admin.cjs <email> <password>
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Minimal .env loader (dotenv is not a dependency of this project).
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let value = m[2].trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
  }
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}

async function main() {
  const email = (process.argv[2] || '').toLowerCase().trim();
  const password = process.argv[3] || '';
  if (!email || !password) {
    console.error('Usage: node scripts/seed-admin.cjs <email> <password>');
    process.exit(1);
  }

  const uri = process.env.MONGOOSE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGOOSE_URL not found in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const users = mongoose.connection.db.collection('users');

  const hash = await bcrypt.hash(password, 12);
  const now = new Date();

  // Raw driver upsert so the non-schema `role: 'Admin'` field (checked by the
  // admin layout) is persisted alongside the schema fields.
  const result = await users.updateOne(
    { email },
    {
      $set: {
        name: 'Platform Admin',
        email,
        password: hash,
        userType: 'admin',
        role: 'Admin',
        isAdmin: true,
        authProvider: 'local',
        updatedAt: now,
      },
      $setOnInsert: {
        phone: '',
        avatar: '',
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const doc = await users.findOne({ email }, { projection: { password: 0 } });
  console.log(result.upsertedCount ? 'CREATED new admin user' : 'UPDATED existing user to admin');
  console.log(JSON.stringify({ _id: doc._id, email: doc.email, userType: doc.userType, role: doc.role, isAdmin: doc.isAdmin }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
