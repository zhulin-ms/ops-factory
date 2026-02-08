import { type LucideIcon } from 'lucide-react'

export interface PromptTemplate {
    id: string
    title: string
    description: string
    prompt: string
    agentId: string
    icon: LucideIcon
}
