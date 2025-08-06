import React, { useEffect, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { FabricRenderer } from '../fabric/FabricRenderer'
import { ZoomControls } from './ZoomControls'
import { WorldView } from './WorldView'
import { FabricGeometry } from '../types/geometry'
import { DesignData } from '../types/design'

interface FabricViewerProps {
  onMessage: (message: any) => void
}

const FabricViewer: React.FC<FabricViewerProps> = ({ onMessage }) => {
  const canvasRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const rendererRef = useRef<FabricRenderer | null>(null)
  const isInitializedRef = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentFabric, setCurrentFabric] = useState<string | null>(null)
  const [currentDesign, setCurrentDesign] = useState<string | null>(null)
  const [currentGeometry, setCurrentGeometry] = useState<FabricGeometry | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [viewportBounds, setViewportBounds] = useState({ x: 0, y: 0, width: 100, height: 100 })

  // Debug component lifecycle
  console.log('FabricViewer render - refs status:', {
    canvasRef: !!canvasRef.current,
    appRef: !!appRef.current,
    rendererRef: !!rendererRef.current,
    isInitialized: isInitializedRef.current
  })

  useEffect(() => {
    console.log('FabricViewer mounted/effect running')
    if (!canvasRef.current) return

    // Ensure container has dimensions
    const container = canvasRef.current
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      console.warn('Canvas container has zero dimensions, setting default size')
      container.style.width = '800px'
      container.style.height = '600px'
    }

    // Initialize Pixi.js application
    const initPixi = async () => {
      try {
        console.log('Initializing PixiJS...')
        console.log('Canvas container dimensions:', {
          width: canvasRef.current!.offsetWidth,
          height: canvasRef.current!.offsetHeight
        })

        const app = new Application()

        // Check if we're in VS Code webview and adjust settings accordingly
        const isVSCodeWebview = typeof (window as any).acquireVsCodeApi !== 'undefined'
        console.log('Environment detected:', isVSCodeWebview ? 'VS Code webview' : 'Browser')

        // Start with canvas renderer for VS Code webview for better compatibility
        let initOptions = {
          width: canvasRef.current!.offsetWidth || 800,
          height: canvasRef.current!.offsetHeight || 600,
          backgroundColor: 0x1e1e1e,
          antialias: !isVSCodeWebview, // Disable antialiasing in VS Code webview
          resolution: isVSCodeWebview ? 1 : (window.devicePixelRatio || 1),
          autoDensity: !isVSCodeWebview,
          preference: isVSCodeWebview ? 'webgl' as const : 'webgl' as const,
          powerPreference: 'low-power' as const,
          failIfMajorPerformanceCaveat: false
        }

        try {
          await app.init(initOptions)
          console.log('PixiJS initialized successfully')
        } catch (webglError) {
          console.warn('First initialization failed, trying with canvas renderer:', webglError)

          // Force canvas renderer as fallback
          const canvasOptions = {
            width: canvasRef.current!.offsetWidth || 800,
            height: canvasRef.current!.offsetHeight || 600,
            backgroundColor: 0x1e1e1e,
            antialias: false,
            resolution: 1,
            autoDensity: false,
            preference: 'webgpu' as const, // Try WebGPU if available
            powerPreference: 'low-power' as const,
            failIfMajorPerformanceCaveat: false
          }

          try {
            await app.init(canvasOptions)
            console.log('PixiJS initialized with WebGPU fallback')
          } catch (webgpuError) {
            console.warn('WebGPU failed, using final canvas fallback:', webgpuError)

            // Final fallback to basic canvas
            const basicOptions = {
              width: canvasRef.current!.offsetWidth || 800,
              height: canvasRef.current!.offsetHeight || 600,
              backgroundColor: 0x1e1e1e,
              antialias: false,
              resolution: 1,
              autoDensity: false,
              // Force canvas renderer
              forceCanvas: true
            }

            await app.init(basicOptions)
            console.log('PixiJS initialized with basic canvas renderer')
          }
        }

        console.log('PixiJS initialized successfully')
        console.log('Renderer type:', app.renderer.type)
        console.log('Canvas created:', app.canvas)

        canvasRef.current!.appendChild(app.canvas)
        appRef.current = app

        // Create enhanced fabric renderer
        console.log('Creating FabricRenderer...')
        try {
          const renderer = new FabricRenderer(app)
          rendererRef.current = renderer
          console.log('FabricRenderer created successfully:', renderer)
        } catch (rendererError) {
          console.error('Failed to create FabricRenderer:', rendererError)
          throw rendererError
        }

        // Send ready message to extension
        onMessage({ type: 'ready', message: 'Webview and PIXI.js initialized successfully' })

        // Mark as initialized
        isInitializedRef.current = true
        console.log('PIXI.js fully initialized and marked as ready')

        // Set up viewport change callback
        if (rendererRef.current) {
          rendererRef.current.setViewportChangeCallback((bounds, zoom) => {
            setViewportBounds(bounds)
            setZoomLevel(zoom)
          })
        }

        // Handle resize
        const handleResize = () => {
          if (canvasRef.current && app) {
            app.renderer.resize(
              canvasRef.current.offsetWidth,
              canvasRef.current.offsetHeight
            )
          }
        }

        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
          app.destroy(true)
        }
      } catch (error) {
        console.error('Failed to initialize Pixi.js:', error)
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'No stack trace',
          canvasContainer: canvasRef.current,
          containerDimensions: canvasRef.current ? {
            width: canvasRef.current.offsetWidth,
            height: canvasRef.current.offsetHeight
          } : 'Container not available',
          webglSupport: (() => {
            try {
              const canvas = document.createElement('canvas')
              const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
              return gl ? 'supported' : 'not supported'
            } catch (e) {
              return 'error checking: ' + e
            }
          })(),
          userAgent: navigator.userAgent,
          isVSCodeWebview: typeof (window as any).acquireVsCodeApi !== 'undefined'
        })

        // Try to show a helpful error message
        let errorMessage = 'Failed to initialize graphics engine'
        if (error instanceof Error) {
          if (error.message.includes('WebGL') || error.message.includes('webgl')) {
            errorMessage = 'WebGL not supported. The extension will work with limited graphics capabilities.'
          } else if (error.message.includes('canvas')) {
            errorMessage = 'Canvas initialization failed. This may be due to browser security restrictions.'
          } else if (error.message.includes('init') || error.message.includes('Application')) {
            errorMessage = 'Graphics engine initialization failed. Try reloading the webview.'
          }
        }

        // Try to create a basic fallback renderer
        try {
          console.log('Attempting basic canvas fallback...')
          const basicCanvas = document.createElement('canvas')
          basicCanvas.width = canvasRef.current!.offsetWidth || 800
          basicCanvas.height = canvasRef.current!.offsetHeight || 600
          basicCanvas.style.width = '100%'
          basicCanvas.style.height = '100%'
          basicCanvas.style.backgroundColor = '#1e1e1e'

          canvasRef.current!.appendChild(basicCanvas)

          const ctx = basicCanvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#1e1e1e'
            ctx.fillRect(0, 0, basicCanvas.width, basicCanvas.height)
            ctx.fillStyle = '#ffffff'
            ctx.font = '16px Arial'
            ctx.textAlign = 'center'
            ctx.fillText('Graphics engine fallback active', basicCanvas.width / 2, basicCanvas.height / 2)
            ctx.fillText('Some features may be limited', basicCanvas.width / 2, basicCanvas.height / 2 + 30)
            console.log('Basic canvas fallback created successfully')

            // Show warning but don't completely fail
            onMessage({
              type: 'warning',
              message: 'Using basic graphics mode. Some features may be limited.',
              details: error instanceof Error ? error.message : String(error)
            })
            return () => { } // Return cleanup function
          }
        } catch (fallbackError) {
          console.error('Even basic canvas fallback failed:', fallbackError)
        }

        onMessage({ type: 'error', message: errorMessage, details: error instanceof Error ? error.message : String(error) })
        setError(errorMessage)
      }
    }

    initPixi()

    return () => {
      console.log('FabricViewer cleanup - destroying instances')
      isInitializedRef.current = false
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
      if (rendererRef.current) {
        rendererRef.current.destroy()
        rendererRef.current = null
      }
    }
  }, []) // Remove onMessage from dependency array

  // Listen for messages from the extension
  useEffect(() => {
    console.log('Setting up message handler')
    const messageHandler = (event: MessageEvent) => {
      const message = event.data
      console.log('Received message in webview:', message)
      switch (message.type) {
        case 'loadFabric':
          console.log('Loading fabric with data:', message.data)
          handleLoadFabric(message.data)
          break
        case 'loadDesign':
          console.log('Loading design with data:', message.data)
          handleLoadDesign(message.data)
          break
        case 'highlightElement':
          console.log('Highlighting element:', message.data)
          handleHighlightElement(message.data)
          break
      }
    }

    window.addEventListener('message', messageHandler)
    return () => {
      console.log('Cleaning up message handler')
      window.removeEventListener('message', messageHandler)
    }
  }, [])

  const handleLoadFabric = (fabricData: FabricGeometry) => {
    console.log('handleLoadFabric called with:', fabricData)
    console.log('Renderer status:', {
      rendererExists: !!rendererRef.current,
      appExists: !!appRef.current,
      canvasExists: !!canvasRef.current,
      isInitialized: isInitializedRef.current
    })

    // Check if we're not yet initialized - defer the call
    if (!isInitializedRef.current) {
      console.log('Not yet initialized, deferring fabric load...')
      setTimeout(() => handleLoadFabric(fabricData), 100)
      return
    }

    if (!rendererRef.current) {
      console.error('No renderer available!')
      console.error('Debug info:', {
        rendererRef: rendererRef.current,
        appRef: appRef.current,
        canvasContainer: canvasRef.current,
        canvasChildren: canvasRef.current?.children.length,
        stageChildren: appRef.current?.stage.children.length,
        isInitialized: isInitializedRef.current
      })
      return
    } setIsLoading(true)
    try {
      console.log('Loading fabric:', fabricData.name)
      rendererRef.current.loadFabric(fabricData)
      setCurrentFabric(fabricData.name)
      setCurrentGeometry(fabricData)
      console.log('Fabric loaded successfully, sending fabricLoaded message')
      onMessage({
        type: 'fabricLoaded',
        data: {
          name: fabricData.name,
          rows: fabricData.numberOfRows,
          columns: fabricData.numberOfColumns
        }
      })
    } catch (error) {
      console.error('Failed to load fabric:', error)
      onMessage({ type: 'error', message: `Failed to load fabric: ${error}` })
    } finally {
      setIsLoading(false)
    }
  }

  // Zoom control handlers
  const handleZoomIn = () => {
    rendererRef.current?.zoomIn()
  }

  const handleZoomOut = () => {
    rendererRef.current?.zoomOut()
  }

  const handleZoomFit = () => {
    rendererRef.current?.zoomToFit()
  }

  const handleZoomReset = () => {
    rendererRef.current?.zoomReset()
  }


  // WorldView navigation handler
  const handleWorldViewClick = (x: number, y: number) => {
    rendererRef.current?.panTo(x, y)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '=':
          case '+':
            event.preventDefault()
            handleZoomIn()
            break
          case '-':
            event.preventDefault()
            handleZoomOut()
            break
          case '0':
            event.preventDefault()
            handleZoomFit()
            break
          case '1':
            event.preventDefault()
            handleZoomReset()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLoadDesign = (designData: DesignData) => {
    if (!rendererRef.current) return

    setIsLoading(true)
    try {
      console.log('Loading design:', designData.filePath)
      rendererRef.current.loadDesign(designData)
      setCurrentDesign(designData.statistics.totalNets > 0 ?
        `${designData.statistics.totalNets} nets` : 'Empty design')
      onMessage({
        type: 'designLoaded',
        data: {
          filePath: designData.filePath,
          nets: designData.statistics.totalNets,
          connections: designData.statistics.totalConnections
        }
      })
    } catch (error) {
      console.error('Failed to load design:', error)
      onMessage({ type: 'error', message: `Failed to load design: ${error}` })
    } finally {
      setIsLoading(false)
    }
  }

  // Handler for highlighting elements from sidebar
  const handleHighlightElement = (elementData: any) => {
    if (!rendererRef.current || !currentGeometry) {
      console.log('Cannot highlight: renderer or geometry not available')
      return
    }

    console.log('Highlighting element:', elementData)

    // Handle different element types
    switch (elementData.type) {
      case 'tile':
        if (elementData.position) {
          // Pan to tile and highlight it
          const { tileLocations, tileGeomMap, tileNames } = currentGeometry
          const tileLocation = tileLocations[elementData.position.y][elementData.position.x]
          const tileName = tileNames[elementData.position.y][elementData.position.x]

          if (tileLocation && tileName) {
            const tileGeometry = tileGeomMap[tileName]
            if (tileGeometry) {
              // Pan to tile center
              const centerX = tileLocation.x + tileGeometry.width / 2
              const centerY = tileLocation.y + tileGeometry.height / 2
              rendererRef.current.panTo(centerX, centerY)

              // You could add highlighting effect here
              console.log(`Panned to tile ${tileName} at (${centerX}, ${centerY})`)
            }
          }
        }
        break

      case 'bel':
      case 'switchMatrix':
      case 'port':
      case 'wire':
        // For now, just log - could implement specific highlighting
        console.log(`Highlighting ${elementData.type}: ${elementData.name}`)
        break

      case 'net':
        // Could highlight all connections in a net
        console.log(`Highlighting net: ${elementData.name}`)
        break

      default:
        console.log(`Highlighting not implemented for type: ${elementData.type}`)
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Main Canvas - moved to top to be the base layer */}
      <div
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'var(--vscode-editor-background)',
          zIndex: 1
        }}
      />

      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'var(--vscode-errorForeground)',
          background: 'var(--vscode-inputValidation-errorBackground)',
          border: '1px solid var(--vscode-inputValidation-errorBorder)',
          padding: '16px',
          borderRadius: '4px',
          textAlign: 'center',
          maxWidth: '400px',
          zIndex: 1200
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Graphics Engine Error</div>
          <div style={{ fontSize: '14px' }}>{error}</div>
          <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.8 }}>
            Try refreshing the webview or check the Developer Console for more details.
          </div>
        </div>
      )}

      {isLoading && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'var(--vscode-foreground)',
          zIndex: 1200
        }}>
          Loading fabric...
        </div>
      )}

      {/* Fabric info badge */}
      {currentFabric && (
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          background: 'var(--vscode-badge-background)',
          color: 'var(--vscode-badge-foreground)',
          padding: '4px 8px',
          borderRadius: '3px',
          fontSize: '12px',
          zIndex: 1100
        }}>
          Fabric: {currentFabric}
        </div>
      )}

      {/* Design info badge */}
      {currentDesign && (
        <div style={{
          position: 'absolute',
          top: currentFabric ? '40px' : '8px',
          left: '8px',
          background: 'var(--vscode-charts-green)',
          color: 'var(--vscode-badge-foreground)',
          padding: '4px 8px',
          borderRadius: '3px',
          fontSize: '12px',
          zIndex: 1100
        }}>
          Design: {currentDesign}
        </div>
      )}

      {/* Zoom Controls */}
      {currentGeometry && (
        <ZoomControls
          zoomLevel={zoomLevel}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomFit={handleZoomFit}
          onZoomReset={handleZoomReset}
          minZoom={0.01}
          maxZoom={50}
        />
      )}

      {/* WorldView Minimap - positioned in bottom right */}
      {currentGeometry && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          zIndex: 1000
        }}>
          <WorldView
            geometry={currentGeometry}
            viewportBounds={viewportBounds}
            onViewportClick={handleWorldViewClick}
          />
        </div>
      )}
    </div>
  )
}

export default React.memo(FabricViewer)