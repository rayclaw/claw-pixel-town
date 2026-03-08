import { useState, useCallback, useRef, useEffect } from 'react'
import { OfficeState } from './office/engine/officeState.js'
import { OfficeCanvas } from './office/components/OfficeCanvas.js'
import { ToolOverlay } from './office/components/ToolOverlay.js'
import { EditorToolbar } from './office/editor/EditorToolbar.js'
import { EditorState } from './office/editor/editorState.js'
import { EditTool } from './office/types.js'
import { isRotatable, buildDynamicCatalog } from './office/layout/furnitureCatalog.js'
import type { LoadedAssetData } from './office/layout/furnitureCatalog.js'
import { loadFurnitureAssets } from './office/layout/assetLoader.js'
import { useApiPolling } from './hooks/useApiPolling.js'
import { PULSE_ANIMATION_DURATION_SEC } from './constants.js'
import { useEditorActions } from './hooks/useEditorActions.js'
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js'
import { ZoomControls } from './components/ZoomControls.js'
import { BottomToolbar } from './components/BottomToolbar.js'
import { DebugView } from './components/DebugView.js'
import { AgentPanel } from './components/AgentPanel.js'
import { AgentNameLabels } from './components/AgentNameLabels.js'
import { LobbyView } from './lobby/index.js'
import { ChannelSettingsModal } from './components/ChannelSettingsModal.js'
import { fetchChannel, type ApiChannel } from './hooks/useChannelApi.js'
import { useAuth } from './hooks/useAuth.js'

/** Simple hash-based router */
function useHashRoute(): { view: 'lobby' | 'channel'; channelId: string | null } {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  return route
}

function parseHash(hash: string): { view: 'lobby' | 'channel'; channelId: string | null } {
  const path = hash.replace(/^#\/?/, '')
  if (path.startsWith('channel/')) {
    const channelId = path.slice(8)
    // Treat empty string, "undefined", and "null" as invalid
    const isValid = channelId && channelId !== 'undefined' && channelId !== 'null'
    return { view: 'channel', channelId: isValid ? channelId : null }
  }
  return { view: 'lobby', channelId: null }
}

function navigateTo(path: string) {
  window.location.hash = path
}

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null }
const editorState = new EditorState()

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState()
  }
  return officeStateRef.current
}

const actionBarBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: 'var(--pixel-btn-disabled-opacity)',
  cursor: 'default',
}

function EditActionBar({ editor, editorState: es }: { editor: ReturnType<typeof useEditorActions>; editorState: EditorState }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const undoDisabled = es.undoStack.length === 0
  const redoDisabled = es.redoStack.length === 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button
        style={actionBarBtnStyle}
        onClick={editor.handleSave}
        title="Save layout"
      >
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '22px', color: 'var(--pixel-reset-text)' }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
            onClick={() => { setShowResetConfirm(false); editor.handleReset() }}
          >
            Yes
          </button>
          <button
            style={actionBarBtnStyle}
            onClick={() => setShowResetConfirm(false)}
          >
            No
          </button>
        </div>
      )}
    </div>
  )
}

function OfficeView() {
  const editor = useEditorActions(getOfficeState, editorState)

  const [isDebugMode, setIsDebugMode] = useState(false)
  const [loadedAssets, setLoadedAssets] = useState<LoadedAssetData | undefined>(undefined)

  // Load furniture assets on mount
  useEffect(() => {
    // Assets are always served from /static/assets (both vite dev and cargo run)
    loadFurnitureAssets('/static/assets').then((assets) => {
      if (assets) {
        console.log(`Loaded ${assets.catalog.length} furniture assets`)
        buildDynamicCatalog(assets)
        setLoadedAssets(assets)
      }
    })
  }, [])

  const assetsReady = loadedAssets !== undefined
  const { agents, agentInfos, layoutReady } = useApiPolling(getOfficeState, editor.setLastSavedLayout, assetsReady)

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), [])

  const handleSelectAgent = useCallback((numericId: number) => {
    const os = getOfficeState()
    os.selectedAgentId = numericId
    os.cameraFollowId = numericId
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0)
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  )

  const handleCloseAgent = useCallback((_id: number) => {
    // No terminal to close in standalone mode
  }, [])

  const handleClick = useCallback((agentId: number) => {
    const os = getOfficeState()
    os.selectedAgentId = agentId
    os.cameraFollowId = agentId
  }, [])

  const officeState = getOfficeState()

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint = editor.isEditMode && (() => {
    if (editorState.selectedFurnitureUid) {
      const item = officeState.getLayout().furniture.find((f) => f.uid === editorState.selectedFurnitureUid)
      if (item && isRotatable(item.type)) return true
    }
    if (editorState.activeTool === EditTool.FURNITURE_PLACE && isRotatable(editorState.selectedFurnitureType)) {
      return true
    }
    return false
  })()

  if (!layoutReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
        Loading...
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
      />

      <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--pixel-vignette)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      <BottomToolbar
        isEditMode={editor.isEditMode}
        onOpenClaude={editor.handleOpenClaude}
        onToggleEditMode={editor.handleToggleEditMode}
        isDebugMode={isDebugMode}
        onToggleDebugMode={handleToggleDebugMode}
        workspaceFolders={[]}
      />

      {editor.isEditMode && editor.isDirty && (
        <EditActionBar editor={editor} editorState={editorState} />
      )}

      {showRotateHint && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: editor.isDirty ? 'translateX(calc(-50% + 100px))' : 'translateX(-50%)',
            zIndex: 49,
            background: 'var(--pixel-hint-bg)',
            color: '#fff',
            fontSize: '20px',
            padding: '3px 8px',
            borderRadius: 0,
            border: '2px solid var(--pixel-accent)',
            boxShadow: 'var(--pixel-shadow)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Press <b>R</b> to rotate
        </div>
      )}

      {editor.isEditMode && (() => {
        // Compute selected furniture color from current layout
        const selUid = editorState.selectedFurnitureUid
        const selColor = selUid
          ? officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null
          : null
        return (
          <EditorToolbar
            activeTool={editorState.activeTool}
            selectedTileType={editorState.selectedTileType}
            selectedFurnitureType={editorState.selectedFurnitureType}
            selectedFurnitureUid={selUid}
            selectedFurnitureColor={selColor}
            floorColor={editorState.floorColor}
            wallColor={editorState.wallColor}
            onToolChange={editor.handleToolChange}
            onTileTypeChange={editor.handleTileTypeChange}
            onFloorColorChange={editor.handleFloorColorChange}
            onWallColorChange={editor.handleWallColorChange}
            onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
            onFurnitureTypeChange={editor.handleFurnitureTypeChange}
            loadedAssets={loadedAssets}
          />
        )
      })()}

      {/* Agent name labels above characters */}
      <AgentNameLabels
        officeState={officeState}
        agents={agents}
        containerRef={containerRef}
        zoom={editor.zoom}
        panRef={editor.panRef}
      />

      {/* Agent status panel */}
      <AgentPanel
        agentInfos={agentInfos}
        onSelectAgent={handleSelectAgent}
        selectedAgentId={officeState.selectedAgentId}
      />

      <ToolOverlay
        officeState={officeState}
        agents={agents}
        agentTools={{}}
        subagentCharacters={[]}
        containerRef={containerRef}
        zoom={editor.zoom}
        panRef={editor.panRef}
        onCloseAgent={handleCloseAgent}
      />

      {isDebugMode && (
        <DebugView
          agents={agents}
          selectedAgent={null}
          agentTools={{}}
          agentStatuses={{}}
          subagentTools={{}}
          onSelectAgent={handleSelectAgent}
        />
      )}
    </div>
  )
}

function App() {
  const route = useHashRoute()

  const handleEnterChannel = useCallback((channelId: string, _joinKey?: string) => {
    // TODO: Store joinKey for later use in channel join API
    navigateTo(`/channel/${channelId}`)
  }, [])

  const handleBackToLobby = useCallback(() => {
    navigateTo('/lobby')
  }, [])

  // Redirect to lobby if no valid channel ID
  if (route.view === 'lobby' || !route.channelId) {
    return <LobbyView onEnterChannel={handleEnterChannel} />
  }

  // Channel view
  return (
    <ChannelView
      channelId={route.channelId}
      onBackToLobby={handleBackToLobby}
    />
  )
}

/** Channel view with owner settings */
function ChannelView({
  channelId,
  onBackToLobby,
}: {
  channelId: string
  onBackToLobby: () => void
}) {
  const { getUserToken } = useAuth()
  const [channel, setChannel] = useState<ApiChannel | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Fetch channel info
  useEffect(() => {
    fetchChannel(channelId)
      .then(setChannel)
      .catch(() => setChannel(null))
  }, [channelId])

  // Check if current user is owner
  const userToken = getUserToken()
  const isOwner = channel && userToken && channel.ownerUserId === userToken

  const handleDeleted = useCallback(() => {
    setShowSettings(false)
    onBackToLobby()
  }, [onBackToLobby])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Top right buttons */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 100,
          display: 'flex',
          gap: 8,
        }}
      >
        {isOwner && (
          <button
            onClick={() => setShowSettings(true)}
            title="Room Settings"
            style={{
              padding: '6px 10px',
              fontSize: '14px',
              background: 'var(--pixel-btn-bg, #3a3a4a)',
              color: 'var(--pixel-text, #e0e0e0)',
              border: '2px solid var(--pixel-border, #4a4a5a)',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{ display: 'block' }}
            >
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>
        )}
        <button
          onClick={onBackToLobby}
          style={{
            padding: '8px 16px',
            fontSize: '20px',
            background: 'var(--pixel-btn-bg, #3a3a4a)',
            color: 'var(--pixel-text, #e0e0e0)',
            border: '2px solid var(--pixel-border, #4a4a5a)',
            borderRadius: 0,
            cursor: 'pointer',
          }}
        >
          Back to Lobby
        </button>
      </div>

      <OfficeView />

      {/* Settings Modal */}
      {showSettings && channel && (
        <ChannelSettingsModal
          channelId={channelId}
          channelName={channel.name}
          onClose={() => setShowSettings(false)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

export default App
