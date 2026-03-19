import { useState } from 'react';
import './CapabilityMarketPanel.css';
import { useTranslation } from 'react-i18next';
import { X, Search, Download, Check, Box, Code2, Activity, FileJson } from 'lucide-react';

interface CapabilityMarketPanelProps {
    isOpen: boolean;
    activeTab: 'all' | 'mcp' | 'skill';
    onClose: () => void;
    onTabChange: (tab: 'all' | 'mcp' | 'skill') => void;
}

const mockCapabilities = [
    {
        id: 'aws-cloud',
        title: 'AWS Cloud Tools',
        type: 'mcp' as const,
        publisher: 'OpsFactory',
        description: 'Official MCP for managing EC2 instances, S3 buckets, and RDS databases in your AWS environment.',
        icon: <Box className="cap-icon text-blue-500" /> // Changed from Cloud
    },
    {
        id: 'k8s-debug',
        title: 'K8s Node Debug',
        type: 'skill' as const,
        publisher: 'Community',
        description: 'Standard operating procedure for K8s nodes. Helps fetch kubelet logs and diagnose OutOfMemory errors.',
        icon: <Activity className="cap-icon text-green-500" />
    },
    {
        id: 'github-interactor',
        title: 'GitHub Interactor',
        type: 'mcp' as const,
        publisher: 'GitHub',
        description: 'Search repositories, manage PRs, and review issues directly within your conversation flow.',
        icon: <Code2 className="cap-icon text-gray-700" /> // Changed from Github
    },
    {
        id: 'log-analyzer',
        title: 'Log Analysis',
        type: 'skill' as const,
        publisher: 'OpsFactory',
        description: 'Paste error logs from your infrastructure and let the agent automatically analyze patterns and root causes.',
        icon: <FileJson className="cap-icon text-purple-500" /> // Changed from AlignLeft
    }
];

export default function CapabilityMarketPanel({ isOpen, activeTab, onClose, onTabChange }: CapabilityMarketPanelProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [installingStatus, setInstallingStatus] = useState<Record<string, 'idle' | 'installing' | 'installed'>>({});

    const counts = {
        all: mockCapabilities.length,
        mcp: mockCapabilities.filter(item => item.type === 'mcp').length,
        skill: mockCapabilities.filter(item => item.type === 'skill').length,
    };

    const filteredItems = mockCapabilities.filter(item => {
        const matchesTab = activeTab === 'all' || item.type === activeTab;
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              item.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesTab && matchesSearch;
    });

    const handleInstall = (id: string, type: 'mcp' | 'skill') => {
        setInstallingStatus(prev => ({ ...prev, [id]: 'installing' }));
        // Mock installation delay
        setTimeout(() => {
            setInstallingStatus(prev => ({ ...prev, [id]: 'installed' }));
            // TODO: In real implementation, this would trigger the AddMcpModal or download the skill markdown
            console.log(`Installed ${type} capability: ${id}`);
        }, 1000);
    };

    if (!isOpen) return null;

    return (
        <div className="capability-market-container">
            <div className="cap-market-header">
                <div className="cap-market-title-area">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h2 className="cap-market-title">{t('market.title')}</h2>
                        <span className="cap-market-mock-badge">
                            {t('market.mockBadge')}
                        </span>
                    </div>
                    <button className="cap-btn-icon" onClick={onClose} aria-label={t('common.close')}>
                        <X size={20} />
                    </button>
                </div>

                <div className="search-container" style={{ marginBottom: '24px' }}>
                    <div className="search-input-wrapper">
                        <Search size={16} style={{ color: 'var(--color-text-muted)' }} />
                        <input 
                            type="text" 
                            placeholder={t('market.searchPlaceholder')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                    </div>
                </div>

                <div className="seg-filter" role="tablist" style={{ marginBottom: '8px' }}>
                    <button 
                        className={`seg-filter-btn ${activeTab === 'all' ? 'active' : ''}`}
                        onClick={() => onTabChange('all')}
                    >
                        {t('market.tabs.all')} <span className="seg-filter-count">{counts.all}</span>
                    </button>
                    <button 
                        className={`seg-filter-btn ${activeTab === 'skill' ? 'active' : ''}`}
                        onClick={() => onTabChange('skill')}
                    >
                        {t('market.tabs.skills')} <span className="seg-filter-count">{counts.skill}</span>
                    </button>
                    <button 
                        className={`seg-filter-btn ${activeTab === 'mcp' ? 'active' : ''}`}
                        onClick={() => onTabChange('mcp')}
                    >
                        {t('market.tabs.mcps')} <span className="seg-filter-count">{counts.mcp}</span>
                    </button>
                </div>
            </div>

            <div className="cap-list-content">
                <div className="cap-grid">
                    {filteredItems.map(item => {
                        const status = installingStatus[item.id] || 'idle';
                        return (
                            <div key={item.id} className="cap-card">
                                <div className="cap-card-header">
                                    <div className="cap-card-icon-title">
                                        <div className="cap-card-icon-wrapper">{item.icon}</div>
                                        <h3 className="cap-card-title">{item.title}</h3>
                                    </div>
                                    <span className={`cap-card-badge ${item.type}`}>
                                        {item.type.toUpperCase()}
                                    </span>
                                </div>
                                <div className="cap-card-publisher">By {item.publisher}</div>
                                <p className="cap-card-desc" title={item.description}>{item.description}</p>
                                <div className="cap-card-footer">
                                {status === 'installed' ? (
                                    <button className="cap-btn-installed" disabled>
                                        <Check size={14} className="btn-icon" /> {t('market.installed')}
                                    </button>
                                ) : (
                                    <button 
                                        className="cap-btn-install" 
                                        onClick={() => handleInstall(item.id, item.type)}
                                        disabled={status === 'installing'}
                                    >
                                        {status === 'installing' ? t('market.installing') : <><Download size={14} className="btn-icon" /> {t('market.install')}</>}
                                    </button>
                                )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {filteredItems.length === 0 && (
                    <div className="cap-empty-state">
                        <p>{t('market.noResults')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
