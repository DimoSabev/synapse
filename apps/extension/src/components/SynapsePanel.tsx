
import { useState } from 'react'
import ProjectRoom from './ProjectRoom'

import type {
  SynapseInsightsState,
} from '@/hooks/useSynapseInsights'

type SynapsePanelProps = {
  onClose: () => void
  onContextChange: (
    projectId: string | null,
    userId: string | null
  ) => void
  intelligence: SynapseInsightsState
  activeProjectId: string | null
  syncEnabled: boolean
  syncBusy: boolean
  syncError: string
  allowedOrigins: string[]
  onEnableAutoSync: (url: string) => Promise<void>
  onDisableAutoSync: () => Promise<void>
}

export default function SynapsePanel({
  onClose,
  onContextChange,
  intelligence,
  activeProjectId,
  syncEnabled,
  syncBusy,
  syncError,
  allowedOrigins,
  onEnableAutoSync,
  onDisableAutoSync,
}: SynapsePanelProps) {
  const [sourceUrl, setSourceUrl] =
    useState('https://example.com')

  return (
    <section
      className="synapse-panel"
      aria-label="Synapse assistant"
    >
      <header className="synapse-header">
        <div className="synapse-brand">
          <span className="synapse-brand-icon">✦</span>

          <div>
            <strong>Synapse</strong>
            <small>Collaborative Intelligence</small>
          </div>
        </div>

        <button
          type="button"
          className="synapse-close"
          onClick={onClose}
          aria-label="Close panel"
        >
          ×
        </button>
      </header>

      <main className="synapse-panel-body">
        {activeProjectId && (
          <div className="synapse-auto-sync">
            <div className="synapse-room-divider">
              ✦ PROJECT AUTO-SYNC
            </div>

            <p>
              {syncEnabled
                ? '● Auto-Sync permission enabled'
                : '○ Auto-Sync disabled'}
            </p>

            {syncEnabled ? (
              <>
                <p>
                  Allowed website:
                  {' '}
                  {allowedOrigins.join(', ')}
                </p>

                <button
                  type="button"
                  className="synapse-secondary-button"
                  disabled={syncBusy}
                  onClick={() => {
                    void onDisableAutoSync()
                  }}
                >
                  Disable Auto-Sync
                </button>
              </>
            ) : (
              <>
                <label className="synapse-field-label">
                  Website to monitor
                  <input
                    className="synapse-input"
                    type="url"
                    value={sourceUrl}
                    onChange={(event) =>
                      setSourceUrl(event.target.value)
                    }
                    placeholder="https://example.com"
                  />
                </label>

                <button
                  type="button"
                  className="synapse-primary-button"
                  disabled={syncBusy || !sourceUrl.trim()}
                  onClick={() => {
                    void onEnableAutoSync(sourceUrl)
                  }}
                >
                  Enable Auto-Sync
                </button>
              </>
            )}

            {syncError && (
              <p className="synapse-error" role="alert">
                {syncError}
              </p>
            )}

            <small>
              Only enable monitoring on pages containing
              information you are authorized to share.
              Automatic cloud sharing is disabled.
            </small>
          </div>
        )}

        <ProjectRoom
          onContextChange={onContextChange}
          intelligence={intelligence}
        />
      </main>

      <footer className="synapse-footer">
        THE AI THAT CONNECTS MINDS
      </footer>
    </section>
  )
}
