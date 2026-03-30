import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

function runtimeConfigPlugin(): Plugin {
    const cwd = process.cwd()
    const configJsonPath = resolve(cwd, 'config.json')
    const configJsonExamplePath = resolve(cwd, 'config.json.example')

    return {
        name: 'runtime-config',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url === '/config.json' || req.url === '/config.json.example') {
                    const sourcePath = req.url === '/config.json'
                        ? configJsonPath
                        : configJsonExamplePath
                    if (!existsSync(sourcePath)) {
                        res.statusCode = 404
                        res.end('Not Found')
                        return
                    }

                    res.setHeader('Content-Type', 'application/json; charset=utf-8')
                    res.end(readFileSync(sourcePath, 'utf-8'))
                    return
                }
                next()
            })
        },
        writeBundle(options) {
            const outDir = resolve(cwd, options.dir || 'dist')
            mkdirSync(outDir, { recursive: true })
            if (existsSync(configJsonPath)) {
                copyFileSync(configJsonPath, resolve(outDir, 'config.json'))
            }
            if (existsSync(configJsonExamplePath)) {
                copyFileSync(configJsonExamplePath, resolve(outDir, 'config.json.example'))
            }
        },
    }
}

export default defineConfig(() => {
    return {
        plugins: [react(), runtimeConfigPlugin()],
        server: {
            port: 5173,
        },
    }
})
