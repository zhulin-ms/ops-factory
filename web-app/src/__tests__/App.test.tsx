import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import App from '../App'
import { BrowserRouter } from 'react-router-dom'
import { UserProvider } from '../app/platform/providers/UserContext'
import { GoosedProvider } from '../app/platform/providers/GoosedContext'
import { ToastProvider } from '../app/platform/providers/ToastContext'

const STORAGE_KEY = 'opsfactory:userId'

describe('App', () => {
    beforeEach(() => {
        // Set a userId so ProtectedRoute allows access
        localStorage.setItem(STORAGE_KEY, 'test-user')
    })

    afterEach(() => {
        localStorage.clear()
    })

    it('renders without crashing', () => {
        render(
            <BrowserRouter>
                <ToastProvider>
                    <UserProvider>
                        <GoosedProvider>
                            <App />
                        </GoosedProvider>
                    </UserProvider>
                </ToastProvider>
            </BrowserRouter>
        )
        // Sidebar should be present for authenticated user
        expect(screen.getByText('Home')).toBeInTheDocument()
        expect(screen.getByText('History')).toBeInTheDocument()
        expect(screen.getByText('Inbox')).toBeInTheDocument()
    })
})
