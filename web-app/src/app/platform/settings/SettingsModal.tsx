import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUser } from '../../../contexts/UserContext'
import './styles/settings-modal.css'

const EMOJI_AVATARS = ['🦆', '🐱', '🐶', '🦊', '🐸', '🐼', '🐨', '🦉', '🐙', '🦄', '🐝', '🦋']

function getAvatarForUser(username: string): string {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i)
        hash |= 0
    }
    return EMOJI_AVATARS[Math.abs(hash) % EMOJI_AVATARS.length]
}

export { getAvatarForUser }

type SettingsTab = 'general' | 'user'

export default function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { t, i18n } = useTranslation()
    const { userId, logout } = useUser()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<SettingsTab>('general')

    const avatar = userId ? getAvatarForUser(userId) : '🦆'

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
    }, [onClose])

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = ''
        }
    }, [isOpen, handleKeyDown])

    const handleLogout = () => {
        onClose()
        logout()
        navigate('/', { replace: true })
    }

    const handleLanguageChange = (lng: string) => {
        i18n.changeLanguage(lng)
    }

    if (!isOpen) return null

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-modal-body">
                    {/* Left nav */}
                    <nav className="settings-modal-nav">
                        <button className="settings-nav-close" onClick={onClose}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                        <div className="settings-nav-list">
                            <button
                                className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`}
                                onClick={() => setActiveTab('general')}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                {t('settings.general')}
                            </button>
                            <button
                                className={`settings-nav-item ${activeTab === 'user' ? 'active' : ''}`}
                                onClick={() => setActiveTab('user')}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                {t('settings.user')}
                            </button>
                        </div>
                    </nav>

                    {/* Right content */}
                    <div className="settings-modal-content">
                        <h3 className="settings-panel-title">
                            {activeTab === 'general' ? t('settings.general') : t('settings.user')}
                        </h3>

                        {activeTab === 'general' && (
                            <div className="settings-panel">
                                <div className="settings-row">
                                    <div className="settings-row-label">
                                        <div className="settings-row-text">{t('settings.language')}</div>
                                        <div className="settings-row-desc">{t('settings.languageDescription')}</div>
                                    </div>
                                    <select
                                        className="settings-select"
                                        value={i18n.language?.startsWith('zh') ? 'zh' : 'en'}
                                        onChange={(e) => handleLanguageChange(e.target.value)}
                                    >
                                        <option value="en">English</option>
                                        <option value="zh">中文</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {activeTab === 'user' && (
                            <div className="settings-panel">
                                <div className="settings-row settings-profile-row">
                                    <div className="settings-avatar">{avatar}</div>
                                    <div className="settings-user-info">
                                        <div className="settings-username">{userId}</div>
                                        <div className="settings-user-label">{t('settings.loggedInUser')}</div>
                                    </div>
                                </div>
                                <div className="settings-row">
                                    <div className="settings-row-label">
                                        <div className="settings-row-text">{t('settings.account')}</div>
                                    </div>
                                    <button className="btn btn-secondary" onClick={handleLogout}>
                                        {t('settings.logout')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
