export class Order {
  constructor(params) {
    Object.assign(this, params)
  }
}

export class OrderRepository {
  static async getById(id) {
    const r = await db.exe('enterprise', 'TODO_getById', [id])
    if (!r?.rows || r.rows.length === 0) return null
    return new Order(r.rows[0])
  }
}
