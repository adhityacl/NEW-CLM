const fs = require('fs');

let content = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

const readOnlyFind = `<div className="p-3 bg-slate-50/80 dark:bg-slate-900/60 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2.5">
                            <div className="min-w-0 flex-1 space-y-1">
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Folder className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                                <span className="truncate">{t('settings.master_root_id_label', 'Master Google Drive Storage Root Folder ID')}</span>
                              </span>
                              <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all">
                                {driveFolderId || 'Belum diatur'}
                              </p>
                            </div>
                            {driveFolderId && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyLink(
                                      \`https://drive.google.com/drive/folders/\${driveFolderId}\`,
                                      'master-root'
                                    )
                                  }
                                  title={t('common.copy_link', 'Salin Link')}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  {copiedKey === 'master-root' ? (
                                    <Check className="w-3.5 h-3.5 text-[#06C755]" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <a
                                  href={\`https://drive.google.com/drive/folders/\${driveFolderId}\`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={t('common.open_link', 'Buka Link')}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors inline-flex items-center"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            )}
                          </div>`;

const readOnlyReplace = `<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Root Folder */}
                            <div className="p-3 bg-slate-50/80 dark:bg-slate-900/60 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2.5">
                              <div className="min-w-0 flex-1 space-y-1">
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                  <Folder className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                                  <span className="truncate">{t('settings.master_root_id_label', 'Master Google Drive Storage Root Folder ID')}</span>
                                </span>
                                <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all">
                                  {driveFolderId || 'Belum diatur'}
                                </p>
                              </div>
                              {driveFolderId && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(\`https://drive.google.com/drive/folders/\${driveFolderId}\`, 'master-root')}
                                    title={t('common.copy_link', 'Salin Link')}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    {copiedKey === 'master-root' ? <Check className="w-3.5 h-3.5 text-[#06C755]" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                  <a href={\`https://drive.google.com/drive/folders/\${driveFolderId}\`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors inline-flex items-center">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              )}
                            </div>
                            {/* Master Spreadsheet */}
                            <div className="p-3 bg-slate-50/80 dark:bg-slate-900/60 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2.5">
                              <div className="min-w-0 flex-1 space-y-1">
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                                  <span className="truncate">Master System Spreadsheet ID</span>
                                </span>
                                <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all">
                                  {masterSpreadsheetId || 'Belum diatur'}
                                </p>
                              </div>
                              {masterSpreadsheetId && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(\`https://docs.google.com/spreadsheets/d/\${masterSpreadsheetId}\`, 'master-sheet')}
                                    title={t('common.copy_link', 'Salin Link')}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    {copiedKey === 'master-sheet' ? <Check className="w-3.5 h-3.5 text-[#06C755]" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                  <a href={\`https://docs.google.com/spreadsheets/d/\${masterSpreadsheetId}\`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors inline-flex items-center">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>`;

content = content.replace(readOnlyFind, readOnlyReplace);

const manualFind = `                            {selectedOptionTab === 'manual' && (
                              <form onSubmit={handleSaveOption3Manual} className="space-y-4">
                                <div>
                                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                                    {t('settings.master_root_id_label', 'Master Google Drive Storage Root Folder ID')}
                                  </label>
                                  <input
                                    type="text"
                                    value={driveFolderId}
                                    onChange={(e) => setDriveFolderId(e.target.value)}
                                    placeholder="Contoh: 1xiFIvgWdDtYEzL7IoqVD9d-NaS7XcfYp"
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#06C755]/20 transition-all font-mono"
                                    required
                                  />
                                </div>`;

const manualReplace = `                            {selectedOptionTab === 'manual' && (
                              <form onSubmit={handleSaveOption3Manual} className="space-y-4">
                                <div>
                                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                                    {t('settings.master_root_id_label', 'Master Google Drive Storage Root Folder ID')}
                                  </label>
                                  <input
                                    type="text"
                                    value={driveFolderId}
                                    onChange={(e) => setDriveFolderId(e.target.value)}
                                    placeholder="Contoh: 1xiFIvgWdDtYEzL7IoqVD9d-NaS7XcfYp"
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#06C755]/20 transition-all font-mono"
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                                    Master System Spreadsheet ID
                                  </label>
                                  <input
                                    type="text"
                                    value={masterSpreadsheetId}
                                    onChange={(e) => setMasterSpreadsheetId(e.target.value)}
                                    placeholder="Contoh: 1BxiMvs0XRYFgwnAKnZJIGtxV..."
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#06C755]/20 transition-all font-mono"
                                  />
                                </div>`;

content = content.replace(manualFind, manualReplace);

fs.writeFileSync('src/components/SettingsView.tsx', content, 'utf8');
