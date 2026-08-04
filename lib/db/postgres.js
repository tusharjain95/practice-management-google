import pg from 'pg';
const { Pool } = pg;

let pool = null;
let initializedTables = new Set();

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

export async function getPostgresDb(connectionString) {
  if (!pool) {
    const isSupabase = connectionString.includes('supabase') || connectionString.includes('neon.tech') || connectionString.includes('.com');
    pool = new Pool({
      connectionString,
      ssl: isSupabase ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  function buildSqlWhere(query, params = []) {
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
      return { whereClause: '', params };
    }

    const conditions = [];

    for (const key of Object.keys(query)) {
      const val = query[key];

      if (key === '$or') {
        if (Array.isArray(val) && val.length > 0) {
          const orClauses = [];
          for (const subQuery of val) {
            const res = buildSqlWhere(subQuery, params);
            if (res.whereClause) {
              orClauses.push(`(${res.whereClause})`);
            }
          }
          if (orClauses.length > 0) {
            conditions.push(`(${orClauses.join(' OR ')})`);
          }
        }
        continue;
      }

      if (key === '$and') {
        if (Array.isArray(val) && val.length > 0) {
          const andClauses = [];
          for (const subQuery of val) {
            const res = buildSqlWhere(subQuery, params);
            if (res.whereClause) {
              andClauses.push(`(${res.whereClause})`);
            }
          }
          if (andClauses.length > 0) {
            conditions.push(`(${andClauses.join(' AND ')})`);
          }
        }
        continue;
      }

      if (key === 'id' || key === '_id') {
        if (typeof val === 'string') {
          params.push(val);
          conditions.push(`id = $${params.length}`);
        } else if (val && typeof val === 'object' && val.$in && Array.isArray(val.$in)) {
          params.push(val.$in.map(String));
          conditions.push(`id = ANY($${params.length})`);
        }
        continue;
      }

      if (key === 'orgId') {
        if (typeof val === 'string') {
          params.push(val);
          conditions.push(`org_id = $${params.length}`);
        } else if (val && typeof val === 'object' && val.$in && Array.isArray(val.$in)) {
          params.push(val.$in.map(String));
          conditions.push(`org_id = ANY($${params.length})`);
        }
        continue;
      }

      let jsonPath;
      if (key.includes('.')) {
        const parts = key.split('.');
        jsonPath = `data#>>'{${parts.join(',')}}'`;
      } else {
        jsonPath = `data->>'${key}'`;
      }

      if (val === null || val === undefined) {
        conditions.push(`(${jsonPath}) IS NULL`);
      } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        params.push(String(val));
        conditions.push(`${jsonPath} = $${params.length}`);
      } else if (typeof val === 'object') {
        if (val instanceof RegExp) {
          params.push(val.source);
          conditions.push(`${jsonPath} ~* $${params.length}`);
        } else if (Array.isArray(val)) {
          params.push(JSON.stringify(val));
          conditions.push(`data->'${key}' = $${params.length}::jsonb`);
        } else {
          const ops = Object.keys(val);
          for (const op of ops) {
            const opVal = val[op];
            if (op === '$eq') {
              params.push(String(opVal));
              conditions.push(`${jsonPath} = $${params.length}`);
            } else if (op === '$ne') {
              params.push(String(opVal));
              conditions.push(`(${jsonPath} IS NULL OR ${jsonPath} != $${params.length})`);
            } else if (op === '$gt') {
              params.push(String(opVal));
              conditions.push(`${jsonPath} > $${params.length}`);
            } else if (op === '$gte') {
              params.push(String(opVal));
              conditions.push(`${jsonPath} >= $${params.length}`);
            } else if (op === '$lt') {
              params.push(String(opVal));
              conditions.push(`${jsonPath} < $${params.length}`);
            } else if (op === '$lte') {
              params.push(String(opVal));
              conditions.push(`${jsonPath} <= $${params.length}`);
            } else if (op === '$in') {
              if (Array.isArray(opVal) && opVal.length > 0) {
                params.push(opVal.map(String));
                conditions.push(`${jsonPath} = ANY($${params.length})`);
              }
            } else if (op === '$nin') {
              if (Array.isArray(opVal) && opVal.length > 0) {
                params.push(opVal.map(String));
                conditions.push(`NOT (${jsonPath} = ANY($${params.length}))`);
              }
            } else if (op === '$regex') {
              const pattern = String(opVal);
              params.push(pattern);
              const isCaseInsensitive = val['$options'] && val['$options'].includes('i');
              if (isCaseInsensitive) {
                conditions.push(`${jsonPath} ILIKE '%' || $${params.length} || '%'`);
              } else {
                conditions.push(`${jsonPath} LIKE '%' || $${params.length} || '%'`);
              }
            } else if (op === '$exists') {
              if (opVal) {
                conditions.push(`data ? '${key}'`);
              } else {
                conditions.push(`NOT (data ? '${key}')`);
              }
            }
          }
        }
      }
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '';
    return { whereClause, params };
  }

  const db = {
    async query(text, params) {
      return pool.query(text, params);
    },
    collection(name) {
      const tableName = `tbl_${name}`;

      const ensureTable = async () => {
        if (initializedTables.has(tableName)) return;
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
              id VARCHAR(255) PRIMARY KEY,
              org_id VARCHAR(255),
              data JSONB,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_org_id ON ${tableName} (org_id);`).catch(() => {});
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_client_id ON ${tableName} ((data->>'clientId'));`).catch(() => {});
          await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_status ON ${tableName} ((data->>'status'));`).catch(() => {});
          initializedTables.add(tableName);
        } catch (err) {
          console.error(`[AI Studio] Failed to ensure table ${tableName}:`, err);
        }
      };

      return {
        async findOne(query, options = {}) {
          await ensureTable();
          const { whereClause, params } = buildSqlWhere(query);
          let sql = `SELECT data FROM ${tableName}`;
          if (whereClause) sql += ` WHERE ${whereClause}`;
          sql += ` LIMIT 1`;

          const res = await pool.query(sql, params);
          if (res.rows.length === 0) return null;

          let found = res.rows[0].data;
          if (!matchQuery(found, query)) return null;

          let result = { ...found };
          if (options.projection) {
            if (options.projection._id === 0) delete result._id;
          }
          return result;
        },

        find(query) {
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
              await ensureTable();
              const { whereClause, params } = buildSqlWhere(query);
              let sql = `SELECT data FROM ${tableName}`;
              if (whereClause) sql += ` WHERE ${whereClause}`;

              if (sortSpec) {
                const keys = Object.keys(sortSpec);
                if (keys.length > 0) {
                  const key = keys[0];
                  const dir = sortSpec[key] < 0 ? 'DESC' : 'ASC';
                  if (key === 'id') {
                    sql += ` ORDER BY id ${dir}`;
                  } else if (key === 'created_at' || key === 'createdAt') {
                    sql += ` ORDER BY created_at ${dir}`;
                  } else {
                    sql += ` ORDER BY (data->>'${key}') ${dir}`;
                  }
                }
              }

              if (skipVal !== null && skipVal > 0) {
                sql += ` OFFSET ${parseInt(skipVal, 10)}`;
              }
              if (limitVal !== null && limitVal > 0) {
                sql += ` LIMIT ${parseInt(limitVal, 10)}`;
              }

              const res = await pool.query(sql, params);
              let docs = res.rows.map(r => r.data);

              let filtered = docs.filter(doc => matchQuery(doc, query));

              if (projSpec) {
                filtered = filtered.map(doc => {
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

              return filtered;
            }
          };
          return cursor;
        },

        async insertOne(doc) {
          await ensureTable();
          const id = doc.id || doc._id || Math.random().toString(36).substring(2);
          if (!doc.id) doc.id = id;
          const orgId = doc.orgId || null;

          await pool.query(
            `INSERT INTO ${tableName} (id, org_id, data) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET org_id = $2, data = $3`,
            [id, orgId, JSON.stringify(doc)]
          );
          return { insertedId: id };
        },

        async insertMany(docs) {
          await ensureTable();
          for (const doc of docs) {
            const id = doc.id || doc._id || Math.random().toString(36).substring(2);
            if (!doc.id) doc.id = id;
            const orgId = doc.orgId || null;

            await pool.query(
              `INSERT INTO ${tableName} (id, org_id, data) VALUES ($1, $2, $3)
               ON CONFLICT (id) DO UPDATE SET org_id = $2, data = $3`,
              [id, orgId, JSON.stringify(doc)]
            );
          }
          return { insertedCount: docs.length };
        },

        async updateOne(query, updateSpec, options = {}) {
          await ensureTable();
          const { whereClause, params } = buildSqlWhere(query);
          let sql = `SELECT id, org_id, data FROM ${tableName}`;
          if (whereClause) sql += ` WHERE ${whereClause}`;

          const res = await pool.query(sql, params);
          const row = res.rows.find(r => matchQuery(r.data, query));

          if (row) {
            const updatedDoc = applyUpdate({ ...row.data }, updateSpec);
            await pool.query(
              `UPDATE ${tableName} SET org_id = $1, data = $2 WHERE id = $3`,
              [updatedDoc.orgId || null, JSON.stringify(updatedDoc), row.id]
            );
            return { matchedCount: 1, modifiedCount: 1 };
          } else if (options.upsert) {
            const newDoc = {};
            if (query) {
              for (const k of Object.keys(query)) {
                if (typeof query[k] !== 'object') newDoc[k] = query[k];
              }
            }
            const updatedDoc = applyUpdate(newDoc, updateSpec);
            const id = updatedDoc.id || updatedDoc._id || Math.random().toString(36).substring(2);
            if (!updatedDoc.id) updatedDoc.id = id;

            await pool.query(
              `INSERT INTO ${tableName} (id, org_id, data) VALUES ($1, $2, $3)
               ON CONFLICT (id) DO UPDATE SET org_id = $2, data = $3`,
              [id, updatedDoc.orgId || null, JSON.stringify(updatedDoc)]
            );
            return { matchedCount: 0, modifiedCount: 1, upsertedId: id };
          }

          return { matchedCount: 0, modifiedCount: 0 };
        },

        async updateMany(query, updateSpec, options = {}) {
          await ensureTable();
          const { whereClause, params } = buildSqlWhere(query);
          let sql = `SELECT id, org_id, data FROM ${tableName}`;
          if (whereClause) sql += ` WHERE ${whereClause}`;

          const res = await pool.query(sql, params);
          const matchingRows = res.rows.filter(r => matchQuery(r.data, query));

          let modifiedCount = 0;
          for (const row of matchingRows) {
            const updatedDoc = applyUpdate({ ...row.data }, updateSpec);
            await pool.query(
              `UPDATE ${tableName} SET org_id = $1, data = $2 WHERE id = $3`,
              [updatedDoc.orgId || null, JSON.stringify(updatedDoc), row.id]
            );
            modifiedCount++;
          }

          return { matchedCount: matchingRows.length, modifiedCount };
        },

        async deleteOne(query) {
          await ensureTable();
          const { whereClause, params } = buildSqlWhere(query);
          let sql = `SELECT id, org_id, data FROM ${tableName}`;
          if (whereClause) sql += ` WHERE ${whereClause}`;

          const res = await pool.query(sql, params);
          const row = res.rows.find(r => matchQuery(r.data, query));

          if (row) {
            await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [row.id]);
            return { deletedCount: 1 };
          }
          return { deletedCount: 0 };
        },

        async deleteMany(query) {
          await ensureTable();
          const { whereClause, params } = buildSqlWhere(query);
          let sql = `SELECT id, org_id, data FROM ${tableName}`;
          if (whereClause) sql += ` WHERE ${whereClause}`;

          const res = await pool.query(sql, params);
          const matchingRows = res.rows.filter(r => matchQuery(r.data, query));

          let deletedCount = 0;
          for (const row of matchingRows) {
            await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [row.id]);
            deletedCount++;
          }

          return { deletedCount };
        },

        async countDocuments(query = {}) {
          await ensureTable();
          const { whereClause, params } = buildSqlWhere(query);
          let sql = `SELECT COUNT(*) AS total FROM ${tableName}`;
          if (whereClause) sql += ` WHERE ${whereClause}`;

          const res = await pool.query(sql, params);
          return parseInt(res.rows[0]?.total || '0', 10);
        }
      };
    }
  };

  return db;
}
