
type SynapseAvatarProps = {
  isOpen: boolean
  onClick: () => void
}

export default function SynapseAvatar({
  isOpen,
  onClick,
}: SynapseAvatarProps) {
  return (
    <button
      type="button"
      className={`synapse-avatar-button ${isOpen ? 'active' : ''}`}
      onClick={onClick}
      aria-label={isOpen ? 'Close Synapse' : 'Open Synapse'}
      aria-expanded={isOpen}
    >
      <span className="synapse-orb">
        <span className="synapse-eye left" />
        <span className="synapse-eye right" />
        <span className="synapse-smile" />
      </span>

      {!isOpen && <span className="synapse-presence" />}
    </button>
  )
}
