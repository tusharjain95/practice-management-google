const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'ca_practice';

async function main() {
  if (!MONGO_URL) {
    console.log('[Indexing] MONGO_URL not provided. Skipping real MongoDB index creation (mock DB mode is active).');
    process.exit(0);
  }

  console.log('[Indexing] Connecting to MongoDB...');
  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`[Indexing] Connected to database: "${DB_NAME}". Creating indexes...`);

    // 1. Users
    const users = db.collection('users');
    console.log('  - users.email (unique)...');
    await users.createIndex({ email: 1 }, { unique: true, background: true });

    // 2. Leads
    const leads = db.collection('leads');
    console.log('  - leads compound indexes and text search...');
    await leads.createIndex({ assignedTo: 1, status: 1, createdAt: -1 }, { background: true });
    await leads.createIndex({ followUpDate: 1, assignedTo: 1 }, { background: true });
    await leads.createIndex({ name: 'text', company: 'text', phone: 'text', email: 'text' }, { background: true, name: 'leads_text_search' });

    // 3. Tasks
    const tasks = db.collection('tasks');
    console.log('  - tasks compound indexes and text search...');
    await tasks.createIndex({ assignedTo: 1, status: 1, dueDate: 1 }, { background: true });
    await tasks.createIndex({ status: 1, dueDate: 1 }, { background: true });
    await tasks.createIndex({ needsDiscussion: 1, discussionWith: 1, updatedAt: -1 }, { background: true });
    await tasks.createIndex({ title: 'text', description: 'text', clientName: 'text' }, { background: true, name: 'tasks_text_search' });

    // 4. Clients
    const clients = db.collection('clients');
    console.log('  - clients name index and text search...');
    await clients.createIndex({ name: 1 }, { background: true });
    await clients.createIndex({ name: 'text', company: 'text', phone: 'text', email: 'text', gstin: 'text', pan: 'text' }, { background: true, name: 'clients_text_search' });

    // 5. Invoices
    const invoices = db.collection('invoices');
    console.log('  - invoices indexes...');
    await invoices.createIndex({ clientId: 1, status: 1, createdAt: -1 }, { background: true });
    await invoices.createIndex({ invoiceNumber: 1 }, { unique: true, background: true });

    // 6. Payments
    const payments = db.collection('payments');
    console.log('  - payments indexes...');
    await payments.createIndex({ clientId: 1, invoiceId: 1, date: -1 }, { background: true });

    // 7. Quotations
    const quotations = db.collection('quotations');
    console.log('  - quotations indexes...');
    await quotations.createIndex({ createdBy: 1, createdAt: -1 }, { background: true });
    await quotations.createIndex({ quotationNumber: 1 }, { unique: true, background: true });

    // 8. Activity logs
    const activityLogs = db.collection('activity_logs');
    console.log('  - activity_logs.createdAt...');
    await activityLogs.createIndex({ createdAt: -1 }, { background: true });

    // 9. WhatsApp notifications
    const whatsappNotifications = db.collection('whatsapp_notifications');
    console.log('  - whatsapp_notifications indexes...');
    await whatsappNotifications.createIndex({ recipientUserId: 1, createdAt: -1 }, { background: true });
    await whatsappNotifications.createIndex({ type: 1, createdAt: -1 }, { background: true });
    await whatsappNotifications.createIndex({ status: 1, createdAt: -1 }, { background: true });

    console.log('[Indexing] All indexes created successfully!');
  } catch (error) {
    console.error('[Indexing] Error creating indexes:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
