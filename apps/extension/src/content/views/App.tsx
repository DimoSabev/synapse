
import { useState } from 'react'

import SynapseAvatar from '@/components/SynapseAvatar'
import SynapsePanel from '@/components/SynapsePanel'

export default function App() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="synapse-agent">
      <SynapseAvatar
        isOpen={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      />

      {isOpen && (
        <SynapsePanel
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

