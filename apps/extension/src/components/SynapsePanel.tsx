
type SynapsePanelProps = {
  onClose: () => void
}

export default function SynapsePanel({
  onClose,
}: SynapsePanelProps) {
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
        <div className="synapse-welcome">
          <span className="synapse-welcome-symbol">✧</span>
          <h2>Better together.</h2>
          <p>
            Your team's intelligence,
            always within reach.
          </p>
        </div>

        <div className="synapse-info-card">
          <div className="synapse-info-heading">
            <span>✦</span>
            <strong>Welcome to Synapse</strong>
          </div>

          <p>
            Connect your project to start
            collaborating with your team.
          </p>
        </div>

        <button
          type="button"
          className="synapse-primary-button"
          onClick={() => {
            window.alert(
              'Project Rooms will be available in Phase 2.2.'
            )
          }}
        >
          Connect to a project
          <span>→</span>
        </button>
      </main>

      <footer className="synapse-footer">
        THE AI THAT CONNECTS MINDS
      </footer>
    </section>
  )
}
