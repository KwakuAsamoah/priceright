import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Search } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { helpArticles } from '../data/helpArticles';

export default function HelpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { articleId } = useParams<{ articleId?: string }>();
  const from = location.state?.from || '/';

  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    helpArticles.reduce<Record<string, boolean>>((acc, article) => {
      acc[article.section] = true;
      return acc;
    }, {})
  );

  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return helpArticles;
    return helpArticles.filter((article) => article.title.toLowerCase().includes(normalized));
  }, [query]);

  const groupedArticles = useMemo(() => {
    return filteredArticles.reduce<Record<string, typeof helpArticles>>((acc, article) => {
      acc[article.section] = [...(acc[article.section] || []), article];
      return acc;
    }, {});
  }, [filteredArticles]);

  const sections = Object.keys(groupedArticles);
  const selectedArticle = articleId ? helpArticles.find((article) => article.id === articleId) || null : null;
  const selectedIndex = selectedArticle ? helpArticles.findIndex((article) => article.id === selectedArticle.id) : -1;
  const previousArticle = selectedIndex > 0 ? helpArticles[selectedIndex - 1] : null;
  const nextArticle = selectedIndex >= 0 && selectedIndex < helpArticles.length - 1 ? helpArticles[selectedIndex + 1] : null;
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [articleId]);

  const firstArticlePerSection = useMemo(() => {
    const seen = new Set<string>();
    const list: typeof helpArticles = [];
    for (const article of helpArticles) {
      if (seen.has(article.section)) continue;
      seen.add(article.section);
      list.push(article);
    }
    return list;
  }, []);

  const currentTitle = selectedArticle?.title || 'Help & Guide';
  const currentSection = selectedArticle?.section || 'Article Index';

  return (
    <div className="help-page">
      <header className="help-page__header">
        <div className="help-page__header-top">
          <button
            type="button"
            className="help-page__exit"
            onClick={() => navigate(from)}
          >
            <ArrowLeft size={16} strokeWidth={2} />
            Exit Help
          </button>
          <h1 className="help-page__title">{currentTitle}</h1>
          <div className="help-page__breadcrumb">{currentSection}</div>
        </div>

        <div className="help-page__header-nav">
          <button
            type="button"
            className="help-page__nav-btn"
            onClick={() => previousArticle && navigate(`/help/${previousArticle.id}`, { state: { from } })}
            disabled={!previousArticle}
            title={previousArticle?.title || ''}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Previous article
          </button>

          <div className="help-page__nav-count">
            {selectedIndex >= 0 ? `${selectedIndex + 1} of ${helpArticles.length} articles` : `0 of ${helpArticles.length} articles`}
          </div>

          <button
            type="button"
            className="help-page__nav-btn"
            onClick={() => nextArticle && navigate(`/help/${nextArticle.id}`, { state: { from } })}
            disabled={!nextArticle}
            title={nextArticle?.title || ''}
          >
            Next article
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="help-page__body">
        <aside className="help-page__sidebar">
          <div className="help-page__sidebar-search">
            <div className="help-page__sidebar-title">Help Articles</div>
            <label className="help-page__search">
              <Search size={13} strokeWidth={2} />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search help articles..."
              />
            </label>
          </div>

          <nav className="help-page__nav-list" aria-label="Help articles">
            {sections.length === 0 ? (
              <div className="help-page__nav-empty">
                <BookOpen size={14} strokeWidth={2} /> No matching articles.
              </div>
            ) : (
              sections.map((section) => (
                <section key={section} className="help-page__nav-section">
                  <button
                    type="button"
                    className="help-page__section-toggle"
                    onClick={() => setExpandedSections((current) => ({ ...current, [section]: !current[section] }))}
                  >
                    <span>{section}</span>
                    <span aria-hidden="true">{expandedSections[section] === false ? '+' : '−'}</span>
                  </button>
                  {expandedSections[section] !== false && (
                    <div className="help-page__section-articles">
                      {groupedArticles[section].map((article) => {
                        const active = selectedArticle?.id === article.id;
                        return (
                          <button
                            key={article.id}
                            type="button"
                            onClick={() => navigate(`/help/${article.id}`, { state: { from } })}
                            className={`app-panel-tab ${active ? 'is-active' : ''}`}
                          >
                            {article.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))
            )}
          </nav>
        </aside>

        <div ref={contentScrollRef} className="help-page__content">
          {selectedArticle ? (
            <article className="help-page__article">
              <div className="help-page__article-meta">Help → {selectedArticle.section}</div>
              <h2 className="help-page__article-title">{selectedArticle.title}</h2>
              <div className="help-article-body" dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
            </article>
          ) : (
            <div className="help-page__index">
              <BookOpen size={48} strokeWidth={1.8} color="#94a3b8" />
              <h2 className="help-page__index-title">PriceRight Help &amp; Guide</h2>
              <p className="help-page__index-subtitle">
                Select an article from the left to get started, or search for a topic above.
              </p>
              <div className="help-page__index-grid">
                {firstArticlePerSection.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    className="help-page__index-card"
                    onClick={() => navigate(`/help/${article.id}`, { state: { from } })}
                  >
                    <div className="help-page__index-card-section">{article.section}</div>
                    <div className="help-page__index-card-title">{article.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
