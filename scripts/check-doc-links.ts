import fs from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(process.cwd())
const docsRoot = path.join(repoRoot, 'docs')

async function exists(p: string): Promise<boolean> {
    try {
        await fs.access(p)
        return true
    } catch {
        return false
    }
}

async function* walk(dir: string): AsyncGenerator<string> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            yield* walk(fullPath)
        } else {
            yield fullPath
        }
    }
}

function isExternalLink(href: string): boolean {
    return (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:') ||
        href.startsWith('#')
    )
}

function stripAnchor(href: string): string {
    const hashIndex = href.indexOf('#')
    return hashIndex === -1 ? href : href.slice(0, hashIndex)
}

function normalizeMdLinkTarget(href: string): string {
    // Ignore query strings for local file targets
    const qIndex = href.indexOf('?')
    return qIndex === -1 ? href : href.slice(0, qIndex)
}

function toPosix(p: string): string {
    return p.split(path.sep).join('/')
}

async function main() {
    if (!(await exists(docsRoot))) {
        console.error(`docs folder not found: ${docsRoot}`)
        process.exitCode = 2
        return
    }

    const mdFiles = []
    for await (const filePath of walk(docsRoot)) {
        if (filePath.toLowerCase().endsWith('.md')) mdFiles.push(filePath)
    }

    const broken = []
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g

    for (const filePath of mdFiles) {
        const raw = await fs.readFile(filePath, 'utf8')
        // Ignore fenced code blocks to avoid false positives like instance[method_na](params)
        // inside ```js blocks.
        const lines = raw.split(/\r?\n/)
        let inFence = false
        const content = lines
            .filter((line) => {
                const trimmed = line.trimStart()
                if (trimmed.startsWith('```')) {
                    inFence = !inFence
                    return false
                }
                return !inFence
            })
            .join('\n')
        const dir = path.dirname(filePath)

        for (const match of content.matchAll(linkRe)) {
            const rawHref = match[1].trim()
            if (!rawHref) continue

            // Strip surrounding <...> sometimes used in MD
            const href0 =
                rawHref.startsWith('<') && rawHref.endsWith('>') ? rawHref.slice(1, -1) : rawHref

            if (isExternalLink(href0)) continue

            const href1 = normalizeMdLinkTarget(stripAnchor(href0))
            if (!href1) continue

            // Treat absolute paths (starting with /) as repo-root relative
            const targetPath = href1.startsWith('/')
                ? path.join(repoRoot, href1.slice(1))
                : path.resolve(dir, href1)

            // For links that point to directories, accept if index.md exists
            let ok = await exists(targetPath)
            if (!ok) {
                const asIndex = path.join(targetPath, 'index.md')
                ok = await exists(asIndex)
            }

            if (!ok) {
                broken.push({
                    from: filePath,
                    href: href0,
                    resolved: targetPath,
                })
            }
        }
    }

    if (broken.length === 0) {
        console.log(`OK: no broken local links in ${mdFiles.length} markdown files under docs/`)
        return
    }

    console.error(`Broken local links: ${broken.length}`)
    for (const b of broken) {
        const fromRel = toPosix(path.relative(repoRoot, b.from))
        const resolvedRel = toPosix(path.relative(repoRoot, b.resolved))
        console.error(`- ${fromRel}: (${b.href}) -> ${resolvedRel}`)
    }

    process.exitCode = 1
}

await main()
