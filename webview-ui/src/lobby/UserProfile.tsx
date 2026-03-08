import { useState, useRef, useEffect } from 'react'
import type { AuthUser } from '../hooks/useAuth.js'

interface UserProfileProps {
  user: AuthUser
  onLogout: () => void
}

export function UserProfile({ user, onLogout }: UserProfileProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Profile Button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'var(--pixel-card-bg, #2a2a3a)',
          border: '2px solid var(--pixel-border, #4a4a5a)',
          cursor: 'pointer',
          borderRadius: 0,
        }}
      >
        {user.githubAvatarUrl ? (
          <img
            src={user.githubAvatarUrl}
            alt={user.name}
            style={{ width: 32, height: 32, borderRadius: '50%' }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--pixel-accent, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {(user.githubLogin || user.name || 'U')[0].toUpperCase()}
          </div>
        )}
        <span style={{ color: 'var(--pixel-text, #e0e0e0)', fontSize: '14px' }}>
          {user.githubLogin || user.name || 'User'}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{
            color: 'var(--pixel-text-dim, #888)',
            transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            minWidth: 200,
            background: 'var(--pixel-card-bg, #2a2a3a)',
            border: '2px solid var(--pixel-border, #4a4a5a)',
            zIndex: 1000,
          }}
        >
          {/* Profile Header */}
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid var(--pixel-border, #4a4a5a)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {user.githubAvatarUrl ? (
              <img
                src={user.githubAvatarUrl}
                alt={user.name}
                style={{ width: 48, height: 48, borderRadius: '50%' }}
              />
            ) : (
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'var(--pixel-accent, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '20px',
                  fontWeight: 'bold',
                }}
              >
                {(user.githubLogin || user.name || 'U')[0].toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ color: 'var(--pixel-text, #e0e0e0)', fontWeight: 'bold', fontSize: '16px' }}>
                {user.githubLogin || user.name || 'User'}
              </div>
              {user.githubLogin && (
                <a
                  href={`https://github.com/${user.githubLogin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--pixel-text-dim, #888)',
                    fontSize: '12px',
                    textDecoration: 'none',
                  }}
                >
                  github.com/{user.githubLogin}
                </a>
              )}
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ padding: '8px 0' }}>
            <button
              onClick={() => {
                setShowDropdown(false)
                onLogout()
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                color: 'var(--pixel-danger, #ef4444)',
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--pixel-bg, #1a1a2a)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
              </svg>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
