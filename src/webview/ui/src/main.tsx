import React from 'react'
import ReactDOM from 'react-dom/client'
import '@pixi/unsafe-eval'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)