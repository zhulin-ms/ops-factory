import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC_DIR = path.resolve(__dirname, '..')

function readSource(relativePath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relativePath), 'utf-8')
}

describe('Chat page header rendering', () => {
    it('falls back to the default new chat title when session.name is missing', () => {
        const src = readSource('app/modules/chat/pages/ChatPage.tsx')
        expect(src).toContain("const sessionTitle = session?.name?.trim() || t('chat.newChat')")
        expect(src).not.toContain('{session?.name && (')
    })

    it('uses the chat panel shell so the header stays outside the scrolling body', () => {
        const src = readSource('app/modules/chat/pages/ChatPage.tsx')
        expect(src).toContain("import ChatPanelShell from '../../../platform/chat/ChatPanelShell'")
        expect(src).toContain('<ChatPanelShell')
        expect(src).toContain('scrollBody={false}')
    })
})
