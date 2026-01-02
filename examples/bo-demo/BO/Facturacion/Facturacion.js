/*
FacturacionRepository

Guía rápida:
- Este módulo contiene acceso a datos (DB), aislado del BO.
- Define tus SQL en src/config/queries.json y ejecútalas con db.exe('<schema>', '<queryName>', params).
- No asumas un schema fijo: cambia 'enterprise' por el schema real de tu dominio.
*/

export class Facturacion {
    constructor(params) {
        Object.assign(this, params)
    }
}

export class FacturacionRepository {
    // Reemplaza 'enterprise' y 'TODO_*' con tu schema/queries reales.

    static async getById(id) {
        const r = await db.exe('enterprise', 'TODO_getById', [id])
        if (!r?.rows || r.rows.length === 0) return null
        return new Facturacion(r.rows[0])
    }

    static async getByName(name) {
        const r = await db.exe('enterprise', 'TODO_getByName', [name])
        if (!r?.rows || r.rows.length === 0) return null
        return new Facturacion(r.rows[0])
    }

    static async create(params) {
        // Ejemplo: await db.exe('enterprise', 'TODO_create', [..])
        await db.exe('enterprise', 'TODO_create', [params])
        return true
    }

    static async update(params) {
        await db.exe('enterprise', 'TODO_update', [params])
        return true
    }

    static async delete(params) {
        await db.exe('enterprise', 'TODO_delete', [params])
        return true
    }
}
