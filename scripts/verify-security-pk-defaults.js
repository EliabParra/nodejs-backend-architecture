import "../src/globals.js";

const pool = globalThis.db?.pool;
if (!pool) throw new Error("DB pool not initialized");

async function show(table, column) {
	const r = await pool.query(
		"select column_default, is_nullable, data_type from information_schema.columns where table_schema='security' and table_name=$1 and column_name=$2",
		[table, column]
	);
	return { table, column, ...r.rows?.[0] };
}

const targets = [
	["object", "object_id"],
	["method", "method_id"],
	["method", "tx_nu"],
	["permission_method", "permission_method_id"],
];

const out = [];
for (const [t, c] of targets) out.push(await show(t, c));

console.log(JSON.stringify(out, null, 2));
