import type { ReactNode } from 'react'
import type { IconKey } from './module-types'

type IconFrameProps = {
    children: ReactNode
    strokeWidth?: number
}

function IconFrame({ children, strokeWidth = 1.9 }: IconFrameProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    )
}

function HomeIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M4.8 10.6L12 4.7l7.2 5.9v7.85A1.8 1.8 0 0 1 17.4 20.25H6.6a1.8 1.8 0 0 1-1.8-1.8z" />
            <path d="M9.5 20.25v-4.9a1.05 1.05 0 0 1 1.05-1.05h2.9a1.05 1.05 0 0 1 1.05 1.05v4.9" />
        </IconFrame>
    )
}

function PlusIcon() {
    return (
        <IconFrame>
            <path d="M12 5.5v13" />
            <path d="M5.5 12h13" />
        </IconFrame>
    )
}

function HistoryIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M5 11.95a7 7 0 1 0 2.05-4.95" />
            <path d="M5 6.45v3.5h3.5" />
            <path d="M12 8.55v3.95l2.7 1.65" />
        </IconFrame>
    )
}

function InboxIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M5.95 7.5h12.1a1.35 1.35 0 0 1 1.23.8l1.02 2.28a1.4 1.4 0 0 1 .12.57v5.3a1.8 1.8 0 0 1-1.8 1.8H5.38a1.8 1.8 0 0 1-1.8-1.8v-5.3c0-.2.04-.4.12-.57L4.72 8.3a1.35 1.35 0 0 1 1.23-.8z" />
            <path d="M3.7 11.8h4.62l1.32 1.82h4.72l1.32-1.82h4.62" />
        </IconFrame>
    )
}

function FilesIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M7.3 3.75h5.9l4.5 4.45v10.95a1.7 1.7 0 0 1-1.7 1.7H7.3a1.7 1.7 0 0 1-1.7-1.7V5.45a1.7 1.7 0 0 1 1.7-1.7z" />
            <path d="M13.2 3.95v4.35h4.35" />
            <path d="M9.1 12.2h5.8" />
            <path d="M9.1 15.95h5.8" />
        </IconFrame>
    )
}

function ChannelsIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M6.35 5.6h6.95a2.25 2.25 0 0 1 2.25 2.25v4.1a2.25 2.25 0 0 1-2.25 2.25H9.8l-3 2.2v-2.2h-.45a2.25 2.25 0 0 1-2.25-2.25v-4.1A2.25 2.25 0 0 1 6.35 5.6z" />
            <path d="M10.7 9.8h6a2.2 2.2 0 0 1 2.2 2.2v3.65a2.2 2.2 0 0 1-2.2 2.2h-.35v1.65l-2.55-1.65H12.8a2.2 2.2 0 0 1-2.2-2.2" />
            <path d="M7.45 9.95h4.65" />
            <path d="M13 13.85h2.85" />
        </IconFrame>
    )
}

function BusinessIntelligenceIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M4.75 19.25h14.5" />
            <path d="M7.05 17.1v-2.95" />
            <path d="M11.95 17.1V8.45" />
            <path d="M16.85 17.1v-5.2" />
            <path d="M6.15 10.25l2.4-2.25 2.95 1.55 4.3-4.05" />
            <path d="M13.95 5.5h1.85v1.85" />
        </IconFrame>
    )
}

function WorkflowIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <rect x="4.4" y="5.2" width="5" height="5" rx="1.25" />
            <rect x="14.6" y="5.2" width="5" height="5" rx="1.25" />
            <rect x="9.5" y="14" width="5" height="5" rx="1.25" />
            <path d="M9.4 7.7h2.6" />
            <path d="M12 7.7v4.9" />
            <path d="M14.6 7.7H12" />
        </IconFrame>
    )
}

function AgentsIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M8.1 7.15h7.8a2.8 2.8 0 0 1 2.8 2.8v5.3a2.8 2.8 0 0 1-2.8 2.8H8.1a2.8 2.8 0 0 1-2.8-2.8v-5.3a2.8 2.8 0 0 1 2.8-2.8z" />
            <path d="M12 4.25v2.1" />
            <path d="M8.7 12.15h.01" />
            <path d="M15.3 12.15h.01" />
            <path d="M9.55 15.2c.7.55 1.55.82 2.45.82s1.75-.27 2.45-.82" />
            <path d="M5.3 10.8H3.95" />
            <path d="M20.05 10.8H18.7" />
        </IconFrame>
    )
}

function KnowledgeIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M6.55 5.1h4.15c1 0 1.92.45 2.55 1.2.63-.75 1.55-1.2 2.55-1.2h2.65v13.8H15.8c-1 0-1.92.45-2.55 1.2-.63-.75-1.55-1.2-2.55-1.2H6.55z" />
            <path d="M13.25 6.3v13.8" />
            <path d="M8.4 9.15h1.85" />
            <path d="M8.4 12.05h1.85" />
            <path d="M15.15 9.15h1.55" />
        </IconFrame>
    )
}

function SchedulerIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M9.1 4.4h5.8" />
            <path d="M12 4.4v2" />
            <circle cx="12" cy="13.2" r="6.55" />
            <path d="M12 9.8v3.65l2.3 1.55" />
            <path d="M8.35 7.9l-1.1-1.15" />
        </IconFrame>
    )
}

function MonitoringIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <path d="M3.8 13.2h3.2l1.75-4.55 3.1 8.7 2.45-5.75h5.9" />
            <path d="M19.45 13.2h.75" />
        </IconFrame>
    )
}

function HostResourceIcon() {
    return (
        <IconFrame strokeWidth={1.85}>
            <rect x="4.1" y="4.7" width="15.8" height="5.6" rx="1.2" />
            <rect x="4.1" y="13.1" width="15.8" height="5.6" rx="1.2" />
            <path d="M7.2 7.5h.01" />
            <path d="M7.2 15.9h.01" />
            <path d="M9.8 7.5h7" />
            <path d="M9.8 15.9h7" />
        </IconFrame>
    )
}

const ICONS: Record<IconKey, () => ReactNode> = {
    home: HomeIcon,
    plus: PlusIcon,
    history: HistoryIcon,
    inbox: InboxIcon,
    files: FilesIcon,
    channels: ChannelsIcon,
    diagnosis: WorkflowIcon,
    businessIntelligence: BusinessIntelligenceIcon,
    agents: AgentsIcon,
    knowledge: KnowledgeIcon,
    scheduler: SchedulerIcon,
    monitoring: MonitoringIcon,
    hostResource: HostResourceIcon,
}

export function renderIcon(icon: IconKey): ReactNode {
    const Icon = ICONS[icon]
    return <Icon />
}
