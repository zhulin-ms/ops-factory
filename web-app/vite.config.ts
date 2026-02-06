import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    const requiredEnvVars = ['GATEWAY_URL', 'GATEWAY_SECRET_KEY']
    const missingEnvVars = requiredEnvVars.filter(key => !env[key])

    if (missingEnvVars.length > 0) {
        console.error('\n Missing required environment variables:\n')
        missingEnvVars.forEach(key => console.error(`   - ${key}`))
        console.error('\n Please create a .env file in web-app/ with:\n')
        console.error('   GATEWAY_URL=http://127.0.0.1:3000')
        console.error('   GATEWAY_SECRET_KEY=test\n')
        process.exit(1)
    }

    return {
        plugins: [react()],
        define: {
            'import.meta.env.VITE_GATEWAY_URL': JSON.stringify(env.GATEWAY_URL),
            'import.meta.env.VITE_GATEWAY_SECRET_KEY': JSON.stringify(env.GATEWAY_SECRET_KEY),
        },
        server: {
            port: 5173,
        },
    }
})
