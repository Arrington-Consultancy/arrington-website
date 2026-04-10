const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./pool');
const defaults = require('./defaults');

const BCRYPT_ROUNDS = 12;

async function seed() {
  console.log('Running database seed...');

  // Create tables
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Tables created/verified.');

  // Seed users (idempotent: ON CONFLICT DO NOTHING)
  const users = [
    { username: 'nat', password: '$caryBee14', role: 'admin' },
    { username: 'tom', password: 'hotwife', role: 'content' }
  ];

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    await db.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING`,
      [user.username, hash, user.role]
    );
  }
  console.log('Users seeded.');

  // Seed content (idempotent: ON CONFLICT DO NOTHING)
  for (const [key, content] of Object.entries(defaults)) {
    await db.query(
      `INSERT INTO content (section_key, content)
       VALUES ($1, $2)
       ON CONFLICT (section_key) DO NOTHING`,
      [key, content]
    );
  }
  console.log(`Content seeded (${Object.keys(defaults).length} keys).`);

  console.log('Seed complete.');
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
