import FilePreview from '../../components/FilePreview'
import CapabilityMarketPanel from '../../components/market/CapabilityMarketPanel'
import { useRightPanel } from '../../contexts/RightPanelContext'
import { usePreview } from '../../contexts/PreviewContext'

export function RightPanelHost() {
    const { previewFile } = usePreview()
    const { isMarketOpen, marketActiveTab, closeMarket, setMarketActiveTab } = useRightPanel()
    const isPreviewOpen = !!previewFile
    const isRightPanelOpen = isMarketOpen || isPreviewOpen

    return (
        <div className={`right-panel-host ${isRightPanelOpen ? 'open' : ''} ${isMarketOpen ? 'drawer' : isPreviewOpen ? 'preview' : ''}`}>
            {isMarketOpen ? (
                <CapabilityMarketPanel
                    isOpen={isMarketOpen}
                    activeTab={marketActiveTab}
                    onClose={closeMarket}
                    onTabChange={setMarketActiveTab}
                />
            ) : (
                <FilePreview embedded />
            )}
        </div>
    )
}

