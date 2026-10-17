import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './firebase/AuthContext.tsx'
import './index.css'
import { LabProvider } from './state/SimulationContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <LabProvider>
        <App />
      </LabProvider>
    </AuthProvider>
  </StrictMode>,
)
