import {
    Activity,
    BookOpen,
    FileText,
    ShieldAlert,
    Users,
    Server,
    Zap,
    BarChart3,
    Search,
    FileCheck,
    AlertTriangle,
    ClipboardCheck,
    Cloud,
    Database,
    Lock
} from 'lucide-react'
import { PromptTemplate } from '../types/prompt'

export const PROMPT_TEMPLATES: PromptTemplate[] = [
    // Universal Agent
    {
        id: 'universal-plan',
        title: 'Cross-Team Incident Plan',
        description: 'Coordinated response plan with owners and timeline.',
        agentId: 'universal-agent',
        icon: Users,
        prompt: 'Create a cross-team response plan for a P1 production incident, including role ownership, 30/60/120-minute action checklists, escalation/sync mechanisms, and postmortem preparation tasks.'
    },
    {
        id: 'arch-review',
        title: 'Architecture Review Board',
        description: 'Prepare ARB presentation for microservice migration.',
        agentId: 'universal-agent',
        icon: Server,
        prompt: 'Prepare an ARB (Architecture Review Board) presentation structure for a new microservice migration. Include context, options considered, trade-off analysis, and rollout plan.'
    },
    {
        id: 'post-mortem',
        title: 'Post-Mortem Orchestration',
        description: 'Guide team through blameless post-mortem analysis.',
        agentId: 'universal-agent',
        icon: Activity,
        prompt: 'Guide the team through a blameless post-mortem analysis for the recent outage. Structure the session to cover timeline, root cause, impact, and preventive actions.'
    },
    {
        id: 'capacity-plan',
        title: 'Capacity Planning Strategy',
        description: 'Analyze resource usage and propose scaling strategy.',
        agentId: 'universal-agent',
        icon: BarChart3,
        prompt: 'Analyze current resource usage trends and propose a scaling strategy for Q4. Consider cost optimization and peak load handling.'
    },
    {
        id: 'cloud-cost',
        title: 'Cloud Cost Optimization',
        description: 'Identify idle resources and suggest savings.',
        agentId: 'universal-agent',
        icon: Cloud,
        prompt: 'Analyze the current cloud infrastructure bill and identify idle resources or over-provisioned instances. Suggest specific actions to reduce monthly spend by 20%.'
    },
    {
        id: 'project-roadmap',
        title: 'Project Roadmap',
        description: 'Draft a quarterly roadmap with milestones.',
        agentId: 'universal-agent',
        icon: FileText,
        prompt: 'Draft a quarterly roadmap for the "Cloud Migration" project. Include key milestones, dependencies, and resource allocation requirements.'
    },
    {
        id: 'team-agenda',
        title: 'Team Sync Agenda',
        description: 'Create an agenda for the weekly sync.',
        agentId: 'universal-agent',
        icon: Users,
        prompt: 'Create an agenda for the weekly engineering team sync. Topics should include: sprint progress, blocker resolution, and design reviews.'
    },

    // Report Agent
    {
        id: 'incident-quality',
        title: 'Incident Quality Report',
        description: 'Ops quality report with HTML and DOCX outputs.',
        agentId: 'report-agent',
        icon: FileCheck,
        prompt: `Use the report agent skill "ops-incident-quality" to generate an "Incident Operations Quality Report". Requirements: 1. Generate one previewable HTML report and one DOCX report. 2. Include incident overview, timeliness, and improvement actions.`
    },
    {
        id: 'weekly-ops',
        title: 'Weekly Operations Summary',
        description: 'Summarize incidents and alerts for leadership.',
        agentId: 'report-agent',
        icon: FileText,
        prompt: 'Generate a weekly operations summary for leadership, including KPIs, trend changes, major incidents, risks, and next-week action items.'
    },
    {
        id: 'sla-audit',
        title: 'SLA Compliance Audit',
        description: 'Monthly report on SLA breaches and compliance.',
        agentId: 'report-agent',
        icon: ClipboardCheck,
        prompt: 'Generate a monthly report on SLA breaches and compliance trends. Highlight teams with highest breach rates and suggest process improvements.'
    },
    {
        id: 'shift-handoff',
        title: 'Shift Handoff Brief',
        description: 'Summarize active alerts for next shift.',
        agentId: 'report-agent',
        icon: Zap,
        prompt: 'Summarize key active alerts, pending tickets, and ongoing incidents for the next shift. Prioritize items requiring immediate attention.'
    },
    {
        id: 'daily-standup',
        title: 'Daily Standup',
        description: 'Summarize yesterday\'s key achievements.',
        agentId: 'report-agent',
        icon: Activity,
        prompt: 'Summarize yesterday\'s key achievements, today\'s planned tasks, and any blockers for the daily standup meeting.'
    },
    {
        id: 'release-notes',
        title: 'Release Notes',
        description: 'Generate release notes for the latest deployment.',
        agentId: 'report-agent',
        icon: FileText,
        prompt: 'Generate release notes for the latest deployment (v2.4.0). Include new features, bug fixes, and known issues based on the commit log.'
    },
    {
        id: 'perf-review',
        title: 'Performance Review',
        description: 'Draft a performance review for an engineer.',
        agentId: 'report-agent',
        icon: Users,
        prompt: 'Draft a performance review for a Senior DevOps Engineer. Highlight achievements in automation, incident response, and mentorship.'
    },

    // KB Agent
    {
        id: 'kb-incident-qa',
        title: 'Incident Knowledge Q&A',
        description: 'Retrieve similar incidents and provide guidance.',
        agentId: 'kb-agent',
        icon: BookOpen,
        prompt: 'Search the knowledge base for historical cases related to "database connection timeout". Return: similar case summaries, troubleshooting paths, reusable fixes, and risk notes.'
    },
    {
        id: 'error-log',
        title: 'Error Log Analysis',
        description: 'Analyze stack traces against known solutions.',
        agentId: 'kb-agent',
        icon: Search,
        prompt: 'Analyze these Java stack traces and match against known solutions in the knowledge base. Identify potential root causes.'
    },
    {
        id: 'runbook-retrieval',
        title: 'Runbook Retrieval',
        description: 'Find SOP for specific operations tasks.',
        agentId: 'kb-agent',
        icon: FileText,
        prompt: 'Find and summarize the standard operating procedure (runbook) for Kafka partition reassignment. List the critical steps and safety checks.'
    },
    {
        id: 'db-tuning',
        title: 'Database Tuning Guide',
        description: 'Find best practices for query optimization.',
        agentId: 'kb-agent',
        icon: Database,
        prompt: 'Search the knowledge base for best practices regarding PostgreSQL query optimization. Summarize index strategies and configuration parameters for high-write workloads.'
    },
    {
        id: 'api-docs',
        title: 'API Documentation',
        description: 'Find the internal API docs for the payment service.',
        agentId: 'kb-agent',
        icon: BookOpen,
        prompt: 'Find the internal API documentation for the payment service. Specifically, look for the "initiate_refund" endpoint and its required parameters.'
    },
    {
        id: 'onboarding-guide',
        title: 'Onboarding Guide',
        description: 'Retrieve the new hire checklist.',
        agentId: 'kb-agent',
        icon: ClipboardCheck,
        prompt: 'Retrieve the new hire onboarding checklist for the Platform Engineering team. Include access requests, required training, and first-week tasks.'
    },
    {
        id: 'security-policy',
        title: 'Security Policy',
        description: 'Find the password rotation policy.',
        agentId: 'kb-agent',
        icon: Lock,
        prompt: 'Find the company\'s password rotation policy and Multi-Factor Authentication (MFA) requirements for production access.'
    },

    // Contract Agent
    {
        id: 'contract-risk',
        title: 'Contract Risk Scan',
        description: 'Detect delivery and breach risks in clauses.',
        agentId: 'contract-agent',
        icon: ShieldAlert,
        prompt: 'Review the following service contract draft. Return a high/medium/low risk clause list, and for each clause include: risk point, impact, and suggested rewritten text.'
    },
    {
        id: 'vendor-renewal',
        title: 'Vendor Renewal Checklist',
        description: 'Evaluate vendor performance before renewal.',
        agentId: 'contract-agent',
        icon: ClipboardCheck,
        prompt: 'Create a checklist for evaluating vendor performance before contract renewal. Include criteria for service quality, support responsiveness, and cost effectiveness.'
    },
    {
        id: 'compliance-term',
        title: 'Compliance Term Review',
        description: 'Highlight GDPR and data sovereignty terms.',
        agentId: 'contract-agent',
        icon: AlertTriangle,
        prompt: 'Highlight terms related to GDPR, data sovereignty, and privacy compliance in this document. Flag any missing standard clauses.'
    },
    {
        id: 'security-audit',
        title: 'Security Clause Audit',
        description: 'Verify SOC2 and audit right clauses.',
        agentId: 'contract-agent',
        icon: Lock,
        prompt: 'Scan the contract for security requirements. Verify if SOC2, penetration testing, and right-to-audit clauses are present and meet our standard policy.'
    },
    {
        id: 'nda-review',
        title: 'NDA Review',
        description: 'Review this NDA for non-compete clauses.',
        agentId: 'contract-agent',
        icon: FileText,
        prompt: 'Review this Non-Disclosure Agreement (NDA). Specifically, check for any non-compete clauses or overly broad definition of "Confidential Information".'
    },
    {
        id: 'sla-define',
        title: 'SLA Definition',
        description: 'Define standard SLA terms for new vendor.',
        agentId: 'contract-agent',
        icon: Zap,
        prompt: 'Define standard Service Level Agreement (SLA) terms for a new SaaS vendor. Include uptime guarantees (99.9%), response times for P1 issues, and service credit penalties.'
    },
    {
        id: 'payment-terms',
        title: 'Payment Terms',
        description: 'Check payment terms for Net-30 compliance.',
        agentId: 'contract-agent',
        icon: ClipboardCheck,
        prompt: 'Check the payment terms in this contract draft. Ensure they align with our standard Net-30 payment policy and check for any late payment penalty clauses.'
    }
]
