import "../src/globals.js";

const pool = globalThis.db?.pool;
if (!pool) throw new Error("DB pool not initialized");

const res = await pool.query(
	"select column_default, is_nullable from information_schema.columns where table_schema='security' and table_name='permission_method' and column_name='permission_method_id'"
);
console.log(res.rows[0] ?? null);
