import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

interface ConfigYaml {
    gatewayUrl?: string
    gatewaySecretKey?: string
    port?: number
}

function loadYamlConfig(): ConfigYaml {
    const configPath = resolve(process.cwd(), 'config.yaml')
    if (!existsSync(configPath)) return {}
    return (parse(readFileSync(configPath, 'utf-8')) as ConfigYaml) || {}
}

export default defineConfig(() => {
    const yaml = loadYamlConfig()

    const gatewayUrl = yaml.gatewayUrl
    const gatewaySecretKey = yaml.gatewaySecretKey
    const port = yaml.port ?? 5173

    const missing: string[] = []
    if (!gatewayUrl) missing.push('gatewayUrl')
    if (!gatewaySecretKey) missing.push('gatewaySecretKey')

    if (missing.length > 0) {
        console.error('\n Missing required configuration:\n')
        missing.forEach(key => console.error(`   - ${key}`))
        console.error('\n Create config.yaml in web-app/ with these fields.\n')
        process.exit(1)
    }

    return {
        plugins: [react()],
        define: {
            'import.meta.env.VITE_GATEWAY_URL': JSON.stringify(gatewayUrl),
            'import.meta.env.VITE_GATEWAY_SECRET_KEY': JSON.stringify(gatewaySecretKey),
        },
        server: {
            port,
        },
    }
})
