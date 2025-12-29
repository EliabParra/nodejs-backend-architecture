import "../src/globals.js";

const SEQ_NAME = "security.permission_method_permission_method_id_seq";

async function main() {
	const pool = globalThis.db?.pool;
	if (!pool) {
		throw new Error("DB pool not initialized. Ensure src/globals.js sets globalThis.db.pool");
	}

	await pool.query("BEGIN");
	try {
		await pool.query(`create sequence if not exists ${SEQ_NAME}`);

		const maxRes = await pool.query(
			"select coalesce(max(permission_method_id),0) as max_id from security.permission_method"
		);
		const maxId = Number(maxRes.rows?.[0]?.max_id ?? 0);
		const nextId = maxId + 1;

		await pool.query("select setval($1::regclass,$2,false)", [SEQ_NAME, nextId]);

		await pool.query(
			"alter table security.permission_method alter column permission_method_id set default nextval('security.permission_method_permission_method_id_seq'::regclass)"
		);

		await pool.query("COMMIT");
		console.log(JSON.stringify({ ok: true, seq: SEQ_NAME, nextId }, null, 2));
	} catch (error) {
		await pool.query("ROLLBACK");
		console.error(
			JSON.stringify(
				{
					ok: false,
					message: error?.message,
					code: error?.code,
				},
				null,
				2
			)
		);
		process.exitCode = 1;
	}
}

await main();
