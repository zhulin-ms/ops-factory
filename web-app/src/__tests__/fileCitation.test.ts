import { describe, expect, it } from 'vitest'
import { getFileCitationDisplayPath, sanitizeFileCitationSnippet } from '../utils/fileCitation'
import { parseFileCitations, replaceFileCitationsWithPlaceholders } from '../utils/fileCitationParser'

describe('fileCitation helpers', () => {
    it('shows child path below data directory when available', () => {
        const path = '/Users/demo/project/gateway/agents/qa-cli-agent/data/src_x/doc_y/content.md'
        expect(getFileCitationDisplayPath(path)).toBe('src_x/doc_y/content.md')
    })

    it('sanitizes unsafe snippet characters', () => {
        expect(sanitizeFileCitationSnippet('2. 更新证书 [3](#x) | done')).toBe('2. 更新证书 3 (#x) done')
    })
})

describe('fileCitation parser safety', () => {
    it('parses citations even when snippet contains brackets', () => {
        const text = '证据[[filecite:1|/tmp/a.md|34|34|2. 更新证书 [3](#x)]]。'
        const citations = parseFileCitations(text)

        expect(citations).toEqual([
            {
                index: 1,
                path: '/tmp/a.md',
                lineFrom: 34,
                lineTo: 34,
                snippet: '2. 更新证书 3 (#x)',
            },
        ])
        expect(replaceFileCitationsWithPlaceholders(text)).toBe('证据[FILECITE_1](#filecite-1)。')
    })

    it('keeps extra pipes inside snippet from breaking parsing', () => {
        const text = '证据[[filecite:1|/tmp/a.md|10|12|left | middle | right]]'
        const citations = parseFileCitations(text)

        expect(citations[0]?.snippet).toBe('left middle right')
    })
})
