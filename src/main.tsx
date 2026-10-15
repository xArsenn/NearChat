import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LanApp from './LanApp'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.nearChat ? <LanApp /> : <App />}
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
