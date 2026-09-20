const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

const pickerFind = `<div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                                  <label className="block font-semibold text-slate-800 dark:text-slate-100">
                                    {t('settings.selected_folder', 'Master Drive Root Storage Folder')}
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={driveFolderId || t('settings.no_folder_selected', 'Belum dipilih')}
                                      placeholder="ID Folder Drive..."
                                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none font-mono"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenDrivePicker('folder')}
                                      disabled={!isTokenActive}
                                      className="h-8 px-3.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer shrink-0 shadow-2xs"
                                    >
                                      {t('settings.pick_folder_btn', 'Pilih Folder')}
                                    </Button>
                                  </div>
                                </div>`;

const pickerReplace = `<div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                                  <label className="block font-semibold text-slate-800 dark:text-slate-100">
                                    {t('settings.selected_folder', 'Master Drive Root Storage Folder')}
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={driveFolderId || t('settings.no_folder_selected', 'Belum dipilih')}
                                      placeholder="ID Folder Drive..."
                                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none font-mono"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenDrivePicker('folder')}
                                      disabled={!isTokenActive}
                                      className="h-8 px-3.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer shrink-0 shadow-2xs"
                                    >
                                      {t('settings.pick_folder_btn', 'Pilih Folder')}
                                    </Button>
                                  </div>
                                </div>
                                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                                  <label className="block font-semibold text-slate-800 dark:text-slate-100">
                                    Master System Spreadsheet ID
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={masterSpreadsheetId || 'Belum dipilih'}
                                      placeholder="ID Spreadsheet..."
                                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-[13px] text-slate-800 dark:text-slate-100 focus:outline-none font-mono"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenDrivePicker('spreadsheet')}
                                      disabled={!isTokenActive}
                                      className="h-8 px-3.5 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer shrink-0 shadow-2xs"
                                    >
                                      Pilih Sheet
                                    </Button>
                                  </div>
                                </div>`;

content = content.replace(pickerFind, pickerReplace);

fs.writeFileSync('src/components/SettingsView.tsx', content, 'utf8');
