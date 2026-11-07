
import ProjectRoom from './ProjectRoom'

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
        <ProjectRoom />
      </main>

      <footer className="synapse-footer">
        THE AI THAT CONNECTS MINDS
      </footer>
    </section>
  )
}
