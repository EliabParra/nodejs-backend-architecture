import "../src/globals.js";

const name = process.argv[2] || "pk_tbl_0";
const pool = globalThis.db?.pool;
if (!pool) throw new Error("DB pool not initialized");

const sql = `
select
  n.nspname as schema,
  c.relname as table,
  con.conname as constraint,
  con.contype as type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where con.conname = $1
order by 1,2;
`;

const r = await pool.query(sql, [name]);
console.log(JSON.stringify(r.rows, null, 2));
