import type { AppModule } from './module-types'
import { validateModules } from './ModuleValidator'

type ModuleRecord = {
    default: AppModule
}

let cachedModules: AppModule[] | null = null

export function loadModules() {
    if (cachedModules) {
        return cachedModules
    }

    const files = import.meta.glob('../modules/**/module.ts', { eager: true })
    const modules = Object.values(files).map((file) => (file as ModuleRecord).default)

    validateModules(modules)
    cachedModules = modules

    return modules
}

