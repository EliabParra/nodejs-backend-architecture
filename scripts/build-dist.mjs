import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const distDir = path.join(repoRoot, 'dist')

async function run(command, args) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: false,
            cwd: repoRoot,
        })
        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`))
        })
    })
}

function resolveTscScript() {
    // Use the JS entrypoint so this works on Windows without `shell: true`.
    return path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')
}

async function copyFileIfExists(from, to) {
    try {
        await fs.access(from)
    } catch {
        return
    }
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.copyFile(from, to)
}

async function copyDirIfExists(fromDir, toDir) {
    try {
        await fs.access(fromDir)
    } catch {
        return
    }
    await fs.rm(toDir, { recursive: true, force: true })
    await fs.mkdir(path.dirname(toDir), { recursive: true })
    await fs.cp(fromDir, toDir, { recursive: true, force: true })
}

async function main() {
    await fs.rm(distDir, { recursive: true, force: true })

    await run(process.execPath, [resolveTscScript(), '-p', 'tsconfig.build.json'])

    await copyFileIfExists(path.join(repoRoot, 'package.json'), path.join(distDir, 'package.json'))
    await copyFileIfExists(
        path.join(repoRoot, 'package-lock.json'),
        path.join(distDir, 'package-lock.json')
    )

    await copyDirIfExists(path.join(repoRoot, 'src', 'config'), path.join(distDir, 'src', 'config'))
    await copyDirIfExists(path.join(repoRoot, 'public'), path.join(distDir, 'public'))
    await copyDirIfExists(path.join(repoRoot, 'BO'), path.join(distDir, 'BO'))
}

main().catch((err) => {
    console.error(err)
    process.exitCode = 1
})
