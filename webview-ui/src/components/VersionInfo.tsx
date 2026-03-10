import { useState, useEffect } from 'react'

interface VersionData {
  version: string
  commitId: string
  buildDate: string
  repoUrl: string
  skillUrl: string
  tagline: string
  changes: string[]
}

interface VersionInfoProps {
  inline?: boolean
}

export function VersionInfo({ inline = false }: VersionInfoProps) {
  const [version, setVersion] = useState<VersionData | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    fetch('/version')
      .then((res) => res.json())
      .then((data) => setVersion(data))
      .catch((err) => console.error('Failed to load version info:', err))
  }, [])

  if (!version) return null

  const buttonStyle: React.CSSProperties = inline
    ? {
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 6,
        padding: '4px 12px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 8,
        fontSize: 14,
        fontFamily: 'monospace',
        color: 'rgba(255, 255, 255, 0.6)',
        transition: 'all 0.2s',
        marginTop: 2,
      }
    : {
        position: 'fixed' as const,
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        background: 'rgba(20, 20, 30, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        padding: '6px 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 14,
        fontFamily: 'monospace',
        color: 'rgba(255, 255, 255, 0.6)',
        transition: 'all 0.2s',
      }

  return (
    <>
      {/* Version badge - click to open */}
      <button
        onClick={() => setIsOpen(true)}
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = inline
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(40, 40, 60, 0.9)'
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = inline
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgba(20, 20, 30, 0.85)'
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'
        }}
      >
        <span style={{ color: '#8cf' }}>v{version.version}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>({version.commitId})</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 200,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: 'rgba(25, 25, 35, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 12,
              padding: 24,
              minWidth: 320,
              maxWidth: 400,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#fff',
                  fontFamily: 'monospace',
                  marginBottom: 4,
                }}
              >
                Claw Pixel Town
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#fc8',
                  fontFamily: 'monospace',
                  marginBottom: 8,
                  fontStyle: 'italic',
                }}
              >
                {version.tagline}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
              >
                <span style={{ color: '#8cf' }}>v{version.version}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {version.commitId}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {version.buildDate}
                </span>
              </div>
            </div>

            {/* Changes */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 8,
                  fontFamily: 'monospace',
                }}
              >
                Recent Changes
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  fontSize: 13,
                  fontFamily: 'monospace',
                  color: 'rgba(255, 255, 255, 0.8)',
                  lineHeight: 1.8,
                }}
              >
                {version.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>

            {/* Links */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {/* Skill link - primary action */}
              <a
                href={version.skillUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  textDecoration: 'none',
                  transition: 'opacity 0.2s',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.85'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                Get SKILL.md
              </a>

              {/* GitHub link */}
              <a
                href={version.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 6,
                  color: '#8cf',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  textDecoration: 'none',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </a>
            </div>

            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: 20,
                cursor: 'pointer',
                padding: 4,
              }}
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </>
  )
}
