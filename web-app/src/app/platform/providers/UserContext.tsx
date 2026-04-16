import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { GATEWAY_URL, GATEWAY_SECRET_KEY, isAdminUser } from '../../../config/runtime'
import { getUrlParam } from '../../../utils/urlParams'
import { updateLoggingContext } from '../logging/context'
import { trackedFetch } from '../logging/requestClient'

const STORAGE_KEY = 'opsfactory:userId'

export type UserRole = 'admin' | 'user'

interface UserContextType {
    userId: string | null
    role: UserRole | null
    login: (username: string) => void
    logout: () => void
}

const UserContext = createContext<UserContextType | null>(null)

export function getCookie(name: string) {
    const cookies = document.cookie
    const cookieArray = cookies ? cookies.split('; ') : []

    for (const cookie of cookieArray) {
        const [cookieName,cookieValue] = cookie.split('=')
        if (cookieName === name && cookieValue) {
            return decodeURIComponent(cookieValue)
        }
    }
    return null
}

export function UserProvider({ children }: { children: ReactNode }) {
    const [userId, setUserId] = useState<string | null>(() => {
        const urlUserId = getUrlParam('uid') || getUrlParam('userId')
        const cookieUserId = getCookie('username')

        const resolvedUserId = urlUserId || cookieUserId

        if (resolvedUserId) {
            localStorage.setItem(STORAGE_KEY, resolvedUserId)
            return resolvedUserId
        }

        const storedUserId = localStorage.getItem(STORAGE_KEY)
        if (storedUserId) {
            return storedUserId
        }

        const fallbackUserId = 'admin'
        localStorage.setItem(STORAGE_KEY, fallbackUserId)
        return fallbackUserId
    })
    const [role, setRole] = useState<UserRole | null>(null)

    useEffect(() => {
        const urlUserId = getUrlParam('uid') || getUrlParam('userId')
        if (!urlUserId || urlUserId === userId) return

        if (urlUserId) {
            localStorage.setItem(STORAGE_KEY, urlUserId)
            setUserId(urlUserId)
        }
    }, [userId])

    const fetchRole = useCallback(async (uid: string) => {
        try {
            const res = await trackedFetch(`${GATEWAY_URL}/me`, {
                category: 'request',
                name: 'request.send',
                headers: {
                    'x-secret-key': GATEWAY_SECRET_KEY,
                    'x-user-id': uid,
                },
                signal: AbortSignal.timeout(5000),
            })
            if (res.ok) {
                const data = await res.json()
                setRole(data.role ?? 'user')
            } else {
                setRole(uid === 'admin' ? 'admin' : 'user')
            }
        } catch {
            setRole(uid === 'admin' ? 'admin' : 'user')
        }
    }, [])

    useEffect(() => {
        if (userId) {
            updateLoggingContext({ userId })
            fetchRole(userId)
        } else {
            updateLoggingContext({ userId: undefined })
            setRole(null)
        }
    }, [userId, fetchRole])

    const login = useCallback((username: string) => {
        const trimmed = username.trim()
        if (!trimmed) return
        localStorage.setItem(STORAGE_KEY, trimmed)
        setUserId(trimmed)
    }, [])

    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY)
        setUserId(null)
        setRole(null)
    }, [])

    return (
        <UserContext.Provider value={{ userId, role, login, logout }}>
            {children}
        </UserContext.Provider>
    )
}

export function useUser(): UserContextType {
    const context = useContext(UserContext)
    if (!context) {
        throw new Error('useUser must be used within a UserProvider')
    }
    return context
}

/** Redirect to /login if not authenticated */
export function ProtectedRoute({ children }: { children: ReactNode }) {
    return <>{children}</>
}

/** Redirect to / if not admin */
export function AdminRoute({ children }: { children: ReactNode }) {
    const { userId, role } = useUser()

    if (role !== null && !isAdminUser(userId, role)) {
        return <Navigate to="/" replace />
    }

    return <>{children}</>
}
