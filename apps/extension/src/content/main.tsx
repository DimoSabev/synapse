
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './views/App'
import synapseStyles from '@/components/SynapseAgent.css?inline'

const ROOT_ID = 'synapse-extension-root'

function initializeSynapse() {
  if (document.getElementById(ROOT_ID)) {
    return
  }

  const host = document.createElement('div')
  host.id = ROOT_ID

  host.style.position = 'fixed'
  host.style.top = '0'
  host.style.left = '0'
  host.style.zIndex = '2147483647'

  const shadowRoot = host.attachShadow({
    mode: 'open',
  })

  const style = document.createElement('style')
  style.textContent = synapseStyles
  shadowRoot.appendChild(style)

  const mountPoint = document.createElement('div')
  shadowRoot.appendChild(mountPoint)

  document.documentElement.appendChild(host)

  createRoot(mountPoint).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    initializeSynapse,
    { once: true }
  )
} else {
  initializeSynapse()
}
