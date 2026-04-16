import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ActionMenu from '../app/platform/ui/primitives/ActionMenu'

describe('ActionMenu', () => {
    it('opens a shared action menu and triggers the selected item', () => {
        const handleRefresh = vi.fn()

        render(
            <ActionMenu
                label="More"
                items={[
                    {
                        key: 'refresh',
                        label: 'Refresh Status',
                        description: 'Pull the latest runtime snapshot.',
                        onSelect: handleRefresh,
                    },
                    {
                        key: 'disable',
                        label: 'Disable',
                        description: 'Remove this channel from active routing.',
                        onSelect: vi.fn(),
                        tone: 'danger',
                        dividerBefore: true,
                    },
                ]}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'More' }))

        expect(screen.getByRole('menu')).toBeInTheDocument()
        expect(screen.getByText('Pull the latest runtime snapshot.')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('menuitem', { name: /Refresh Status/i }))

        expect(handleRefresh).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
})
