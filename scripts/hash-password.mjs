import bcrypt from 'bcryptjs'

function usage() {
  console.log('Usage: node scripts/hash-password.js <plainPassword> [saltRounds]')
  console.log('Example: node scripts/hash-password.js "MyPassword123" 10')
}

const plainPassword = process.argv[2]
const saltRoundsRaw = process.argv[3]

if (!plainPassword) {
  usage()
  process.exit(1)
}

const saltRounds = saltRoundsRaw ? Number(saltRoundsRaw) : 10
if (!Number.isFinite(saltRounds) || saltRounds < 4 || saltRounds > 15) {
  console.error('saltRounds must be a number between 4 and 15')
  process.exit(1)
}

const hash = await bcrypt.hash(plainPassword, saltRounds)
console.log(hash)
