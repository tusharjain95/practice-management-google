import { MongoClient } from 'mongodb';
import { getPostgresDb } from './db/postgres';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'ca_practice';

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
    
    const docValue = doc[key];
    const queryValue = query[key];
    
    if (queryValue && typeof queryValue === 'object' && !(queryValue instanceof RegExp)) {
      for (const op of Object.keys(queryValue)) {
        const val = queryValue[op];
        if (op === '$ne') {
          if (docValue === val) return false;
        } else if (op === '$eq') {
          if (docValue !== val) return false;
        } else if (op === '$gt') {
          if (!(docValue > val)) return false;
        } else if (op === '$gte') {
          if (!(docValue >= val)) return false;
        } else if (op === '$lt') {
          if (!(docValue < val)) return false;
        } else if (op === '$lte') {
          if (!(docValue <= val)) return false;
        } else if (op === '$in') {
          if (!Array.isArray(val) || !val.includes(docValue)) return false;
        } else if (op === '$nin') {
          if (!Array.isArray(val) || val.includes(docValue)) return false;
        }
      }
    } else if (queryValue instanceof RegExp || (queryValue && typeof queryValue.test === 'function')) {
      if (typeof docValue !== 'string' || !queryValue.test(docValue)) return false;
    } else {
      if (docValue !== queryValue) return false;
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
        doc[k] = doc[k].filter(item => item !== valToPull);
      }
    }
  }
  
  return doc;
}

export function getMockDb() {
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

export async function getDb() {
  if (cached.db) return cached.db;
  
  const pgUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_URL;
  if (pgUrl) {
    console.log('[AI Studio] Connecting to Supabase/PostgreSQL database via lib/db...');
    try {
      cached.db = await getPostgresDb(pgUrl);
      await seedAdmin(cached.db);
      console.log('[AI Studio] Connected to Supabase/PostgreSQL successfully via lib/db!');
      return cached.db;
    } catch (err) {
      console.error('[AI Studio] Failed to connect to Supabase/PostgreSQL database via lib/db:', err);
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
      whatsappNumber: '',
      whatsappOptIn: false,
      whatsappNotificationsEnabled: false,
      dailyRosterEnabled: false
    });
  }
}
