require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // your Postgres URL from Neon
  ssl: {
    rejectUnauthorized: false
  }
});

const promotionsTable = 'promotions';
const samplePromotions = [
  {
    title: 'Welcome Bonus',
    description: 'Get 20% off your first purchase',
    code: 'WELCOME20',
    type: 'percentage',
    discountValue: 20
  },
  {
    title: 'Holiday Special',
    description: '$10 off orders over $50',
    code: 'HOLIDAY10',
    type: 'fixed',
    discountValue: 10
  },
  {
    title: 'Bot Hosting Promo',
    description: '3 months for the price of 2',
    code: 'BOT3FOR2',
    type: 'custom',
    discountValue: 33.33
  }
];

async function initDB() {
  try {
    console.log('Initializing Postgres DB...');

    // 1️⃣ Create table schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${promotionsTable} (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        discountValue NUMERIC NOT NULL
      );
    `);

    // 2️⃣ Insert sample data
    for (const promo of samplePromotions) {
      await pool.query(`
        INSERT INTO ${promotionsTable} (title, description, code, type, discountValue)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO NOTHING;
      `, [promo.title, promo.description, promo.code, promo.type, promo.discountValue]);
      console.log(`Inserted promo ${promo.code}`);
    }

    console.log('Database initialized successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

initDB();
