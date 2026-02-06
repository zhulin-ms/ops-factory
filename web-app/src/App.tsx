import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import Chat from './pages/Chat'
import History from './pages/History'
import Files from './pages/Files'
import Agents from './pages/Agents'
import FilePreview from './components/FilePreview'
import { PreviewProvider, usePreview } from './contexts/PreviewContext'

function AppContent() {
    const { previewFile } = usePreview()
    const isPreviewOpen = !!previewFile

    return (
        <div className="app-container">
            <Sidebar />
            <div className={`main-wrapper ${isPreviewOpen ? 'with-preview' : ''}`}>
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/files" element={<Files />} />
                        <Route path="/agents" element={<Agents />} />
                    </Routes>
                </main>
                <FilePreview />
            </div>
        </div>
    )
}

export default function App() {
    return (
        <PreviewProvider>
            <AppContent />
        </PreviewProvider>
    )
}
