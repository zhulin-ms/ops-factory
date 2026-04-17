import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import DetailDialog from '../../../platform/ui/primitives/DetailDialog'

interface RenameSessionDialogProps {
    initialTitle: string
    isSaving?: boolean
    onClose: () => void
    onSave: (title: string) => Promise<void> | void
}

export default function RenameSessionDialog({
    initialTitle,
    isSaving = false,
    onClose,
    onSave,
}: RenameSessionDialogProps) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLInputElement>(null)
    const [title, setTitle] = useState(initialTitle)

    useEffect(() => {
        setTitle(initialTitle)
    }, [initialTitle])

    useEffect(() => {
        const input = inputRef.current
        if (!input) return
        input.focus()
        input.select()
    }, [])

    const trimmedTitle = title.trim()
    const isUnchanged = trimmedTitle === initialTitle.trim()
    const isSaveDisabled = isSaving || !trimmedTitle || isUnchanged

    const handleSave = async () => {
        if (isSaveDisabled) return
        await onSave(trimmedTitle)
    }

    const handleKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            await handleSave()
            return
        }

        if (event.key === 'Escape' && !isSaving) {
            event.preventDefault()
            onClose()
        }
    }

    return (
        <DetailDialog
            title={t('history.renameSessionTitle')}
            onClose={isSaving ? () => undefined : onClose}
            footer={(
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={isSaveDisabled}>
                        {isSaving ? t('common.saving') : t('history.renameSessionSave')}
                    </button>
                </>
            )}
        >
            <div className="form-group">
                <label className="form-label" htmlFor="history-session-title-input">
                    {t('history.sessionTitleLabel')}
                </label>
                <input
                    ref={inputRef}
                    id="history-session-title-input"
                    className="form-input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => void handleKeyDown(event)}
                    maxLength={200}
                    disabled={isSaving}
                    aria-describedby="history-session-title-help"
                />
                <p id="history-session-title-help" className="history-rename-help">
                    {t('history.renameSessionHint')}
                </p>
            </div>
        </DetailDialog>
    )
}
