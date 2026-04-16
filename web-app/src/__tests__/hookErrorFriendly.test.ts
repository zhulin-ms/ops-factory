import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Static analysis tests: verify that all hooks use getErrorMessage()
 * instead of raw error messages like "err instanceof Error ? err.message : ..."
 */

const SRC_DIR = path.resolve(__dirname, '..')

function readSource(relativePath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relativePath), 'utf-8')
}

describe('Hook HTTP error friendlification — getErrorMessage usage', () => {
    const hooksToCheck = [
        { file: 'app/modules/agents/hooks/useAgentConfig.ts', name: 'useAgentConfig' },
        { file: 'app/modules/agents/hooks/useMcp.ts', name: 'useMcp' },
        { file: 'app/modules/agents/hooks/useSkills.ts', name: 'useSkills' },
        { file: 'app/platform/providers/GoosedContext.tsx', name: 'GoosedContext' },
    ]

    for (const { file, name } of hooksToCheck) {
        it(`${name} imports getErrorMessage`, () => {
            const src = readSource(file)
            expect(src).toMatch(/import\s+\{\s*getErrorMessage\s*\}\s+from\s+['"][^'"]*utils\/errorMessages['"]/)
        })

        it(`${name} uses getErrorMessage(err) in catch blocks`, () => {
            const src = readSource(file)
            expect(src).toContain('getErrorMessage(err)')
        })

        it(`${name} does not use raw "err instanceof Error ? err.message" for setError`, () => {
            const src = readSource(file)
            // Check that setError does not use the old pattern
            const rawPattern = /setError\(err instanceof Error \? err\.message/g
            const matches = src.match(rawPattern)
            expect(matches).toBeNull()
        })
    }
})

describe('errorMessages.ts utility file exists and is well-formed', () => {
    it('exports getErrorMessage function', () => {
        const src = readSource('utils/errorMessages.ts')
        expect(src).toContain('export function getErrorMessage')
    })

    it('imports i18n', () => {
        const src = readSource('utils/errorMessages.ts')
        expect(src).toContain("import i18n from '../i18n'")
    })

    it('handles HTTP status codes', () => {
        const src = readSource('utils/errorMessages.ts')
        expect(src).toContain('extractHttpStatus')
        expect(src).toContain("errors.serverError")
        expect(src).toContain("errors.unauthorized")
        expect(src).toContain("errors.notFound")
    })

    it('handles network and timeout errors', () => {
        const src = readSource('utils/errorMessages.ts')
        expect(src).toContain("errors.networkError")
        expect(src).toContain("errors.timeout")
    })
})

describe('i18n error keys exist', () => {
    it('en.json contains errors namespace', () => {
        const src = readSource('i18n/en.json')
        const json = JSON.parse(src)
        expect(json.errors).toBeDefined()
        expect(json.errors.networkError).toBeDefined()
        expect(json.errors.serverError).toBeDefined()
        expect(json.errors.unauthorized).toBeDefined()
        expect(json.errors.timeout).toBeDefined()
        expect(json.errors.notFound).toBeDefined()
        expect(json.errors.unknown).toBeDefined()
        expect(json.errors.deleteFailed).toBeDefined()
        expect(json.errors.createFailed).toBeDefined()
        expect(json.errors.operationFailed).toBeDefined()
        expect(json.errors.copyFailed).toBeDefined()
        expect(json.errors.voiceError).toBeDefined()
        expect(json.errors.micPermissionDenied).toBeDefined()
    })

    it('zh.json contains errors namespace', () => {
        const src = readSource('i18n/zh.json')
        const json = JSON.parse(src)
        expect(json.errors).toBeDefined()
        expect(json.errors.networkError).toBeDefined()
        expect(json.errors.serverError).toBeDefined()
        expect(json.errors.unauthorized).toBeDefined()
        expect(json.errors.timeout).toBeDefined()
        expect(json.errors.notFound).toBeDefined()
        expect(json.errors.unknown).toBeDefined()
        expect(json.errors.deleteFailed).toBeDefined()
        expect(json.errors.createFailed).toBeDefined()
        expect(json.errors.operationFailed).toBeDefined()
        expect(json.errors.copyFailed).toBeDefined()
        expect(json.errors.voiceError).toBeDefined()
        expect(json.errors.micPermissionDenied).toBeDefined()
    })

    it('en.json and zh.json have matching error keys', () => {
        const enSrc = readSource('i18n/en.json')
        const zhSrc = readSource('i18n/zh.json')
        const enKeys = Object.keys(JSON.parse(enSrc).errors).sort()
        const zhKeys = Object.keys(JSON.parse(zhSrc).errors).sort()
        expect(enKeys).toEqual(zhKeys)
    })
})

describe('ToastProvider root-level placement', () => {
    it('main.tsx imports ToastProvider', () => {
        const src = readSource('main.tsx')
        expect(src).toContain("import { ToastProvider } from './app/platform/providers/ToastContext'")
    })

    it('main.tsx wraps app with ToastProvider', () => {
        const src = readSource('main.tsx')
        expect(src).toContain('<ToastProvider>')
        expect(src).toContain('</ToastProvider>')
    })

    it('App.tsx does NOT import ToastProvider', () => {
        const appSrc = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf-8')
        expect(appSrc).not.toContain("import { ToastProvider }")
        expect(appSrc).not.toContain('<ToastProvider>')
    })
})

describe('SSE closure bug fix — useChat.ts', () => {
    it('uses streamErrorRef instead of state.error in STREAM_FINISH', () => {
        const src = readSource('app/platform/chat/useChat.ts')
        expect(src).toContain('streamErrorRef')
        expect(src).toContain('streamErrorRef.current = null')
        expect(src).toContain('streamErrorRef.current = errorMsg')
        expect(src).toContain('dispatch({ type: \'STREAM_FINISH\', error: streamErrorRef.current ?? undefined })')
    })

    it('does not use state.error in sendMessage dependency array', () => {
        const src = readSource('app/platform/chat/useChat.ts')
        // The sendMessage useCallback should not depend on state.error
        const sendMessageDeps = src.match(/\}, \[client, sessionId.*?\]\)/)
        expect(sendMessageDeps).not.toBeNull()
        expect(sendMessageDeps![0]).not.toContain('state.error')
    })
})
