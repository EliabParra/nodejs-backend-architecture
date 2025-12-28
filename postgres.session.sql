-- Tabla para persistir sesiones de express-session usando Postgres.
-- Configurada para connect-pg-simple con tableName = "session".

CREATE TABLE IF NOT EXISTS "session" (
	"sid" varchar NOT NULL COLLATE "default",
	"sess" json NOT NULL,
	"expire" timestamp(6) NOT NULL,
	CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");