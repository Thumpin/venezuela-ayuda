import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

// Server-only Supabase client.
//
// Reads/writes go through here so a secret key (and therefore private phone
// numbers) never reach the browser. We prefer a secret/service-role key when
// present (it bypasses RLS, so all writes are server-controlled). Otherwise we
// fall back to the publishable/anon key — the app still works because RLS
// allows inserts and the public_* views expose only non-sensitive columns.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Server-side secret key (new `sb_secret_...` format or legacy service-role JWT).
const secretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Public client key (new `sb_publishable_...` format or legacy anon JWT).
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;
let pool: pg.Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: "postgresql://postgres:postgres@localhost:5432/mapa_emergencia",
    });
  }
  return pool;
}

class MockSupabaseQueryBuilder {
  table: string;
  selectFields: string;
  selectOptions: any;
  whereClauses: string[];
  whereValues: any[];
  orderBy: string;
  limitVal: number | null;
  isSingle: boolean;
  isMaybeSingle: boolean;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  insertData: any;
  updateData: any;

  constructor(table: string) {
    this.table = table;
    this.selectFields = "*";
    this.selectOptions = null;
    this.whereClauses = [];
    this.whereValues = [];
    this.orderBy = "";
    this.limitVal = null;
    this.isSingle = false;
    this.isMaybeSingle = false;
    this.operation = "SELECT";
    this.insertData = null;
    this.updateData = null;
  }

  select(fields?: string, options?: any) {
    this.selectFields = fields || "*";
    this.selectOptions = options;
    return this;
  }

  eq(col: string, val: any) {
    if (val === null) {
      this.whereClauses.push(`"${col}" IS NULL`);
    } else {
      this.whereClauses.push(`"${col}" = $${this.whereValues.length + 1}`);
      this.whereValues.push(val);
    }
    return this;
  }

  neq(col: string, val: any) {
    if (val === null) {
      this.whereClauses.push(`"${col}" IS NOT NULL`);
    } else {
      this.whereClauses.push(`"${col}" != $${this.whereValues.length + 1}`);
      this.whereValues.push(val);
    }
    return this;
  }

  is(col: string, val: any) {
    if (val === null) {
      this.whereClauses.push(`"${col}" IS NULL`);
    } else if (val === true) {
      this.whereClauses.push(`"${col}" IS TRUE`);
    } else if (val === false) {
      this.whereClauses.push(`"${col}" IS FALSE`);
    } else {
      this.whereClauses.push(`"${col}" = $${this.whereValues.length + 1}`);
      this.whereValues.push(val);
    }
    return this;
  }

  not(col: string, op: string, val: any) {
    if (op === "is" && val === null) {
      this.whereClauses.push(`"${col}" IS NOT NULL`);
    } else if (op === "eq") {
      this.whereClauses.push(`"${col}" != $${this.whereValues.length + 1}`);
      this.whereValues.push(val);
    } else {
      this.whereClauses.push(`NOT ("${col}" = $${this.whereValues.length + 1})`);
      this.whereValues.push(val);
    }
    return this;
  }

  or(filters: string) {
    const parts = filters.split(",");
    const subClauses: string[] = [];
    for (const part of parts) {
      if (part.includes(".is.null")) {
        const col = part.split(".is.null")[0];
        subClauses.push(`"${col}" IS NULL`);
      } else if (part.includes(".lt.")) {
        const [col, val] = part.split(".lt.");
        subClauses.push(`"${col}" < $${this.whereValues.length + 1}`);
        this.whereValues.push(val);
      } else if (part.includes(".eq.")) {
        const [col, val] = part.split(".eq.");
        subClauses.push(`"${col}" = $${this.whereValues.length + 1}`);
        this.whereValues.push(val);
      }
    }
    if (subClauses.length > 0) {
      this.whereClauses.push(`(${subClauses.join(" OR ")})`);
    }
    return this;
  }

  in(col: string, vals: any[]) {
    if (vals.length === 0) {
      this.whereClauses.push("1=0");
      return this;
    }
    const placeholdersList: string[] = [];
    vals.forEach(val => {
      placeholdersList.push(`$${this.whereValues.length + 1}`);
      this.whereValues.push(val);
    });
    this.whereClauses.push(`"${col}" IN (${placeholdersList.join(', ')})`);
    return this;
  }

  ilike(col: string, val: any) {
    this.whereClauses.push(`"${col}" ILIKE $${this.whereValues.length + 1}`);
    this.whereValues.push(val);
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    const dir = options && options.ascending === false ? "DESC" : "ASC";
    this.orderBy = `ORDER BY "${col}" ${dir}`;
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data: any) {
    this.operation = "INSERT";
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.operation = "UPDATE";
    this.updateData = data;
    return this;
  }

  delete() {
    this.operation = "DELETE";
    return this;
  }

  async then(resolve: any, reject: any) {
    try {
      const res = await this.execute();
      resolve(res);
    } catch (err) {
      reject(err);
    }
  }

  async execute() {
    const pool = getPool();
    let queryText = "";
    let queryValues = [...this.whereValues];

    if (this.operation === "SELECT") {
      let fields = this.selectFields;
      fields = fields.split(',').map(f => {
        const clean = f.trim();
        if (clean === '*') return clean;
        return `"${clean}"`;
      }).join(', ');

      queryText = `SELECT ${fields} FROM "${this.table}"`;
      if (this.whereClauses.length > 0) {
        queryText += ` WHERE ${this.whereClauses.join(" AND ")}`;
      }
      if (this.orderBy) {
        queryText += ` ${this.orderBy}`;
      }
      if (this.limitVal !== null) {
        queryText += ` LIMIT ${this.limitVal}`;
      }
    } else if (this.operation === "INSERT") {
      const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      if (rows.length === 0) return { data: [], error: null };
      
      const columns = Object.keys(rows[0]).filter(c => c !== 'location');
      const placeholders: string[] = [];
      const values: any[] = [];
      
      rows.forEach((row: any, rIdx: number) => {
        const rowPlaceholders: string[] = [];
        columns.forEach((col, cIdx) => {
          rowPlaceholders.push(`$${values.length + 1}`);
          let val = row[col];
          if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            val = JSON.stringify(val);
          }
          values.push(val);
        });
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
      });

      queryText = `INSERT INTO "${this.table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders.join(', ')} RETURNING *`;
      queryValues = values;
    } else if (this.operation === "UPDATE") {
      const columns = Object.keys(this.updateData).filter(c => c !== 'location');
      const setClauses = columns.map((col, idx) => `"${col}" = $${idx + 1}`);
      const setValues = columns.map(col => {
        let val = this.updateData[col];
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          val = JSON.stringify(val);
        }
        return val;
      });
      
      queryText = `UPDATE "${this.table}" SET ${setClauses.join(', ')}`;
      
      const whereOffset = setValues.length;
      if (this.whereClauses.length > 0) {
        const offsetWhereClauses = this.whereClauses.map(clause => {
          return clause.replace(/\$(\d+)/g, (match, p1) => `$${parseInt(p1) + whereOffset}`);
        });
        queryText += ` WHERE ${offsetWhereClauses.join(" AND ")}`;
      }
      queryText += ` RETURNING *`;
      queryValues = [...setValues, ...this.whereValues];
    } else if (this.operation === "DELETE") {
      queryText = `DELETE FROM "${this.table}"`;
      if (this.whereClauses.length > 0) {
        queryText += ` WHERE ${this.whereClauses.join(" AND ")}`;
      }
      queryText += ` RETURNING *`;
    }

    try {
      let countVal: number | null = null;
      if (this.selectOptions?.count) {
        let countQueryText = `SELECT COUNT(*) FROM "${this.table}"`;
        if (this.whereClauses.length > 0) {
          countQueryText += ` WHERE ${this.whereClauses.join(" AND ")}`;
        }
        const countRes = await pool.query(countQueryText, queryValues);
        countVal = parseInt(countRes.rows[0].count, 10);
      }

      let data: any = [];
      if (!this.selectOptions?.head) {
        const result = await pool.query(queryText, queryValues);
        data = result.rows;

        if (this.isSingle || this.isMaybeSingle) {
          data = data[0] || null;
          if (this.isSingle && !data) {
            return { data: null, error: { message: "Row not found" }, count: countVal };
          }
        }
      }

      return { data, error: null, count: countVal };
    } catch (err: any) {
      console.error("Local PG Query Error:", err, "Query:", queryText);
      return { data: null, error: err, count: null };
    }
  }
}

const mockClient = {
  from(table: string) {
    return new MockSupabaseQueryBuilder(table);
  },
  rpc(fnName: string, args?: any) {
    return {
      then: async (resolve: any, reject: any) => {
        try {
          const pool = getPool();
          const keys = Object.keys(args || {});
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => args[k]);
          const res = await pool.query(`SELECT * FROM "${fnName}"(${placeholders})`, values);
          resolve({ data: res.rows, error: null });
        } catch (err) {
          console.error("Local PG RPC Error:", err);
          resolve({ data: null, error: err });
        }
      }
    };
  }
} as unknown as SupabaseClient;

// True when a secret/service-role key is configured — writes bypass RLS and we
// can read back inserted rows.
export function hasSecretKey(): boolean {
  return Boolean(secretKey);
}

export function isSupabaseConfigured(): boolean {
  return process.env.BYPASS_ADMIN_AUTH === "true" || Boolean(url && (secretKey || publicKey));
}

export function getServerSupabase(): SupabaseClient {
  if (process.env.BYPASS_ADMIN_AUTH === "true") {
    return mockClient;
  }
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase no está configurado. Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY (o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }
  if (cached) return cached;
  cached = createClient(url!, (secretKey || publicKey)!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

