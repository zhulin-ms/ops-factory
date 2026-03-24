import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

function runtimeConfigPlugin(): Plugin {
    const cwd = process.cwd()
    const configPath = resolve(cwd, 'config.yaml')
    const configExamplePath = resolve(cwd, 'config.yaml.example')

    return {
        name: 'runtime-config',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url === '/config.yaml' || req.url === '/config.yaml.example') {
                    const sourcePath = req.url === '/config.yaml' ? configPath : configExamplePath
                    if (!existsSync(sourcePath)) {
                        res.statusCode = 404
                        res.end('Not Found')
                        return
                    }

                    res.setHeader('Content-Type', 'application/yaml; charset=utf-8')
                    res.end(readFileSync(sourcePath, 'utf-8'))
                    return
                }
                next()
            })
        },
        writeBundle(options) {
            const outDir = resolve(cwd, options.dir || 'dist')
            mkdirSync(outDir, { recursive: true })
            if (existsSync(configPath)) {
                copyFileSync(configPath, resolve(outDir, 'config.yaml'))
            }
            if (existsSync(configExamplePath)) {
                copyFileSync(configExamplePath, resolve(outDir, 'config.yaml.example'))
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
