import { useMemo, useState } from 'react';
import { HelpCircle, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { helpArticles } from '../data/helpArticles';

type HelpPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    helpArticles.reduce<Record<string, boolean>>((accumulator, article) => {
      accumulator[article.section] = true;
      return accumulator;
    }, {})
  );

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return helpArticles;
    }

    return helpArticles.filter((article) => {
      const inTitle = article.title.toLowerCase().includes(normalizedQuery);
      const inKeywords = article.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery));
      return inTitle || inKeywords;
    });
  }, [query]);

  const groupedArticles = useMemo(() => {
    return filteredArticles.reduce<Record<string, typeof helpArticles>>((accumulator, article) => {
      accumulator[article.section] = [...(accumulator[article.section] || []), article];
      return accumulator;
    }, {});
  }, [filteredArticles]);

  const visibleSections = Object.keys(groupedArticles);

  return (
    <>
      <div
        className={`app-help-backdrop ${isOpen ? 'is-open' : ''}`}
        aria-hidden="true"
      />
      <aside className={`app-help-panel ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
        <div className="app-help-panel-header">
          <div className="app-help-panel-title-row">
            <div>
              <div className="app-help-panel-title">Help &amp; Guide</div>
            </div>
            <button type="button" className="btn-close-x" onClick={onClose} aria-label="Close help panel">
              ×
            </button>
          </div>
          <label className="app-help-search-wrap">
            <Search size={14} strokeWidth={2} />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search help articles..."
              className="app-help-search"
            />
          </label>
        </div>

        <div className="app-help-panel-body">
          <div className="app-help-list-view">
            {visibleSections.length === 0 ? (
              <div className="app-help-empty-state">
                <HelpCircle size={18} strokeWidth={2} />
                No help articles matched your search.
              </div>
            ) : (
              visibleSections.map((section) => (
                <section key={section} className="app-help-section">
                  <button
                    type="button"
                    className="app-help-section-toggle"
                    onClick={() => setExpandedSections((current) => ({ ...current, [section]: !current[section] }))}
                  >
                    <span>{section}</span>
                    <span>{expandedSections[section] === false ? '+' : '−'}</span>
                  </button>
                  {expandedSections[section] !== false && (
                    <div className="app-help-section-list">
                      {groupedArticles[section].map((article) => (
                        <button
                          type="button"
                          key={article.id}
                          className="app-help-article-row"
                          onClick={() => {
                            navigate(`/help/${article.id}`, { state: { from: location.pathname } });
                            onClose();
                          }}
                        >
                          {article.title}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        </div>

        <div className="app-help-open-guide-wrap">
          <button
            type="button"
            className="app-help-open-guide-link"
            onClick={() => {
              navigate('/help', { state: { from: location.pathname } });
              onClose();
            }}
          >
            Open full help guide →
          </button>
        </div>

        <div className="app-help-panel-footer">
          <div>Still stuck? Contact support</div>
          <div>support@rightbusinesssystems.com</div>
        </div>
      </aside>
    </>
  );
}