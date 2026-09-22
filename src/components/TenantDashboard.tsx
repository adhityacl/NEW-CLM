import React, { useState } from "react";
import { authClient, useSession, organization } from "../lib/auth-client";
import { useAuth } from "../context/AuthContext";
import {
  Building2,
  Users,
  UserPlus,
  Plus,
  Check,
  Mail,
  Shield,
  Loader2,
  RefreshCw,
  Sparkles,
  Info,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

export function TenantDashboard() {
  const { data: session, isPending } = useSession();
  const { user: authUser } = useAuth();
  const activeUser = (session as any)?.user || authUser;

  const { data: organizations, refetch: refetchOrgs } = (authClient as any).useListOrganizations?.() || { data: [], refetch: () => {} };
  const { data: activeOrg, refetch: refetchActiveOrg } = (authClient as any).useActiveOrganization?.() || { data: null, refetch: () => {} };

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Helper to show temporary feedback
  const showFeedback = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Handler: Buat Tenant / Organisasi Baru
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setIsCreating(true);
    setStatusMessage(null);
    try {
      const slugVal = (orgSlug || orgName.toLowerCase().replace(/[^a-z0-9]/g, "-")).trim();
      const res = await authClient.organization.create({
        name: orgName.trim(),
        slug: slugVal,
      });
      if ((res as any)?.error) {
        throw new Error((res as any).error.message || "Gagal membuat tenant");
      }
      setOrgName("");
      setOrgSlug("");
      showFeedback("success", `Organisasi "${orgName}" berhasil dibuat!`);
      if (refetchOrgs) refetchOrgs();
      if (refetchActiveOrg) refetchActiveOrg();
    } catch (err: any) {
      showFeedback("error", err.message || "Terjadi kesalahan saat membuat organisasi.");
    } finally {
      setIsCreating(false);
    }
  };

  // Handler: Ganti Tenant Aktif
  const handleSelectOrg = async (orgId: string) => {
    try {
      await authClient.organization.setActive({
        organizationId: orgId,
      });
      showFeedback("success", "Berhasil beralih tenant.");
      if (refetchActiveOrg) refetchActiveOrg();
      // Optional: trigger app event
      if (typeof window !== "undefined") {
        localStorage.setItem("activeOrganizationId", orgId);
        window.dispatchEvent(new CustomEvent("organization-updated"));
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Gagal mengganti tenant aktif.");
    }
  };

  // Handler: Undang Anggota ke Tenant
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) {
      showFeedback("error", "Pilih tenant aktif terlebih dahulu.");
      return;
    }
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setStatusMessage(null);
    try {
      const res = await authClient.organization.inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        organizationId: activeOrg.id,
      });
      if ((res as any)?.error) {
        throw new Error((res as any).error.message || "Gagal mengirim undangan");
      }
      const sentEmail = inviteEmail;
      setInviteEmail("");
      showFeedback("success", `Undangan berhasil dikirim ke ${sentEmail} sebagai ${inviteRole}!`);
      if (refetchActiveOrg) refetchActiveOrg();
    } catch (err: any) {
      showFeedback("error", err.message || "Gagal mengundang anggota.");
    } finally {
      setIsInviting(false);
    }
  };

  if (isPending && !activeUser) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-600" />
        <p className="text-sm font-medium">Memuat sesi pengguna...</p>
      </div>
    );
  }

  if (!activeUser) {
    return (
      <div className="p-8 max-w-xl mx-auto my-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center">
        <Shield className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Autentikasi Diperlukan</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Silakan login terlebih dahulu untuk mengelola tenant dan organisasi Anda.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Silegal Tenant Portal
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Better Auth Multi-Tenant & RBAC Organization Management
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div className="text-xs">
            <span className="text-slate-500 dark:text-slate-400 block">Sesi Terverifikasi:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {activeUser?.email || "Pengguna"}
            </span>
          </div>
        </div>
      </header>

      {/* Info Card: Bedanya Tenant Portal vs Manage Admin Access */}
      <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-blue-800 dark:text-blue-300">
          <Info className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>Panduan Fitur: Perbedaan "Tenant Portal" vs "Manage Admin Access"</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
          <div className="p-3 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-blue-100 dark:border-blue-900/40">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mb-1">
              <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
              Manage Admin Access
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Mengelola <strong>Daftar Pengguna Global Platform SI LEGAL</strong> (Allowlist email, Role Global: Admin/Editor/Viewer, dan Departemen internal).
            </p>
          </div>
          <div className="p-3 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-blue-100 dark:border-blue-900/40">
            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Tenant Portal (RBAC)
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Mengelola <strong>Multi-Tenancy & Entitas Perusahaan</strong> (Membuat Tenant/Organisasi, mengundang tim, dan isolasi data per perusahaan).
            </p>
          </div>
        </div>
      </div>

      {/* Alert Status Feedback */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-sm font-medium flex items-center justify-between border ${
            statusMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              : "bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800"
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs underline hover:opacity-75 ml-2 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Selector Organization / Tenant */}
      <section className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Pilih Tenant / Organisasi
          </h2>
          <button
            onClick={() => {
              if (refetchOrgs) refetchOrgs();
              if (refetchActiveOrg) refetchActiveOrg();
            }}
            className="text-xs text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <div className="flex gap-2.5 flex-wrap">
          {organizations && organizations.length > 0 ? (
            organizations.map((org) => {
              const isActive = activeOrg?.id === org.id;
              return (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org.id)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 border cursor-pointer ${
                    isActive
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20"
                      : "bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <Building2 className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                  <span>{org.name}</span>
                  {isActive && <Check className="w-3.5 h-3.5 ml-1" />}
                </button>
              );
            })
          ) : (
            <p className="text-sm text-slate-400 italic py-2">
              Belum ada organisasi terdaftar. Silakan buat tenant pertama Anda di bawah.
            </p>
          )}
        </div>
      </section>

      {/* Grid: Form Buat Tenant Baru & Form Undangan Anggota */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form Buat Tenant Baru */}
        <section className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Buat Tenant Baru
          </h2>

          <form onSubmit={handleCreateOrg} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nama Perusahaan / Tenant
              </label>
              <input
                type="text"
                placeholder="Contoh: PT Media Nusantara Digital"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (!orgSlug) {
                    setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                  }
                }}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Domain Slug (URL identifier)
              </label>
              <input
                type="text"
                placeholder="contoh: pt-media-nusantara"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-xs"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm py-2.5 px-4 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membuat Organisasi...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Buat Tenant</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Form Undang Anggota */}
        <section className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Undang Anggota ke Tenant
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Undang kolaborator ke tenant aktif:{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {activeOrg ? activeOrg.name : "(Belum ada tenant aktif)"}
            </span>
          </p>

          <form onSubmit={handleInviteMember} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Email Anggota Baru
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  placeholder="rekan.kerja@perusahaan.co.id"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full text-sm pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                  disabled={!activeOrg}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Role / Peran di Tenant
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                disabled={!activeOrg}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 capitalize"
              >
                <option value="member">Member (Staf / Operator)</option>
                <option value="admin">Admin (Pengelola Tenant)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isInviting || !activeOrg}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm py-2.5 px-4 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isInviting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengirim Undangan...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Kirim Undangan</span>
                </>
              )}
            </button>
          </form>
        </section>
      </div>

      {/* Detail Tenant Aktif & Manajemen Anggota */}
      {activeOrg && (
        <section className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Tenant Aktif
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {activeOrg.name}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                Slug: {activeOrg.slug || activeOrg.id}
              </p>
            </div>
            <span className="text-xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full font-medium border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Aktif
            </span>
          </div>

          {/* Daftar Anggota */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                Daftar Anggota ({activeOrg.members?.length || 0})
              </h3>
            </div>

            {activeOrg.members && activeOrg.members.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {activeOrg.members.map((member: any) => (
                  <li
                    key={member.id}
                    className="p-3.5 flex items-center justify-between bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-semibold text-xs text-slate-700 dark:text-slate-300">
                        {(member.user?.email || member.email || "U")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {member.user?.email || member.email}
                        </p>
                        {member.user?.name && (
                          <p className="text-xs text-slate-400">{member.user.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize border ${
                          member.role === "owner"
                            ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                            : member.role === "admin"
                            ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {member.role}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                Belum ada anggota terdaftar di tenant ini. Gunakan formulir di atas untuk mengundang anggota tim.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default TenantDashboard;
