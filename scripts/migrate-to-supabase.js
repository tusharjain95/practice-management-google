const { MongoClient } = require('mongodb');
const { Pool } = require('pg');
require('dotenv').config();

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'ca_practice';
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_URL;

async function migrate() {
  console.log('🚀 Starting MongoDB to Supabase / PostgreSQL Data Migration...');

  if (!MONGO_URL) {
    console.error('❌ Error: MONGO_URL environment variable is missing.');
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL / SUPABASE_DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  console.log(`🔌 Connecting to MongoDB...`);
  const mongoClient = new MongoClient(MONGO_URL);
  await mongoClient.connect();
  const mongoDb = mongoClient.db(DB_NAME);
  console.log('✅ Connected to MongoDB successfully.');

  console.log(`🔌 Connecting to Supabase/PostgreSQL...`);
  const pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('supabase') || DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('.com') ? { rejectUnauthorized: false } : false
  });
  await pgPool.query('SELECT NOW()'); // Verify connection
  console.log('✅ Connected to Supabase/PostgreSQL successfully.');

  const collections = [
    'users',
    'leads',
    'tasks',
    'clients',
    'invoices',
    'payments',
    'settings',
    'quotations',
    'activity_logs',
    'compliances',
    'whatsapp_notifications'
  ];

  for (const colName of collections) {
    const tableName = `tbl_${colName}`;
    console.log(`📦 Migrating collection: "${colName}" -> Table: "${tableName}"...`);

    // 1. Ensure Table Exists
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id VARCHAR(255) PRIMARY KEY,
        org_id VARCHAR(255),
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_org_id ON ${tableName} (org_id);`).catch(() => {});

    // 2. Fetch docs from MongoDB
    const docs = await mongoDb.collection(colName).find({}).toArray();
    console.log(`   Fetched ${docs.length} documents from MongoDB.`);

    if (docs.length === 0) {
      console.log(`   No documents to migrate for ${colName}.`);
      continue;
    }

    // 3. Clear existing table to avoid duplicates or upsert them
    console.log(`   Inserting documents into PostgreSQL...`);
    let count = 0;
    for (const doc of docs) {
      const cleanedDoc = { ...doc };
      delete cleanedDoc._id; // Remove native mongo ObjectId

      const id = doc.id || doc._id?.toString() || Math.random().toString(36).substring(2);
      if (!cleanedDoc.id) cleanedDoc.id = id;
      const orgId = doc.orgId || null;

      await pgPool.query(
        `INSERT INTO ${tableName} (id, org_id, data) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET org_id = $2, data = $3`,
        [id, orgId, JSON.stringify(cleanedDoc)]
      );
      count++;
    }
    console.log(`   Successfully migrated ${count}/${docs.length} documents for ${colName}.`);
  }

  console.log('\n🎉 MongoDB to Supabase migration completed successfully!');
  await mongoClient.close();
  await pgPool.end();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
