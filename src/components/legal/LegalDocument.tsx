import React, { useEffect } from 'react';
import { ArrowLeft, Mail, Printer } from 'lucide-react';
import { LANGUAGE_OPTIONS, useLanguage } from '../../context/LanguageContext';

export type Clause = string | { text: string; items: string[] };
export interface LegalSection { title: string; clauses: Clause[] }
export interface LegalContent {
  navLabel: string;
  title: string;
  updated: string;
  intro: Clause[];
  sections: LegalSection[];
  contact: { title: string; text: string; email: string };
}
export type LegalCatalog = Record<'ID' | 'EN' | 'ZH', LegalContent>;

export interface LegalAccent {
  icon: React.ReactNode;
  num: string;
  toc: string;
  tocTitle: string;
  button: string;
  link: string;
}

const LABELS = {
  EN: { toc: 'Table of Contents', back: 'Back to Login', print: 'Print / Save PDF', updated: 'Last updated' },
  ID: { toc: 'Daftar Isi', back: 'Kembali ke Login', print: 'Cetak / Simpan PDF', updated: 'Terakhir diperbarui' },
  ZH: { toc: '目录', back: '返回登录', print: '打印 / 保存 PDF', updated: '最后更新' },
} as const;

const alpha = (i: number) => String.fromCharCode(97 + i);

export const LegalDocument: React.FC<{
  catalog: LegalCatalog;
  accent: LegalAccent;
  idPrefix: string;
  onBack?: () => void;
}> = ({ catalog, accent, idPrefix, onBack }) => {
  const { language, setLanguage } = useLanguage();
  const doc = catalog[language] ?? catalog.EN;
  const L = LABELS[language] ?? LABELS.EN;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const renderClause = (clause: Clause, label: string) => (
    <div key={label} className="flex gap-3">
      <span className="shrink-0 w-10 font-semibold tabular-nums text-slate-500 dark:text-slate-400">{label}</span>
      <div className="min-w-0 flex-1">
        <p>{typeof clause === 'string' ? clause : clause.text}</p>
        {typeof clause !== 'string' && (
          <ol className="mt-2 space-y-1.5">
            {clause.items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-slate-500 dark:text-slate-400">({alpha(i)})</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );

  return (
    <main lang={language.toLowerCase()} className="legal-page h-screen overflow-y-auto scroll-smooth bg-canvas text-ink transition-colors px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-3 mb-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-11 items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ArrowLeft aria-hidden="true" className="w-4 h-4" />
                <span>{L.back}</span>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {accent.icon}
              <span>{doc.navLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Language" className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  lang={option.htmlLang}
                  aria-pressed={language === option.code}
                  onClick={() => setLanguage(option.code)}
                  className={`min-h-9 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    language === option.code
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {option.nativeName}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              aria-label={L.print}
              title={L.print}
              className="inline-flex size-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Printer aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 sm:p-8 lg:p-12 border border-slate-200 dark:border-slate-800 shadow-sm mb-8">
          <header className="pb-6 mb-8 border-b border-slate-200 dark:border-slate-800">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight text-balance">{doc.title}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{L.updated}: {doc.updated}</p>
          </header>

          <div className="grid gap-8 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-12 lg:items-start">
            <nav aria-label={L.toc} className={`p-4 rounded-2xl border lg:sticky lg:top-28 print:hidden ${accent.toc}`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${accent.tocTitle}`}>{L.toc}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1 text-sm">
                {doc.sections.map((s, i) => (
                  <a key={i} href={`#${idPrefix}-${i + 1}`} className={`legal-toc-link ${accent.link}`}>
                    {i + 1}. {s.title}
                  </a>
                ))}
              </div>
            </nav>

            <article className="legal-document-body min-w-0 max-w-[80ch] text-slate-700 dark:text-slate-300">
              <div className="space-y-3 mb-10">{doc.intro.map((c, i) => renderClause(c, `0.${i + 1}`))}</div>

              {doc.sections.map((s, i) => (
                <section key={i} id={`${idPrefix}-${i + 1}`} className="scroll-mt-6 mb-10">
                  <h2 className="font-bold uppercase tracking-wide text-slate-900 dark:text-white mb-3">
                    <span className={`inline-block w-10 ${accent.num}`}>{i + 1}.</span>
                    {s.title}
                  </h2>
                  <div className="space-y-3">{s.clauses.map((c, j) => renderClause(c, `${i + 1}.${j + 1}`))}</div>
                </section>
              ))}

              <section className="mt-12 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{doc.contact.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{doc.contact.text}</p>
                </div>
                <a
                  href={`mailto:${doc.contact.email}`}
                  className={`inline-flex min-h-11 items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors shadow-sm ${accent.button}`}
                >
                  <Mail aria-hidden="true" className="w-4 h-4" />
                  <span>{doc.contact.email}</span>
                </a>
              </section>
            </article>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 dark:text-slate-500 print:hidden">
            <p>© 2026 Legalio. All rights reserved.</p>
            {onBack && (
              <button type="button" onClick={onBack} className={`inline-flex min-h-11 items-center hover:underline font-semibold cursor-pointer ${accent.link}`}>
                ← {L.back}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
