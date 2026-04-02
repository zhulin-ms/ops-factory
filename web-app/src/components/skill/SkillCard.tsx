import { useTranslation } from 'react-i18next'
import type { SkillEntry } from '../../types/skill'
import './Skill.css'

interface SkillCardProps {
    skill: SkillEntry
}

export default function SkillCard({ skill }: SkillCardProps) {
    const { t } = useTranslation()
    return (
        <div className="skill-card">
            <div className="skill-card-header">
                <span className="skill-card-name">{skill.name}</span>
            </div>
            <p className="skill-card-description">
                {skill.description || t('skill.noDescription')}
            </p>
            <div className="skill-card-path">
                <code>{skill.path}</code>
            </div>
        </div>
    )
}
