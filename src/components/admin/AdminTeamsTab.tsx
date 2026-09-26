import React, { useState } from 'react';
import { getActiveFormattingLocale } from '../../lib/currencyUtils';
import {
  Layers,
  Plus,
  Users,
  Search,
  UserPlus,
  Trash2,
  Building2,
  Shield,
  Edit2,
} from 'lucide-react';
import { ConsoleTeam, ConsoleOrganization } from './types';
import { useLanguage } from '../../context/LanguageContext';

interface AdminTeamsTabProps {
  teams: ConsoleTeam[];
  activeOrg: ConsoleOrganization | null;
  onOpenCreateTeam: () => void;
  onOpenEditTeam?: (team: ConsoleTeam) => void;
  onOpenAddTeamMember: (team: ConsoleTeam) => void;
  onRemoveTeamMember: (teamId: string, userId: string) => void;
  onDeleteTeam: (team: ConsoleTeam) => void;
}

export const AdminTeamsTab: React.FC<AdminTeamsTabProps> = ({
  teams,
  activeOrg: _activeOrg,
  onOpenCreateTeam,
  onOpenEditTeam,
  onOpenAddTeamMember,
  onRemoveTeamMember,
  onDeleteTeam,
}) => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group departments by organization so each org's cards sit under their own
  // divider — otherwise teams from different organizations blend into one grid.
  const teamsByOrg: Array<{ orgKey: string; orgName: string; teams: ConsoleTeam[] }> = [];
  const orgIndex = new Map<string, number>();
  for (const team of filteredTeams) {
    const orgKey = team.organizationId || 'unknown';
    const orgName = team.organizationName || (t('admin.active_organization', 'Active Organization'));
    let idx = orgIndex.get(orgKey);
    if (idx === undefined) {
      idx = teamsByOrg.length;
      orgIndex.set(orgKey, idx);
      teamsByOrg.push({ orgKey, orgName, teams: [] });
    }
    teamsByOrg[idx].teams.push(team);
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.team_search_ph', 'Cari tim atau departemen...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCreateTeam}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('admin.btn_create_team', 'Buat Tim Baru')}</span>
          </button>
        </div>
      </div>

      {/* Teams Grid, grouped by organization */}
      {filteredTeams.length === 0 ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
          {t('admin.no_teams_found', 'Belum ada tim atau departemen yang dibuat untuk organisasi ini.')}
        </div>
      ) : (
        <div className="space-y-6">
          {teamsByOrg.map((group) => (
            <div key={group.orgKey} className="space-y-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                  {group.orgName}
                </h3>
                <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.teams.map((team) => (
            <div
              key={team.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                        {team.name}
                      </h4>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        <span>{team.organizationName || (t('admin.active_organization', 'Active Organization'))}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Member avatars and count */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                      <Users className="w-3.5 h-3.5" />
                      {t('admin.team_members', 'Anggota')} ({team.members.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenAddTeamMember(team)}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" />
                      {t('admin.team_add_member', 'Tambah')}
                    </button>
                  </div>

                  {team.members.length === 0 ? (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 text-center">
                      {t('admin.no_team_members', 'Belum ada anggota di tim ini.')}
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {team.members.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs"
                        >
                          <div className="truncate pr-2">
                            <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                              {member.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {member.email}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveTeamMember(team.id, member.userId)}
                            className="text-slate-400 hover:text-red-600 text-[11px] p-1 shrink-0 cursor-pointer"
                            title={t('admin.remove_member_title', 'Keluarkan dari tim')}
                          >
                            {t('admin.text_2', '×')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons matching reference */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenEditTeam?.(team)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3 text-slate-500" />
                    <span>{t('admin.btn_edit', 'Edit')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteTeam(team)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t('admin.btn_delete', 'Hapus')}</span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-400">
                  {t('admin.team_created_prefix', 'Dibuat')}: {new Date(team.createdAt).toLocaleDateString(getActiveFormattingLocale())}
                </span>
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
