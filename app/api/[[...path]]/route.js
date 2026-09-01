import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { getPostgresDb } from '@/lib/db/postgres';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import {
  sendTaskAssignedWhatsApp,
  sendTaskReassignedWhatsApp,
  sendTaskDiscussionWhatsApp,
  sendDailyRosterPdfWhatsApp,
  generateRosterPdfBuffer,
  sendWhatsAppTemplateMessage,
  logNotification,
  sendTestWhatsApp,
  sendTaskCommentWhatsApp,
  sendLeadNoteWhatsApp
} from '@/lib/whatsapp/client';
import {
  sendTaskAssignedTelegram,
  sendTaskReassignedTelegram,
  sendTaskDiscussionTelegram,
  sendLeadAssignedTelegram,
  sendLeadReassignedTelegram,
  getBotUsername,
  sendTestTelegram,
  sendDailyRosterTelegram,
  sendTaskCommentTelegram,
  sendLeadNoteTelegram,
  sendDepartmentTaskAssignedTelegram,
  sendDepartmentReminderTelegram,
  sendDepartmentCommentTelegram,
  processDepartmentReminders
} from '@/lib/telegram/client';

export const runtime = 'nodejs';
export const preferredRegion = 'sin1';

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'ca_practice';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

let cached = global._mongo;
if (!cached) cached = global._mongo = { client: null, db: null, promise: null };

const DB_FILE = '/memory/db.json';

function ensureDbDir() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    console.error('Error creating mock DB directory:', e);
  }
}

function readDbFile() {
  ensureDbDir();
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading mock DB file:', e);
  }
  return {};
}

function writeDbFile(data) {
  ensureDbDir();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing mock DB file:', e);
  }
}

function getNestedValue(obj, key) {
  if (obj === undefined || obj === null) return undefined;
  if (!key.includes('.')) {
    return obj[key];
  }
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current)) {
      const restPath = parts.slice(i).join('.');
      const results = [];
      for (const item of current) {
        const val = getNestedValue(item, restPath);
        if (val !== undefined) {
          if (Array.isArray(val)) {
            results.push(...val);
          } else {
            results.push(val);
          }
        }
      }
      return results.length > 0 ? results : undefined;
    }
    current = current[part];
  }
  return current;
}

function evaluateValueMatch(docValue, queryValue) {
  if (queryValue instanceof RegExp || (queryValue && typeof queryValue.test === 'function')) {
    if (Array.isArray(docValue)) {
      return docValue.some(v => typeof v === 'string' && queryValue.test(v));
    }
    return typeof docValue === 'string' && queryValue.test(docValue);
  }

  if (Array.isArray(queryValue)) {
    if (Array.isArray(docValue)) {
      if (docValue.length !== queryValue.length) return false;
      return docValue.every((v, i) => v === queryValue[i]);
    }
    return false;
  }

  if (queryValue && typeof queryValue === 'object') {
    const keys = Object.keys(queryValue);
    const hasOp = keys.some(k => k.startsWith('$'));
    if (hasOp) {
      for (const op of keys) {
        const val = queryValue[op];
        if (op === '$ne') {
          if (Array.isArray(docValue)) {
            if (docValue.includes(val)) return false;
          } else {
            if (docValue === val) return false;
          }
        } else if (op === '$eq') {
          if (Array.isArray(docValue)) {
            if (!docValue.includes(val)) return false;
          } else {
            if (docValue !== val) return false;
          }
        } else if (op === '$gt') {
          if (Array.isArray(docValue)) {
            if (!docValue.some(v => v > val)) return false;
          } else {
            if (!(docValue > val)) return false;
          }
        } else if (op === '$gte') {
          if (Array.isArray(docValue)) {
            if (!docValue.some(v => v >= val)) return false;
          } else {
            if (!(docValue >= val)) return false;
          }
        } else if (op === '$lt') {
          if (Array.isArray(docValue)) {
            if (!docValue.some(v => v < val)) return false;
          } else {
            if (!(docValue < val)) return false;
          }
        } else if (op === '$lte') {
          if (Array.isArray(docValue)) {
            if (!docValue.some(v => v <= val)) return false;
          } else {
            if (!(docValue <= val)) return false;
          }
        } else if (op === '$in') {
          if (!Array.isArray(val)) return false;
          if (Array.isArray(docValue)) {
            if (!docValue.some(v => val.includes(v))) return false;
          } else {
            if (!val.includes(docValue)) return false;
          }
        } else if (op === '$nin') {
          if (!Array.isArray(val)) return false;
          if (Array.isArray(docValue)) {
            if (docValue.some(v => val.includes(v))) return false;
          } else {
            if (val.includes(docValue)) return false;
          }
        } else if (op === '$regex') {
          const options = queryValue['$options'] || '';
          try {
            const rx = new RegExp(val, options);
            if (Array.isArray(docValue)) {
              if (!docValue.some(v => typeof v === 'string' && rx.test(v))) return false;
            } else {
              if (typeof docValue !== 'string' || !rx.test(docValue)) return false;
            }
          } catch {
            return false;
          }
        } else if (op === '$options') {
          // Handled in $regex
          continue;
        } else if (op === '$exists') {
          const exists = docValue !== undefined;
          if (exists !== !!val) return false;
        }
      }
      return true;
    }
  }

  if (Array.isArray(docValue)) {
    return docValue.includes(queryValue);
  }
  return docValue === queryValue;
}

function matchQuery(doc, query) {
  if (!query) return true;
  for (const key of Object.keys(query)) {
    if (key === '$or') {
      const orArray = query[key];
      if (!Array.isArray(orArray)) continue;
      let matchedAny = false;
      for (const subQuery of orArray) {
        if (matchQuery(doc, subQuery)) {
          matchedAny = true;
          break;
        }
      }
      if (!matchedAny) return false;
      continue;
    }
    
    if (key === '$and') {
      const andArray = query[key];
      if (!Array.isArray(andArray)) continue;
      for (const subQuery of andArray) {
        if (!matchQuery(doc, subQuery)) {
          return false;
        }
      }
      continue;
    }
    
    const docValue = getNestedValue(doc, key);
    const queryValue = query[key];
    
    if (!evaluateValueMatch(docValue, queryValue)) {
      return false;
    }
  }
  return true;
}

function applyUpdate(doc, updateSpec) {
  if (!updateSpec) return doc;
  
  if (updateSpec.$set) {
    for (const k of Object.keys(updateSpec.$set)) {
      doc[k] = updateSpec.$set[k];
    }
  }
  
  if (updateSpec.$pull) {
    for (const k of Object.keys(updateSpec.$pull)) {
      const valToPull = updateSpec.$pull[k];
      if (Array.isArray(doc[k])) {
        doc[k] = doc[k].filter(item => {
          if (valToPull && typeof valToPull === 'object') {
            const keys = Object.keys(valToPull);
            const hasOp = keys.some(key => key.startsWith('$'));
            if (hasOp) {
              return !evaluateValueMatch(item, valToPull);
            } else {
              if (item && typeof item === 'object') {
                return !matchQuery(item, valToPull);
              }
            }
          }
          return item !== valToPull;
        });
      }
    }
  }

  if (updateSpec.$push) {
    for (const k of Object.keys(updateSpec.$push)) {
      const valToPush = updateSpec.$push[k];
      if (!Array.isArray(doc[k])) {
        doc[k] = [];
      }
      doc[k].push(valToPush);
    }
  }
  
  return doc;
}

function getMockDb() {
  const collection = (collectionName) => {
    return {
      async findOne(query, options = {}) {
        const data = readDbFile();
        const docs = data[collectionName] || [];
        const found = docs.find(doc => matchQuery(doc, query));
        if (!found) return null;
        
        let result = { ...found };
        if (options.projection) {
          if (options.projection._id === 0) delete result._id;
        }
        return result;
      },
      
      find(query) {
        const data = readDbFile();
        const docs = data[collectionName] || [];
        let filtered = docs.filter(doc => matchQuery(doc, query));
        
        let sortSpec = null;
        let limitVal = null;
        let skipVal = null;
        let projSpec = null;
        
        const cursor = {
          project(proj) {
            projSpec = proj;
            return cursor;
          },
          sort(spec) {
            sortSpec = spec;
            return cursor;
          },
          limit(n) {
            limitVal = n;
            return cursor;
          },
          skip(n) {
            skipVal = n;
            return cursor;
          },
          async toArray() {
            let res = [...filtered];
            
            if (sortSpec) {
              const keys = Object.keys(sortSpec);
              if (keys.length > 0) {
                const key = keys[0];
                const dir = sortSpec[key];
                res.sort((a, b) => {
                  const valA = a[key] ?? '';
                  const valB = b[key] ?? '';
                  if (valA < valB) return -1 * dir;
                  if (valA > valB) return 1 * dir;
                  return 0;
                });
              }
            }
            
            if (skipVal !== null) {
              res = res.slice(skipVal);
            }
            if (limitVal !== null) {
              res = res.slice(0, limitVal);
            }
            
            if (projSpec) {
              res = res.map(doc => {
                const copy = { ...doc };
                if (projSpec._id === 0) delete copy._id;
                const projKeys = Object.keys(projSpec);
                if (projKeys.some(k => k !== '_id' && projSpec[k] === 1)) {
                  const clean = {};
                  if (projSpec._id !== 0 && copy._id !== undefined) clean._id = copy._id;
                  for (const k of projKeys) {
                    if (k !== '_id' && projSpec[k] === 1) {
                      clean[k] = copy[k];
                    }
                  }
                  return clean;
                } else if (projKeys.some(k => k !== '_id' && projSpec[k] === 0)) {
                  for (const k of projKeys) {
                    if (k !== '_id' && projSpec[k] === 0) {
                      delete copy[k];
                    }
                  }
                }
                return copy;
              });
            }
            
            return res;
          }
        };
        return cursor;
      },
      
      async insertOne(doc) {
        const data = readDbFile();
        if (!data[collectionName]) data[collectionName] = [];
        const copy = { _id: uuidv4(), ...doc };
        data[collectionName].push(copy);
        writeDbFile(data);
        return { insertedId: copy._id };
      },
      
      async insertMany(docs) {
        const data = readDbFile();
        if (!data[collectionName]) data[collectionName] = [];
        const insertedIds = [];
        for (const doc of docs) {
          const copy = { _id: uuidv4(), ...doc };
          data[collectionName].push(copy);
          insertedIds.push(copy._id);
        }
        writeDbFile(data);
        return { insertedIds };
      },
      
      async updateOne(query, updateSpec, options = {}) {
        const data = readDbFile();
        const docs = data[collectionName] || [];
        let foundIdx = docs.findIndex(doc => matchQuery(doc, query));
        if (foundIdx >= 0) {
          docs[foundIdx] = applyUpdate(docs[foundIdx], updateSpec);
        } else if (options.upsert) {
          let newDoc = { ...query };
          newDoc = applyUpdate(newDoc, updateSpec);
          if (!newDoc._id) newDoc._id = uuidv4();
          docs.push(newDoc);
        } else {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        data[collectionName] = docs;
        writeDbFile(data);
        return { matchedCount: 1, modifiedCount: 1 };
      },
      
      async updateMany(query, updateSpec, options = {}) {
        const data = readDbFile();
        const docs = data[collectionName] || [];
        let modifiedCount = 0;
        let matchedCount = 0;
        for (let i = 0; i < docs.length; i++) {
          if (matchQuery(docs[i], query)) {
            matchedCount++;
            docs[i] = applyUpdate(docs[i], updateSpec);
            modifiedCount++;
          }
        }
        data[collectionName] = docs;
        writeDbFile(data);
        return { matchedCount, modifiedCount };
      },
      
      async deleteOne(query) {
        const data = readDbFile();
        const docs = data[collectionName] || [];
        let foundIdx = docs.findIndex(doc => matchQuery(doc, query));
        if (foundIdx >= 0) {
          docs.splice(foundIdx, 1);
          data[collectionName] = docs;
          writeDbFile(data);
          return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
      },
      
      async deleteMany(query) {
        const data = readDbFile();
        const docs = data[collectionName] || [];
        const initialCount = docs.length;
        const kept = docs.filter(doc => !matchQuery(doc, query));
        data[collectionName] = kept;
        writeDbFile(data);
        return { deletedCount: initialCount - kept.length };
      },
      
      async countDocuments(query = {}) {
        const data = readDbFile();
        const docs = data[collectionName] || [];
        const filtered = docs.filter(doc => matchQuery(doc, query));
        return filtered.length;
      }
    };
  };
  
  return { collection };
}

async function ensureIndexes(db) {
  if (cached.indexesCreated) return;
  try {
    // Check if real MongoDB client is used
    if (!MONGO_URL) return;
    
    await Promise.all([
      db.collection('users').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('users').createIndex({ email: 1 }).catch(() => {}),
      db.collection('users').createIndex({ "orgs.orgId": 1 }).catch(() => {}),
      
      db.collection('leads').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('leads').createIndex({ orgId: 1 }).catch(() => {}),
      db.collection('leads').createIndex({ assignedTo: 1 }).catch(() => {}),
      db.collection('leads').createIndex({ status: 1 }).catch(() => {}),
      db.collection('leads').createIndex({ followUpDate: 1 }).catch(() => {}),

      db.collection('tasks').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('tasks').createIndex({ orgId: 1 }).catch(() => {}),
      db.collection('tasks').createIndex({ assignedTo: 1 }).catch(() => {}),
      db.collection('tasks').createIndex({ status: 1 }).catch(() => {}),
      db.collection('tasks').createIndex({ dueDate: 1 }).catch(() => {}),

      db.collection('clients').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('clients').createIndex({ orgId: 1 }).catch(() => {}),

      db.collection('invoices').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('invoices').createIndex({ orgId: 1 }).catch(() => {}),
      db.collection('invoices').createIndex({ clientId: 1 }).catch(() => {}),
      db.collection('invoices').createIndex({ status: 1 }).catch(() => {}),

      db.collection('payments').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('payments').createIndex({ orgId: 1 }).catch(() => {}),
      db.collection('payments').createIndex({ invoiceId: 1 }).catch(() => {}),
      db.collection('payments').createIndex({ clientId: 1 }).catch(() => {}),

      db.collection('ledger_adjustments').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('ledger_adjustments').createIndex({ orgId: 1 }).catch(() => {}),
      db.collection('ledger_adjustments').createIndex({ clientId: 1 }).catch(() => {}),

      db.collection('settings').createIndex({ id: 1, orgId: 1 }).catch(() => {}),

      db.collection('quotations').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('quotations').createIndex({ orgId: 1 }).catch(() => {}),

      db.collection('activity_logs').createIndex({ orgId: 1 }).catch(() => {}),
      db.collection('activity_logs').createIndex({ createdAt: -1 }).catch(() => {}),

      db.collection('compliances').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('whatsapp_notifications').createIndex({ orgId: 1 }).catch(() => {})
    ]);
    cached.indexesCreated = true;
    console.log('[AI Studio] MongoDB database indexes ensured successfully.');
  } catch (err) {
    console.error('[AI Studio] Failed to ensure database indexes:', err);
  }
}

async function getDb() {
  if (cached.db) return cached.db;
  
  const pgUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_URL;
  if (pgUrl) {
    console.log('[AI Studio] Connecting to Supabase/PostgreSQL database...');
    try {
      cached.db = await getPostgresDb(pgUrl);
      await seedAdmin(cached.db);
      console.log('[AI Studio] Connected to Supabase/PostgreSQL successfully!');
      return cached.db;
    } catch (err) {
      console.error('[AI Studio] Failed to connect to Supabase/PostgreSQL database:', err);
    }
  }

  if (!MONGO_URL) {
    console.warn('[AI Studio] MONGO_URL not provided, using JSON-fallback mock db.');
    cached.db = getMockDb();
    await seedAdmin(cached.db);
    return cached.db;
  }
  if (!cached.promise) {
    cached.promise = MongoClient.connect(MONGO_URL).then(client => {
      cached.client = client;
      return client.db(DB_NAME);
    });
  }
  try {
    cached.db = await cached.promise;
    await seedAdmin(cached.db);
    await ensureIndexes(cached.db);
    return cached.db;
  } catch (err) {
    console.warn('[AI Studio] Failed to connect to MongoDB, using JSON-fallback mock db.', err);
    cached.promise = null; // Reset to allow retry
    cached.db = getMockDb();
    await seedAdmin(cached.db);
    return cached.db;
  }
}

async function seedAdmin(db) {
  const users = db.collection('users');
  const existing = await users.findOne({ email: 'admin@ca.com' });
  if (!existing) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await users.insertOne({
      id: uuidv4(),
      email: 'admin@ca.com',
      passwordHash,
      name: 'Admin User',
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString(),
    });
    // Seed a manager and staff
    const mgrHash = await bcrypt.hash('manager123', 10);
    await users.insertOne({
      id: uuidv4(), email: 'manager@ca.com', passwordHash: mgrHash,
      name: 'Priya Manager', role: 'manager', active: true,
      createdAt: new Date().toISOString(),
    });
    const staffHash = await bcrypt.hash('staff123', 10);
    await users.insertOne({
      id: uuidv4(), email: 'staff@ca.com', passwordHash: staffHash,
      name: 'Rahul Staff', role: 'staff', active: true,
      createdAt: new Date().toISOString(),
    });
  }
}

function getPaginationParams(searchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  let limit = parseInt(searchParams.get('limit') || '25', 10);
  if (isNaN(limit) || limit <= 0) limit = 25;
  if (limit > 50) limit = 50;
  return { page, limit };
}

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function getToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function verifyAuth(request) {
  const token = getToken(request);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function logActivity(db, user, action, entity, entityId, details = {}) {
  return db.collection('activity_logs').insertOne({
    id: uuidv4(),
    orgId: user?.activeOrgId,
    userId: user?.id, userName: user?.name,
    action, entity, entityId, details,
    createdAt: new Date().toISOString(),
  });
}

// ============ HANDLERS ============

async function handle(request, ctx) {
  try {
    const db = await getDb();
    const params = await ctx.params;
    const path = params?.path || [];
    const route = path.join('/');
    const method = request.method;
    const url = new URL(request.url);

    // -------- AUTH --------
    if (route === 'auth/login' && method === 'POST') {
      const { email, password } = await request.json();
      const user = await db.collection('users').findOne({ email: (email || '').toLowerCase().trim() });
      if (!user) return json({ error: 'Invalid credentials' }, 401);
      const ok = await bcrypt.compare(password || '', user.passwordHash);
      if (!ok) return json({ error: 'Invalid credentials' }, 401);
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
      return json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions || {} },
      });
    }

    if (route === 'auth/me' && method === 'GET') {
      const decoded = verifyAuth(request);
      if (!decoded) return json({ error: 'Unauthorized' }, 401);
      const me = await db.collection('users').findOne({ id: decoded.id });
      if (!me) return json({ error: 'Unauthorized' }, 401);

      if (!me.orgs || me.orgs.length === 0) {
        const defaultOrgId = uuidv4();
        const defaultOrgName = me.name ? `${me.name}'s Org` : "Default Org";
        const newOrg = {
          id: defaultOrgId,
          name: defaultOrgName,
          createdBy: me.id,
          createdAt: new Date().toISOString()
        };
        await db.collection('organisations').insertOne(newOrg);

        const initialOrgs = [{ orgId: defaultOrgId, role: 'admin' }];
        await db.collection('users').updateOne({ id: me.id }, { $set: { orgs: initialOrgs } });
        me.orgs = initialOrgs;
      } else {
        // Self-healing check for GUI-restored backups: make sure listed orgs actually exist
        for (const orgMembership of me.orgs) {
          const orgId = orgMembership.orgId;
          if (orgId) {
            const orgExists = await db.collection('organisations').findOne({ id: orgId });
            if (!orgExists) {
              console.log(`[AI Studio] Org ${orgId} from user profile not found. Auto-creating fallback record...`);
              const fallbackOrg = {
                id: orgId,
                name: me.name ? `${me.name}'s Org` : "Default Org",
                createdBy: me.id,
                createdAt: new Date().toISOString()
              };
              await db.collection('organisations').insertOne(fallbackOrg);
            }
          }
        }
      }

      // Always ensure all existing unassociated records are associated to the user's default organization
      if (me.orgs && me.orgs.length > 0) {
        const defaultOrgId = me.orgs[0].orgId;
        const unassignedFilter = { $or: [{ orgId: { $exists: false } }, { orgId: null }, { orgId: "" }] };
        await db.collection('leads').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('tasks').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('clients').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('invoices').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('quotations').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('payments').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('settings').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('compliances').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('activity_logs').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
        await db.collection('whatsapp_notifications').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      }

      let activeOrgId = request.headers.get('x-org-id');
      let orgMembership = (Array.isArray(me.orgs) && me.orgs.length > 0)
        ? me.orgs.find(o => o.orgId === activeOrgId)
        : null;
      if (!orgMembership) {
        activeOrgId = (Array.isArray(me.orgs) && me.orgs.length > 0) ? me.orgs[0].orgId : null;
        orgMembership = (Array.isArray(me.orgs) && me.orgs.length > 0) ? me.orgs[0] : null;
      }

      const botUsername = await getBotUsername();
      return json({
        user: {
          id: me.id,
          email: me.email,
          name: me.name,
          role: orgMembership ? orgMembership.role : me.role || 'staff',
          activeOrgId: activeOrgId,
          orgs: me.orgs || [],
          permissions: me.permissions || {},
          whatsappNumber: me.whatsappNumber || '',
          whatsappOptIn: !!me.whatsappOptIn,
          whatsappNotificationsEnabled: !!me.whatsappNotificationsEnabled,
          dailyRosterEnabled: !!me.dailyRosterEnabled,
          telegramChatId: me.telegramChatId || '',
          telegramOptIn: !!me.telegramOptIn,
          telegramNotificationsEnabled: !!me.telegramNotificationsEnabled,
          telegramDailyRosterEnabled: !!me.telegramDailyRosterEnabled,
          telegramBotUsername: botUsername,
        }
      });
    }

    // Change own password
    if (route === 'auth/change-password' && method === 'POST') {
      const u = verifyAuth(request);
      if (!u) return json({ error: 'Unauthorized' }, 401);
      const { currentPassword, newPassword } = await request.json();
      if (!newPassword || newPassword.length < 6) {
        return json({ error: 'New password must be at least 6 characters' }, 400);
      }
      const user = await db.collection('users').findOne({ id: u.id });
      if (!user) return json({ error: 'User not found' }, 404);
      const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
      if (!ok) return json({ error: 'Current password is incorrect' }, 401);
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await db.collection('users').updateOne({ id: u.id }, { $set: { passwordHash, updatedAt: new Date().toISOString() } });
      logActivity(db, u, 'change_password', 'user', u.id);
      return json({ ok: true });
    }

    // Update own profile (including email, name, password, whatsapp, telegram)
    if (route === 'auth/profile' && method === 'POST') {
      const u = verifyAuth(request);
      if (!u) return json({ error: 'Unauthorized' }, 401);
      const body = await request.json();
      const { email, name, currentPassword, newPassword } = body;
      const user = await db.collection('users').findOne({ id: u.id });
      if (!user) return json({ error: 'User not found' }, 404);

      let updatedEmail = user.email;
      if (email && email.toLowerCase().trim() !== user.email) {
        const cleanEmail = email.toLowerCase().trim();
        const exists = await db.collection('users').findOne({ email: cleanEmail, id: { $ne: u.id } });
        if (exists) return json({ error: 'Email already exists' }, 400);
        updatedEmail = cleanEmail;
      }

      const update = {
        name: name || user.name,
        email: updatedEmail,
        updatedAt: new Date().toISOString()
      };

      if (body.whatsappNumber !== undefined) update.whatsappNumber = body.whatsappNumber;
      if (body.whatsappOptIn !== undefined) update.whatsappOptIn = !!body.whatsappOptIn;
      if (body.whatsappNotificationsEnabled !== undefined) update.whatsappNotificationsEnabled = !!body.whatsappNotificationsEnabled;
      if (body.dailyRosterEnabled !== undefined) update.dailyRosterEnabled = !!body.dailyRosterEnabled;

      if (body.telegramChatId !== undefined) update.telegramChatId = body.telegramChatId;
      if (body.telegramOptIn !== undefined) update.telegramOptIn = !!body.telegramOptIn;
      if (body.telegramNotificationsEnabled !== undefined) update.telegramNotificationsEnabled = !!body.telegramNotificationsEnabled;
      if (body.telegramDailyRosterEnabled !== undefined) update.telegramDailyRosterEnabled = !!body.telegramDailyRosterEnabled;

      if (newPassword) {
        if (!currentPassword) {
          return json({ error: 'Current password is required to set a new password' }, 400);
        }
        const ok = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!ok) return json({ error: 'Current password is incorrect' }, 401);
        if (newPassword.length < 6) {
          return json({ error: 'New password must be at least 6 characters' }, 400);
        }
        update.passwordHash = await bcrypt.hash(newPassword, 10);
      }

      await db.collection('users').updateOne({ id: u.id }, { $set: update });

      const botUsername = await getBotUsername();
      const updatedUser = {
        id: user.id,
        email: updatedEmail,
        name: update.name,
        role: user.role,
        permissions: user.permissions || {},
        orgs: user.orgs || [],
        activeOrgId: user.activeOrgId || null,
        whatsappNumber: update.whatsappNumber !== undefined ? update.whatsappNumber : user.whatsappNumber,
        whatsappOptIn: update.whatsappOptIn !== undefined ? update.whatsappOptIn : user.whatsappOptIn,
        whatsappNotificationsEnabled: update.whatsappNotificationsEnabled !== undefined ? update.whatsappNotificationsEnabled : user.whatsappNotificationsEnabled,
        dailyRosterEnabled: update.dailyRosterEnabled !== undefined ? update.dailyRosterEnabled : user.dailyRosterEnabled,
        telegramChatId: update.telegramChatId !== undefined ? update.telegramChatId : user.telegramChatId,
        telegramOptIn: update.telegramOptIn !== undefined ? update.telegramOptIn : user.telegramOptIn,
        telegramNotificationsEnabled: update.telegramNotificationsEnabled !== undefined ? update.telegramNotificationsEnabled : user.telegramNotificationsEnabled,
        telegramDailyRosterEnabled: update.telegramDailyRosterEnabled !== undefined ? update.telegramDailyRosterEnabled : user.telegramDailyRosterEnabled,
        telegramBotUsername: botUsername,
      };
      const token = jwt.sign(updatedUser, JWT_SECRET, { expiresIn: '7d' });

      logActivity(db, u, 'update_profile', 'user', u.id, { name: update.name, email: updatedEmail });

      return json({ ok: true, user: updatedUser, token });
    }

    // Send a test Telegram notification
    if (route === 'auth/test-telegram' && method === 'POST') {
      const u = verifyAuth(request);
      if (!u) return json({ error: 'Unauthorized' }, 401);
      const { telegramChatId } = await request.json();
      if (!telegramChatId) {
        return json({ error: 'Telegram Chat ID is required' }, 400);
      }
      const result = await sendTestTelegram(telegramChatId);
      if (result.success) {
        return json({ ok: true, message: 'Test message sent successfully!' });
      } else {
        return json({ error: result.error || 'Failed to send test message. Check if your bot token is correct and you have clicked /start in the bot.' }, 500);
      }
    }

    // Send a test WhatsApp notification
    if (route === 'auth/test-whatsapp' && method === 'POST') {
      const u = verifyAuth(request);
      if (!u) return json({ error: 'Unauthorized' }, 401);
      const { whatsappNumber } = await request.json();
      if (!whatsappNumber) {
        return json({ error: 'WhatsApp number is required' }, 400);
      }
      const result = await sendTestWhatsApp(whatsappNumber, u.name);
      if (result.success) {
        return json({ ok: true, message: 'Test WhatsApp message sent successfully!' });
      } else {
        return json({ error: result.error || 'Failed to send test message. Check your Meta credentials and templates.' }, 500);
      }
    }

    // -------- MANUALLY GENERATE AND SEND DAILY ROSTER --------
    if (route === 'auth/send-manual-roster' && method === 'POST') {
      const u = verifyAuth(request);
      if (!u) return json({ error: 'Unauthorized' }, 401);

      let targetUserId = null;
      try {
        const body = await request.json();
        targetUserId = body?.targetUserId;
      } catch {}

      // Determine user to process
      let targetUser = null;
      if (targetUserId) {
        // If passing targetUserId, caller must be admin or requesting themselves
        if (u.role !== 'admin' && u.id !== targetUserId) {
          return json({ error: 'Forbidden' }, 403);
        }
        targetUser = await db.collection('users').findOne({ id: targetUserId });
      } else {
        targetUser = await db.collection('users').findOne({ id: u.id });
      }

      if (!targetUser) {
        return json({ error: 'User not found' }, 404);
      }

      // Check if they have daily roster enabled or opt-in configured
      const hasWhatsApp = !!(targetUser.whatsappOptIn && targetUser.whatsappNumber);
      const hasTelegram = !!(targetUser.telegramOptIn && targetUser.telegramChatId);

      if (!hasWhatsApp && !hasTelegram) {
        return json({ error: 'User has no configured and active notification channels (WhatsApp or Telegram)' }, 400);
      }

      // Setup Dates (IST / Asia/Kolkata timezone)
      const today = new Date();
      const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
      const formatter = new Intl.DateTimeFormat('en-CA', options); // returns YYYY-MM-DD
      const dateStr = formatter.format(today);

      // Yesterday date calculation
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = formatter.format(yesterday);

      const orgIds = (targetUser.orgs || []).map(o => o.orgId);

      // Fetch Yesterday's Performance Statistics (incorporating milestones)
      const completedYesterdayCount = await db.collection('tasks').countDocuments({
        orgId: { $in: orgIds },
        $or: [
          { assignedTo: targetUser.id },
          { assignees: targetUser.id },
          { 'milestones.assignedTo': targetUser.id },
          { 'milestones.assignees': targetUser.id }
        ],
        status: 'Completed',
        updatedAt: { $regex: '^' + yesterdayStr }
      });

      const openedYesterdayCount = await db.collection('tasks').countDocuments({
        orgId: { $in: orgIds },
        createdBy: targetUser.id,
        createdAt: { $regex: '^' + yesterdayStr }
      });

      const assignedYesterdayCount = await db.collection('tasks').countDocuments({
        orgId: { $in: orgIds },
        $or: [
          { assignedTo: targetUser.id },
          { assignees: targetUser.id },
          { 'milestones.assignedTo': targetUser.id },
          { 'milestones.assignees': targetUser.id }
        ],
        createdAt: { $regex: '^' + yesterdayStr }
      });

      // Current workload counts (including milestone tasks)
      const pendingTasks = await db.collection('tasks').find({
        orgId: { $in: orgIds },
        $or: [
          { assignedTo: targetUser.id },
          { assignees: targetUser.id },
          { 'milestones.assignedTo': targetUser.id },
          { 'milestones.assignees': targetUser.id }
        ],
        status: { $ne: 'Completed' }
      }).toArray();

      const pendingCount = pendingTasks.length;
      const overdueCount = pendingTasks.filter(t => t.dueDate && t.dueDate < dateStr).length;
      const dueTodayCount = pendingTasks.filter(t => t.dueDate === dateStr).length;

      // Calculate milestone statistics for the user
      let totalMilestonesCount = 0;
      let completedMilestonesCount = 0;
      let pendingMilestonesCount = 0;
      let overdueMilestonesCount = 0;
      let dueTodayMilestonesCount = 0;
      let awaitingDiscussionMilestonesCount = 0;
      let biggerTasksCount = 0;

      pendingTasks.forEach(t => {
        if (t.milestones && Array.isArray(t.milestones) && t.milestones.length > 0) {
          biggerTasksCount++;
          t.milestones.forEach(m => {
            totalMilestonesCount++;
            if (m.completed) {
              completedMilestonesCount++;
            } else {
              pendingMilestonesCount++;
              const mDue = m.dueDate || t.dueDate;
              if (mDue && mDue < dateStr) overdueMilestonesCount++;
              if (mDue && mDue === dateStr) dueTodayMilestonesCount++;
              if (m.needsDiscussion) awaitingDiscussionMilestonesCount++;
            }
          });
        }
      });

      const performanceStats = {
        completedYesterdayCount,
        openedYesterdayCount,
        assignedYesterdayCount,
        pendingCount,
        overdueCount,
        dueTodayCount,
        totalMilestonesCount,
        completedMilestonesCount,
        pendingMilestonesCount,
        overdueMilestonesCount,
        dueTodayMilestonesCount,
        awaitingDiscussionMilestonesCount,
        biggerTasksCount
      };

      // Generate dynamic secure JWT token that expires in 24 hours to secure PDF access
      const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
      const token = jwt.sign(
        { userId: targetUser.id, date: dateStr },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      // Construct the public URL where external APIs or internal servers can fetch the PDF
      const publicPdfUrl = `${APP_BASE_URL}/api/whatsapp/pdf-roster?token=${token}`;

      let whatsappSent = false;
      let telegramSent = false;
      let whatsappError = null;
      let telegramError = null;

      // Send via WhatsApp if opt-in and number are set
      if (hasWhatsApp) {
        try {
          await sendDailyRosterPdfWhatsApp(db, targetUser, dateStr, publicPdfUrl);
          whatsappSent = true;
        } catch (err) {
          whatsappError = err.message;
        }
      }

      // Send via Telegram if opt-in and chatId are set
      if (hasTelegram) {
        try {
          await sendDailyRosterTelegram(db, targetUser, dateStr, publicPdfUrl, performanceStats);
          telegramSent = true;
        } catch (err) {
          telegramError = err.message;
        }
      }

      if (!whatsappSent && !telegramSent) {
        return json({
          error: 'Failed to send daily roster to any channel',
          whatsappError,
          telegramError
        }, 500);
      }

      return json({
        ok: true,
        message: 'Daily roster manually generated and dispatched successfully!',
        whatsapp: whatsappSent ? 'sent' : whatsappError ? `failed: ${whatsappError}` : 'not configured',
        telegram: telegramSent ? 'sent' : telegramError ? `failed: ${telegramError}` : 'not configured'
      });
    }

    // -------- WHATSAPP PDF ROSTER (public but JWT-secured) --------
    if (route === 'whatsapp/pdf-roster' && method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response('Missing authorization token', { status: 400 });
      }

      try {
        const decodedToken = jwt.verify(token, JWT_SECRET);
        const { userId, date } = decodedToken;

        const db = await getDb();
        const user = await db.collection('users').findOne({ id: userId });
        if (!user) {
          return new Response('User not found', { status: 404 });
        }

        // Yesterday date calculation (IST)
        const dObj = new Date(date);
        const yesterdayObj = new Date(dObj.getTime() - 24 * 60 * 60 * 1000);
        const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('en-CA', options);
        const yesterdayStr = formatter.format(yesterdayObj);

        const orgIds = (user.orgs || []).map(o => o.orgId);

        // Fetch user tasks including tasks where user is assigned to main task or any milestone
        const taskUserFilter = {
          $or: [
            { assignedTo: userId },
            { assignees: userId },
            { 'milestones.assignedTo': userId },
            { 'milestones.assignees': userId }
          ]
        };

        const completedYesterdayTasks = await db.collection('tasks').find({
          orgId: { $in: orgIds },
          ...taskUserFilter,
          status: 'Completed',
          updatedAt: { $regex: '^' + yesterdayStr }
        }).toArray();

        const openedYesterdayTasks = await db.collection('tasks').find({
          orgId: { $in: orgIds },
          createdBy: userId,
          createdAt: { $regex: '^' + yesterdayStr }
        }).toArray();

        const assignedYesterdayTasks = await db.collection('tasks').find({
          orgId: { $in: orgIds },
          ...taskUserFilter,
          createdAt: { $regex: '^' + yesterdayStr }
        }).toArray();

        const pendingTasks = await db.collection('tasks').find({
          orgId: { $in: orgIds },
          ...taskUserFilter,
          status: { $ne: 'Completed' }
        }).sort({ dueDate: 1 }).toArray();

        // Fetch organization names
        const orgs = await db.collection('organisations').find({
          id: { $in: orgIds }
        }).toArray();
        const orgNameMap = {};
        orgs.forEach(o => {
          orgNameMap[o.id] = o.name;
        });

        // Fetch all users in these organizations to map IDs to names
        const usersList = await db.collection('users').find({
          "orgs.orgId": { $in: orgIds }
        }).toArray();
        const userNameMap = {};
        usersList.forEach(u => {
          userNameMap[u.id] = u.name;
        });

        // Fetch clients to resolve client names if missing
        const clientsList = await db.collection('clients').find({
          orgId: { $in: orgIds }
        }).toArray();
        const clientNameMap = {};
        clientsList.forEach(c => {
          clientNameMap[c.id] = c.name;
        });

        // Helper to normalize task and its milestones
        const normalizeTaskWithMilestones = (t) => {
          let assignedName = 'Unassigned';
          if (t.assignees && Array.isArray(t.assignees) && t.assignees.length > 0) {
            assignedName = t.assignees.map(id => userNameMap[id] || id).join(', ');
          } else if (t.assignedTo) {
            assignedName = userNameMap[t.assignedTo] || t.assignedTo;
          }

          const clientName = t.clientName || (t.clientId ? clientNameMap[t.clientId] : 'General');
          const isBiggerTask = !!(t.isBiggerTask || (t.milestones && t.milestones.length > 0));

          const normalizedMilestones = (t.milestones && Array.isArray(t.milestones))
            ? t.milestones.map((m, idx) => {
                const mAssignees = Array.isArray(m.assignees) && m.assignees.length > 0
                  ? m.assignees
                  : (m.assignedTo ? [m.assignedTo] : (t.assignees || (t.assignedTo ? [t.assignedTo] : [])));
                
                const mAssignedToName = mAssignees.length > 0
                  ? mAssignees.map(id => userNameMap[id] || id).join(', ')
                  : (m.assignedTo ? (userNameMap[m.assignedTo] || m.assignedTo) : assignedName);

                const mDueDate = m.dueDate || t.dueDate || '';
                const mCompleted = !!m.completed || m.status === 'Completed';
                const isOverdue = !mCompleted && mDueDate && mDueDate < date;
                const isDueToday = !mCompleted && mDueDate && mDueDate === date;
                const isAssignedToUser = mAssignees.includes(userId) || m.assignedTo === userId;

                return {
                  id: m.id || `m_${idx}`,
                  title: m.title || `Milestone ${idx + 1}`,
                  description: m.description || '',
                  dueDate: mDueDate,
                  completed: mCompleted,
                  status: mCompleted ? 'Completed' : (m.status || (isOverdue ? 'Overdue' : 'Pending')),
                  assignedTo: m.assignedTo || (mAssignees[0] || ''),
                  assignees: mAssignees,
                  assignedToName: mAssignedToName,
                  isAssignedToUser,
                  isOverdue,
                  isDueToday,
                  needsDiscussion: !!m.needsDiscussion,
                  discussionWith: m.discussionWith || '',
                  discussionWithName: m.discussionWith ? (userNameMap[m.discussionWith] || m.discussionWith) : '',
                  discussionNote: m.discussionNote || '',
                  discussionRaisedByName: m.discussionRaisedByName || '',
                  recurrence: m.recurrence || t.recurrence || 'none'
                };
              })
            : [];

          return {
            ...t,
            orgName: orgNameMap[t.orgId] || 'Unknown Organisation',
            clientName,
            assignedToName: assignedName,
            isBiggerTask,
            milestones: normalizedMilestones
          };
        };

        const normalizedPendingTasks = pendingTasks.map(normalizeTaskWithMilestones);
        const overdueTasks = normalizedPendingTasks.filter(t => t.dueDate && t.dueDate < date);
        const dueTodayTasks = normalizedPendingTasks.filter(t => t.dueDate === date);
        const otherPendingTasks = normalizedPendingTasks.filter(t => !t.dueDate || t.dueDate > date);

        // Fetch all organization pending tasks (not just for the individual staff)
        const allOrgPendingTasks = await db.collection('tasks').find({
          orgId: { $in: orgIds },
          status: { $ne: 'Completed' }
        }).sort({ dueDate: 1 }).toArray();

        // Map tasks for organization view with assignee names and org names
        const mappedOrgTasks = allOrgPendingTasks.map(normalizeTaskWithMilestones);

        // Milestone Statistics
        let totalMilestonesCount = 0;
        let completedMilestonesCount = 0;
        let pendingMilestonesCount = 0;
        let overdueMilestonesCount = 0;
        let dueTodayMilestonesCount = 0;
        let awaitingDiscussionMilestonesCount = 0;
        let biggerTasksCount = 0;

        normalizedPendingTasks.forEach(t => {
          if (t.milestones && t.milestones.length > 0) {
            biggerTasksCount++;
            t.milestones.forEach(m => {
              totalMilestonesCount++;
              if (m.completed) {
                completedMilestonesCount++;
              } else {
                pendingMilestonesCount++;
                if (m.isOverdue) overdueMilestonesCount++;
                if (m.isDueToday) dueTodayMilestonesCount++;
                if (m.needsDiscussion) awaitingDiscussionMilestonesCount++;
              }
            });
          }
        });

        const milestoneCompletionRate = totalMilestonesCount > 0
          ? Math.round((completedMilestonesCount / totalMilestonesCount) * 100)
          : 0;

        const pdfData = {
          completedYesterdayCount: completedYesterdayTasks.length,
          openedYesterdayCount: openedYesterdayTasks.length,
          assignedYesterdayCount: assignedYesterdayTasks.length,
          pendingCount: normalizedPendingTasks.length,
          overdueCount: overdueTasks.length,
          dueTodayCount: dueTodayTasks.length,
          totalMilestonesCount,
          completedMilestonesCount,
          pendingMilestonesCount,
          overdueMilestonesCount,
          dueTodayMilestonesCount,
          awaitingDiscussionMilestonesCount,
          biggerTasksCount,
          milestoneCompletionRate,
          overdueTasks,
          dueTodayTasks,
          pendingTasks: otherPendingTasks,
          orgWiseTasks: mappedOrgTasks,
          orgNameMap
        };

        const pdfBuffer = await generateRosterPdfBuffer(user.name, date, pdfData);

        return new Response(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="roster_${user.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${date}.pdf"`,
            'Content-Length': pdfBuffer.length.toString()
          }
        });
      } catch (err) {
        console.error('[PDF Roster Error]', err);
        return new Response(`Unauthorized or expired token: ${err.message}`, { status: 401 });
      }
    }

    // From here on, auth required
    const decoded = verifyAuth(request);
    if (!decoded) return json({ error: 'Unauthorized' }, 401);

    // Fetch the fresh user document
    const me = await db.collection('users').findOne({ id: decoded.id });
    if (!me) return json({ error: 'Unauthorized' }, 401);

    // Find or initialize organizations for this user
    if (!me.orgs || me.orgs.length === 0) {
      const defaultOrgId = uuidv4();
      const defaultOrgName = me.name ? `${me.name}'s Org` : "Default Org";
      const newOrg = {
        id: defaultOrgId,
        name: defaultOrgName,
        createdBy: me.id,
        createdAt: new Date().toISOString()
      };
      await db.collection('organisations').insertOne(newOrg);

      const initialOrgs = [{ orgId: defaultOrgId, role: 'admin' }];
      await db.collection('users').updateOne({ id: me.id }, { $set: { orgs: initialOrgs } });
      me.orgs = initialOrgs;
    } else {
      // Self-healing check for GUI-restored backups: make sure listed orgs actually exist
      for (const orgMembership of me.orgs) {
        const orgId = orgMembership.orgId;
        if (orgId) {
          const orgExists = await db.collection('organisations').findOne({ id: orgId });
          if (!orgExists) {
            console.log(`[AI Studio] Org ${orgId} from user profile not found. Auto-creating fallback record...`);
            const fallbackOrg = {
              id: orgId,
              name: me.name ? `${me.name}'s Org` : "Default Org",
              createdBy: me.id,
              createdAt: new Date().toISOString()
            };
            await db.collection('organisations').insertOne(fallbackOrg);
          }
        }
      }
    }

    // Always ensure all existing unassociated records are associated to the user's default organization
    if (me.orgs && me.orgs.length > 0) {
      const defaultOrgId = me.orgs[0].orgId;
      const unassignedFilter = { $or: [{ orgId: { $exists: false } }, { orgId: null }, { orgId: "" }] };
      await db.collection('leads').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('tasks').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('clients').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('invoices').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('quotations').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('payments').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('settings').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('compliances').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('activity_logs').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
      await db.collection('whatsapp_notifications').updateMany(unassignedFilter, { $set: { orgId: defaultOrgId } });
    }

    // Now determine the active organization ID
    let activeOrgId = request.headers.get('x-org-id');
    let orgMembership = (Array.isArray(me.orgs) && me.orgs.length > 0)
      ? me.orgs.find(o => o.orgId === activeOrgId)
      : null;
    if (!orgMembership) {
      activeOrgId = (Array.isArray(me.orgs) && me.orgs.length > 0) ? me.orgs[0].orgId : null;
      orgMembership = (Array.isArray(me.orgs) && me.orgs.length > 0) ? me.orgs[0] : null;
    }

    me.role = orgMembership ? orgMembership.role : me.role || 'staff';
    me.activeOrgId = activeOrgId;

    // -------- ORGANISATIONS --------
    if (route === 'organisations' && method === 'GET') {
      const allParam = url.searchParams.get('all');
      if (allParam === 'true') {
        if (me.role !== 'admin') {
          return json({ error: 'Forbidden' }, 403);
        }
        const allOrgs = await db.collection('organisations').find({
          id: { $exists: true, $ne: null, $ne: "" },
          name: { $exists: true, $ne: null, $ne: "" }
        }).toArray();
        return json({ organisations: allOrgs });
      }

      const orgIds = me.orgs.map(o => o.orgId);
      const orgs = await db.collection('organisations').find({
        id: { $in: orgIds, $exists: true, $ne: null, $ne: "" },
        name: { $exists: true, $ne: null, $ne: "" }
      }).toArray();
      // Attach the user's role in each org
      const list = orgs.map(o => {
        const mem = me.orgs.find(x => x.orgId === o.id);
        return {
          id: o.id,
          name: o.name,
          createdAt: o.createdAt,
          createdBy: o.createdBy,
          role: mem ? mem.role : 'staff'
        };
      });
      return json({ organisations: list, activeOrgId });
    }

    if (route === 'organisations' && method === 'POST') {
      const body = await request.json();
      if (!body.name || !body.name.trim()) return json({ error: 'Name is required' }, 400);
      const orgId = uuidv4();
      const org = {
        id: orgId,
        name: body.name.trim(),
        createdBy: me.id,
        createdAt: new Date().toISOString()
      };
      await db.collection('organisations').insertOne(org);
      const userOrgs = me.orgs || [];
      userOrgs.push({ orgId, role: 'admin' });
      await db.collection('users').updateOne({ id: me.id }, { $set: { orgs: userOrgs } });
      return json({ ok: true, organisation: { ...org, role: 'admin' } });
    }

    if (route.startsWith('organisations/') && method === 'PUT') {
      const id = route.split('/')[1];
      // Only admins of this organization can edit its details
      const orgMembership = me.orgs.find(o => o.orgId === id);
      if (!orgMembership || orgMembership.role !== 'admin') {
        return json({ error: 'Forbidden' }, 403);
      }
      const body = await request.json();
      if (!body.name || !body.name.trim()) return json({ error: 'Name is required' }, 400);

      await db.collection('organisations').updateOne({ id }, { $set: { name: body.name.trim() } });
      logActivity(db, me, 'update', 'organisation', id, { name: body.name.trim() });
      return json({ ok: true });
    }

    if (route.startsWith('organisations/') && method === 'DELETE') {
      const id = route.split('/')[1];
      if (me.role !== 'admin') {
        return json({ error: 'Forbidden' }, 403);
      }
      if (me.activeOrgId === id) {
        return json({ error: 'Cannot delete your active organization. Please switch to another organization first.' }, 400);
      }

      await db.collection('organisations').deleteOne({ id });
      await db.collection('users').updateMany(
        { "orgs.orgId": id },
        { $pull: { orgs: { orgId: id } } }
      );
      await db.collection('leads').deleteMany({ orgId: id });
      await db.collection('tasks').deleteMany({ orgId: id });
      await db.collection('clients').deleteMany({ orgId: id });
      await db.collection('invoices').deleteMany({ orgId: id });
      await db.collection('quotations').deleteMany({ orgId: id });
      await db.collection('payments').deleteMany({ orgId: id });
      await db.collection('settings').deleteMany({ orgId: id });
      await db.collection('whatsapp_notifications').deleteMany({ orgId: id });
      await db.collection('activity_logs').deleteMany({ orgId: id });

      logActivity(db, me, 'delete', 'organisation', id, { id });
      return json({ ok: true });
    }

    // -------- USERS (staff management) --------
    if (route === 'users' && method === 'GET') {
      const users = await db.collection('users').find({ "orgs.orgId": me.activeOrgId }).project({ passwordHash: 0, _id: 0 }).toArray();
      // Map roles specific to this organization
      const mapped = users.map(u => {
        const o = (u.orgs || []).find(x => x.orgId === me.activeOrgId);
        return {
          ...u,
          role: o ? o.role : 'staff'
        };
      });
      return json({ users: mapped });
    }
    if (route === 'users' && method === 'POST') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      if (!body.email) return json({ error: 'Email is required' }, 400);
      const cleanEmail = body.email.toLowerCase().trim();
      const exists = await db.collection('users').findOne({ email: cleanEmail });
      
      if (exists) {
        const targetOrgs = exists.orgs || [];
        const alreadyMember = targetOrgs.some(o => o.orgId === me.activeOrgId);
        if (alreadyMember) return json({ error: 'User is already a member of this organisation' }, 400);
        
        targetOrgs.push({ orgId: me.activeOrgId, role: body.role || 'staff' });
        await db.collection('users').updateOne({ id: exists.id }, { $set: { orgs: targetOrgs } });
        logActivity(db, me, 'add_user_to_org', 'user', exists.id, { orgId: me.activeOrgId });
        return json({ ok: true, user: { id: exists.id, name: exists.name, email: exists.email, role: body.role || 'staff' } });
      }

      const passwordHash = await bcrypt.hash(body.password || 'password123', 10);
      const user = {
        id: uuidv4(),
        email: cleanEmail,
        passwordHash,
        name: body.name || cleanEmail.split('@')[0],
        active: true,
        whatsappNumber: body.whatsappNumber || '',
        whatsappOptIn: !!body.whatsappOptIn,
        whatsappNotificationsEnabled: !!body.whatsappNotificationsEnabled,
        dailyRosterEnabled: !!body.dailyRosterEnabled,
        telegramChatId: body.telegramChatId || '',
        telegramOptIn: !!body.telegramOptIn,
        telegramNotificationsEnabled: !!body.telegramNotificationsEnabled,
        telegramDailyRosterEnabled: !!body.telegramDailyRosterEnabled,
        createdAt: new Date().toISOString(),
        orgs: [{ orgId: me.activeOrgId, role: body.role || 'staff' }],
        permissions: body.permissions || {},
      };
      await db.collection('users').insertOne(user);
      logActivity(db, me, 'create', 'user', user.id, { name: user.name });
      const { passwordHash: _, _id, ...safe } = user;
      return json({ user: { ...safe, role: body.role || 'staff' } });
    }
    if (route.startsWith('users/') && method === 'PUT') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const sub = route.split('/')[2];
      
      if (sub === 'permissions') {
        const { permissions } = await request.json();
        await db.collection('users').updateOne({ id }, { $set: { permissions: permissions || {} } });
        logActivity(db, me, 'update_permissions', 'user', id, { permissions });
        return json({ ok: true });
      }

      const body = await request.json();
      const existingUser = await db.collection('users').findOne({ id });
      if (!existingUser) return json({ error: 'User not found' }, 404);

      const update = {};
      if (body.name) update.name = body.name;
      if (body.email) {
        const cleanEmail = body.email.toLowerCase().trim();
        const exists = await db.collection('users').findOne({ email: cleanEmail, id: { $ne: id } });
        if (exists) return json({ error: 'Email already exists' }, 400);
        update.email = cleanEmail;
      }
      if (typeof body.active === 'boolean') update.active = body.active;
      if (body.password) update.passwordHash = await bcrypt.hash(body.password, 10);
      if (body.whatsappNumber !== undefined) update.whatsappNumber = body.whatsappNumber;
      if (body.whatsappOptIn !== undefined) update.whatsappOptIn = !!body.whatsappOptIn;
      if (body.whatsappNotificationsEnabled !== undefined) update.whatsappNotificationsEnabled = !!body.whatsappNotificationsEnabled;
      if (body.dailyRosterEnabled !== undefined) update.dailyRosterEnabled = !!body.dailyRosterEnabled;
      if (body.telegramChatId !== undefined) update.telegramChatId = body.telegramChatId;
      if (body.telegramOptIn !== undefined) update.telegramOptIn = !!body.telegramOptIn;
      if (body.telegramNotificationsEnabled !== undefined) update.telegramNotificationsEnabled = !!body.telegramNotificationsEnabled;
      if (body.telegramDailyRosterEnabled !== undefined) update.telegramDailyRosterEnabled = !!body.telegramDailyRosterEnabled;

      if (body.role) {
        const targetOrgs = existingUser.orgs || [];
        const orgIdx = targetOrgs.findIndex(o => o.orgId === me.activeOrgId);
        if (orgIdx !== -1) {
          targetOrgs[orgIdx].role = body.role;
          update.orgs = targetOrgs;
        }
      }

      if (body.allowedOrgIds) {
        const targetOrgs = update.orgs || existingUser.orgs || [];
        const updatedOrgs = [];
        for (const orgId of body.allowedOrgIds) {
          const existingOrg = targetOrgs.find(o => o.orgId === orgId);
          if (existingOrg) {
            updatedOrgs.push(existingOrg);
          } else {
            updatedOrgs.push({ orgId, role: 'staff' });
          }
        }
        update.orgs = updatedOrgs;
      }

      await db.collection('users').updateOne({ id }, { $set: update });
      logActivity(db, me, 'update', 'user', id, update);
      return json({ ok: true });
    }
    if (route.startsWith('users/') && method === 'DELETE') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const targetUser = await db.collection('users').findOne({ id });
      if (targetUser) {
        const remainingOrgs = (targetUser.orgs || []).filter(o => o.orgId !== me.activeOrgId);
        if (remainingOrgs.length > 0) {
          await db.collection('users').updateOne({ id }, { $set: { orgs: remainingOrgs } });
          logActivity(db, me, 'remove_user_from_org', 'user', id, { orgId: me.activeOrgId });
        } else {
          await db.collection('users').deleteOne({ id });
          logActivity(db, me, 'delete', 'user', id);
        }
      }
      return json({ ok: true });
    }

    // -------- LEADS --------
    if (route === 'leads' && method === 'GET') {
      const filter = { orgId: me.activeOrgId };
      if (me.role === 'staff') filter.assignedTo = me.id;
      const id = url.searchParams.get('id');
      if (id) {
        filter.id = id;
      } else {
        const status = url.searchParams.get('status');
        const assignedTo = url.searchParams.get('assignedTo');
        const serviceType = url.searchParams.get('serviceType');
        if (status) filter.status = status;
        if (assignedTo) filter.assignedTo = assignedTo;
        if (serviceType) filter.serviceType = serviceType;
      }

      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('leads').countDocuments(filter);
      const data = await db.collection('leads').find(filter).project({ _id: 0 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();

      return json({
        leads: data, // compat
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }
    if (route === 'leads' && method === 'POST') {
      // Staff can create leads (auto-assigned to themselves)
      const body = await request.json();
      const assignedTo = me.role === 'staff' ? me.id : (body.assignedTo || '');
      const lead = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        name: body.name,
        phone: body.phone || '',
        email: body.email || '',
        company: body.company || '',
        serviceType: body.serviceType || 'Other',
        source: body.source || 'Other',
        status: body.status || 'New',
        assignedTo,
        followUpDate: body.followUpDate || '',
        notes: [],
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: me.id,
        createdByName: me.name,
      };
      await db.collection('leads').insertOne(lead);
      logActivity(db, me, 'create', 'lead', lead.id, { name: lead.name });

      // Send Telegram notification if assigned to someone
      if (assignedTo) {
        db.collection('users').findOne({ id: assignedTo }).then(targetUser => {
          if (targetUser) {
            sendLeadAssignedTelegram(db, targetUser, lead).catch(err => {
              console.error('[Telegram Notification Background Error] Lead Assigned:', err);
            });
          }
        }).catch(err => {
          console.error('[Notification Trigger Fetch User Error] Lead Assigned:', err);
        });
      }

      const { _id, ...safe } = lead;
      return json({ lead: safe });
    }
    if (route.startsWith('leads/') && method === 'PUT') {
      const id = route.split('/')[1];
      const sub = route.split('/')[2];
      const existingLead = await db.collection('leads').findOne({ id, orgId: me.activeOrgId });
      if (!existingLead) return json({ error: 'Lead not found or access denied' }, 404);

      if (sub === 'notes') {
        // Staff can add notes only to their own leads
        if (me.role === 'staff' && existingLead.assignedTo !== me.id) {
          return json({ error: 'Forbidden' }, 403);
        }
        const { note } = await request.json();
        const entry = { id: uuidv4(), text: note, by: me.name, at: new Date().toISOString() };
        await db.collection('leads').updateOne({ id, orgId: me.activeOrgId }, { $push: { notes: entry }, $set: { updatedAt: new Date().toISOString() } });

        // Trigger notifications for lead notes
        try {
          const notifyUserIds = new Set();
          if (existingLead.assignedTo) notifyUserIds.add(existingLead.assignedTo);
          if (existingLead.createdBy) notifyUserIds.add(existingLead.createdBy);
          notifyUserIds.delete(me.id);

          if (notifyUserIds.size > 0) {
            db.collection('users').find({ id: { $in: Array.from(notifyUserIds) } }).toArray().then(usersToNotify => {
              usersToNotify.forEach(userToNotify => {
                sendLeadNoteTelegram(db, userToNotify, existingLead, entry, me.name).catch(err => {
                  console.error('[Notification Trigger Error] sendLeadNoteTelegram:', err);
                });
                sendLeadNoteWhatsApp(db, userToNotify, existingLead, entry, me.name).catch(err => {
                  console.error('[Notification Trigger Error] sendLeadNoteWhatsApp:', err);
                });
              });
            }).catch(err => {
              console.error('[Notification Trigger Error] fetching users to notify on lead note:', err);
            });
          }
        } catch (notificationErr) {
          console.error('[Notification Trigger Error] Lead Note:', notificationErr);
        }

        return json({ ok: true, note: entry });
      }
      const body = await request.json();
      // Staff can edit only their own leads, but may reassign them to other users.
      if (me.role === 'staff') {
        if (existingLead.assignedTo !== me.id) return json({ error: 'Forbidden' }, 403);
        delete body.createdBy;
      }
      const oldAssignedTo = existingLead.assignedTo;
      body.updatedAt = new Date().toISOString();
      await db.collection('leads').updateOne({ id, orgId: me.activeOrgId }, { $set: body });
      logActivity(db, me, 'update', 'lead', id, body);

      // Send Telegram lead reassignment notification if assignee changed
      if (body.assignedTo && body.assignedTo !== oldAssignedTo) {
        db.collection('users').findOne({ id: body.assignedTo }).then(targetUser => {
          if (targetUser) {
            db.collection('leads').findOne({ id, orgId: me.activeOrgId }).then(updatedLead => {
              sendLeadReassignedTelegram(db, targetUser, updatedLead || existingLead).catch(err => {
                console.error('[Telegram Notification Background Error] Lead Reassigned:', err);
              });
            });
          }
        }).catch(err => {
          console.error('[Notification Trigger Fetch User Error] Lead Reassigned:', err);
        });
      }

      return json({ ok: true });
    }
    if (route.startsWith('leads/') && method === 'DELETE') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const existingLead = await db.collection('leads').findOne({ id, orgId: me.activeOrgId });
      if (!existingLead) return json({ error: 'Lead not found or access denied' }, 404);
      await db.collection('leads').deleteOne({ id, orgId: me.activeOrgId });
      logActivity(db, me, 'delete', 'lead', id);
      return json({ ok: true });
    }

    // Convert lead -> task
    if (route === 'leads/convert' && method === 'POST') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      const lead = await db.collection('leads').findOne({ id: body.leadId, orgId: me.activeOrgId });
      if (!lead) return json({ error: 'Lead not found' }, 404);
      const task = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        title: body.title || `${lead.serviceType} - ${lead.name}`,
        description: body.description || `Converted from lead. Client: ${lead.name}, Company: ${lead.company || '-'}`,
        category: body.category || lead.serviceType,
        priority: body.priority || 'Medium',
        dueDate: body.dueDate || '',
        assignedTo: body.assignedTo || lead.assignedTo,
        status: 'Pending',
        leadId: lead.id,
        clientName: lead.name,
        comments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: me.id,
      };
      await db.collection('tasks').insertOne(task);
      await db.collection('leads').updateOne({ id: lead.id, orgId: me.activeOrgId }, { $set: { status: 'Converted', updatedAt: new Date().toISOString() } });
      logActivity(db, me, 'convert', 'lead', lead.id, { taskId: task.id });
      const { _id, ...safe } = task;
      return json({ task: safe });
    }

    // -------- TASKS --------
    if (route === 'tasks' && method === 'GET') {
      const filter = { orgId: me.activeOrgId };
      const andClauses = [];

      if (me.role === 'staff') {
        andClauses.push({
          $or: [
            { assignedTo: me.id },
            { assignees: me.id },
            { needsDiscussion: true, discussionWith: me.id },
            { 'milestones.assignedTo': me.id },
            { 'milestones.assignees': me.id },
            { 'milestones.needsDiscussion': true, 'milestones.discussionWith': me.id },
          ]
        });
      }

      const id = url.searchParams.get('id');
      if (id) {
        filter.id = id;
      } else {
        const status = url.searchParams.get('status');
        const assignedTo = url.searchParams.get('assignedTo');
        const priority = url.searchParams.get('priority');
        const category = url.searchParams.get('category');
        const discussion = url.searchParams.get('discussion');
        const isBigger = url.searchParams.get('isBiggerTask');
        const q = url.searchParams.get('q');

        if (status) {
          if (status === 'action') {
            andClauses.push({ status: { $ne: 'Completed' } });
          } else if (status === 'overdue') {
            const todayStr = new Date().toISOString().slice(0, 10);
            andClauses.push({ status: { $ne: 'Completed' }, dueDate: { $ne: '', $lt: todayStr } });
          } else {
            andClauses.push({ status });
          }
        }
        if (assignedTo) {
          andClauses.push({
            $or: [
              { assignedTo },
              { assignees: assignedTo },
              { 'milestones.assignedTo': assignedTo },
              { 'milestones.assignees': assignedTo }
            ]
          });
        }
        if (priority) {
          andClauses.push({ priority });
        }
        if (category) {
          andClauses.push({ category });
        }
        if (isBigger === 'true') {
          andClauses.push({
            $or: [
              { isBiggerTask: true },
              { 'milestones.0': { $exists: true } }
            ]
          });
        } else if (isBigger === 'false') {
          andClauses.push({
            $and: [
              { isBiggerTask: { $ne: true } },
              { $or: [{ milestones: { $exists: false } }, { milestones: { $size: 0 } }] }
            ]
          });
        }
        if (discussion === 'me') {
          andClauses.push({
            $or: [
              { needsDiscussion: true, discussionWith: me.id },
              { 'milestones.needsDiscussion': true, 'milestones.discussionWith': me.id }
            ]
          });
        } else if (discussion === 'mine') {
          andClauses.push({
            $or: [
              { needsDiscussion: true, discussionRaisedBy: me.id },
              { 'milestones.needsDiscussion': true, 'milestones.discussionRaisedBy': me.id }
            ]
          });
        } else if (discussion === 'true' || discussion === 'any') {
          andClauses.push({
            $or: [
              { needsDiscussion: true },
              { 'milestones.needsDiscussion': true }
            ]
          });
        }
        if (q && q.trim()) {
          const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          andClauses.push({
            $or: [
              { title: rx },
              { description: rx },
              { clientName: rx },
              { 'milestones.title': rx },
              { 'milestones.description': rx }
            ]
          });
        }
      }

      if (andClauses.length > 0) {
        filter.$and = andClauses;
      }

      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('tasks').countDocuments(filter);
      const data = await db.collection('tasks').find(filter).project({ _id: 0 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();

      // Backfill and safely normalize assignees and milestones for legacy tasks
      for (const t of data) {
        if (!t.assignees || !Array.isArray(t.assignees) || !t.assignees.length) {
          t.assignees = t.assignedTo ? [t.assignedTo] : [];
        }
        if (!Array.isArray(t.milestones)) t.milestones = [];
        t.milestones = t.milestones.map((m, idx) => ({
          id: m.id || `m_${idx}_${Date.now()}`,
          title: m.title || '',
          description: m.description || '',
          dueDate: m.dueDate || t.dueDate || '',
          assignedTo: m.assignedTo || (Array.isArray(m.assignees) && m.assignees[0]) || t.assignedTo || '',
          assignees: Array.isArray(m.assignees) && m.assignees.length ? m.assignees : (m.assignedTo ? [m.assignedTo] : t.assignees),
          completed: !!m.completed,
          status: m.completed ? 'Completed' : (m.status || 'Pending'),
          needsDiscussion: !!m.needsDiscussion,
          discussionWith: m.discussionWith || '',
          discussionNote: m.discussionNote || '',
          discussionRaisedAt: m.discussionRaisedAt || null,
          discussionRaisedBy: m.discussionRaisedBy || null,
          discussionRaisedByName: m.discussionRaisedByName || null,
          discussionResolvedAt: m.discussionResolvedAt || null,
          discussionResolvedBy: m.discussionResolvedBy || null,
          discussionResolvedByName: m.discussionResolvedByName || null,
          recurrence: m.recurrence || t.recurrence || 'none',
        }));
        if (t.isBiggerTask === undefined) t.isBiggerTask = t.milestones.length > 0;
        if (!Array.isArray(t.comments)) t.comments = [];
        if (t.needsDiscussion === undefined) t.needsDiscussion = false;
        if (t.discussionWith === undefined) t.discussionWith = '';
      }

      return json({
        tasks: data, // compat
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }
    if (route === 'tasks' && method === 'POST') {
      const body = await request.json();
      // Build assignees array (multi). Any user can now assign to anyone.
      let assignees = [];
      if (Array.isArray(body.assignees) && body.assignees.length) {
        assignees = body.assignees.filter(Boolean);
      } else if (body.assignedTo) {
        assignees = [body.assignedTo];
      } else {
        // No assignee specified — default to self
        assignees = [me.id];
      }
      const assignedTo = assignees[0] || ''; // primary for legacy

      // Process initial milestones if provided
      const rawMilestones = Array.isArray(body.milestones) ? body.milestones : [];
      const milestones = rawMilestones.map((m, idx) => ({
        id: m.id || uuidv4(),
        title: m.title || `Milestone ${idx + 1}`,
        description: m.description || '',
        dueDate: m.dueDate || body.dueDate || '',
        assignedTo: m.assignedTo || assignedTo || me.id,
        assignees: Array.isArray(m.assignees) && m.assignees.length ? m.assignees : (m.assignedTo ? [m.assignedTo] : assignees),
        status: m.completed ? 'Completed' : (m.status || 'Pending'),
        completed: !!m.completed,
        completedAt: m.completed ? (m.completedAt || new Date().toISOString()) : null,
        completedBy: m.completed ? (m.completedBy || me.id) : null,
        completedByName: m.completed ? (m.completedByName || me.name) : null,
        needsDiscussion: !!m.needsDiscussion,
        discussionWith: m.needsDiscussion ? (m.discussionWith || '') : '',
        discussionNote: m.discussionNote || '',
        discussionRaisedAt: m.needsDiscussion ? (m.discussionRaisedAt || new Date().toISOString()) : null,
        discussionRaisedBy: m.needsDiscussion ? (m.discussionRaisedBy || me.id) : null,
        discussionRaisedByName: m.needsDiscussion ? (m.discussionRaisedByName || me.name) : null,
        order: typeof m.order === 'number' ? m.order : idx,
      }));

      const task = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        title: body.title,
        description: body.description || '',
        category: body.category || 'Other',
        priority: body.priority || 'Medium',
        dueDate: body.dueDate || '',
        assignedTo,
        assignees,
        status: 'Pending',
        isBiggerTask: !!body.isBiggerTask || milestones.length > 0,
        milestones,
        leadId: body.leadId || null,
        clientId: body.clientId || null,
        clientName: body.clientName || '',
        recurrence: body.recurrence || 'none',
        needsDiscussion: !!body.needsDiscussion,
        discussionWith: body.needsDiscussion ? (body.discussionWith || '') : '',
        discussionRaisedAt: body.needsDiscussion ? new Date().toISOString() : null,
        discussionRaisedBy: body.needsDiscussion ? me.id : null,
        discussionRaisedByName: body.needsDiscussion ? me.name : null,
        comments: [],
        completedAt: (body.status === 'Completed') ? (body.completedAt || new Date().toISOString()) : null,
        completedBy: (body.status === 'Completed') ? (body.completedBy || me.id) : null,
        completedByName: (body.status === 'Completed') ? (body.completedByName || me.name) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: me.id,
        createdByName: me.name,
      };
      await db.collection('tasks').insertOne(task);
      logActivity(db, me, 'create', 'task', task.id, { title: task.title, isBiggerTask: task.isBiggerTask });

      // Send notifications asynchronously (WhatsApp & Telegram)
      try {
        if (assignees && assignees.length) {
          for (const uId of assignees) {
            // Find assignee user details
            db.collection('users').findOne({ id: uId }).then(targetUser => {
              if (targetUser) {
                sendTaskAssignedWhatsApp(db, targetUser, task).catch(err => {
                  console.error('[WhatsApp Notification Background Error] Task Assigned:', err);
                });
                sendTaskAssignedTelegram(db, targetUser, task).catch(err => {
                  console.error('[Telegram Notification Background Error] Task Assigned:', err);
                });
              }
            }).catch(err => {
              console.error('[Notification Trigger Fetch User Error] Task Assigned:', err);
            });
          }
        }

        // Send discussion notification if needs discussion on creation
        if (task.needsDiscussion && task.discussionWith) {
          db.collection('users').findOne({ id: task.discussionWith }).then(targetUser => {
            if (targetUser) {
              sendTaskDiscussionWhatsApp(db, targetUser, task).catch(err => {
                console.error('[WhatsApp Notification Background Error] Task Discussion:', err);
              });
              sendTaskDiscussionTelegram(db, targetUser, task).catch(err => {
                console.error('[Telegram Notification Background Error] Task Discussion:', err);
              });
            }
          }).catch(err => {
            console.error('[Notification Trigger Fetch User Error] Task Discussion:', err);
          });
        }
      } catch (err) {
        console.error('[Notification Trigger Error] Task creation:', err);
      }

      const { _id, ...safe } = task;
      return json({ task: safe });
    }
    if (route.startsWith('tasks/') && method === 'PUT') {
      const id = route.split('/')[1];
      const sub = route.split('/')[2];
      if (sub === 'comments') {
        const { comment } = await request.json();
        const entry = { id: uuidv4(), text: comment, by: me.name, at: new Date().toISOString() };
        await db.collection('tasks').updateOne({ id, orgId: me.activeOrgId }, { $push: { comments: entry }, $set: { updatedAt: new Date().toISOString() } });

        // Trigger notifications for task comments
        try {
          const existingTask = await db.collection('tasks').findOne({ id, orgId: me.activeOrgId });
          if (existingTask) {
            const notifyUserIds = new Set();
            if (existingTask.assignedTo) notifyUserIds.add(existingTask.assignedTo);
            if (Array.isArray(existingTask.assignees)) {
              existingTask.assignees.forEach(aid => {
                if (aid) notifyUserIds.add(aid);
              });
            }
            if (existingTask.createdBy) notifyUserIds.add(existingTask.createdBy);
            if (existingTask.discussionWith) notifyUserIds.add(existingTask.discussionWith);
            notifyUserIds.delete(me.id);

            if (notifyUserIds.size > 0) {
              db.collection('users').find({ id: { $in: Array.from(notifyUserIds) } }).toArray().then(usersToNotify => {
                usersToNotify.forEach(userToNotify => {
                  sendTaskCommentTelegram(db, userToNotify, existingTask, entry, me.name).catch(err => {
                    console.error('[Notification Trigger Error] sendTaskCommentTelegram:', err);
                  });
                  sendTaskCommentWhatsApp(db, userToNotify, existingTask, entry, me.name).catch(err => {
                    console.error('[Notification Trigger Error] sendTaskCommentWhatsApp:', err);
                  });
                });
              }).catch(err => {
                console.error('[Notification Trigger Error] fetching users to notify on task comment:', err);
              });
            }
          }
        } catch (notificationErr) {
          console.error('[Notification Trigger Error] Task Comment:', notificationErr);
        }

        return json({ ok: true, comment: entry });
      }
      const body = await request.json();
      // Role-based update permissions
      let updatedFields = {};
      const existing = await db.collection('tasks').findOne({ id, orgId: me.activeOrgId });
      if (!existing) return json({ error: 'Not found' }, 404);

      // Auto-set discussion metadata when flag transitions
      if (body.needsDiscussion === true && !existing.needsDiscussion) {
        body.discussionRaisedAt = new Date().toISOString();
        body.discussionRaisedBy = me.id;
        body.discussionRaisedByName = me.name;
      }
      if (body.needsDiscussion === false && existing.needsDiscussion) {
        body.discussionResolvedAt = new Date().toISOString();
        body.discussionResolvedBy = me.id;
        body.discussionResolvedByName = me.name;
        body.discussionWith = '';
      }

      // Track completion timestamp and user
      if (body.status === 'Completed') {
        body.completedAt = body.completedAt || existing.completedAt || new Date().toISOString();
        body.completedBy = body.completedBy || existing.completedBy || me.id;
        body.completedByName = body.completedByName || existing.completedByName || me.name;
      } else if (body.status && body.status !== 'Completed') {
        body.completedAt = null;
        body.completedBy = null;
        body.completedByName = null;
      }

      // Process milestones if provided
      if (body.milestones !== undefined) {
        const existingMilestones = Array.isArray(existing.milestones) ? existing.milestones : [];
        const existingMap = new Map(existingMilestones.map(m => [m.id, m]));
        const taskDueDate = body.dueDate || existing.dueDate || '';
        const taskAssignedTo = body.assignedTo || existing.assignedTo || me.id;
        const taskAssignees = Array.isArray(body.assignees) && body.assignees.length ? body.assignees : (existing.assignees || [taskAssignedTo]);

        body.milestones = (Array.isArray(body.milestones) ? body.milestones : []).map((m, idx) => {
          const mId = m.id || uuidv4();
          const prev = existingMap.get(mId) || {};
          const isCompleted = !!m.completed || m.status === 'Completed';
          const wasCompleted = !!prev.completed || prev.status === 'Completed';

          const needsDisc = !!m.needsDiscussion;
          const prevNeedsDisc = !!prev.needsDiscussion;

          let discRaisedAt = prev.discussionRaisedAt || null;
          let discRaisedBy = prev.discussionRaisedBy || null;
          let discRaisedByName = prev.discussionRaisedByName || null;
          let discResolvedAt = prev.discussionResolvedAt || null;
          let discResolvedBy = prev.discussionResolvedBy || null;
          let discResolvedByName = prev.discussionResolvedByName || null;

          if (needsDisc && !prevNeedsDisc) {
            discRaisedAt = new Date().toISOString();
            discRaisedBy = me.id;
            discRaisedByName = me.name;
          } else if (!needsDisc && prevNeedsDisc) {
            discResolvedAt = new Date().toISOString();
            discResolvedBy = me.id;
            discResolvedByName = me.name;
          }

          return {
            id: mId,
            title: m.title || `Milestone ${idx + 1}`,
            description: m.description || '',
            dueDate: m.dueDate || taskDueDate || '',
            assignedTo: m.assignedTo || taskAssignedTo,
            assignees: Array.isArray(m.assignees) && m.assignees.length ? m.assignees : (m.assignedTo ? [m.assignedTo] : taskAssignees),
            status: isCompleted ? 'Completed' : (m.status || 'Pending'),
            completed: isCompleted,
            completedAt: isCompleted ? (prev.completedAt || new Date().toISOString()) : null,
            completedBy: isCompleted ? (prev.completedBy || me.id) : null,
            completedByName: isCompleted ? (prev.completedByName || me.name) : null,
            needsDiscussion: needsDisc,
            discussionWith: needsDisc ? (m.discussionWith || '') : '',
            discussionNote: m.discussionNote || '',
            discussionRaisedAt: discRaisedAt,
            discussionRaisedBy: discRaisedBy,
            discussionRaisedByName: discRaisedByName,
            discussionResolvedAt: discResolvedAt,
            discussionResolvedBy: discResolvedBy,
            discussionResolvedByName: discResolvedByName,
            order: typeof m.order === 'number' ? m.order : idx,
          };
        });

        if (body.isBiggerTask === undefined) {
          body.isBiggerTask = body.milestones.length > 0 ? true : existing.isBiggerTask;
        }
      }

      if (me.role === 'staff') {
        const isAssignee = existing.assignedTo === me.id || (Array.isArray(existing.assignees) && existing.assignees.includes(me.id));
        const isDiscussionTarget = (existing.needsDiscussion && existing.discussionWith === me.id) ||
          (Array.isArray(existing.milestones) && existing.milestones.some(m => m.needsDiscussion && m.discussionWith === me.id));
        const isMilestoneAssignee = Array.isArray(existing.milestones) && existing.milestones.some(m => m.assignedTo === me.id || (Array.isArray(m.assignees) && m.assignees.includes(me.id)));

        if (!isAssignee && !isDiscussionTarget && !isMilestoneAssignee) return json({ error: 'Forbidden' }, 403);
        // Staff can fully edit (including reassigning to other users) any task they are part of.
        const allowed = { ...body };
        if (isAssignee || isMilestoneAssignee) {
          delete allowed.createdBy;
          delete allowed.createdByName;
          // Normalize multi-assignee -> primary assignedTo
          if (Array.isArray(allowed.assignees)) {
            allowed.assignees = allowed.assignees.filter(Boolean);
            allowed.assignedTo = allowed.assignees[0] || allowed.assignedTo || '';
          }
        } else {
          // Discussion-only target (not an assignee) — limited to status change & milestone resolution
          const minimal = {};
          if (body.status) minimal.status = body.status;
          if (body.milestones) minimal.milestones = body.milestones;
          Object.assign(allowed, minimal);
        }
        allowed.updatedAt = new Date().toISOString();
        updatedFields = allowed;
        await db.collection('tasks').updateOne({ id, orgId: me.activeOrgId }, { $set: allowed });
      } else {
        // Admin/manager: full update including reassign + discussion resolve
        // If assignees array passed, sync assignedTo to primary
        if (Array.isArray(body.assignees)) {
          body.assignees = body.assignees.filter(Boolean);
          body.assignedTo = body.assignees[0] || body.assignedTo || '';
        }
        body.updatedAt = new Date().toISOString();
        updatedFields = body;
        await db.collection('tasks').updateOne({ id, orgId: me.activeOrgId }, { $set: body });
      }
      // Recurring task rollover: if marked Completed AND has recurrence, create next occurrence
      if (updatedFields.status === 'Completed') {
        const current = await db.collection('tasks').findOne({ id, orgId: me.activeOrgId }, { projection: { _id: 0 } });
        if (current && current.recurrence && current.recurrence !== 'none' && !current.recurrenceSpawned) {
          const next = { ...current };
          delete next._id;
          next.id = uuidv4();
          next.orgId = me.activeOrgId;
          next.status = 'Pending';
          next.comments = [];
          next.recurrenceSpawned = false;
          next.parentTaskId = current.id;
          next.needsDiscussion = false;
          next.discussionWith = '';
          next.createdAt = new Date().toISOString();
          next.updatedAt = new Date().toISOString();
          if (current.dueDate) {
            const d = new Date(current.dueDate);
            if (current.recurrence === 'daily') d.setDate(d.getDate() + 1);
            else if (current.recurrence === 'weekly') d.setDate(d.getDate() + 7);
            else if (current.recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
            else if (current.recurrence === 'quarterly') d.setMonth(d.getMonth() + 3);
            else if (current.recurrence === 'half-yearly') d.setMonth(d.getMonth() + 6);
            else if (current.recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
            next.dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
          // Reset milestones for recurring occurrence
          if (Array.isArray(current.milestones) && current.milestones.length > 0) {
            next.milestones = current.milestones.map(m => {
              const nm = { ...m };
              nm.id = uuidv4();
              nm.completed = false;
              nm.status = 'Pending';
              nm.completedAt = null;
              nm.completedBy = null;
              nm.completedByName = null;
              nm.needsDiscussion = false;
              nm.discussionWith = '';
              nm.discussionNote = '';
              nm.discussionRaisedAt = null;
              nm.discussionRaisedBy = null;
              nm.discussionRaisedByName = null;
              nm.discussionResolvedAt = null;
              nm.discussionResolvedBy = null;
              nm.discussionResolvedByName = null;
              if (nm.dueDate && current.dueDate) {
                const md = new Date(nm.dueDate);
                if (!isNaN(md.getTime())) {
                  if (current.recurrence === 'daily') md.setDate(md.getDate() + 1);
                  else if (current.recurrence === 'weekly') md.setDate(md.getDate() + 7);
                  else if (current.recurrence === 'monthly') md.setMonth(md.getMonth() + 1);
                  else if (current.recurrence === 'quarterly') md.setMonth(md.getMonth() + 3);
                  else if (current.recurrence === 'half-yearly') md.setMonth(md.getMonth() + 6);
                  else if (current.recurrence === 'yearly') md.setFullYear(md.getFullYear() + 1);
                  nm.dueDate = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}`;
                }
              } else if (next.dueDate) {
                nm.dueDate = next.dueDate;
              }
              return nm;
            });
          }
          await db.collection('tasks').insertOne(next);
          await db.collection('tasks').updateOne({ id: current.id, orgId: me.activeOrgId }, { $set: { recurrenceSpawned: true } });
          logActivity(db, me, 'recurring_spawn', 'task', next.id, { from: current.id });
        }
      }
      logActivity(db, me, 'update', 'task', id, body);

      // Check for WhatsApp Reassignment
      try {
        const oldAssignees = Array.isArray(existing.assignees) ? existing.assignees : (existing.assignedTo ? [existing.assignedTo] : []);
        let hasAssigneesChanged = false;
        let finalAssignees = oldAssignees;

        if (updatedFields.assignees !== undefined) {
          finalAssignees = updatedFields.assignees;
          hasAssigneesChanged = true;
        } else if (updatedFields.assignedTo !== undefined) {
          finalAssignees = [updatedFields.assignedTo];
          hasAssigneesChanged = true;
        }

        if (hasAssigneesChanged) {
          // Find newly added assignees
          const addedAssignees = finalAssignees.filter(id => !oldAssignees.includes(id));
          if (addedAssignees.length > 0) {
            // Fetch updated task data
            db.collection('tasks').findOne({ id, orgId: me.activeOrgId }).then(updatedTask => {
              for (const uId of addedAssignees) {
                db.collection('users').findOne({ id: uId }).then(targetUser => {
                  if (targetUser) {
                    sendTaskReassignedWhatsApp(db, targetUser, updatedTask || existing).catch(err => {
                      console.error('[WhatsApp Notification Background Error] Task Reassigned:', err);
                    });
                    sendTaskReassignedTelegram(db, targetUser, updatedTask || existing).catch(err => {
                      console.error('[Telegram Notification Background Error] Task Reassigned:', err);
                    });
                  }
                }).catch(err => {
                  console.error('[Notification Trigger Fetch User Error] Task Reassigned:', err);
                });
              }
            }).catch(err => {
              console.error('[Notification Trigger Fetch Task Error] Task Reassigned:', err);
            });
          }
        }
      } catch (err) {
        console.error('[Notification Trigger Error] Task update reassignment:', err);
      }

      // Check for Discussion Assignment
      try {
        const isDiscussionActive = updatedFields.needsDiscussion === true || (updatedFields.needsDiscussion === undefined && existing.needsDiscussion === true);
        if (isDiscussionActive) {
          const prevDiscussionWith = existing.discussionWith || '';
          const newDiscussionWith = updatedFields.discussionWith !== undefined ? (updatedFields.discussionWith || '') : prevDiscussionWith;
          
          // Trigger if:
          // 1. It is newly marked as needing discussion
          // 2. Or the manager to discuss with was changed
          const isNewlyAssignedForDiscussion = (updatedFields.needsDiscussion === true && !existing.needsDiscussion) || 
            (newDiscussionWith && newDiscussionWith !== prevDiscussionWith);

          if (isNewlyAssignedForDiscussion && newDiscussionWith) {
            db.collection('tasks').findOne({ id, orgId: me.activeOrgId }).then(updatedTask => {
              db.collection('users').findOne({ id: newDiscussionWith }).then(targetUser => {
                if (targetUser) {
                  sendTaskDiscussionWhatsApp(db, targetUser, updatedTask || existing).catch(err => {
                    console.error('[WhatsApp Notification Background Error] Task Discussion Update:', err);
                  });
                  sendTaskDiscussionTelegram(db, targetUser, updatedTask || existing).catch(err => {
                    console.error('[Telegram Notification Background Error] Task Discussion Update:', err);
                  });
                }
              }).catch(err => {
                console.error('[Notification Trigger Fetch User Error] Task Discussion Update:', err);
              });
            }).catch(err => {
              console.error('[Notification Trigger Fetch Task Error] Task Discussion Update:', err);
            });
          }
        }
      } catch (err) {
        console.error('[Notification Trigger Error] Task discussion update:', err);
      }

      return json({ ok: true });
    }
    if (route.startsWith('tasks/') && method === 'DELETE') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      await db.collection('tasks').deleteOne({ id, orgId: me.activeOrgId });
      logActivity(db, me, 'delete', 'task', id);
      return json({ ok: true });
    }

    // -------- DEPARTMENT MODULE (TASKS / MATTERS / NOTICES / VISITS) --------
    if (route === 'department-tasks' && method === 'GET') {
      const { page, limit } = getPaginationParams(url.searchParams);
      const filter = { orgId: me.activeOrgId };
      const andClauses = [];

      const id = url.searchParams.get('id');
      if (id) {
        filter.id = id;
      } else {
        const q = url.searchParams.get('q');
        if (q) {
          const regex = { $regex: q, $options: 'i' };
          andClauses.push({
            $or: [
              { title: regex },
              { noticeNo: regex },
              { clientName: regex },
              { department: regex },
              { matterType: regex },
              { officerDetails: regex },
              { description: regex }
            ]
          });
        }
        const department = url.searchParams.get('department');
        if (department && department !== 'all') filter.department = department;

        const matterType = url.searchParams.get('matterType');
        if (matterType && matterType !== 'all') filter.matterType = matterType;

        const status = url.searchParams.get('status');
        if (status && status !== 'all') filter.status = status;

        const priority = url.searchParams.get('priority');
        if (priority && priority !== 'all') filter.priority = priority;

        const assignedTo = url.searchParams.get('assignedTo');
        if (assignedTo && assignedTo !== 'all') {
          andClauses.push({
            $or: [
              { assignedTo: assignedTo },
              { assignees: assignedTo }
            ]
          });
        } else if (me.role === 'staff' && url.searchParams.get('viewAll') !== 'true') {
          andClauses.push({
            $or: [
              { assignedTo: me.id },
              { assignees: me.id },
              { createdBy: me.id }
            ]
          });
        }

        const isDueToday = url.searchParams.get('isDueToday');
        const isDueInTwoDays = url.searchParams.get('isDueInTwoDays');
        const isOverdue = url.searchParams.get('isOverdue');
        const now = new Date();
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
        const twoDaysObj = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        const twoDaysStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(twoDaysObj);

        if (isDueToday === 'true') {
          andClauses.push({
            status: { $nin: ['Completed', 'Closed'] },
            $or: [{ dueDate: todayStr }, { visitDate: todayStr }]
          });
        } else if (isDueInTwoDays === 'true') {
          andClauses.push({
            status: { $nin: ['Completed', 'Closed'] },
            $or: [{ dueDate: twoDaysStr }, { visitDate: twoDaysStr }]
          });
        } else if (isOverdue === 'true') {
          andClauses.push({
            status: { $nin: ['Completed', 'Closed'] },
            $or: [
              { dueDate: { $ne: '', $lt: todayStr } },
              { visitDate: { $ne: '', $lt: todayStr } }
            ]
          });
        }

        if (andClauses.length > 0) {
          filter.$and = andClauses;
        }
      }

      const sortField = url.searchParams.get('sortField') || 'dueDate';
      const sortOrder = url.searchParams.get('sortOrder') === 'desc' ? -1 : 1;
      const sort = { [sortField]: sortOrder, createdAt: -1 };

      const total = await db.collection('department_tasks').countDocuments(filter);
      const data = await db.collection('department_tasks')
        .find(filter)
        .project({ _id: 0 })
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      // Aggregate stats
      const allOrgFilter = { orgId: me.activeOrgId };
      const now = new Date();
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
      const twoDaysObj = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const twoDaysStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(twoDaysObj);

      const [totalDeptTasks, pendingDeptTasks, completedDeptTasks, dueTodayCount, dueInTwoDaysCount, overdueCount] = await Promise.all([
        db.collection('department_tasks').countDocuments(allOrgFilter),
        db.collection('department_tasks').countDocuments({ ...allOrgFilter, status: { $nin: ['Completed', 'Closed'] } }),
        db.collection('department_tasks').countDocuments({ ...allOrgFilter, status: { $in: ['Completed', 'Closed'] } }),
        db.collection('department_tasks').countDocuments({
          ...allOrgFilter,
          status: { $nin: ['Completed', 'Closed'] },
          $or: [{ dueDate: todayStr }, { visitDate: todayStr }]
        }),
        db.collection('department_tasks').countDocuments({
          ...allOrgFilter,
          status: { $nin: ['Completed', 'Closed'] },
          $or: [{ dueDate: twoDaysStr }, { visitDate: twoDaysStr }]
        }),
        db.collection('department_tasks').countDocuments({
          ...allOrgFilter,
          status: { $nin: ['Completed', 'Closed'] },
          $or: [
            { dueDate: { $ne: '', $lt: todayStr } },
            { visitDate: { $ne: '', $lt: todayStr } }
          ]
        })
      ]);

      // Automatic background sweep: trigger auto reminders dispatch asynchronously without blocking response
      processDepartmentReminders(db, me.activeOrgId).catch(err => {
        console.error('[Auto Background Dept Reminders Error]', err);
      });

      return json({
        tasks: data,
        data,
        total,
        page,
        limit,
        hasMore: total > page * limit,
        stats: {
          total: totalDeptTasks,
          pending: pendingDeptTasks,
          completed: completedDeptTasks,
          dueToday: dueTodayCount,
          dueInTwoDays: dueInTwoDaysCount,
          overdue: overdueCount
        }
      });
    }

    if (route === 'department-tasks' && method === 'POST') {
      const body = await request.json();
      if (!body.department || (!body.title && !body.matterType)) {
        return json({ error: 'Department and Title/Matter are required' }, 400);
      }
      const assignees = Array.isArray(body.assignees) && body.assignees.length ? body.assignees : (body.assignedTo ? [body.assignedTo] : [me.id]);
      const isCompleted = body.status === 'Completed' || body.status === 'Closed';

      const task = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        department: body.department || 'Income Tax',
        matterType: body.matterType || 'Notice Reply',
        title: body.title || `${body.department} - ${body.matterType || 'Matter'} (${body.clientName || 'General'})`,
        noticeNo: body.noticeNo || '',
        noticeDate: body.noticeDate || '',
        dueDate: body.dueDate || '',
        visitDate: body.visitDate || '',
        officerDetails: body.officerDetails || '',
        clientId: body.clientId || '',
        clientName: body.clientName || '',
        priority: body.priority || 'Medium',
        status: body.status || 'Pending',
        description: body.description || '',
        assignedTo: assignees[0] || me.id,
        assignees,
        comments: [],
        remindersSent: [],
        completedAt: isCompleted ? (body.completedAt || new Date().toISOString()) : null,
        completedBy: isCompleted ? (body.completedBy || me.id) : null,
        completedByName: isCompleted ? (body.completedByName || me.name) : null,
        completionRemarks: body.completionRemarks || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: me.id,
        createdByName: me.name
      };

      await db.collection('department_tasks').insertOne(task);
      logActivity(db, me, 'create', 'department_task', task.id, { title: task.title, department: task.department });

      // Trigger Telegram assign notification
      try {
        if (assignees && assignees.length) {
          for (const uId of assignees) {
            db.collection('users').findOne({ id: uId }).then(targetUser => {
              if (targetUser) {
                sendDepartmentTaskAssignedTelegram(db, targetUser, task).catch(err => {
                  console.error('[Telegram Dept Task Error]', err);
                });
              }
            }).catch(err => console.error('[Telegram Dept User Error]', err));
          }
        }
      } catch (e) {
        console.error('[Telegram Dept Task Dispatch Error]', e);
      }

      const { _id, ...safe } = task;
      return json({ task: safe });
    }

    if (route === 'department-tasks/check-reminders' && method === 'POST') {
      const result = await processDepartmentReminders(db, me.activeOrgId);
      return json({
        ...result,
        remindersSentCount: result.sentCount || 0
      });
    }

    if (route.startsWith('department-tasks/') && method === 'PUT') {
      const id = route.split('/')[1];
      const sub = route.split('/')[2];
      if (sub === 'comments') {
        const { comment } = await request.json();
        const entry = { id: uuidv4(), text: comment, by: me.name, byId: me.id, at: new Date().toISOString() };
        await db.collection('department_tasks').updateOne({ id, orgId: me.activeOrgId }, { $push: { comments: entry }, $set: { updatedAt: new Date().toISOString() } });

        // Notify team via Telegram
        try {
          const existing = await db.collection('department_tasks').findOne({ id, orgId: me.activeOrgId });
          if (existing) {
            const notifyUserIds = new Set();
            if (existing.assignedTo) notifyUserIds.add(existing.assignedTo);
            if (Array.isArray(existing.assignees)) existing.assignees.forEach(aid => aid && notifyUserIds.add(aid));
            if (existing.createdBy) notifyUserIds.add(existing.createdBy);
            notifyUserIds.delete(me.id);

            if (notifyUserIds.size > 0) {
              db.collection('users').find({ id: { $in: Array.from(notifyUserIds) } }).toArray().then(usersToNotify => {
                usersToNotify.forEach(userToNotify => {
                  sendDepartmentCommentTelegram(db, userToNotify, existing, entry, me.name).catch(err => console.error(err));
                });
              });
            }
          }
        } catch (e) {
          console.error('[Department Comment Notification Error]', e);
        }

        return json({ ok: true, comment: entry });
      }

      const body = await request.json();
      const existing = await db.collection('department_tasks').findOne({ id, orgId: me.activeOrgId });
      if (!existing) return json({ error: 'Not found' }, 404);

      if (body.status === 'Completed' || body.status === 'Closed') {
        body.completedAt = body.completedAt || existing.completedAt || new Date().toISOString();
        body.completedBy = body.completedBy || existing.completedBy || me.id;
        body.completedByName = body.completedByName || existing.completedByName || me.name;
      } else if (body.status && body.status !== 'Completed' && body.status !== 'Closed') {
        body.completedAt = null;
        body.completedBy = null;
        body.completedByName = null;
      }

      if (Array.isArray(body.assignees)) {
        body.assignees = body.assignees.filter(Boolean);
        body.assignedTo = body.assignees[0] || body.assignedTo || '';
      }

      body.updatedAt = new Date().toISOString();
      await db.collection('department_tasks').updateOne({ id, orgId: me.activeOrgId }, { $set: body });
      logActivity(db, me, 'update', 'department_task', id, body);

      return json({ ok: true });
    }

    if (route.startsWith('department-tasks/') && method === 'DELETE') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      await db.collection('department_tasks').deleteOne({ id, orgId: me.activeOrgId });
      logActivity(db, me, 'delete', 'department_task', id);
      return json({ ok: true });
    }

    // -------- APPOINTMENTS --------
    if (route === 'appointments' && method === 'GET') {
      const filter = { orgId: me.activeOrgId };
      const andClauses = [];

      const id = url.searchParams.get('id');
      if (id) {
        filter.id = id;
      } else {
        const viewMode = url.searchParams.get('viewMode'); // 'my' or 'all'
        if (viewMode === 'my' || (me.role === 'staff' && viewMode !== 'all')) {
          andClauses.push({
            $or: [
              { createdBy: me.id },
              { assignedUserIds: me.id }
            ]
          });
        }

        const date = url.searchParams.get('date');
        const clientId = url.searchParams.get('clientId');
        const assignedUserId = url.searchParams.get('assignedUserId');
        const type = url.searchParams.get('type');
        const status = url.searchParams.get('status');
        const q = url.searchParams.get('q');

        if (date) {
          andClauses.push({ date });
        }
        if (clientId) {
          andClauses.push({ clientId });
        }
        if (assignedUserId) {
          andClauses.push({ assignedUserIds: assignedUserId });
        }
        if (type) {
          andClauses.push({ type });
        }
        if (status) {
          andClauses.push({ status });
        }
        if (q && q.trim()) {
          const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          andClauses.push({
            $or: [
              { title: rx },
              { notes: rx },
              { clientName: rx },
              { locationAddress: rx },
              { assignedUserNames: rx }
            ]
          });
        }
      }

      if (andClauses.length > 0) {
        filter.$and = andClauses;
      }

      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('appointments').countDocuments(filter);
      const data = await db.collection('appointments')
        .find(filter)
        .project({ _id: 0 })
        .sort({ date: -1, startTime: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      return json({
        appointments: data,
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }

    if (route === 'appointments' && method === 'POST') {
      const body = await request.json();
      if (!body.title) return json({ error: 'Appointment title is required' }, 400);
      if (!body.date) return json({ error: 'Appointment date is required' }, 400);

      // Handle assignees array (can be multiple users assigned by admin or staff)
      let assignedUserIds = [];
      if (Array.isArray(body.assignedUserIds) && body.assignedUserIds.length) {
        assignedUserIds = body.assignedUserIds.filter(Boolean);
      } else if (body.assignedUserId) {
        assignedUserIds = [body.assignedUserId];
      } else {
        assignedUserIds = [me.id];
      }

      // Fetch user names for assignedUserIds
      const assignedUsers = await db.collection('users')
        .find({ id: { $in: assignedUserIds } })
        .project({ id: 1, name: 1 })
        .toArray();
      const assignedUserNames = assignedUsers.map(u => u.name);

      const appointment = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        title: body.title.trim(),
        type: body.type || 'in_office', // 'in_office' | 'client_visit'
        clientId: body.clientId || '',
        clientName: body.clientName || '',
        locationAddress: body.locationAddress || '',
        date: body.date,
        startTime: body.startTime || '10:00',
        endTime: body.endTime || '11:00',
        status: body.status || 'Scheduled', // 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled'
        assignedUserIds,
        assignedUserNames,
        notes: body.notes || '',
        createdBy: me.id,
        createdByName: me.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.collection('appointments').insertOne(appointment);
      logActivity(db, me, 'create', 'appointment', appointment.id, { title: appointment.title });

      const { _id, ...safe } = appointment;
      return json({ appointment: safe, ok: true });
    }

    if (route.startsWith('appointments/') && method === 'PUT') {
      const id = route.split('/')[1];
      const existing = await db.collection('appointments').findOne({ id, orgId: me.activeOrgId });
      if (!existing) return json({ error: 'Appointment not found' }, 404);

      const body = await request.json();

      let assignedUserIds = existing.assignedUserIds || [];
      if (Array.isArray(body.assignedUserIds)) {
        assignedUserIds = body.assignedUserIds.filter(Boolean);
      } else if (body.assignedUserId) {
        assignedUserIds = [body.assignedUserId];
      }

      const assignedUsers = await db.collection('users')
        .find({ id: { $in: assignedUserIds } })
        .project({ id: 1, name: 1 })
        .toArray();
      const assignedUserNames = assignedUsers.map(u => u.name);

      const updateData = {
        ...body,
        assignedUserIds,
        assignedUserNames,
        updatedAt: new Date().toISOString(),
      };
      delete updateData._id;
      delete updateData.id;
      delete updateData.orgId;
      delete updateData.createdBy;
      delete updateData.createdAt;

      await db.collection('appointments').updateOne({ id, orgId: me.activeOrgId }, { $set: updateData });
      logActivity(db, me, 'update', 'appointment', id);

      const updated = await db.collection('appointments').findOne({ id, orgId: me.activeOrgId }, { projection: { _id: 0 } });
      return json({ ok: true, appointment: updated });
    }

    if (route.startsWith('appointments/') && method === 'DELETE') {
      const id = route.split('/')[1];
      const existing = await db.collection('appointments').findOne({ id, orgId: me.activeOrgId });
      if (!existing) return json({ error: 'Appointment not found' }, 404);

      const canDelete = me.role === 'admin' || me.role === 'owner' || existing.createdBy === me.id;
      if (!canDelete) return json({ error: 'Forbidden' }, 403);

      await db.collection('appointments').deleteOne({ id, orgId: me.activeOrgId });
      logActivity(db, me, 'delete', 'appointment', id);
      return json({ ok: true });
    }

    // -------- QUOTATIONS --------
    if (route === 'quotations' && method === 'GET') {
      const filter = me.role === 'staff' ? { orgId: me.activeOrgId, createdBy: me.id } : { orgId: me.activeOrgId };
      const id = url.searchParams.get('id');
      if (id) filter.id = id;

      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('quotations').countDocuments(filter);
      const data = await db.collection('quotations').find(filter).project({ _id: 0 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();

      return json({
        quotations: data, // compat
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }
    if (route === 'quotations' && method === 'POST') {
      const body = await request.json();
      const count = await db.collection('quotations').countDocuments({ orgId: me.activeOrgId });
      const year = new Date().getFullYear();
      const quotationNumber = `QT-${year}-${String(count + 1).padStart(4, '0')}`;
      const subtotal = (body.services || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
      const gstAmount = body.gstApplicable ? +(subtotal * 0.18).toFixed(2) : 0;
      const total = +(subtotal + gstAmount).toFixed(2);
      const quote = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        quotationNumber,
        clientName: body.clientName,
        companyName: body.companyName || '',
        clientAddress: body.clientAddress || '',
        clientEmail: body.clientEmail || '',
        clientPhone: body.clientPhone || '',
        services: body.services || [],
        gstApplicable: !!body.gstApplicable,
        subtotal,
        gstAmount,
        total,
        validUntil: body.validUntil || '',
        terms: body.terms || 'Payment due within 15 days. Quotation valid for 30 days from issue date.',
        firmName: body.firmName || 'ABC & Associates, Chartered Accountants',
        firmAddress: body.firmAddress || '123 Business District, Mumbai - 400001',
        firmGstin: body.firmGstin || '27AABCU9603R1ZX',
        firmContact: body.firmContact || 'contact@abcca.com  |  +91 98765 43210',
        createdAt: new Date().toISOString(),
        createdBy: me.id,
        createdByName: me.name,
      };
      await db.collection('quotations').insertOne(quote);
      logActivity(db, me, 'create', 'quotation', quote.id, { quotationNumber });
      const { _id, ...safe } = quote;
      return json({ quotation: safe });
    }
    if (route.startsWith('quotations/') && method === 'GET') {
      const id = route.split('/')[1];
      const q = await db.collection('quotations').findOne({ id, orgId: me.activeOrgId }, { projection: { _id: 0 } });
      if (!q) return json({ error: 'Not found' }, 404);
      return json({ quotation: q });
    }
    if (route.startsWith('quotations/') && method === 'PUT') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const body = await request.json();
      const existing = await db.collection('quotations').findOne({ id, orgId: me.activeOrgId });
      if (!existing) return json({ error: 'Not found' }, 404);
      // Recalculate totals on edit
      const services = body.services || existing.services || [];
      const gstApplicable = body.gstApplicable !== undefined ? !!body.gstApplicable : !!existing.gstApplicable;
      const subtotal = services.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
      const gstAmount = gstApplicable ? +(subtotal * 0.18).toFixed(2) : 0;
      const total = +(subtotal + gstAmount).toFixed(2);
      const update = {
        ...body,
        services,
        gstApplicable,
        subtotal, gstAmount, total,
        // quotationNumber is immutable — never overwrite
        quotationNumber: existing.quotationNumber,
        updatedAt: new Date().toISOString(),
        updatedBy: me.id,
        updatedByName: me.name,
      };
      delete update.id;
      delete update.createdAt;
      delete update.createdBy;
      delete update.createdByName;
      await db.collection('quotations').updateOne({ id, orgId: me.activeOrgId }, { $set: update });
      logActivity(db, me, 'update', 'quotation', id, { quotationNumber: existing.quotationNumber });
      const fresh = await db.collection('quotations').findOne({ id, orgId: me.activeOrgId }, { projection: { _id: 0 } });
      return json({ quotation: fresh });
    }
    if (route.startsWith('quotations/') && method === 'DELETE') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const existing = await db.collection('quotations').findOne({ id, orgId: me.activeOrgId });
      if (!existing) return json({ error: 'Not found' }, 404);
      await db.collection('quotations').deleteOne({ id, orgId: me.activeOrgId });
      return json({ ok: true });
    }

    // -------- CLIENTS --------
    if (route === 'clients' && method === 'GET') {
      const { page, limit } = getPaginationParams(url.searchParams);
      const skip = (page - 1) * limit;

      let enriched = [];
      let total = 0;

      const filter = { orgId: me.activeOrgId };
      const id = url.searchParams.get('id');
      if (id) filter.id = id;

      // Check if real MongoDB (has aggregate function)
      if (typeof db.collection('clients').aggregate === 'function') {
        const countRes = await db.collection('clients').countDocuments(filter);
        total = countRes;

        const pipeline = [
          { $match: filter },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'invoices',
              localField: 'id',
              foreignField: 'clientId',
              as: 'invoices'
            }
          },
          {
            $lookup: {
              from: 'payments',
              localField: 'id',
              foreignField: 'clientId',
              as: 'payments'
            }
          },
          {
            $project: {
              _id: 0,
              id: 1,
              orgId: 1,
              name: 1,
              company: 1,
              phone: 1,
              email: 1,
              address: 1,
              gstin: 1,
              pan: 1,
              openingBalance: 1,
              openingBalanceAsOn: 1,
              notes: 1,
              leadId: 1,
              createdAt: 1,
              createdBy: 1,
              whatsappNumber: 1,
              whatsappOptIn: 1,
              whatsappNotificationsEnabled: 1,
              dailyRosterEnabled: 1,
              invoiceCount: { $size: '$invoices' },
              billed: { $sum: '$invoices.total' },
              received: { $sum: '$payments.amount' }
            }
          },
          {
            $addFields: {
              netDue: {
                $round: [
                  {
                    $subtract: [
                      { $add: [ { $ifNull: ['$openingBalance', 0] }, '$billed' ] },
                      '$received'
                    ]
                  },
                  2
                ]
              }
            }
          }
        ];
        enriched = await db.collection('clients').aggregate(pipeline).toArray();
      } else {
        // Fallback for mock DB
        const clients = await db.collection('clients').find(filter).project({ _id: 0 }).sort({ createdAt: -1 }).toArray();
        total = clients.length;
        const pageClients = clients.slice(skip, skip + limit);
        for (const c of pageClients) {
          const invoices = await db.collection('invoices').find({ clientId: c.id, orgId: me.activeOrgId }).project({ _id: 0 }).toArray();
          const payments = await db.collection('payments').find({ clientId: c.id, orgId: me.activeOrgId }).project({ _id: 0 }).toArray();
          const adjustments = await db.collection('ledger_adjustments').find({ clientId: c.id, orgId: me.activeOrgId }).project({ _id: 0 }).toArray();
          const billed = invoices.reduce((s, i) => s + (i.total || 0), 0);
          const debitAdjustments = adjustments.filter(a => a.type === 'debit').reduce((s, a) => s + (a.amount || 0), 0);
          const received = payments.reduce((s, p) => s + (p.amount || 0), 0);
          const creditAdjustments = adjustments.filter(a => a.type === 'credit').reduce((s, a) => s + (a.amount || 0), 0);
          const netDue = +((c.openingBalance || 0) + billed + debitAdjustments - received - creditAdjustments).toFixed(2);
          enriched.push({ ...c, billed: billed + debitAdjustments, received: received + creditAdjustments, netDue, invoiceCount: invoices.length, debitAdjustments, creditAdjustments });
        }
      }

      return json({
        clients: enriched, // compat
        data: enriched,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }
    if (route === 'clients' && method === 'POST') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      const client = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        name: body.name,
        company: body.company || '',
        phone: body.phone || '',
        email: body.email || '',
        address: body.address || '',
        gstin: body.gstin || '',
        pan: body.pan || '',
        openingBalance: Number(body.openingBalance) || 0,
        openingBalanceAsOn: body.openingBalanceAsOn || new Date().toISOString().slice(0, 10),
        notes: body.notes || '',
        leadId: body.leadId || null,
        createdAt: new Date().toISOString(),
        createdBy: me.id,
      };
      await db.collection('clients').insertOne(client);
      logActivity(db, me, 'create', 'client', client.id, { name: client.name });
      const { _id, ...safe } = client;
      return json({ client: safe });
    }
    // -------- CLIENTS BULK IMPORT (Excel/CSV via JSON rows) --------
    // POST /api/clients/bulk-import
    // Body: { rows: [ { Name, Company?, Phone?, Email?, Address?, GSTIN?, PAN?, OpeningBalance?, AsOn?, Notes? }, ... ], skipDuplicates?: bool }
    if (route === 'clients/bulk-import' && method === 'POST') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const skipDuplicates = body.skipDuplicates !== false; // default true

      if (!rows.length) return json({ error: 'No rows to import' }, 400);

      // Pre-fetch existing for duplicate detection (by name+phone or gstin) within this organization!
      const existing = await db.collection('clients').find({ orgId: me.activeOrgId }).project({ name: 1, phone: 1, gstin: 1, _id: 0 }).toArray();
      const dupeKey = (r) => `${(r.name || '').trim().toLowerCase()}|${(r.phone || '').trim()}`;
      const gstinSet = new Set(existing.filter(e => e.gstin).map(e => e.gstin.trim().toUpperCase()));
      const nameSet = new Set(existing.map(e => dupeKey(e)));

      const inserted = [];
      const skipped = [];
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        // Accept multiple casings of keys: Name/name, Company/company, etc.
        const pick = (...keys) => {
          for (const k of keys) {
            if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return r[k];
          }
          return '';
        };
        const name = String(pick('Name', 'name', 'NAME', 'Client Name', 'ClientName') || '').trim();
        if (!name) { errors.push({ row: i + 1, reason: 'Missing required field: Name' }); continue; }

        const company = String(pick('Company', 'company', 'Business', 'CompanyName') || '').trim();
        const phone = String(pick('Phone', 'phone', 'Mobile', 'Contact') || '').trim();
        const email = String(pick('Email', 'email', 'EmailAddress') || '').trim();
        const address = String(pick('Address', 'address') || '').trim();
        const gstinRaw = String(pick('GSTIN', 'gstin', 'GST', 'GSTNo') || '').trim().toUpperCase();
        const pan = String(pick('PAN', 'pan', 'PANNo') || '').trim().toUpperCase();
        const openingBalance = Number(pick('OpeningBalance', 'openingBalance', 'Opening Balance', 'Opening', 'Balance')) || 0;
        const asOnRaw = pick('AsOn', 'asOn', 'OpeningBalanceAsOn', 'Opening Balance As On', 'As On Date', 'AsOnDate', 'OpeningAsOn');
        // Normalize date to YYYY-MM-DD (accept ISO, dd/mm/yyyy, dd-mm-yyyy, or Excel serial)
        const openingBalanceAsOn = (() => {
          if (!asOnRaw) return new Date().toISOString().slice(0, 10);
          if (typeof asOnRaw === 'number') {
            // Excel serial -> JS date
            const d = new Date(Date.UTC(1899, 11, 30) + asOnRaw * 86400000);
            return d.toISOString().slice(0, 10);
          }
          const s = String(asOnRaw).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
          const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
          if (m) {
            const dd = m[1].padStart(2, '0');
            const mm = m[2].padStart(2, '0');
            let yy = m[3];
            if (yy.length === 2) yy = (Number(yy) > 50 ? '19' : '20') + yy;
            return `${yy}-${mm}-${dd}`;
          }
          const parsed = new Date(s);
          if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
          return new Date().toISOString().slice(0, 10);
        })();
        const notes = String(pick('Notes', 'notes', 'Remarks') || '').trim();

        // Duplicate detection
        const key = dupeKey({ name, phone });
        const dupeByName = nameSet.has(key);
        const dupeByGstin = gstinRaw && gstinSet.has(gstinRaw);
        if (skipDuplicates && (dupeByName || dupeByGstin)) {
          skipped.push({ row: i + 1, name, reason: dupeByGstin ? 'Duplicate GSTIN' : 'Duplicate name + phone' });
          continue;
        }

        const client = {
          id: uuidv4(),
          orgId: me.activeOrgId,
          name,
          company,
          phone,
          email,
          address,
          gstin: gstinRaw,
          pan,
          openingBalance,
          openingBalanceAsOn,
          notes,
          leadId: null,
          createdAt: new Date().toISOString(),
          createdBy: me.id,
          importedAt: new Date().toISOString(),
        };
        try {
          await db.collection('clients').insertOne(client);
          inserted.push({ row: i + 1, id: client.id, name });
          nameSet.add(key);
          if (gstinRaw) gstinSet.add(gstinRaw);
        } catch (e) {
          errors.push({ row: i + 1, name, reason: e.message || 'Insert failed' });
        }
      }

      logActivity(db, me, 'bulk_import', 'clients', 'bulk', {
        total: rows.length,
        inserted: inserted.length,
        skipped: skipped.length,
        errors: errors.length,
      });
      return json({
        ok: true,
        total: rows.length,
        inserted: inserted.length,
        skipped: skipped.length,
        errors: errors.length,
        details: { inserted, skipped, errors },
      });
    }
    if (route.startsWith('clients/') && method === 'GET') {
      const id = route.split('/')[1];
      const sub = route.split('/')[2];
      const client = await db.collection('clients').findOne({ id, orgId: me.activeOrgId }, { projection: { _id: 0 } });
      if (!client) return json({ error: 'Not found' }, 404);
      if (sub === 'ledger') {
        const invoices = await db.collection('invoices').find({ clientId: id, orgId: me.activeOrgId }).project({ _id: 0 }).sort({ createdAt: 1 }).toArray();
        const payments = await db.collection('payments').find({ clientId: id, orgId: me.activeOrgId }).project({ _id: 0 }).sort({ date: 1 }).toArray();
        const adjustments = await db.collection('ledger_adjustments').find({ clientId: id, orgId: me.activeOrgId }).project({ _id: 0 }).sort({ date: 1 }).toArray();

        const billed = invoices.reduce((s, i) => s + (i.total || 0), 0);
        const debitAdjustments = adjustments.filter(a => a.type === 'debit').reduce((s, a) => s + (a.amount || 0), 0);
        const received = payments.reduce((s, p) => s + (p.amount || 0), 0);
        const creditAdjustments = adjustments.filter(a => a.type === 'credit').reduce((s, a) => s + (a.amount || 0), 0);

        const totalDebits = +(billed + debitAdjustments).toFixed(2);
        const totalCredits = +(received + creditAdjustments).toFixed(2);
        const netDue = +((client.openingBalance || 0) + totalDebits - totalCredits).toFixed(2);

        // Build ledger entries
        const entries = [];
        if (client.openingBalance) {
          entries.push({
            type: 'opening',
            date: client.openingBalanceAsOn || (client.createdAt ? client.createdAt.slice(0, 10) : '2026-01-01'),
            label: 'Opening Balance',
            debit: client.openingBalance || 0,
            credit: 0
          });
        }
        invoices.forEach(i => entries.push({
          type: 'invoice',
          date: i.createdAt ? i.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
          label: `Invoice ${i.invoiceNumber}`,
          debit: i.total,
          credit: 0,
          id: i.id
        }));
        payments.forEach(p => entries.push({
          type: 'payment',
          date: p.date,
          label: `Payment via ${p.mode}${p.reference ? ' (' + p.reference + ')' : ''}`,
          debit: 0,
          credit: p.amount,
          id: p.id
        }));
        adjustments.forEach(a => entries.push({
          type: a.type === 'debit' ? 'debit_adjustment' : 'credit_adjustment',
          date: a.date,
          label: `${a.type === 'debit' ? 'Debit Entry: ' : 'Credit Entry: '}${a.description}${a.reference ? ' (' + a.reference + ')' : ''}`,
          debit: a.type === 'debit' ? a.amount : 0,
          credit: a.type === 'credit' ? a.amount : 0,
          id: a.id,
          rawType: a.type
        }));

        entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        let running = 0;
        entries.forEach(e => {
          running += ((e.debit || 0) - (e.credit || 0));
          e.balance = +running.toFixed(2);
        });

        return json({
          client,
          invoices,
          payments,
          adjustments,
          billed,
          debitAdjustments,
          received,
          creditAdjustments,
          totalDebits,
          totalCredits,
          netDue,
          ledger: entries
        });
      }
      return json({ client });
    }
    if (route.startsWith('clients/') && method === 'PUT') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const existingClient = await db.collection('clients').findOne({ id, orgId: me.activeOrgId });
      if (!existingClient) return json({ error: 'Not found' }, 404);
      const body = await request.json();
      if (body.openingBalance !== undefined) body.openingBalance = Number(body.openingBalance);
      await db.collection('clients').updateOne({ id, orgId: me.activeOrgId }, { $set: body });
      logActivity(db, me, 'update', 'client', id, body);
      return json({ ok: true });
    }
    if (route.startsWith('clients/') && method === 'DELETE') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const existingClient = await db.collection('clients').findOne({ id, orgId: me.activeOrgId });
      if (!existingClient) return json({ error: 'Not found' }, 404);
      await db.collection('clients').deleteOne({ id, orgId: me.activeOrgId });
      logActivity(db, me, 'delete', 'client', id);
      return json({ ok: true });
    }

    // -------- INVOICES --------
    if (route === 'invoices' && method === 'GET') {
      const filter = { orgId: me.activeOrgId };
      const id = url.searchParams.get('id');
      if (id) {
        filter.id = id;
      } else {
        const clientId = url.searchParams.get('clientId');
        const status = url.searchParams.get('status');
        if (clientId) filter.clientId = clientId;
        if (status) filter.status = status;
      }

      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('invoices').countDocuments(filter);
      const data = await db.collection('invoices').find(filter).project({ _id: 0 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();

      // attach paidAmount per invoice for the current page only
      for (const inv of data) {
        const pays = await db.collection('payments').find({ invoiceId: inv.id, orgId: me.activeOrgId }).toArray();
        inv.paidAmount = +pays.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2);
        inv.dueAmount = +(inv.total - inv.paidAmount).toFixed(2);
      }

      return json({
        invoices: data, // compat
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }
    if (route === 'invoices' && method === 'POST') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      const count = await db.collection('invoices').countDocuments({ orgId: me.activeOrgId });
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
      const subtotal = (body.items || []).reduce((s, it) => s + (Number(it.rate) || 0) * (Number(it.qty) || 1), 0);
      const gstAmount = body.gstApplicable ? +(subtotal * 0.18).toFixed(2) : 0;
      const total = +(subtotal + gstAmount).toFixed(2);
      const inv = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        invoiceNumber,
        clientId: body.clientId || null,
        clientName: body.clientName,
        companyName: body.companyName || '',
        clientAddress: body.clientAddress || '',
        clientGstin: body.clientGstin || '',
        items: body.items || [],
        gstApplicable: !!body.gstApplicable,
        subtotal, gstAmount, total,
        dueDate: body.dueDate || '',
        status: 'Unpaid',
        notes: body.notes || '',
        createdAt: new Date().toISOString(),
        createdBy: me.id,
        createdByName: me.name,
      };
      await db.collection('invoices').insertOne(inv);
      logActivity(db, me, 'create', 'invoice', inv.id, { invoiceNumber });
      const { _id, ...safe } = inv;
      return json({ invoice: safe });
    }
    if (route.startsWith('invoices/') && method === 'GET') {
      const id = route.split('/')[1];
      const inv = await db.collection('invoices').findOne({ id, orgId: me.activeOrgId }, { projection: { _id: 0 } });
      if (!inv) return json({ error: 'Not found' }, 404);
      const pays = await db.collection('payments').find({ invoiceId: id, orgId: me.activeOrgId }).project({ _id: 0 }).toArray();
      inv.paidAmount = +pays.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2);
      inv.dueAmount = +(inv.total - inv.paidAmount).toFixed(2);
      inv.payments = pays;
      return json({ invoice: inv });
    }
    if (route.startsWith('invoices/') && method === 'PUT') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const existingInvoice = await db.collection('invoices').findOne({ id, orgId: me.activeOrgId });
      if (!existingInvoice) return json({ error: 'Not found' }, 404);
      const body = await request.json();

      const items = body.items !== undefined ? body.items : existingInvoice.items;
      const gstApplicable = body.gstApplicable !== undefined ? !!body.gstApplicable : existingInvoice.gstApplicable;
      const subtotal = items.reduce((s, it) => s + (Number(it.rate) || 0) * (Number(it.qty) || 1), 0);
      const gstAmount = gstApplicable ? +(subtotal * 0.18).toFixed(2) : 0;
      const total = +(subtotal + gstAmount).toFixed(2);

      const pays = await db.collection('payments').find({ invoiceId: id, orgId: me.activeOrgId }).toArray();
      const paidAmount = pays.reduce((s, p) => s + (p.amount || 0), 0);
      let status = existingInvoice.status || 'Unpaid';
      if (paidAmount >= total && total > 0) status = 'Paid';
      else if (paidAmount > 0) status = 'Partial';
      else status = 'Unpaid';

      const updateData = {
        ...body,
        subtotal,
        gstAmount,
        total,
        status,
        updatedAt: new Date().toISOString(),
        updatedBy: me.id,
      };
      delete updateData._id;
      delete updateData.id;
      delete updateData.orgId;
      delete updateData.invoiceNumber;
      delete updateData.createdAt;
      delete updateData.createdBy;

      await db.collection('invoices').updateOne({ id, orgId: me.activeOrgId }, { $set: updateData });
      logActivity(db, me, 'update', 'invoice', id);
      const updated = await db.collection('invoices').findOne({ id, orgId: me.activeOrgId }, { projection: { _id: 0 } });
      return json({ ok: true, invoice: updated });
    }
    if (route.startsWith('invoices/') && method === 'DELETE') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const existingInvoice = await db.collection('invoices').findOne({ id, orgId: me.activeOrgId });
      if (!existingInvoice) return json({ error: 'Not found' }, 404);
      await db.collection('invoices').deleteOne({ id, orgId: me.activeOrgId });
      logActivity(db, me, 'delete', 'invoice', id);
      return json({ ok: true });
    }

    // -------- PAYMENTS --------
    if (route === 'payments' && method === 'GET') {
      const filter = { orgId: me.activeOrgId };
      const clientId = url.searchParams.get('clientId');
      const invoiceId = url.searchParams.get('invoiceId');
      if (clientId) filter.clientId = clientId;
      if (invoiceId) filter.invoiceId = invoiceId;

      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('payments').countDocuments(filter);
      const data = await db.collection('payments').find(filter).project({ _id: 0 }).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).toArray();

      return json({
        payments: data, // compat
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }
    if (route === 'payments' && method === 'POST') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      const payment = {
        id: uuidv4(),
        orgId: me.activeOrgId,
        clientId: body.clientId,
        invoiceId: body.invoiceId || null,
        amount: Number(body.amount) || 0,
        mode: body.mode || 'Cash', // Cash | Bank | UPI | Cheque | Card
        reference: body.reference || '',
        date: body.date || new Date().toISOString().slice(0, 10),
        notes: body.notes || '',
        createdAt: new Date().toISOString(),
        createdBy: me.id,
      };
      await db.collection('payments').insertOne(payment);
      // Update invoice status if applicable
      if (payment.invoiceId) {
        const inv = await db.collection('invoices').findOne({ id: payment.invoiceId, orgId: me.activeOrgId });
        if (inv) {
          const pays = await db.collection('payments').find({ invoiceId: inv.id, orgId: me.activeOrgId }).toArray();
          const totalPaid = pays.reduce((s, p) => s + (p.amount || 0), 0);
          const newStatus = totalPaid >= inv.total ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Unpaid');
          await db.collection('invoices').updateOne({ id: inv.id, orgId: me.activeOrgId }, { $set: { status: newStatus } });
        }
      }
      logActivity(db, me, 'create', 'payment', payment.id, { amount: payment.amount });
      const { _id, ...safe } = payment;
      return json({ payment: safe });
    }
    if (route.startsWith('payments/') && method === 'DELETE') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const p = await db.collection('payments').findOne({ id, orgId: me.activeOrgId });
      if (!p) return json({ error: 'Payment not found' }, 404);
      await db.collection('payments').deleteOne({ id, orgId: me.activeOrgId });
      if (p && p.invoiceId) {
        const inv = await db.collection('invoices').findOne({ id: p.invoiceId, orgId: me.activeOrgId });
        if (inv) {
          const pays = await db.collection('payments').find({ invoiceId: inv.id, orgId: me.activeOrgId }).toArray();
          const totalPaid = pays.reduce((s, x) => s + (x.amount || 0), 0);
          const newStatus = totalPaid >= inv.total ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Unpaid');
          await db.collection('invoices').updateOne({ id: inv.id, orgId: me.activeOrgId }, { $set: { status: newStatus } });
        }
      }
      return json({ ok: true });
    }

    // -------- LEDGER ADJUSTMENTS --------
    if (route === 'ledger-adjustments' && method === 'GET') {
      const filter = { orgId: me.activeOrgId };
      const clientId = url.searchParams.get('clientId');
      if (clientId) filter.clientId = clientId;
      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('ledger_adjustments').countDocuments(filter);
      const data = await db.collection('ledger_adjustments').find(filter).project({ _id: 0 }).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
      return json({ adjustments: data, data, page, limit, total, hasMore: total > page * limit });
    }

    if (route === 'ledger-adjustments' && method === 'POST') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      if (!body.clientId) return json({ error: 'Client ID is required' }, 400);
      if (!['debit', 'credit'].includes(body.type)) return json({ error: 'Type must be debit or credit' }, 400);
      if (!body.amount || Number(body.amount) <= 0) return json({ error: 'Valid positive amount is required' }, 400);

      const client = await db.collection('clients').findOne({ id: body.clientId, orgId: me.activeOrgId });

      const adjustment = {
        id: 'adj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        orgId: me.activeOrgId,
        clientId: body.clientId,
        clientName: client ? client.name : (body.clientName || 'Client'),
        type: body.type, // 'debit' or 'credit'
        amount: Math.abs(Number(body.amount)),
        date: body.date || new Date().toISOString().slice(0, 10),
        description: body.description || body.particulars || (body.type === 'debit' ? 'Direct Debit Entry' : 'Direct Credit Entry'),
        reference: body.reference || '',
        notes: body.notes || '',
        createdAt: new Date().toISOString(),
        createdBy: me.email || me.id,
      };

      await db.collection('ledger_adjustments').insertOne(adjustment);
      logActivity(db, me, 'create', 'ledger_adjustment', adjustment.id, {
        clientId: adjustment.clientId,
        type: adjustment.type,
        amount: adjustment.amount,
        description: adjustment.description,
      });

      const { _id, ...safe } = adjustment;
      return json({ ok: true, adjustment: safe });
    }

    if (route.startsWith('ledger-adjustments/') && method === 'DELETE') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const adj = await db.collection('ledger_adjustments').findOne({ id, orgId: me.activeOrgId });
      if (!adj) return json({ error: 'Adjustment not found' }, 404);
      await db.collection('ledger_adjustments').deleteOne({ id, orgId: me.activeOrgId });
      logActivity(db, me, 'delete', 'ledger_adjustment', id);
      return json({ ok: true });
    }

    // -------- BRANDING (single doc per org) --------
    if (route === 'branding' && method === 'GET') {
      const b = await db.collection('settings').findOne({ id: 'branding', orgId: me.activeOrgId }, { projection: { _id: 0 } });
      return json({ branding: b || {
        id: 'branding',
        orgId: me.activeOrgId,
        firmName: 'ABC & Associates, Chartered Accountants',
        firmAddress: '123 Business District, Mumbai - 400001',
        firmGstin: '27AABCU9603R1ZX',
        firmContact: 'contact@abcca.com  |  +91 98765 43210',
        firmEmail: 'contact@abcca.com',
        firmPhone: '+91 98765 43210',
        bankName: '',
        bankAccount: '',
        bankIfsc: '',
        upiId: '',
        logoBase64: '',
        primaryColor: '#0f172a',
        footerText: 'This is a computer-generated document.',
      } });
    }
    if (route === 'branding' && method === 'PUT') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      body.id = 'branding';
      body.orgId = me.activeOrgId;
      body.updatedAt = new Date().toISOString();
      await db.collection('settings').updateOne({ id: 'branding', orgId: me.activeOrgId }, { $set: body }, { upsert: true });
      logActivity(db, me, 'update', 'branding', 'branding');
      return json({ ok: true });
    }

    // -------- SEARCH (global) --------
    if (route === 'search' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 1) {
        return json({ leads: [], tasks: [], clients: [], invoices: [], quotations: [] });
      }
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      
      const leadFilter = { orgId: me.activeOrgId };
      if (me.role === 'staff') {
        leadFilter.assignedTo = me.id;
      }
      leadFilter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { company: rx }];

      let taskQuery = { orgId: me.activeOrgId };
      if (me.role === 'staff') {
        taskQuery.$and = [
          { $or: [{ title: rx }, { description: rx }, { clientName: rx }] },
          {
            $or: [
              { assignedTo: me.id },
              { assignees: me.id },
              { needsDiscussion: true, discussionWith: me.id }
            ]
          }
        ];
      } else {
        taskQuery.$or = [{ title: rx }, { description: rx }, { clientName: rx }];
      }

      const [leads, tasks, clients, invoices, quotations] = await Promise.all([
        db.collection('leads').find(leadFilter).project({ _id: 0 }).limit(5).toArray(),
        db.collection('tasks').find(taskQuery).project({ _id: 0 }).limit(5).toArray(),
        me.role !== 'staff' ? db.collection('clients').find({ orgId: me.activeOrgId, $or: [{ name: rx }, { company: rx }, { phone: rx }, { email: rx }, { gstin: rx }] }).project({ _id: 0 }).limit(5).toArray() : [],
        me.role !== 'staff' ? db.collection('invoices').find({ orgId: me.activeOrgId, $or: [{ invoiceNumber: rx }, { clientName: rx }, { companyName: rx }] }).project({ _id: 0 }).limit(5).toArray() : [],
        me.role !== 'staff' ? db.collection('quotations').find({ orgId: me.activeOrgId, $or: [{ quotationNumber: rx }, { clientName: rx }, { companyName: rx }] }).project({ _id: 0 }).limit(5).toArray() : [],
      ]);
      return json({ leads, tasks, clients, invoices, quotations });
    }

    // -------- REMINDERS / CALENDAR EVENTS --------
    if (route === 'calendar' && method === 'GET') {
      const from = url.searchParams.get('from'); // ISO date
      const to = url.searchParams.get('to');
      const filter = me.role === 'staff'
        ? {
            orgId: me.activeOrgId,
            $or: [
              { assignedTo: me.id },
              { assignees: me.id },
              { 'milestones.assignedTo': me.id },
              { 'milestones.assignees': me.id },
            ]
          }
        : { orgId: me.activeOrgId };
      const tasks = await db.collection('tasks').find({ ...filter, dueDate: { $ne: '', $gte: from || '', $lte: to || '9999' } }).project({ _id: 0 }).toArray();
      // Backfill tasks for calendar
      for (const t of tasks) {
        if (!t.assignees || !Array.isArray(t.assignees) || !t.assignees.length) {
          t.assignees = t.assignedTo ? [t.assignedTo] : [];
        }
        if (!Array.isArray(t.milestones)) t.milestones = [];
        if (t.isBiggerTask === undefined) t.isBiggerTask = t.milestones.length > 0;
      }
      const leadFilter = me.role === 'staff' ? { orgId: me.activeOrgId, assignedTo: me.id } : { orgId: me.activeOrgId };
      const leads = await db.collection('leads').find({ ...leadFilter, followUpDate: { $ne: '', $gte: from || '', $lte: to || '9999' } }).project({ _id: 0 }).toArray();
      
      const apptFilter = me.role === 'staff' 
        ? { orgId: me.activeOrgId, $or: [{ createdBy: me.id }, { assignedUserIds: me.id }] } 
        : { orgId: me.activeOrgId };
      const appointments = await db.collection('appointments').find({ ...apptFilter, date: { $ne: '', $gte: from || '', $lte: to || '9999' } }).project({ _id: 0 }).toArray();

      return json({ tasks, leads, appointments });
    }

    if (route === 'reminders' && method === 'GET') {
      const today = new Date().toISOString().slice(0, 10);
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const filterStaff = me.role === 'staff'
        ? {
            orgId: me.activeOrgId,
            $or: [
              { assignedTo: me.id },
              { assignees: me.id },
              { 'milestones.assignedTo': me.id },
              { 'milestones.assignees': me.id },
            ]
          }
        : { orgId: me.activeOrgId };
      const dueToday = await db.collection('tasks').find({ ...filterStaff, status: { $ne: 'Completed' }, dueDate: today }).project({ _id: 0 }).toArray();
      const upcoming = await db.collection('tasks').find({ ...filterStaff, status: { $ne: 'Completed' }, dueDate: { $gt: today, $lte: in7 } }).project({ _id: 0 }).sort({ dueDate: 1 }).toArray();
      const overdue = await db.collection('tasks').find({ ...filterStaff, status: { $ne: 'Completed' }, dueDate: { $ne: '', $lt: today } }).project({ _id: 0 }).sort({ dueDate: 1 }).toArray();
      
      // Normalize reminder tasks
      for (const t of [...dueToday, ...upcoming, ...overdue]) {
        if (!t.assignees || !Array.isArray(t.assignees) || !t.assignees.length) {
          t.assignees = t.assignedTo ? [t.assignedTo] : [];
        }
        if (!Array.isArray(t.milestones)) t.milestones = [];
        if (t.isBiggerTask === undefined) t.isBiggerTask = t.milestones.length > 0;
      }

      const followUpsToday = await db.collection('leads').find({ ...filterStaff, status: { $nin: ['Converted', 'Cancelled'] }, followUpDate: today }).project({ _id: 0 }).toArray();
      const followUpsUpcoming = await db.collection('leads').find({ ...filterStaff, status: { $nin: ['Converted', 'Cancelled'] }, followUpDate: { $gt: today, $lte: in7 } }).project({ _id: 0 }).sort({ followUpDate: 1 }).toArray();
      const followUpsOverdue = await db.collection('leads').find({ ...filterStaff, status: { $nin: ['Converted', 'Cancelled'] }, followUpDate: { $ne: '', $lt: today } }).project({ _id: 0 }).sort({ followUpDate: 1 }).toArray();
      
      const apptFilterStaff = me.role === 'staff' 
        ? { orgId: me.activeOrgId, $or: [{ createdBy: me.id }, { assignedUserIds: me.id }] } 
        : { orgId: me.activeOrgId };
      const appointmentsToday = await db.collection('appointments').find({ ...apptFilterStaff, status: 'Scheduled', date: today }).project({ _id: 0 }).sort({ startTime: 1 }).toArray();

      return json({ dueToday, upcoming, overdue, followUpsToday, followUpsUpcoming, followUpsOverdue, appointmentsToday });
    }

    // -------- RECEIVABLES AGING REPORT --------
    if (route === 'reports/aging' && method === 'GET') {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const clients = await db.collection('clients').find({ orgId: me.activeOrgId }).project({ _id: 0 }).toArray();
      const allInvoices = await db.collection('invoices').find({ orgId: me.activeOrgId, status: { $ne: 'Paid' } }).project({ _id: 0 }).toArray();
      // attach paidAmount/dueAmount
      for (const inv of allInvoices) {
        const pays = await db.collection('payments').find({ invoiceId: inv.id, orgId: me.activeOrgId }).toArray();
        inv.paidAmount = +pays.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2);
        inv.dueAmount = +(inv.total - inv.paidAmount).toFixed(2);
      }

      function bucketize(daysOverdue) {
        if (daysOverdue <= 0) return 'current';
        if (daysOverdue <= 30) return 'b30';
        if (daysOverdue <= 60) return 'b60';
        if (daysOverdue <= 90) return 'b90';
        return 'b90plus';
      }

      const totals = { current: 0, b30: 0, b60: 0, b90: 0, b90plus: 0, total: 0 };
      const perClient = [];
      const clientMap = new Map(clients.map(c => [c.id, c]));

      // First handle all unpaid invoices grouped by client
      const byClient = new Map();
      for (const inv of allInvoices) {
        const cid = inv.clientId || `_orphan_${inv.clientName}`;
        if (!byClient.has(cid)) byClient.set(cid, { invoices: [], totalPayments: 0 });
        byClient.get(cid).invoices.push(inv);
      }

      // Process clients with opening balance OR unpaid invoices
      const allClientIds = new Set([...byClient.keys(), ...clients.map(c => c.id)]);
      for (const cid of allClientIds) {
        const c = clientMap.get(cid);
        const cName = c?.name || allInvoices.find(i => (i.clientId || `_orphan_${i.clientName}`) === cid)?.clientName || 'Unknown';
        const cCompany = c?.company || '';
        const row = {
          clientId: cid,
          clientName: cName,
          companyName: cCompany,
          openingBalance: 0,
          openingAsOn: c?.openingBalanceAsOn || '',
          current: 0, b30: 0, b60: 0, b90: 0, b90plus: 0,
          unpaidInvoiceCount: 0,
          oldestInvoiceDate: null,
          total: 0,
        };

        // Opening balance handling - bucket by openingBalanceAsOn date
        if (c && c.openingBalance > 0) {
          // First account for payments without invoice (on-account payments reduce opening)
          const onAccount = await db.collection('payments').find({ clientId: c.id, invoiceId: null, orgId: me.activeOrgId }).toArray();
          const allClientPayments = await db.collection('payments').find({ clientId: c.id, orgId: me.activeOrgId }).toArray();
          const totalPaid = allClientPayments.reduce((s, p) => s + (p.amount || 0), 0);
          const invoicesTotal = (byClient.get(c.id)?.invoices || []).reduce((s, i) => s + (i.total || 0), 0);
          // remaining opening = opening - max(0, payments - invoices)
          const allInvForClient = await db.collection('invoices').find({ clientId: c.id, orgId: me.activeOrgId }).toArray();
          const fullBilled = allInvForClient.reduce((s, i) => s + (i.total || 0), 0);
          const remainingOpening = Math.max(0, c.openingBalance - Math.max(0, totalPaid - fullBilled));
          // simpler: opening contribution to netDue = opening - (totalPaid applied to opening after invoices)
          // We'll compute: balance from opening = max(0, opening + fullBilled - totalPaid) - sum(unpaid invoices due amount)
          const unpaidDue = (byClient.get(c.id)?.invoices || []).reduce((s, i) => s + (i.dueAmount || 0), 0);
          const netDueTotal = +((c.openingBalance || 0) + fullBilled - totalPaid).toFixed(2);
          const openingPortion = Math.max(0, +(netDueTotal - unpaidDue).toFixed(2));
          row.openingBalance = openingPortion;

          // Bucket the opening portion based on openingBalanceAsOn
          if (openingPortion > 0) {
            const asOn = c.openingBalanceAsOn ? new Date(c.openingBalanceAsOn) : today;
            const days = Math.floor((today - asOn) / 86400000);
            const bucket = bucketize(days);
            row[bucket] += openingPortion;
          }
        }

        // Bucket each unpaid invoice's dueAmount based on dueDate
        const invs = byClient.get(cid)?.invoices || [];
        row.unpaidInvoiceCount = invs.length;
        for (const inv of invs) {
          if (inv.dueAmount <= 0) continue;
          const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.createdAt);
          const days = Math.floor((today - dueDate) / 86400000);
          const bucket = bucketize(days);
          row[bucket] += inv.dueAmount;
          if (!row.oldestInvoiceDate || dueDate < new Date(row.oldestInvoiceDate)) {
            row.oldestInvoiceDate = (inv.dueDate || inv.createdAt.slice(0, 10));
          }
        }

        // Include direct debit & credit adjustments
        if (c) {
          const clientAdjs = await db.collection('ledger_adjustments').find({ clientId: c.id, orgId: me.activeOrgId }).toArray();
          const debitAdjTotal = clientAdjs.filter(a => a.type === 'debit').reduce((s, a) => s + (a.amount || 0), 0);
          const creditAdjTotal = clientAdjs.filter(a => a.type === 'credit').reduce((s, a) => s + (a.amount || 0), 0);
          const netAdj = debitAdjTotal - creditAdjTotal;
          if (netAdj !== 0) {
            row.current = +(row.current + netAdj).toFixed(2);
          }
        }

        row.current = +row.current.toFixed(2);
        row.b30 = +row.b30.toFixed(2);
        row.b60 = +row.b60.toFixed(2);
        row.b90 = +row.b90.toFixed(2);
        row.b90plus = +row.b90plus.toFixed(2);
        row.total = +(row.current + row.b30 + row.b60 + row.b90 + row.b90plus).toFixed(2);

        if (row.total > 0) {
          perClient.push(row);
          totals.current += row.current;
          totals.b30 += row.b30;
          totals.b60 += row.b60;
          totals.b90 += row.b90;
          totals.b90plus += row.b90plus;
          totals.total += row.total;
        }
      }

      // Sort by total desc
      perClient.sort((a, b) => b.total - a.total);

      totals.current = +totals.current.toFixed(2);
      totals.b30 = +totals.b30.toFixed(2);
      totals.b60 = +totals.b60.toFixed(2);
      totals.b90 = +totals.b90.toFixed(2);
      totals.b90plus = +totals.b90plus.toFixed(2);
      totals.total = +totals.total.toFixed(2);

      return json({ asOn: todayStr, totals, perClient });
    }

    // -------- COMPLIANCES --------
    if (route === 'compliances' && method === 'GET') {
      const items = await db.collection('compliances').find({}).project({ _id: 0 }).sort({ name: 1 }).toArray();
      // For each compliance, count applicable clients
      const clients = await db.collection('clients').find({}).project({ _id: 0 }).toArray();
      for (const c of items) {
        c.applicableClients = clients
          .filter(cl => Array.isArray(cl.applicableCompliances) && cl.applicableCompliances.includes(c.id))
          .map(cl => ({ id: cl.id, name: cl.name, company: cl.company || '', gstin: cl.gstin || '' }));
        c.clientCount = c.applicableClients.length;
      }
      return json({ compliances: items });
    }
    if (route === 'compliances' && method === 'POST') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const body = await request.json();
      const comp = {
        id: uuidv4(),
        name: body.name,
        description: body.description || '',
        frequency: body.frequency || 'one-time', // daily/weekly/monthly/quarterly/half-yearly/yearly/one-time
        dueDay: body.dueDay || '', // e.g., "20th of next month"
        createdAt: new Date().toISOString(),
        createdBy: me.id,
      };
      await db.collection('compliances').insertOne(comp);
      logActivity(db, me, 'create', 'compliance', comp.id, { name: comp.name });
      const { _id, ...safe } = comp;
      return json({ compliance: safe });
    }
    if (route.startsWith('compliances/') && method === 'PUT') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const body = await request.json();
      delete body.id;
      await db.collection('compliances').updateOne({ id }, { $set: body });
      logActivity(db, me, 'update', 'compliance', id);
      return json({ ok: true });
    }
    if (route.startsWith('compliances/') && method === 'DELETE') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      await db.collection('compliances').deleteOne({ id });
      // Remove from all clients' applicable lists
      await db.collection('clients').updateMany({}, { $pull: { applicableCompliances: id } });
      logActivity(db, me, 'delete', 'compliance', id);
      return json({ ok: true });
    }

    // -------- USER PERMISSIONS --------
    if (route.match(/^users\/[^/]+\/permissions$/) && method === 'PUT') {
      if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const id = route.split('/')[1];
      const { permissions } = await request.json();
      await db.collection('users').updateOne({ id }, { $set: { permissions: permissions || {} } });
      logActivity(db, me, 'update_permissions', 'user', id, { permissions });
      return json({ ok: true });
    }

    // -------- DASHBOARD --------
    if (route === 'dashboard' && method === 'GET') {
      const leadsCol = db.collection('leads');
      const tasksCol = db.collection('tasks');
      const deptCol = db.collection('department_tasks');
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
      const twoDaysObj = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const twoDaysStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(twoDaysObj);

      if (me.role === 'staff') {
        const my = {
          orgId: me.activeOrgId,
          $or: [
            { assignedTo: me.id },
            { assignees: me.id },
            { 'milestones.assignedTo': me.id },
            { 'milestones.assignees': me.id },
          ]
        };
        const [allMine, pending, inProg, done] = await Promise.all([
          tasksCol.countDocuments(my),
          tasksCol.countDocuments({ ...my, status: 'Pending' }),
          tasksCol.countDocuments({ ...my, status: 'In Progress' }),
          tasksCol.countDocuments({ ...my, status: 'Completed' }),
        ]);
        const overdue = await tasksCol.countDocuments({
          ...my, status: { $ne: 'Completed' }, dueDate: { $ne: '', $lt: todayStart },
        });
        const dueToday = await tasksCol.countDocuments({
          ...my, status: { $ne: 'Completed' }, dueDate: { $gte: todayStart, $lt: todayEnd },
        });

        // Compute staff personal efficiency metrics
        const myCompletedTasksList = await tasksCol.find({ ...my, status: 'Completed' }).project({ dueDate: 1, completedAt: 1, updatedAt: 1 }).toArray();
        const myOnTimeCount = myCompletedTasksList.filter(t => !t.dueDate || (t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate.slice(0, 10)) || (!t.completedAt && t.updatedAt && t.updatedAt.slice(0, 10) <= t.dueDate.slice(0, 10))).length;
        const myLateCount = Math.max(0, done - myOnTimeCount);
        const myCompletionRate = allMine > 0 ? Math.round((done / allMine) * 1000) / 10 : 0;
        const myOnTimeEfficiencyRate = done > 0 ? Math.round((myOnTimeCount / done) * 1000) / 10 : 0;

        // Department tasks for this staff
        const myDeptFilter = {
          orgId: me.activeOrgId,
          $or: [{ assignedTo: me.id }, { assignees: me.id }, { createdBy: me.id }]
        };
        const [myDeptTotal, myDeptPending, myDeptCompleted, myDeptDueToday, myDeptDueIn2Days] = await Promise.all([
          deptCol.countDocuments(myDeptFilter),
          deptCol.countDocuments({ ...myDeptFilter, status: { $nin: ['Completed', 'Closed'] } }),
          deptCol.countDocuments({ ...myDeptFilter, status: { $in: ['Completed', 'Closed'] } }),
          deptCol.countDocuments({ ...myDeptFilter, status: { $nin: ['Completed', 'Closed'] }, $or: [{ dueDate: todayStr }, { visitDate: todayStr }] }),
          deptCol.countDocuments({ ...myDeptFilter, status: { $nin: ['Completed', 'Closed'] }, $or: [{ dueDate: twoDaysStr }, { visitDate: twoDaysStr }] })
        ]);

        const recent = await tasksCol.find(my).project({ _id: 0 }).sort({ createdAt: -1 }).limit(5).toArray();
        // Tasks where I raised a discussion that's still pending (either at task level or milestone level)
        const myDiscussionsRaised = await tasksCol.find({
          orgId: me.activeOrgId,
          $or: [
            { discussionRaisedBy: me.id, needsDiscussion: true },
            { 'milestones.discussionRaisedBy': me.id, 'milestones.needsDiscussion': true },
          ]
        }).project({ _id: 0 }).sort({ discussionRaisedAt: -1, createdAt: -1 }).limit(10).toArray();

        for (const t of [...recent, ...myDiscussionsRaised]) {
          if (!t.assignees || !Array.isArray(t.assignees) || !t.assignees.length) {
            t.assignees = t.assignedTo ? [t.assignedTo] : [];
          }
          if (!Array.isArray(t.milestones)) t.milestones = [];
          if (t.isBiggerTask === undefined) t.isBiggerTask = t.milestones.length > 0;
        }

        return json({
          role: 'staff',
          stats: { allMine, pending, inProg, done, overdue, dueToday, awaitingDiscussion: myDiscussionsRaised.length },
          efficiency: {
            totalTasks: allMine,
            completedTasks: done,
            completionRate: myCompletionRate,
            completedOnTime: myOnTimeCount,
            completedLate: myLateCount,
            onTimeEfficiencyRate: myOnTimeEfficiencyRate
          },
          deptStats: {
            total: myDeptTotal,
            pending: myDeptPending,
            completed: myDeptCompleted,
            dueToday: myDeptDueToday,
            dueInTwoDays: myDeptDueIn2Days
          },
          recentTasks: recent,
          awaitingDiscussion: myDiscussionsRaised,
        });
      }

      const [totalLeads, newLeads, inProgress, converted, cancelled] = await Promise.all([
        leadsCol.countDocuments({ orgId: me.activeOrgId }),
        leadsCol.countDocuments({ orgId: me.activeOrgId, status: 'New' }),
        leadsCol.countDocuments({ orgId: me.activeOrgId, status: 'In Progress' }),
        leadsCol.countDocuments({ orgId: me.activeOrgId, status: 'Converted' }),
        leadsCol.countDocuments({ orgId: me.activeOrgId, status: 'Cancelled' }),
      ]);
      const [totalTasks, pendingTasks, inProgTasks, doneTasks] = await Promise.all([
        tasksCol.countDocuments({ orgId: me.activeOrgId }),
        tasksCol.countDocuments({ orgId: me.activeOrgId, status: 'Pending' }),
        tasksCol.countDocuments({ orgId: me.activeOrgId, status: 'In Progress' }),
        tasksCol.countDocuments({ orgId: me.activeOrgId, status: 'Completed' }),
      ]);
      const overdueTasks = await tasksCol.countDocuments({
        orgId: me.activeOrgId, status: { $ne: 'Completed' }, dueDate: { $ne: '', $lt: todayStart },
      });

      // Overall Organization Task Efficiency
      const allCompletedTasks = await tasksCol.find({ orgId: me.activeOrgId, status: 'Completed' }).project({ dueDate: 1, completedAt: 1, updatedAt: 1 }).toArray();
      const onTimeCompletedTotal = allCompletedTasks.filter(t => !t.dueDate || (t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate.slice(0, 10)) || (!t.completedAt && t.updatedAt && t.updatedAt.slice(0, 10) <= t.dueDate.slice(0, 10))).length;
      const lateCompletedTotal = Math.max(0, doneTasks - onTimeCompletedTotal);
      const orgCompletionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 1000) / 10 : 0;
      const orgOnTimeEfficiencyRate = doneTasks > 0 ? Math.round((onTimeCompletedTotal / doneTasks) * 1000) / 10 : 0;

      // Department Tasks Overview
      const allDeptFilter = { orgId: me.activeOrgId };
      const [totalDeptTasks, pendingDeptTasks, completedDeptTasks, dueTodayDeptCount, dueIn2DaysDeptCount, overdueDeptCount] = await Promise.all([
        deptCol.countDocuments(allDeptFilter),
        deptCol.countDocuments({ ...allDeptFilter, status: { $nin: ['Completed', 'Closed'] } }),
        deptCol.countDocuments({ ...allDeptFilter, status: { $in: ['Completed', 'Closed'] } }),
        deptCol.countDocuments({ ...allDeptFilter, status: { $nin: ['Completed', 'Closed'] }, $or: [{ dueDate: todayStr }, { visitDate: todayStr }] }),
        deptCol.countDocuments({ ...allDeptFilter, status: { $nin: ['Completed', 'Closed'] }, $or: [{ dueDate: twoDaysStr }, { visitDate: twoDaysStr }] }),
        deptCol.countDocuments({ ...allDeptFilter, status: { $nin: ['Completed', 'Closed'] }, $or: [{ dueDate: { $ne: '', $lt: todayStr } }, { visitDate: { $ne: '', $lt: todayStr } }] })
      ]);

      // Staff Performance & Efficiency analysis for every user
      const users = await db.collection('users').find({ "orgs.orgId": me.activeOrgId }).project({ _id: 0, passwordHash: 0 }).toArray();
      const perf = [];
      for (const u of users) {
        const orgMembership = (u.orgs || []).find(o => o.orgId === me.activeOrgId);
        const uRole = orgMembership ? orgMembership.role : (u.role || 'staff');

        const staffFilter = {
          orgId: me.activeOrgId,
          $or: [
            { assignedTo: u.id },
            { assignees: u.id },
            { 'milestones.assignedTo': u.id },
            { 'milestones.assignees': u.id },
          ]
        };

        const [assigned, done, pending, uOverdue] = await Promise.all([
          tasksCol.countDocuments(staffFilter),
          tasksCol.countDocuments({ ...staffFilter, status: 'Completed' }),
          tasksCol.countDocuments({ ...staffFilter, status: { $ne: 'Completed' } }),
          tasksCol.countDocuments({ ...staffFilter, status: { $ne: 'Completed' }, dueDate: { $ne: '', $lt: todayStart } })
        ]);

        const uCompletedList = await tasksCol.find({ ...staffFilter, status: 'Completed' }).project({ dueDate: 1, completedAt: 1, updatedAt: 1 }).toArray();
        const uOnTime = uCompletedList.filter(t => !t.dueDate || (t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate.slice(0, 10)) || (!t.completedAt && t.updatedAt && t.updatedAt.slice(0, 10) <= t.dueDate.slice(0, 10))).length;
        const uLate = Math.max(0, done - uOnTime);
        const uCompletionRate = assigned > 0 ? Math.round((done / assigned) * 1000) / 10 : 0;
        const uOnTimeEfficiency = done > 0 ? Math.round((uOnTime / done) * 1000) / 10 : 0;

        perf.push({
          id: u.id,
          name: u.name,
          email: u.email || '',
          role: uRole,
          assigned,
          done,
          pending,
          overdue: uOverdue,
          completedOnTime: uOnTime,
          completedLate: uLate,
          completionRate: uCompletionRate,
          onTimeEfficiency: uOnTimeEfficiency
        });
      }

      const recentLeads = await leadsCol.find({ orgId: me.activeOrgId }).project({ _id: 0 }).sort({ createdAt: -1 }).limit(5).toArray();
      const recentTasks = await tasksCol.find({ orgId: me.activeOrgId }).project({ _id: 0 }).sort({ createdAt: -1 }).limit(5).toArray();

      // Tasks awaiting MY discussion (where discussionWith === me.id on task OR milestone)
      const awaitingDiscussion = await tasksCol.find({
        orgId: me.activeOrgId,
        $or: [
          { needsDiscussion: true, discussionWith: me.id },
          { 'milestones.needsDiscussion': true, 'milestones.discussionWith': me.id },
        ]
      }).project({ _id: 0 }).sort({ discussionRaisedAt: -1, createdAt: -1 }).limit(10).toArray();

      for (const t of [...recentTasks, ...awaitingDiscussion]) {
        if (!t.assignees || !Array.isArray(t.assignees) || !t.assignees.length) {
          t.assignees = t.assignedTo ? [t.assignedTo] : [];
        }
        if (!Array.isArray(t.milestones)) t.milestones = [];
        if (t.isBiggerTask === undefined) t.isBiggerTask = t.milestones.length > 0;
      }

      return json({
        role: me.role,
        leads: { total: totalLeads, new: newLeads, inProgress, converted, cancelled },
        tasks: { total: totalTasks, pending: pendingTasks, inProgress: inProgTasks, completed: doneTasks, overdue: overdueTasks, awaitingDiscussion: awaitingDiscussion.length },
        efficiency: {
          totalTasks,
          completedTasks: doneTasks,
          completionRate: orgCompletionRate,
          completedOnTime: onTimeCompletedTotal,
          completedLate: lateCompletedTotal,
          onTimeEfficiencyRate: orgOnTimeEfficiencyRate
        },
        deptStats: {
          total: totalDeptTasks,
          pending: pendingDeptTasks,
          completed: completedDeptTasks,
          dueToday: dueTodayDeptCount,
          dueInTwoDays: dueIn2DaysDeptCount,
          overdue: overdueDeptCount
        },
        staffPerformance: perf,
        recentLeads,
        recentTasks,
        awaitingDiscussion,
      });
    }

    // -------- ACTIVITY LOG --------
    if (route === 'activity' && method === 'GET') {
      const { page, limit } = getPaginationParams(url.searchParams);
      const filter = { orgId: me.activeOrgId };
      const total = await db.collection('activity_logs').countDocuments(filter);
      const data = await db.collection('activity_logs').find(filter).project({ _id: 0 }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();

      return json({
        logs: data, // compat
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }

    // -------- BACKUP & RESTORE (admin only) --------
    // Collections that are part of a full backup
    const BACKUP_COLLECTIONS = [
      'users', 'leads', 'tasks', 'clients', 'invoices',
      'payments', 'quotations', 'compliances', 'settings', 'activity_logs',
    ];

    // GET /api/backup/export -> returns a JSON file with all data (scoped to active org)
    if (route === 'backup/export' && method === 'GET') {
      if (me.role !== 'admin') return json({ error: 'Forbidden — admin only' }, 403);
      const includeLogs = url.searchParams.get('includeLogs') !== 'false';
      const includePasswords = url.searchParams.get('includePasswords') !== 'false';

      const data = {};
      const counts = {};
      for (const name of BACKUP_COLLECTIONS) {
        if (!includeLogs && name === 'activity_logs') continue;
        
        let docs = [];
        if (name === 'users') {
          docs = await db.collection('users').find({ "orgs.orgId": me.activeOrgId }).project({ _id: 0 }).toArray();
        } else if (name === 'settings') {
          docs = await db.collection('settings').find({ $or: [{ orgId: me.activeOrgId }, { id: `branding-${me.activeOrgId}` }] }).project({ _id: 0 }).toArray();
        } else {
          docs = await db.collection(name).find({ orgId: me.activeOrgId }).project({ _id: 0 }).toArray();
        }

        // strip password hashes optionally (users still need a hash on restore, so default keep)
        if (name === 'users' && !includePasswords) {
          for (const u of docs) delete u.passwordHash;
        }
        data[name] = docs;
        counts[name] = docs.length;
      }

      const payload = {
        meta: {
          appName: 'CA Practice Management',
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          exportedBy: { id: me.id, email: me.email, name: me.name },
          activeOrgId: me.activeOrgId,
          dbName: DB_NAME,
          includeLogs,
          includePasswords,
          counts,
        },
        data,
      };
      logActivity(db, me, 'export', 'backup', 'full', { counts });
      const filename = `ca-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      return new NextResponse(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // POST /api/backup/import -> restores from JSON payload (scoped to active org)
    // body: { mode: 'replace' | 'merge', payload: <export JSON>, collections?: [...] }
    if (route === 'backup/import' && method === 'POST') {
      if (me.role !== 'admin') return json({ error: 'Forbidden — admin only' }, 403);
      const body = await request.json();
      const mode = body.mode === 'replace' ? 'replace' : 'merge';
      const payload = body.payload;
      if (!payload || !payload.data || typeof payload.data !== 'object') {
        return json({ error: 'Invalid backup file: missing data section' }, 400);
      }
      if (payload.meta && payload.meta.appName && payload.meta.appName !== 'CA Practice Management') {
        return json({ error: `Backup is for a different app: ${payload.meta.appName}` }, 400);
      }
      const onlyCollections = Array.isArray(body.collections) && body.collections.length
        ? body.collections.filter(c => BACKUP_COLLECTIONS.includes(c))
        : BACKUP_COLLECTIONS;

      const summary = {};
      for (const name of onlyCollections) {
        const docs = Array.isArray(payload.data[name]) ? payload.data[name] : [];
        const col = db.collection(name);

        if (mode === 'replace') {
          if (name === 'users') {
            // Remove activeOrgId membership from all users except myself
            await col.updateMany(
              { id: { $ne: me.id }, "orgs.orgId": me.activeOrgId },
              { $pull: { orgs: { orgId: me.activeOrgId } } }
            );
          } else if (name === 'settings') {
            await col.deleteMany({ $or: [{ orgId: me.activeOrgId }, { id: `branding-${me.activeOrgId}` }] });
          } else {
            await col.deleteMany({ orgId: me.activeOrgId });
          }
        }

        let inserted = 0, updated = 0, skipped = 0;
        for (const doc of docs) {
          if (!doc || typeof doc !== 'object') { skipped++; continue; }
          // Strip _id if accidentally present
          delete doc._id;
          // Ensure id exists (UUIDs are mandatory)
          if (!doc.id) doc.id = uuidv4();

          if (name === 'users') {
            // For users without passwordHash, set a placeholder so login still requires a reset
            if (!doc.passwordHash) {
              doc.passwordHash = await bcrypt.hash(uuidv4(), 10);
            }
            // Ensure the user has the active org in their memberships
            const exists = await col.findOne({ id: doc.id });
            if (exists) {
              const targetOrgs = exists.orgs || [];
              const orgMembership = targetOrgs.find(o => o.orgId === me.activeOrgId);
              if (!orgMembership) {
                targetOrgs.push({ orgId: me.activeOrgId, role: 'staff' });
              }
              await col.updateOne({ id: doc.id }, { $set: { orgs: targetOrgs } });
              updated++;
            } else {
              doc.orgs = [{ orgId: me.activeOrgId, role: 'staff' }];
              await col.insertOne(doc);
              inserted++;
            }
          } else {
            // Tag with activeOrgId
            doc.orgId = me.activeOrgId;
            if (name === 'settings' && doc.id.startsWith('branding-')) {
              doc.id = `branding-${me.activeOrgId}`;
            }

            if (mode === 'replace') {
              await col.insertOne(doc);
              inserted++;
            } else {
              // Merge: upsert by id
              const exists = await col.findOne({ id: doc.id, orgId: me.activeOrgId });
              if (exists) {
                const { id: _id1, ...rest } = doc;
                await col.updateOne({ id: doc.id, orgId: me.activeOrgId }, { $set: rest });
                updated++;
              } else {
                await col.insertOne(doc);
                inserted++;
              }
            }
          }
        }
        summary[name] = { total: docs.length, inserted, updated, skipped };
      }

      logActivity(db, me, 'import', 'backup', 'full', { mode, summary });
      return json({ ok: true, mode, summary });
    }

    // POST /api/backup/clear-old-data -> deletes old records as of a selected date (scoped to active org)
    if (route === 'backup/clear-old-data' && method === 'POST') {
      if (me.role !== 'admin') return json({ error: 'Forbidden — admin only' }, 403);
      const body = await request.json();
      const asOnDate = body.asOnDate; // "YYYY-MM-DD"
      if (!asOnDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOnDate)) {
        return json({ error: 'Invalid or missing asOnDate format (expected YYYY-MM-DD)' }, 400);
      }
      const categories = Array.isArray(body.categories) ? body.categories : [];

      const endOfIsoDate = `${asOnDate}T23:59:59.999Z`;
      const summary = {};

      // 1. Tasks
      if (categories.includes('tasks')) {
        const q = {
          orgId: me.activeOrgId,
          $or: [
            { createdAt: { $lte: endOfIsoDate } },
            { dueDate: { $ne: '', $lte: asOnDate } }
          ]
        };
        const res = await db.collection('tasks').deleteMany(q);
        summary.tasks = res.deletedCount || 0;
      }

      // 2. Leads
      if (categories.includes('leads')) {
        const q = {
          orgId: me.activeOrgId,
          $or: [
            { createdAt: { $lte: endOfIsoDate } },
            { followUpDate: { $ne: '', $lte: asOnDate } }
          ]
        };
        const res = await db.collection('leads').deleteMany(q);
        summary.leads = res.deletedCount || 0;
      }

      // 3. Invoices & Payments
      if (categories.includes('invoices_payments')) {
        // Find invoices to delete first so we can remove their payments
        const invQuery = {
          orgId: me.activeOrgId,
          $or: [
            { createdAt: { $lte: endOfIsoDate } },
            { invoiceDate: { $lte: asOnDate } },
            { dueDate: { $lte: asOnDate } }
          ]
        };
        const invoicesToDelete = await db.collection('invoices').find(invQuery).project({ id: 1 }).toArray();
        const invoiceIds = invoicesToDelete.map(i => i.id).filter(Boolean);

        // Delete invoices
        const resInv = await db.collection('invoices').deleteMany(invQuery);

        // Delete payments linked to those deleted invoices
        const payQueryLinked = { orgId: me.activeOrgId, invoiceId: { $in: invoiceIds } };
        // Delete payments directly based on payment date
        const payQueryDirect = {
          orgId: me.activeOrgId,
          $or: [
            { createdAt: { $lte: endOfIsoDate } },
            { date: { $lte: asOnDate } }
          ]
        };

        const resPayLinked = await db.collection('payments').deleteMany(payQueryLinked);
        const resPayDirect = await db.collection('payments').deleteMany({
          ...payQueryDirect,
          invoiceId: { $nin: invoiceIds }
        });

        summary.invoices = resInv.deletedCount || 0;
        summary.payments = (resPayLinked.deletedCount || 0) + (resPayDirect.deletedCount || 0);
      }

      // 4. Quotations
      if (categories.includes('quotations')) {
        const q = {
          orgId: me.activeOrgId,
          $or: [
            { createdAt: { $lte: endOfIsoDate } },
            { quotationDate: { $lte: asOnDate } }
          ]
        };
        const res = await db.collection('quotations').deleteMany(q);
        summary.quotations = res.deletedCount || 0;
      }

      // 5. Activity Logs
      if (categories.includes('activity_logs')) {
        const q = { orgId: me.activeOrgId, createdAt: { $lte: endOfIsoDate } };
        const res = await db.collection('activity_logs').deleteMany(q);
        summary.activity_logs = res.deletedCount || 0;
      }

      // 6. Compliances
      if (categories.includes('compliances')) {
        const q = { orgId: me.activeOrgId, createdAt: { $lte: endOfIsoDate } };
        const res = await db.collection('compliances').deleteMany(q);
        summary.compliances = res.deletedCount || 0;
      }
      
      logActivity(db, me, 'clear_old_data', 'backup', 'clear', { asOnDate, categories, summary });
      return json({ ok: true, summary });
    }

    // -------- WHATSAPP ADMIN TEST ENDPOINT --------
    if (route === 'whatsapp/test' && method === 'POST') {
      if (me.role !== 'admin') {
        return json({ error: 'Forbidden: Admin access required' }, 403);
      }

      const body = await request.json();
      const { userId, templateName, phone } = body;

      const targetUser = userId 
        ? await db.collection('users').findOne({ id: userId })
        : { id: 'test_admin', name: 'Test Recipient', whatsappNumber: phone || me.whatsappNumber || '', whatsappOptIn: true, whatsappNotificationsEnabled: true };

      if (!targetUser || !targetUser.whatsappNumber) {
        return json({ error: 'No recipient phone number provided or found' }, 400);
      }

      if (targetUser) {
        targetUser.activeOrgId = me.activeOrgId;
      }

      const testTemplate = templateName || 'task_assigned_notification';
      const testParams = [
        targetUser.name,
        'Test Demo Task',
        new Date().toISOString().slice(0, 10),
        'High'
      ];

      const res = await sendWhatsAppTemplateMessage(targetUser.whatsappNumber, testTemplate, testParams);

      await logNotification(db, {
        type: 'TEST_NOTIFICATION',
        user: targetUser,
        templateName: testTemplate,
        status: res.success ? 'sent' : 'failed',
        messageId: res.messageId,
        error: res.error
      });

      return json({
        success: res.success,
        messageId: res.messageId,
        error: res.error,
        recipient: {
          name: targetUser.name,
          phone: targetUser.whatsappNumber
        }
      });
    }

    // -------- WHATSAPP LOGS (admin/manager only) --------
    if (route === 'whatsapp/logs' && method === 'GET') {
      if (me.role === 'staff') return json({ error: 'Forbidden' }, 403);
      const { page, limit } = getPaginationParams(url.searchParams);
      const total = await db.collection('whatsapp_notifications').countDocuments({ orgId: me.activeOrgId });
      const data = await db.collection('whatsapp_notifications').find({ orgId: me.activeOrgId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      return json({
        logs: data, // compat
        data,
        page,
        limit,
        total,
        hasMore: total > page * limit
      });
    }

    if (route === '' || route === 'health') {
      return json({ ok: true, service: 'CA Practice Management API' });
    }

    return json({ error: `Route not found: ${method} /${route}` }, 404);
  } catch (err) {
    console.error('API error:', err);
    return json({ error: err.message || 'Server error' }, 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
