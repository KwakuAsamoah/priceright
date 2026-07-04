import { HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type PageHelpButtonProps = {
  context: string;
};

export default function PageHelpButton({ context }: PageHelpButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      title="Help"
      aria-label="Help"
      onClick={() => navigate(`/help?context=${encodeURIComponent(context)}`)}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94A3B8',
        flexShrink: 0,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.color = '#0F2847';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = '#94A3B8';
      }}
    >
      <HelpCircle size={20} strokeWidth={2} />
    </button>
  );
}
