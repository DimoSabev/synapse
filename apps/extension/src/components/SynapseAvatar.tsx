
type SynapseAvatarProps = {
  isOpen: boolean
  onClick: () => void
  unreadCount?: number
}

export default function SynapseAvatar({
  isOpen,
  onClick,
  unreadCount = 0,
}: SynapseAvatarProps) {
  const hasUnread = unreadCount > 0

  return (
    <button
      type="button"
      className={`synapse-avatar-button ${
        isOpen ? 'active' : ''
      } ${hasUnread ? 'has-insights' : ''}`}
      onClick={onClick}
      aria-label={
        isOpen
          ? 'Close Synapse'
          : hasUnread
          ? `Open Synapse, ${unreadCount} unread AI insights`
          : 'Open Synapse'
      }
      aria-expanded={isOpen}
    >
      <span className="synapse-orb">
        <span className="synapse-eye left" />
        <span className="synapse-eye right" />
        <span className="synapse-smile" />
      </span>

      {hasUnread && (
        <span
          className="synapse-notification-badge"
          aria-hidden="true"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {!isOpen && !hasUnread && (
        <span className="synapse-presence" />
      )}
    </button>
  )
}
