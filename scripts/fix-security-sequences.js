import "../src/globals.js";

const pool = globalThis.db?.pool;
if (!pool) throw new Error("DB pool not initialized");

const targets = [
	{
		seq: "security.object_object_id_seq",
		table: "security.object",
		column: "object_id",
	},
	{
		seq: "security.method_method_id_seq",
		table: "security.method",
		column: "method_id",
	},
	{
		seq: "security.permission_method_permission_method_id_seq",
		table: "security.permission_method",
		column: "permission_method_id",
	},
];

async function seqExists(seq) {
	const r = await pool.query("select to_regclass($1) as reg", [seq]);
	return Boolean(r.rows?.[0]?.reg);
}

async function maxId(table, column) {
	const r = await pool.query(`select coalesce(max(${column}),0) as max_id from ${table}`);
	return Number(r.rows?.[0]?.max_id ?? 0);
}

await pool.query("BEGIN");
try {
	const results = [];
	for (const t of targets) {
		if (!(await seqExists(t.seq))) {
			results.push({ seq: t.seq, ok: false, reason: "missing" });
			continue;
		}

		const m = await maxId(t.table, t.column);
		const nextId = m + 1;
		await pool.query("select setval($1::regclass,$2,false)", [t.seq, nextId]);
		results.push({ seq: t.seq, ok: true, maxId: m, nextId });
	}

	await pool.query("COMMIT");
	console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (error) {
	await pool.query("ROLLBACK");
	console.error(JSON.stringify({ ok: false, message: error?.message, code: error?.code }, null, 2));
	process.exitCode = 1;
}
