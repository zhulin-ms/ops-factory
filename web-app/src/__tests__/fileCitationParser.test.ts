import { describe, expect, it } from 'vitest'
import {
    parseFileCitations,
    replaceFileCitationsWithPlaceholders,
    stripFileCitations,
} from '../utils/fileCitationParser'

describe('fileCitationParser', () => {
    it('parses file citation markers', () => {
        const text = '结论[[filecite:1|/tmp/config.yaml|10|12|enabled: false]]。'
        const citations = parseFileCitations(text)

        expect(citations).toEqual([
            {
                index: 1,
                path: '/tmp/config.yaml',
                lineFrom: 10,
                lineTo: 12,
                snippet: 'enabled: false',
            },
        ])
    })

    it('renumbers citations by first appearance', () => {
        const text = '甲[[filecite:9|/tmp/a.txt|1|1|alpha]]乙[[filecite:10|/tmp/b.txt|2|2|beta]]'
        expect(parseFileCitations(text).map(citation => citation.index)).toEqual([1, 2])
        expect(replaceFileCitationsWithPlaceholders(text)).toBe('甲[FILECITE_1](#filecite-1)乙[FILECITE_2](#filecite-2)')
    })

    it('strips file citation markers from text', () => {
        const text = '结论[[filecite:1|/tmp/config.yaml|10|12|enabled: false]]。'
        expect(stripFileCitations(text)).toBe('结论。')
    })
})
