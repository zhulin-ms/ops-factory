import { useState, type FormEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface NewSessionModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (workingDir: string, initialMessage?: string) => void
    showInitialMessage?: boolean
}

export default function NewSessionModal({
    isOpen,
    onClose,
    onSubmit,
    showInitialMessage = false
}: NewSessionModalProps) {
    const { t } = useTranslation()
    const defaultWorkingDir = '~'

    const [workingDir, setWorkingDir] = useState(defaultWorkingDir)
    const [initialMessage, setInitialMessage] = useState('')

    if (!isOpen) return null

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (workingDir.trim()) {
            onSubmit(workingDir.trim(), showInitialMessage ? initialMessage.trim() : undefined)
            // Reset form
            setWorkingDir(defaultWorkingDir)
            setInitialMessage('')
        }
    }

    const handleOverlayClick = (e: MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className="modal animate-slide-up">
                <div className="modal-header">
                    <h2 className="modal-title">{t('newSession.title')}</h2>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label" htmlFor="workingDir">
                                {t('newSession.workingDir')}
                            </label>
                            <input
                                id="workingDir"
                                type="text"
                                className="form-input"
                                value={workingDir}
                                onChange={(e) => setWorkingDir(e.target.value)}
                                placeholder="/path/to/directory"
                                autoFocus
                            />
                            <p style={{
                                fontSize: 'var(--font-size-xs)',
                                color: 'var(--color-text-muted)',
                                marginTop: 'var(--spacing-2)'
                            }}>
                                {t('newSession.workingDirHint')}
                            </p>
                        </div>

                        {showInitialMessage && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="initialMessage">
                                    {t('newSession.initialMessage')}
                                </label>
                                <textarea
                                    id="initialMessage"
                                    className="form-input"
                                    value={initialMessage}
                                    onChange={(e) => setInitialMessage(e.target.value)}
                                    placeholder={t('newSession.initialMessagePlaceholder')}
                                    rows={3}
                                    style={{ resize: 'vertical', minHeight: '80px' }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={!workingDir.trim()}
                        >
                            {t('newSession.startChat')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
