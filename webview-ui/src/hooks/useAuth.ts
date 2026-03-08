import { useState, useEffect, useCallback } from 'react'

const API_BASE = ''
const USER_TOKEN_KEY = 'user_token'

export interface AuthUser {
  userId: string
  name: string
  avatar: string
  githubId: number | null
  githubLogin: string | null
  githubAvatarUrl: string | null
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isLoggedIn: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isLoggedIn: false,
  })

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem(USER_TOKEN_KEY)
    if (!token) {
      setState({ user: null, loading: false, isLoggedIn: false })
      return
    }

    try {
      const resp = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'x-user-token': token },
      })
      if (resp.ok) {
        const user: AuthUser = await resp.json()
        setState({ user, loading: false, isLoggedIn: !!user.githubId })
      } else {
        setState({ user: null, loading: false, isLoggedIn: false })
      }
    } catch {
      setState({ user: null, loading: false, isLoggedIn: false })
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // Handle login success from OAuth callback
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('login-success')) {
      const params = new URLSearchParams(hash.split('?')[1] || '')
      const token = params.get('token')
      if (token) {
        localStorage.setItem(USER_TOKEN_KEY, token)
        // Clear the hash and reload user
        window.location.hash = '#/lobby'
        fetchUser()
      }
    }
  }, [fetchUser])

  const loginWithGitHub = useCallback(() => {
    window.location.href = '/auth/github'
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(USER_TOKEN_KEY)
    setState({ user: null, loading: false, isLoggedIn: false })
  }, [])

  const getUserToken = useCallback((): string | null => {
    return localStorage.getItem(USER_TOKEN_KEY)
  }, [])

  return {
    ...state,
    loginWithGitHub,
    logout,
    getUserToken,
    refresh: fetchUser,
  }
}
