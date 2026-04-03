import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Files from '../app/modules/files/pages/FilesPage'

const openPreview = vi.fn()
const closePreview = vi.fn()
const showToast = vi.fn()
const mockedAgents = [{ id: 'agent-1', name: 'Universal Agent' }]

const previewState: {
    previewFile: { name: string; path: string; type: string; agentId: string } | null
} = {
    previewFile: null,
}

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (params?.term) return `${key}:${String(params.term)}`
            if (params?.count !== undefined) return `${key}:${String(params.count)}`
            return key
        },
    }),
}))

vi.mock('../contexts/GoosedContext', () => ({
    useGoosed: () => ({
        agents: mockedAgents,
        isConnected: true,
        error: null,
    }),
}))

vi.mock('../contexts/PreviewContext', () => ({
    usePreview: () => ({
        openPreview,
        closePreview,
        isPreviewable: () => true,
        previewFile: previewState.previewFile,
    }),
}))

vi.mock('../contexts/UserContext', () => ({
    useUser: () => ({
        userId: 'alice',
    }),
}))

vi.mock('../contexts/ToastContext', () => ({
    useToast: () => ({
        showToast,
    }),
}))

describe('Files page delete flow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        previewState.previewFile = null

        vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
            const url = String(input)
            const method = init?.method ?? 'GET'

            if (method === 'GET' && url.includes('/agents/agent-1/files')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        files: [{
                            name: 'demo.txt',
                            path: 'demo.txt',
                            size: 18,
                            modifiedAt: '2026-03-22T07:41:00.000Z',
                            type: 'txt',
                        }],
                    }),
                } as Response)
            }

            if (method === 'DELETE' && url.includes('/agents/agent-1/files/demo.txt')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        status: 'deleted',
                        path: 'demo.txt',
                    }),
                } as Response)
            }

            return Promise.resolve({
                ok: false,
                status: 404,
                json: async () => ({ error: 'not found' }),
            } as Response)
        }))
    })

    it('shows inline confirmation and removes the file after delete succeeds', async () => {
        render(<Files />)

        await screen.findByText('demo.txt')

        fireEvent.click(screen.getByTitle('删除文件'))

        expect(screen.getByText('删除文件')).toBeInTheDocument()
        expect(screen.getByText('将永久删除 “demo.txt”，此操作不可恢复。')).toBeInTheDocument()
        expect(screen.getByText('确认删除')).toBeInTheDocument()

        fireEvent.click(screen.getByText('确认删除'))

        await waitFor(() => {
            expect(screen.queryByText('demo.txt')).not.toBeInTheDocument()
        })

        const fetchMock = vi.mocked(fetch)
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/agents/agent-1/files/demo.txt'),
            expect.objectContaining({ method: 'DELETE' }),
        )
        expect(showToast).toHaveBeenCalledWith('success', '已删除 demo.txt')
    })

    it('closes preview when deleting the file currently being previewed', async () => {
        previewState.previewFile = {
            name: 'demo.txt',
            path: 'demo.txt',
            type: 'txt',
            agentId: 'agent-1',
        }

        render(<Files />)

        await screen.findByText('demo.txt')
        fireEvent.click(screen.getByTitle('删除文件'))
        fireEvent.click(screen.getByText('确认删除'))

        await waitFor(() => {
            expect(closePreview).toHaveBeenCalledTimes(1)
        })
    })
})
