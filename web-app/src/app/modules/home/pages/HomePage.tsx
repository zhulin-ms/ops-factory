import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoosed } from '../../../platform/providers/GoosedContext'
import { useUser } from '../../../platform/providers/UserContext'
import { useToast } from '../../../platform/providers/ToastContext'
import ChatInput from '../../../platform/chat/ChatInput'
import GooseAvatarIcon from '../../../platform/chat/GooseAvatarIcon'
import { gatewayHeaders } from '../../../../config/runtime'
import { getUrlParams } from '../../../../utils/urlParams'
import '../styles/home.css'

interface ModelInfo {
    provider: string
    model: string
}

const UNIVERSAL_AGENT_ID = 'universal-agent'
const DIAGNOSIS_GATEWAY_URL = `${window.location.origin || 'http://localhost:3000'}`

export default function HomePage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { showToast } = useToast()
    const { userId } = useUser()
    const { getClient, agents, isConnected, error: connectionError } = useGoosed()
    const [isCreatingSession, setIsCreatingSession] = useState(false)
    const [diagnosisMessage, setDiagnosisMessage] = useState<string>('')
    const [selectedAgent, setSelectedAgent] = useState('')
    const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
    const hasCalledDiagnosis = useRef(false)

    const handleDiagnosis = useCallback(async (sceneCode: string) => {
        if (hasCalledDiagnosis.current) return
        hasCalledDiagnosis.current = true

        try {
            const response = await fetch(`${DIAGNOSIS_GATEWAY_URL}/itom/api/diagnosis/getDiagnosisQuery?sceneCode=${sceneCode}`, {
                headers: gatewayHeaders(userId),
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            const data = await response.text()
            setDiagnosisMessage(data || '')
            return data
        } catch (err) {
            showToast('error', '获取诊断信息失败')
            throw err
        }
    }, [userId, showToast])

    useEffect(() => {
        const params = getUrlParams()
        const hasScene = params.get('sceneCode')

        if (agents.length > 0 && !hasCalledDiagnosis.current) {
            if (hasScene) {
                setSelectedAgent('qos-agent')
                void handleDiagnosis(hasScene)
            } else if (!selectedAgent) {
                const universal = agents.find((agent) => agent.id === UNIVERSAL_AGENT_ID)
                setSelectedAgent(universal ? universal.id : agents[0].id)
            }
        }
    }, [agents, selectedAgent, handleDiagnosis])

    useEffect(() => {
        if (selectedAgent && diagnosisMessage) {
            setDiagnosisMessage('')
            const params = getUrlParams()
            const startTime = params.get('startTime')
            const endTime = params.get('endTime')
            const startT = startTime ? new Date(Number(startTime)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : ''
            const endT = endTime ? new Date(Number(endTime)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : ''
            const timeStr = startT && endT ? `，${t('home.time')}[ ${startT}，${endT} ]` : ''
            const message = `${t('home.environment')}：${params.get('envCode')}${t('home.qosHealth')}${timeStr}`
            void handleInputSubmit(message)
        }
    }, [selectedAgent, diagnosisMessage, t])

    useEffect(() => {
        const fetchModelInfo = async () => {
            if (!isConnected || !selectedAgent) return
            try {
                const client = getClient(selectedAgent)
                const systemInfo = await client.systemInfo()
                if (systemInfo.provider && systemInfo.model) {
                    setModelInfo({ provider: systemInfo.provider, model: systemInfo.model })
                }
            } catch (err) {
                console.error('Failed to fetch model info:', err)
            }
        }

        void fetchModelInfo()
    }, [getClient, selectedAgent, isConnected])

    const handleInputSubmit = async (message: string) => {
        if (isCreatingSession || !selectedAgent) return

        setIsCreatingSession(true)
        try {
            const client = getClient(selectedAgent)
            const session = await client.startSession()

            navigate(`/chat?sessionId=${session.id}&agent=${selectedAgent}`, {
                state: { initialMessage: message },
            })
        } catch (err) {
            console.error('Failed to create session:', err)
            showToast('error', t('home.failedToCreateSession', { error: err instanceof Error ? err.message : 'Unknown error' }))
        } finally {
            setIsCreatingSession(false)
        }
    }

    return (
        <div className="home-container">
            <div className="home-hero">
                <h1 className="home-title">
                    <span className="home-title-text">
                        {t('home.greeting')}
                        <GooseAvatarIcon className="home-title-icon" />
                    </span>
                </h1>
                <p className="home-description">{t('home.description')}</p>

                {connectionError && (
                    <div className="conn-banner conn-banner-error">
                        {t('common.connectionError', { error: connectionError })}
                    </div>
                )}

                {!isConnected && !connectionError && (
                    <div className="conn-banner conn-banner-warning">
                        {t('common.connectingGateway')}
                    </div>
                )}
            </div>

            <div className="home-input-container">
                <ChatInput
                    onSubmit={handleInputSubmit}
                    disabled={!isConnected || isCreatingSession || !selectedAgent}
                    placeholder={isCreatingSession ? t('home.creatingSession') : t('home.askAnything')}
                    autoFocus
                    selectedAgent={selectedAgent}
                    onAgentChange={setSelectedAgent}
                    modelInfo={modelInfo}
                />
            </div>
        </div>
    )
}
