import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(argv) {
  const outIndex = argv.indexOf('--out')
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined
  return {
    out: out && !out.startsWith('--') ? out : undefined
  }
}

async function ensureEmptyDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true })
  await fs.mkdir(dirPath, { recursive: true })
}

async function copyDir(src, dest, { filter } = {}) {
  await fs.cp(src, dest, {
    recursive: true,
    filter: filter
      ? (source) => filter(source)
      : undefined
  })
}

function createPathFilter({ repoRoot }) {
  const ignoredPrefixes = [
    path.join(repoRoot, 'node_modules') + path.sep,
    path.join(repoRoot, '.git') + path.sep,
    path.join(repoRoot, '.vscode') + path.sep,
    path.join(repoRoot, 'BO') + path.sep,
    path.join(repoRoot, 'docs', 'api') + path.sep,
    path.join(repoRoot, '.tmp-starterpack') + path.sep
  ]

  const ignoredExact = new Set([
    path.join(repoRoot, '.env'),
    path.join(repoRoot, 'package-lock.json')
  ])

  return function filter(source) {
    const normalized = path.resolve(source)

    if (ignoredExact.has(normalized)) return false

    for (const prefix of ignoredPrefixes) {
      if (normalized.startsWith(prefix)) return false
    }

    return true
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..')
  const { out } = parseArgs(process.argv.slice(2))

  const outDir = path.resolve(repoRoot, out ?? '.tmp-starterpack')

  console.log(`[export-starter] repo: ${repoRoot}`)
  console.log(`[export-starter] out:  ${outDir}`)

  await ensureEmptyDir(outDir)

  const filter = createPathFilter({ repoRoot })

  const allowList = [
    'src',
    'scripts',
    'docs',
    'public',
    'test',
    '.env.example',
    '.gitignore',
    'package.json',
    'postgres.session.sql',
    'jsdoc.json'
  ]

  for (const rel of allowList) {
    const srcPath = path.join(repoRoot, rel)
    const destPath = path.join(outDir, rel)

    try {
      const stat = await fs.stat(srcPath)
      if (stat.isDirectory()) {
        await copyDir(srcPath, destPath, { filter })
      } else {
        await fs.mkdir(path.dirname(destPath), { recursive: true })
        await fs.copyFile(srcPath, destPath)
      }
    } catch {
      // Optional file/folder does not exist in some setups.
    }
  }

  // Create an empty BO folder so developers have a clear place to start.
  const boDir = path.join(outDir, 'BO')
  await fs.mkdir(boDir, { recursive: true })
  await fs.writeFile(path.join(boDir, '.gitkeep'), '')
  await fs.writeFile(
    path.join(boDir, 'README.md'),
    [
      '# BO (Business Objects)',
      '',
      'This folder is intentionally empty in the starter template.',
      '',
      '- Add your domain BOs here (e.g. `BO/ObjectName/ObjectNameBO.js`).',
      '- The dispatcher resolves `tx -> (object_na, method_na)` and `Security` dynamically imports BO modules.',
      '',
      'Tip: use the BO CLI (`npm run bo -- new ...`) to scaffold a BO.',
      ''
    ].join('\n')
  )

  console.log('[export-starter] done')
}

main().catch((err) => {
  console.error('[export-starter] failed:', err)
  process.exitCode = 1
})
