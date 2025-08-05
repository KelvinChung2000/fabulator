import React, { useEffect, useRef } from 'react'
import FabricViewer from './components/FabricViewer'

declare global {
  interface Window {
    acquireVsCodeApi(): {
      postMessage(message: any): void
      setState(state: any): void
      getState(): any
    }
  }
}

function App() {
  const vscode = useRef(window.acquireVsCodeApi())

  // VS Code API is available through the FabricViewer component

  const handleSendMessage = (message: any) => {
    vscode.current.postMessage(message)
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <h3 style={{ margin: '0', color: 'var(--vscode-foreground)' }}>FABulator - FPGA Fabric Viewer</h3>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FabricViewer onMessage={handleSendMessage} />
      </div>
    </div>
  )
}

export default App