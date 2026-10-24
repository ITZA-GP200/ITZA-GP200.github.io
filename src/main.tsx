import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AudioEngineProvider } from '@/components/AudioEngineProvider'
import { registerServiceWorker } from '@/core/registerServiceWorker'
import { startSupportLog } from '@/core/supportLog'

// Before anything renders, so a failure during start-up is in the log too.
startSupportLog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AudioEngineProvider>
      <App />
    </AudioEngineProvider>
  </StrictMode>,
)

registerServiceWorker()
