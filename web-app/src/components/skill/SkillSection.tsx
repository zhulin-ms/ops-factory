import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSkills } from '../../hooks/useSkills'
import SkillCard from './SkillCard'
import './Skill.css'

interface SkillSectionProps {
    agentId: string
    onBrowseMarket?: () => void
}

export default function SkillSection({ agentId, onBrowseMarket }: SkillSectionProps) {
    const { t } = useTranslation()
    const { skills, isLoading, error, fetchSkills } = useSkills()

    useEffect(() => {
        if (agentId) {
            fetchSkills(agentId)
        }
    }, [agentId, fetchSkills])

    if (!agentId) return null

    return (
        <div className="skill-section">
            <div className="skill-section-header">
                <div className="skill-section-heading">
                    <h3 className="skill-section-title">{t('skill.title')}</h3>
                    <span className="skill-section-count">{skills.length}</span>
                </div>
            {onBrowseMarket && (
                <button
                    type="button"
                    className="action-btn-secondary"
                    onClick={onBrowseMarket}
                >
                    {t('market.browseMarket')}
                </button>
            )}
            </div>

            {error && (
                <div className="skill-alert skill-alert-error">{error}</div>
            )}

            {isLoading ? (
                <div className="skill-loading">{t('skill.loadingSkills')}</div>
            ) : skills.length > 0 ? (
                <div className="skill-grid">
                    {skills.map(skill => (
                        <SkillCard key={skill.name} skill={skill} />
                    ))}
                </div>
            ) : (
                <div className="skill-empty">
                    <p>{t('skill.noSkills')}</p>
                </div>
            )}
        </div>
    )
}
