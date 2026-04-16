import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageBackLink from '../../../platform/ui/primitives/PageBackLink'
import Button from '../../../platform/ui/primitives/Button'
import ActionMenu, { type ActionMenuItem } from '../../../platform/ui/primitives/ActionMenu'
import DetailDialog from '../../../platform/ui/primitives/DetailDialog'
import { buildChatSessionState } from '../../../platform/chat/chatRouteState'
import { useChannels } from '../hooks/useChannels'
import { useToast } from '../../../platform/providers/ToastContext'
import { useGoosed } from '../../../platform/providers/GoosedContext'
import type { ChannelConnectionConfig, ChannelDetail, ChannelLoginState, ChannelSelfTestResult, ChannelType, ChannelUpsertRequest } from '../../../../types/channel'
import '../styles/channels.css'

type ChannelConfigTab = 'overview' | 'connection' | 'runtime'

type ChannelFormState = {
    name: string
    enabled: boolean
    defaultAgentId: string
    type: ChannelType
    config: ChannelConnectionConfig
}

const EMPTY_CONFIG: ChannelConnectionConfig = {
    loginStatus: 'disconnected',
    authStateDir: 'auth',
    lastConnectedAt: '',
    lastDisconnectedAt: '',
    lastError: '',
    selfPhone: '',
    wechatId: '',
    displayName: '',
}

function createInitialForm(defaultAgentId: string): ChannelFormState {
    return {
        name: '',
        enabled: true,
        defaultAgentId,
        type: 'whatsapp',
        config: EMPTY_CONFIG,
    }
}

function formatTimestamp(value: string | null | undefined, fallback: string): string {
    if (!value) return fallback
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) return fallback
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed)
}

function toFormState(channel: ChannelDetail): ChannelFormState {
    return {
        name: channel.name,
        enabled: channel.enabled,
        defaultAgentId: channel.defaultAgentId,
        type: channel.type,
        config: channel.config,
    }
}

function getStatusTone(status: string): 'is-ok' | 'is-warning' | 'is-danger' {
    if (status === 'connected' || status === 'ACTIVE') return 'is-ok'
    if (status === 'error' || status === 'ERROR') return 'is-danger'
    return 'is-warning'
}

export default function ChannelConfigurePage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { channelId } = useParams<{ channelId: string }>()
    const { agents } = useGoosed()
    const { showToast } = useToast()
    const {
        channel,
        isLoading,
        isSaving,
        error,
        fetchChannel,
        updateChannel,
        setChannelEnabled,
        verifyChannel,
        startLogin,
        fetchLoginState,
        logoutChannel,
        runSelfTest,
    } = useChannels()

    const defaultAgentId = useMemo(() => {
        return agents.find(agent => agent.id === 'fo-copilot')?.id
            || agents.find(agent => agent.id === 'universal-agent')?.id
            || agents[0]?.id
            || ''
    }, [agents])

    const [form, setForm] = useState<ChannelFormState>(() => createInitialForm(defaultAgentId))
    const [loginState, setLoginState] = useState<ChannelLoginState | null>(null)
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<ChannelConfigTab>('overview')
    const [selfTestInput, setSelfTestInput] = useState('Introduce yourself in one short paragraph.')
    const [selfTestResult, setSelfTestResult] = useState<ChannelSelfTestResult | null>(null)

    useEffect(() => {
        if (channelId) {
            void fetchChannel(channelId)
        }
    }, [channelId, fetchChannel])

    useEffect(() => {
        if (channel) {
            setForm(toFormState(channel))
        }
    }, [channel, defaultAgentId])

    useEffect(() => {
        if (!channelId) return
        void fetchLoginState(channelId).then(result => {
            if (result.success && result.state) {
                setLoginState(result.state)
            }
        })
    }, [channelId, fetchLoginState])

    useEffect(() => {
        if (!channelId || !loginState || loginState.status !== 'pending') {
            return
        }

        const timer = window.setInterval(() => {
            void fetchLoginState(channelId).then(result => {
                if (result.success && result.state) {
                    setLoginState(result.state)
                }
            })
        }, 3000)

        return () => window.clearInterval(timer)
    }, [channelId, fetchLoginState, loginState])

    useEffect(() => {
        if (!isLoginModalOpen) {
            return
        }
        if (loginState?.status === 'connected') {
            const timer = window.setTimeout(() => setIsLoginModalOpen(false), 1200)
            return () => window.clearTimeout(timer)
        }
        return undefined
    }, [isLoginModalOpen, loginState])

    const updateConfigField = (field: keyof ChannelConnectionConfig, value: string) => {
        setForm(current => ({
            ...current,
            config: {
                ...current.config,
                [field]: value,
            },
        }))
    }

    const handleSave = async () => {
        if (!form.name.trim()) {
            showToast('error', t('channels.validationName'))
            return
        }
        if (!form.defaultAgentId) {
            showToast('error', t('channels.validationAgent'))
            return
        }

        const payload: ChannelUpsertRequest = {
            name: form.name.trim(),
            enabled: form.enabled,
            type: form.type,
            defaultAgentId: form.defaultAgentId,
            config: form.config,
        }

        const result = await updateChannel(channelId!, payload)

        if (!result.success || !result.channel) {
            showToast('error', result.error || t('channels.saveFailed'))
            return
        }

        showToast('success', t('channels.saveSuccess'))
        navigate(`/channels/${result.channel.id}/configure`, { replace: true })
    }

    const handleVerify = async () => {
        if (!channelId) return
        const result = await verifyChannel(channelId)
        if (!result.success || !result.verification) {
            showToast('error', result.error || t('channels.verifyFailed'))
            return
        }

        if (result.verification.ok) {
            showToast('success', t('channels.verifySuccess'))
        } else {
            showToast('warning', result.verification.issues.join('; '))
        }
        await fetchChannel(channelId)
    }

    const handleToggleEnabled = async () => {
        if (!channelId) {
            setForm(current => ({ ...current, enabled: !current.enabled }))
            return
        }
        const result = await setChannelEnabled(channelId, !form.enabled)
        if (!result.success || !result.channel) {
            showToast('error', result.error || t('channels.statusUpdateFailed'))
            return
        }
        setForm(toFormState(result.channel))
        showToast('success', result.channel.enabled ? t('channels.enabledSuccess') : t('channels.disabledSuccess'))
    }

    const handleStartLogin = async () => {
        if (!channelId) return
        setIsLoginModalOpen(true)
        const result = await startLogin(channelId)
        if (!result.success || !result.state) {
            setIsLoginModalOpen(false)
            showToast('error', result.error || t('channels.loginStartFailed'))
            return
        }
        setLoginState(result.state)
        await fetchChannel(channelId)
    }

    const handleRefreshLoginState = async () => {
        if (!channelId) return
        const result = await fetchLoginState(channelId)
        if (!result.success || !result.state) {
            showToast('error', result.error || t('channels.loginStateFailed'))
            return
        }
        setLoginState(result.state)
        showToast('success', result.state.message)
    }

    const handleLogout = async () => {
        if (!channelId) return
        const result = await logoutChannel(channelId)
        if (!result.success || !result.state) {
            showToast('error', result.error || t('channels.logoutFailed'))
            return
        }
        setLoginState(result.state)
        showToast('success', t('channels.logoutSuccess'))
        await fetchChannel(channelId)
    }

    const handleRunSelfTest = async () => {
        if (!channelId) return
        if (!selfTestInput.trim()) {
            showToast('error', t('channels.selfTestValidation'))
            return
        }
        const result = await runSelfTest(channelId, selfTestInput.trim())
        if (!result.success || !result.result) {
            showToast('error', result.error || t('channels.selfTestFailed'))
            return
        }
        setSelfTestResult(result.result)
        showToast('success', t('channels.selfTestSuccess'))
        await fetchChannel(channelId)
    }

    if (isLoading) {
        return (
            <div className="page-container sidebar-top-page channel-configure-page">
                <div className="channel-configure-loading">{t('channels.loading')}</div>
            </div>
        )
    }

    if (!channelId || (!channel && !isLoading)) {
        return (
            <div className="page-container sidebar-top-page channel-configure-page">
                <div className="channel-configure-error">
                    {error || t('channels.notFound')}
                    <button type="button" onClick={() => navigate('/channels')}>
                        {t('channels.backToList')}
                    </button>
                </div>
            </div>
        )
    }

    const currentChannel = channel!
    const bindings = channel?.bindings ?? []
    const events = channel?.events ?? []
    const loginStatus = loginState?.status || form.config.loginStatus || 'disconnected'
    const channelStatus = !form.enabled
        ? 'DISABLED'
        : loginStatus === 'connected'
            ? 'ACTIVE'
            : loginStatus === 'pending'
                ? 'PENDING_LOGIN'
                : loginStatus === 'error'
                    ? 'ERROR'
                    : 'LOGIN_REQUIRED'
    const statusLabel = channelStatus === 'ACTIVE'
        ? t('channels.statusActive')
        : channelStatus === 'PENDING_LOGIN'
            ? t('channels.statusPendingLogin')
            : channelStatus === 'ERROR'
                ? t('channels.statusError')
                : channelStatus === 'DISABLED'
                    ? t('channels.statusDisabled')
                    : t('channels.statusLoginRequired')
    const loginActionsDisabled = !form.enabled || isSaving
    const showQrLoading = isLoginModalOpen && loginState?.status === 'pending' && !loginState?.qrCodeDataUrl
    const showQrReady = isLoginModalOpen && !!loginState?.qrCodeDataUrl
    const showQrError = isLoginModalOpen && loginState?.status === 'error'
    const primaryLoginLabel = loginStatus === 'connected' || loginStatus === 'pending'
        ? t('channels.reconnect')
        : t('channels.connect')
    const tabs: Array<{ key: ChannelConfigTab; label: string }> = [
        { key: 'overview', label: t('configTabs.overview') },
        { key: 'connection', label: t('channels.connectionTab') },
        { key: 'runtime', label: t('channels.runtimeTab') },
    ]
    const isWhatsApp = form.type === 'whatsapp'
    const isWeChat = form.type === 'wechat'
    const supportsQrLogin = isWhatsApp || isWeChat
    const supportsSelfTest = isWhatsApp
    const typeLabel = isWeChat ? t('channels.type_wechat') : t('channels.type_whatsapp')
    const actionMenuItems: ActionMenuItem[] = [
        {
            key: 'refresh-status',
            label: t('channels.refreshStatus'),
            description: t('channels.refreshStatusDescription'),
            onSelect: () => { void handleRefreshLoginState() },
        },
        {
            key: 'check-status',
            label: t('channels.checkStatus'),
            description: t('channels.checkStatusDescription'),
            onSelect: () => { void handleVerify() },
        },
        {
            key: 'toggle-enabled',
            label: form.enabled ? t('channels.disable') : t('channels.enable'),
            description: form.enabled ? t('channels.disableDescription') : t('channels.enableDescription'),
            onSelect: () => { void handleToggleEnabled() },
            tone: form.enabled ? 'danger' : 'default',
            dividerBefore: true,
        },
    ]

    return (
        <div className="channel-configure-scroll-area">
            <div className="page-container sidebar-top-page channel-configure-page">
                <div className="channel-configure-header">
                    <PageBackLink onClick={() => navigate('/channels')}>
                        {t('channels.backToList')}
                    </PageBackLink>
                    <div className="channel-configure-title-row">
                        <div>
                            <div className="channel-configure-title-line">
                                <h1 className="channel-configure-title">
                                    {form.name || currentChannel.id}
                                </h1>
                                <span className={`channel-status-badge ${getStatusTone(channelStatus)}`}>
                                    {statusLabel}
                                </span>
                            </div>
                            <div className="channel-configure-subtitle">{channelId}</div>
                        </div>
                        <div className="channel-configure-actions">
                            <Button variant="secondary" onClick={() => void handleStartLogin()} disabled={loginActionsDisabled || !supportsQrLogin}>
                                {primaryLoginLabel}
                            </Button>
                            <Button variant="secondary" onClick={() => void handleLogout()} disabled={loginActionsDisabled || !supportsQrLogin}>
                                {t('channels.logout')}
                            </Button>
                            <ActionMenu
                                label={t('channels.moreActions')}
                                items={actionMenuItems}
                                disabled={isSaving}
                                ariaLabel={t('channels.moreActions')}
                            />
                            <Button variant="primary" onClick={() => void handleSave()} disabled={isSaving}>
                                {isSaving ? t('common.saving') : t('common.save')}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="config-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            className={`config-tab ${activeTab === tab.key ? 'config-tab-active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="channel-configure-content">
                    {activeTab === 'overview' && (
                        <>
                            <section className="channel-configure-section">
                                <div className="channel-configure-section-header">
                                    <div>
                                        <h2 className="channel-configure-section-title">{t('channels.basicTitle')}</h2>
                                        <p className="channel-configure-section-desc">{t('channels.basicDesc')}</p>
                                    </div>
                                </div>
                                <div className="channel-form-grid">
                                    <label className="channel-form-field">
                                        <span>{t('channels.name')}</span>
                                        <input
                                            value={form.name}
                                            onChange={(event) => setForm(current => ({ ...current, name: event.target.value }))}
                                            placeholder={t('channels.namePlaceholder')}
                                        />
                                    </label>
                                    <label className="channel-form-field">
                                        <span>{t('channels.type')}</span>
                                        <input value={typeLabel} readOnly />
                                    </label>
                                    <label className="channel-form-field">
                                        <span>{t('channels.defaultAgent')}</span>
                                        <select
                                            value={form.defaultAgentId}
                                            onChange={(event) => setForm(current => ({ ...current, defaultAgentId: event.target.value }))}
                                        >
                                            {agents.map(agent => (
                                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="channel-form-field">
                                        <span>{t('channels.ownerUser')}</span>
                                        <input value={currentChannel.ownerUserId} readOnly />
                                    </label>
                                </div>
                                <p className="channel-overview-note">{t('channels.ownershipNote')}</p>
                            </section>

                            <section className="channel-configure-section">
                                <div className="channel-configure-section-header">
                                    <div>
                                        <h2 className="channel-configure-section-title">
                                            {isWeChat ? t('channels.wechatTitle') : t('channels.whatsappTitle')}
                                        </h2>
                                        <p className="channel-configure-section-desc">
                                            {isWeChat ? t('channels.wechatDesc') : t('channels.whatsappDesc')}
                                        </p>
                                    </div>
                                </div>
                                <div className="channel-form-grid">
                                    {isWhatsApp && (
                                        <label className="channel-form-field">
                                            <span>{t('channels.selfPhone')}</span>
                                            <input
                                                value={form.config.selfPhone}
                                                onChange={(event) => updateConfigField('selfPhone', event.target.value)}
                                            />
                                        </label>
                                    )}
                                    {isWeChat && (
                                        <>
                                            <label className="channel-form-field">
                                                <span>{t('channels.wechatId')}</span>
                                                <input
                                                    value={form.config.wechatId}
                                                    onChange={(event) => updateConfigField('wechatId', event.target.value)}
                                                />
                                            </label>
                                            <label className="channel-form-field">
                                                <span>{t('channels.displayName')}</span>
                                                <input
                                                    value={form.config.displayName}
                                                    onChange={(event) => updateConfigField('displayName', event.target.value)}
                                                />
                                            </label>
                                        </>
                                    )}
                                    <label className="channel-form-field">
                                        <span>{t('channels.authStateDir')}</span>
                                        <input
                                            value={form.config.authStateDir}
                                            onChange={(event) => updateConfigField('authStateDir', event.target.value)}
                                        />
                                    </label>
                                </div>
                            </section>
                        </>
                    )}

                    {activeTab === 'connection' && (
                        <>
                            <section className="channel-configure-section">
                                <div className="channel-configure-section-header">
                                    <div>
                                        <h2 className="channel-configure-section-title">{t('channels.connectionTitle')}</h2>
                                        <p className="channel-configure-section-desc">{t('channels.connectionDesc')}</p>
                                    </div>
                                </div>
                                <div className="channel-webhook-card">
                                    <div className="channel-webhook-row">
                                        <span className="channel-webhook-label">{t('channels.loginStatus')}</span>
                                        <div className={`channel-verification-status ${loginStatus === 'connected' ? 'is-ok' : 'is-warning'}`}>
                                            {t(`channels.loginStatus_${loginStatus}`, { defaultValue: loginStatus })}
                                        </div>
                                    </div>
                                    <div className="channel-webhook-row">
                                        <span className="channel-webhook-label">{t('channels.lastConnectedAt')}</span>
                                        <code className="channel-webhook-value">{formatTimestamp(form.config.lastConnectedAt, t('channels.never'))}</code>
                                    </div>
                                    <div className="channel-webhook-row">
                                        <span className="channel-webhook-label">{t('channels.lastDisconnectedAt')}</span>
                                        <code className="channel-webhook-value">{formatTimestamp(form.config.lastDisconnectedAt, t('channels.never'))}</code>
                                    </div>
                                    <p className="channel-webhook-hint">
                                        {loginState?.message || form.config.lastError || (isWeChat ? t('channels.wechatConnectionHint') : t('channels.connectionHint'))}
                                    </p>
                                </div>
                            </section>

                            {supportsSelfTest && (
                                <section className="channel-configure-section">
                                    <div className="channel-configure-section-header">
                                        <div>
                                            <h2 className="channel-configure-section-title">{t('channels.selfTestTitle')}</h2>
                                            <p className="channel-configure-section-desc">{t('channels.selfTestDesc')}</p>
                                        </div>
                                    </div>
                                    <div className="channel-self-test-card">
                                        <label className="channel-form-field">
                                            <span>{t('channels.selfTestPrompt')}</span>
                                            <textarea
                                                className="channel-self-test-textarea"
                                                value={selfTestInput}
                                                onChange={(event) => setSelfTestInput(event.target.value)}
                                                placeholder={t('channels.selfTestPlaceholder')}
                                            />
                                        </label>
                                        <div className="channel-self-test-actions">
                                            <Button
                                                variant="secondary"
                                                onClick={() => void handleRunSelfTest()}
                                                disabled={loginActionsDisabled || loginStatus !== 'connected'}
                                            >
                                                {t('channels.runSelfTest')}
                                            </Button>
                                            {selfTestResult && (
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => navigate('/chat', {
                                                        state: buildChatSessionState(selfTestResult.sessionId, selfTestResult.agentId),
                                                    })}
                                                >
                                                    {t('channels.openSession')}
                                                </Button>
                                            )}
                                        </div>
                                        {selfTestResult && (
                                            <div className="channel-self-test-result">
                                                <div className="channel-self-test-meta">
                                                    <span>{t('channels.selfTestPhone')}: {selfTestResult.selfPhone}</span>
                                                    <span>{t('channels.selfTestSession')}: {selfTestResult.sessionId}</span>
                                                </div>
                                                <div className="channel-self-test-reply">
                                                    <strong>{t('channels.selfTestReply')}</strong>
                                                    <p>{selfTestResult.replyText}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </>
                    )}

                    {activeTab === 'runtime' && (
                        <section className="channel-configure-section">
                            <div className="channel-configure-section-header">
                                <div>
                                    <h2 className="channel-configure-section-title">{t('channels.runtimeTitle')}</h2>
                                    <p className="channel-configure-section-desc">{t('channels.runtimeDesc')}</p>
                                </div>
                            </div>
                            <div className="channel-runtime-grid">
                                <div className="channel-runtime-card">
                                    <h3>{t('channels.bindingsTitle')}</h3>
                                    {bindings.length === 0 ? (
                                        <p className="channel-runtime-empty">{t('channels.noBindings')}</p>
                                    ) : (
                                        <ul className="channel-runtime-list channel-runtime-list-scroll">
                                            {bindings.slice(0, 5).map(binding => (
                                                <li key={`${binding.channelId}:${binding.accountId}:${binding.conversationId}:${binding.threadId || ''}`}>
                                                    <strong>{binding.conversationId}</strong>
                                                    <span>{binding.peerId}</span>
                                                    <span>{binding.conversationType}{binding.threadId ? ` · ${binding.threadId}` : ''}</span>
                                                    <span>{binding.sessionId}</span>
                                                    <span>{formatTimestamp(binding.lastInboundAt, t('channels.never'))}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div className="channel-runtime-card">
                                    <h3>{t('channels.eventsTitle')}</h3>
                                    {events.length === 0 ? (
                                        <p className="channel-runtime-empty">{t('channels.noEvents')}</p>
                                    ) : (
                                        <ul className="channel-runtime-list channel-runtime-list-scroll">
                                            {events.map(event => (
                                                <li key={event.id}>
                                                    <strong>{event.type}</strong>
                                                    <span>{event.summary}</span>
                                                    <span>{formatTimestamp(event.createdAt, t('channels.never'))}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {isLoginModalOpen && (
                <DetailDialog
                    title={isWeChat ? t('channels.loginModalTitle_wechat') : t('channels.loginModalTitle')}
                    onClose={() => setIsLoginModalOpen(false)}
                    className="channel-login-dialog"
                >
                    <div className="channel-login-modal-body">
                        {showQrLoading && (
                            <div className="channel-login-loading">
                                <div className="channel-login-spinner" aria-hidden="true" />
                                <p>{t('channels.loginPreparing')}</p>
                            </div>
                        )}

                        {showQrReady && (
                            <div className="channel-qr-card">
                                <img
                                    className="channel-qr-image"
                                    src={loginState?.qrCodeDataUrl || ''}
                                    alt={isWeChat ? t('channels.qrAlt_wechat') : t('channels.qrAlt')}
                                />
                                <p className="channel-webhook-hint">
                                    {isWeChat ? t('channels.qrHint_wechat') : t('channels.qrHint')}
                                </p>
                            </div>
                        )}

                        {showQrError && (
                            <div className="channel-login-error">
                                <p>{loginState?.message || t('channels.loginStateFailed')}</p>
                            </div>
                        )}

                        {!showQrLoading && !showQrReady && !showQrError && (
                            <div className="channel-login-loading">
                                <div className="channel-login-spinner" aria-hidden="true" />
                                <p>{loginState?.message || t('channels.loginPreparing')}</p>
                            </div>
                        )}
                    </div>
                </DetailDialog>
            )}
        </div>
    )
}
