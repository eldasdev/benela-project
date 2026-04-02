"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  FileBadge2,
  KeyRound,
  PanelLeft,
  Save,
  ShieldCheck,
  UploadCloud,
  UserRound,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { getSupabase } from "@/lib/supabase";
import { signOutAndRedirect } from "@/lib/auth-fetch";
import {
  CLIENT_SECTIONS,
  ClientSection,
  DEFAULT_CLIENT_SETTINGS,
  NotificationSettings,
  readClientSettings,
  saveClientSettings,
} from "@/lib/client-settings";
import { pathForSection } from "@/lib/section-routes";
import { Section } from "@/types";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  fetchClientAccountProfile,
  ensureClientWorkspaceAccount,
  listClientBusinessDocuments,
  patchClientAccountProfile,
  planLabel,
  upsertClientOnboarding,
  uploadClientBusinessDocument,
  type ClientBusinessDocument,
  type ClientAccountProfile,
  type ClientProfilePatchPayload,
  type PaidPlanTier,
} from "@/lib/client-account";
import { captureProductEvent } from "@/lib/posthog";

const SECTION_LABELS: Record<ClientSection, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  finance: "Finance",
  hr: "HR",
  sales: "Sales",
  support: "Support",
  legal: "Legal",
  marketing: "Marketing",
  supply_chain: "Supply Chain",
  procurement: "Procurement",
  insights: "Insights",
  marketplace: "Marketplace",
};

type BusinessForm = {
  owner_name: string;
  owner_phone: string;
  business_name: string;
  registration_number: string;
  industry: string;
  country: string;
  city: string;
  address: string;
  employee_count: string;
  plan_tier: PaidPlanTier;
};

const DEFAULT_BUSINESS_FORM: BusinessForm = {
  owner_name: "",
  owner_phone: "",
  business_name: "",
  registration_number: "",
  industry: "",
  country: "Uzbekistan",
  city: "",
  address: "",
  employee_count: "",
  plan_tier: "starter",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function resolveDownloadUrl(downloadUrl: string): string {
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl;
  if (!API_BASE || API_BASE === "/api") return downloadUrl;
  return `${API_BASE.replace(/\/+$/, "")}${downloadUrl}`;
}

export default function ClientSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const [workspaceId, setWorkspaceId] = useState(DEFAULT_CLIENT_SETTINGS.workspaceId);
  const [defaultSection, setDefaultSection] = useState<ClientSection>(
    DEFAULT_CLIENT_SETTINGS.defaultSection
  );
  const [notifications, setNotifications] = useState<NotificationSettings>(
    DEFAULT_CLIENT_SETTINGS.notifications
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [businessForm, setBusinessForm] = useState<BusinessForm>(DEFAULT_BUSINESS_FORM);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [trialLabel, setTrialLabel] = useState("Setup required");
  const [trialProgressPercent, setTrialProgressPercent] = useState(0);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [missingSetupFields, setMissingSetupFields] = useState<string[]>([]);
  const [setupProgressPercent, setSetupProgressPercent] = useState(0);

  const [documents, setDocuments] = useState<ClientBusinessDocument[]>([]);
  const [documentType, setDocumentType] = useState("official");
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const setMessage = (nextNotice = "", nextError = "") => {
    setNotice(nextNotice);
    setError(nextError);
  };

  const applyAccountState = (account: ClientAccountProfile) => {
    setOnboardingCompleted(Boolean(account.onboarding_completed));
    setPaymentRequired(Boolean(account.payment_required));
    setTrialLabel(
      account.payment_required
        ? "Payment required"
        : account.trial_seconds_remaining > 0
        ? `${Math.floor(account.trial_seconds_remaining / 86400)}d trial left`
        : account.trial_started_at
        ? "Trial ended"
        : "Setup required"
    );
    setTrialProgressPercent(account.trial_progress_percent || 0);
    setMissingSetupFields(account.missing_setup_fields || []);
    setSetupProgressPercent(account.setup_progress_percent || 0);
  };

  useEffect(() => {
    if (searchParams.get("setup") === "business") {
      setNotice("Complete your business profile to activate the client workspace.");
      setError("");
    }
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      const sb = getSupabase();
      const { data, error: getUserError } = await sb.auth.getUser();
      if (getUserError || !data.user) {
        router.push("/login");
        return;
      }
      const role = typeof data.user.user_metadata?.role === "string" ? data.user.user_metadata.role : "";
      if (role === "admin" || role === "owner" || role === "super_admin") {
        router.replace("/admin/dashboard");
        return;
      }
      if (!active) return;

      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
      const metadata = (data.user.user_metadata || {}) as Record<string, unknown>;
      const metadataName = typeof metadata.full_name === "string" ? metadata.full_name : "";
      setFullName(metadataName);
      setJobTitle(typeof metadata.job_title === "string" ? metadata.job_title : "");

      const stored = readClientSettings();
      setWorkspaceId(stored.workspaceId);
      setDefaultSection(stored.defaultSection);
      setNotifications(stored.notifications);

      try {
        await ensureClientWorkspaceAccount(data.user.id);
        const account = await fetchClientAccountProfile(data.user.id);
        if (account) {
          setBusinessForm({
            owner_name: account.owner_name || metadataName,
            owner_phone: account.owner_phone || "",
            business_name: account.business_name || "",
            registration_number: account.registration_number || "",
            industry: account.industry || "",
            country: account.country || "Uzbekistan",
            city: account.city || "",
            address: account.address || "",
            employee_count: account.employee_count ? String(account.employee_count) : "",
            plan_tier: account.plan_tier,
          });
          applyAccountState(account);

          if (account.workspace_id) {
            setWorkspaceId(account.workspace_id);
            saveClientSettings({
              workspaceId: account.workspace_id,
              defaultSection: stored.defaultSection,
              notifications: stored.notifications,
            });
          }

          try {
            const docs = await listClientBusinessDocuments(data.user.id);
            if (active) setDocuments(docs);
          } catch {
            if (active) setDocuments([]);
          }
          setProfileLoaded(true);
        } else {
          setBusinessForm((prev) => ({ ...prev, owner_name: metadataName || prev.owner_name }));
          setProfileLoaded(false);
          setMissingSetupFields([]);
          setSetupProgressPercent(0);
        }
      } catch {
        setProfileLoaded(false);
        setMissingSetupFields([]);
        setSetupProgressPercent(0);
      }

      if (!active) return;
      setLoading(false);
    };

    void init();
    return () => {
      active = false;
    };
  }, [router]);

  const saveProfile = async () => {
    setSavingProfile(true);
    setMessage();
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getUser();
      const existingMetadata = (data.user?.user_metadata || {}) as Record<string, unknown>;

      const { error: updateError } = await sb.auth.updateUser({
        data: {
          ...existingMetadata,
          full_name: fullName.trim(),
          job_title: jobTitle.trim(),
        },
      });
      if (updateError) throw updateError;
      setMessage("Profile saved successfully.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not update profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePreferences = async () => {
    setSavingPrefs(true);
    setMessage();
    try {
      const normalizedWorkspace = workspaceId.trim();
      if (!normalizedWorkspace) {
        throw new Error("Workspace ID cannot be empty.");
      }
      saveClientSettings({
        workspaceId: normalizedWorkspace,
        defaultSection,
        notifications,
      });
      setWorkspaceId(normalizedWorkspace);
      setMessage("Client settings saved.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not save client settings."));
    } finally {
      setSavingPrefs(false);
    }
  };

  const saveBusinessProfile = async () => {
    if (!userId) return;
    setSavingBusiness(true);
    setMessage();

    try {
      const employeeCount = businessForm.employee_count.trim()
        ? Math.max(1, Number.parseInt(businessForm.employee_count, 10) || 0)
        : null;

      const updated = profileLoaded
        ? await patchClientAccountProfile(userId, {
            owner_name: businessForm.owner_name.trim() || undefined,
            owner_phone: businessForm.owner_phone.trim() || undefined,
            business_name: businessForm.business_name.trim() || undefined,
            registration_number: businessForm.registration_number.trim() || undefined,
            industry: businessForm.industry.trim() || undefined,
            country: businessForm.country.trim() || undefined,
            city: businessForm.city.trim() || undefined,
            address: businessForm.address.trim() || undefined,
            employee_count: employeeCount,
            plan_tier: businessForm.plan_tier,
          } satisfies ClientProfilePatchPayload)
        : await upsertClientOnboarding({
            user_id: userId,
            user_email: email || undefined,
            owner_name: businessForm.owner_name.trim() || undefined,
            owner_phone: businessForm.owner_phone.trim() || undefined,
            business_name: businessForm.business_name.trim(),
            registration_number: businessForm.registration_number.trim() || undefined,
            industry: businessForm.industry.trim() || undefined,
            country: businessForm.country.trim() || "Uzbekistan",
            city: businessForm.city.trim() || undefined,
            address: businessForm.address.trim() || undefined,
            employee_count: employeeCount,
            plan_tier: businessForm.plan_tier,
          });
      applyAccountState(updated);
      setProfileLoaded(true);

      if (updated.workspace_id) {
        setWorkspaceId(updated.workspace_id);
        saveClientSettings({
          workspaceId: updated.workspace_id,
          defaultSection,
          notifications,
        });
      }

      captureProductEvent("benela_client_business_profile_saved", {
        plan_tier: updated.plan_tier,
        onboarding_completed: Boolean(updated.onboarding_completed),
        setup_progress_percent: updated.setup_progress_percent || 0,
        documents_uploaded_count: updated.documents_uploaded_count || 0,
        user_role: "client",
        user_type: "client",
      });
      setMessage("Business profile saved. Upload official documents to complete verification.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not save business profile."));
    } finally {
      setSavingBusiness(false);
    }
  };

  const uploadDocument = async () => {
    if (!userId) return;
    if (!documentFile) {
      setMessage("", "Select a file to upload.");
      return;
    }

    setUploadingDocument(true);
    setMessage();
    try {
      const uploaded = await uploadClientBusinessDocument(userId, documentFile, documentType);
      setDocuments((prev) => [uploaded, ...prev]);
      setDocumentFile(null);

      const refreshed = await fetchClientAccountProfile(userId).catch(() => null);
      if (refreshed) {
        applyAccountState(refreshed);
      }

      setMessage("Document uploaded successfully. Verification pending.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not upload document."));
    } finally {
      setUploadingDocument(false);
    }
  };

  const updatePassword = async () => {
    setSavingPassword(true);
    setMessage();
    try {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      const { error: updateError } = await getSupabase().auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    } catch (e: unknown) {
      setMessage("", readErrorMessage(e, "Could not update password."));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSectionChange = (section: Section) => {
    if (section === "settings") return;
    setMobileSidebarOpen(false);
    router.push(pathForSection(section));
  };

  const handleLogout = async () => {
    setMobileSidebarOpen(false);
    await signOutAndRedirect("/login");
  };

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="platform-glass-app" style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-canvas)" }}>
      <Sidebar
        activeSection="settings"
        onSectionChange={handleSectionChange}
        onLogout={handleLogout}
        isMobile={isMobile}
        mobileOpen={isMobile ? mobileSidebarOpen : false}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      {isMobile && mobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="mobile-shell-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}
      <main style={{ flex: 1, overflowY: "auto" }}>
        <div className="responsive-page-container client-settings-container" style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
          <header
            className="responsive-page-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              {isMobile ? (
                <button onClick={() => setMobileSidebarOpen((prev) => !prev)} style={{ ...secondaryBtn, marginBottom: "10px" }}>
                  <PanelLeft size={13} />
                  Menu
                </button>
              ) : null}
              <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                Client Settings
              </h1>
              <p style={{ fontSize: "12px", color: "var(--text-subtle)", marginTop: "4px" }}>
                Manage your account, company profile, legal documents, and security.
              </p>
            </div>
            <button onClick={() => router.push(pathForSection(defaultSection))} style={secondaryBtn}>
              <ArrowLeft size={13} />
              Back to Dashboard
            </button>
          </header>

          {(error || notice) && (
            <div
              style={{
                marginBottom: "14px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: error
                  ? "1px solid var(--danger-soft-border)"
                  : "1px solid var(--success-soft-border)",
                background: error ? "var(--danger-soft-bg)" : "var(--success-soft-bg)",
                color: error ? "var(--danger)" : "var(--success)",
                fontSize: "12px",
              }}
            >
              {error || notice}
            </div>
          )}

          <div
            style={{
              marginBottom: "16px",
              border: "1px solid var(--border-default)",
              borderRadius: "12px",
              background: "var(--bg-surface)",
              padding: "12px 14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Workspace</div>
              <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{workspaceId}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Plan</div>
              <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: 600, color: paymentRequired ? "var(--danger)" : "var(--text-primary)" }}>
                {profileLoaded ? planLabel(businessForm.plan_tier) : "Not configured"}
                {paymentRequired ? " · payment required" : ""}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Onboarding</div>
              <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: 600, color: onboardingCompleted ? "var(--success)" : "var(--text-primary)" }}>
                {onboardingCompleted ? "Completed" : "In progress"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-subtle)" }}>Trial status</div>
              <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                {trialLabel}
              </div>
              <div style={{ marginTop: "6px", width: "100%", height: "8px", borderRadius: "999px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, trialProgressPercent))}%`,
                    height: "100%",
                    background: paymentRequired
                      ? "linear-gradient(90deg, #ef4444, #f87171)"
                      : "linear-gradient(90deg, var(--accent), var(--accent-2))",
                  }}
                />
              </div>
            </div>
          </div>

          {!onboardingCompleted ? (
            <section
              style={{
                marginBottom: "16px",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                background: "var(--bg-surface)",
                padding: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Workspace setup checklist
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-subtle)" }}>
                    Complete the required company profile fields and upload official documents to activate the workspace cleanly.
                  </div>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {Math.round(setupProgressPercent)}% complete
                </div>
              </div>
              <div style={{ marginBottom: "12px", width: "100%", height: "8px", borderRadius: "999px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, setupProgressPercent))}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                {[
                  ["business_name", "Business name"],
                  ["registration_number", "Registration number"],
                  ["country", "Country"],
                  ["city", "City"],
                  ["address", "Business address"],
                  ["owner_name", "Owner name"],
                  ["employee_count", "Employee count"],
                  ["documents", "Official documents"],
                ].map(([key, label]) => {
                  const done = !missingSetupFields.includes(key);
                  return (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-elevated)",
                        padding: "10px 12px",
                        fontSize: "12px",
                        color: done ? "var(--text-primary)" : "var(--text-subtle)",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "999px",
                          background: done ? "var(--success)" : "var(--warning)",
                          flexShrink: 0,
                        }}
                      />
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div
            className="client-settings-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "16px",
            }}
          >
            <section style={panelStyle}>
              <div style={panelHeader}>
                <Building2 size={14} />
                Business Profile
              </div>
              <div style={panelBody}>
                <Field label="Business Name">
                  <input
                    value={businessForm.business_name}
                    onChange={(e) => setBusinessForm((prev) => ({ ...prev, business_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Acme Holdings"
                  />
                </Field>
                <Field label="Registration Number">
                  <input
                    value={businessForm.registration_number}
                    onChange={(e) => setBusinessForm((prev) => ({ ...prev, registration_number: e.target.value }))}
                    style={inputStyle}
                    placeholder="Official registry ID"
                  />
                </Field>
                <Field label="Industry">
                  <input
                    value={businessForm.industry}
                    onChange={(e) => setBusinessForm((prev) => ({ ...prev, industry: e.target.value }))}
                    style={inputStyle}
                    placeholder="Finance, SaaS, Retail..."
                  />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <Field label="Country">
                    <input
                      value={businessForm.country}
                      onChange={(e) => setBusinessForm((prev) => ({ ...prev, country: e.target.value }))}
                      style={inputStyle}
                      placeholder="Uzbekistan"
                    />
                  </Field>
                  <Field label="City">
                    <input
                      value={businessForm.city}
                      onChange={(e) => setBusinessForm((prev) => ({ ...prev, city: e.target.value }))}
                      style={inputStyle}
                      placeholder="Tashkent"
                    />
                  </Field>
                </div>
                <Field label="Business Address">
                  <input
                    value={businessForm.address}
                    onChange={(e) => setBusinessForm((prev) => ({ ...prev, address: e.target.value }))}
                    style={inputStyle}
                    placeholder="Street, district, city"
                  />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <Field label="Employee Count">
                    <input
                      type="number"
                      min={1}
                      value={businessForm.employee_count}
                      onChange={(e) => setBusinessForm((prev) => ({ ...prev, employee_count: e.target.value }))}
                      style={inputStyle}
                      placeholder="10"
                    />
                  </Field>
                  <Field label="Plan Tier">
                    <select
                      value={businessForm.plan_tier}
                      onChange={(e) =>
                        setBusinessForm((prev) => ({
                          ...prev,
                          plan_tier: e.target.value as PaidPlanTier,
                        }))
                      }
                      style={inputStyle}
                    >
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <Field label="Owner Name">
                    <input
                      value={businessForm.owner_name}
                      onChange={(e) => setBusinessForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                      style={inputStyle}
                      placeholder="Owner / legal rep"
                    />
                  </Field>
                  <Field label="Owner Phone">
                    <input
                      value={businessForm.owner_phone}
                      onChange={(e) => setBusinessForm((prev) => ({ ...prev, owner_phone: e.target.value }))}
                      style={inputStyle}
                      placeholder="+998 ..."
                    />
                  </Field>
                </div>
                {paymentRequired ? (
                  <div
                    style={{
                      borderRadius: "9px",
                      border: "1px solid var(--danger-soft-border)",
                      background: "var(--danger-soft-bg)",
                      color: "var(--danger)",
                      padding: "9px 10px",
                      fontSize: "11px",
                      display: "flex",
                      gap: "7px",
                      alignItems: "flex-start",
                    }}
                  >
                    <AlertTriangle size={14} style={{ marginTop: "1px", flexShrink: 0 }} />
                    <span>
                      This business fingerprint is already registered under another account. Trial is disabled and payment is required to activate this account.
                    </span>
                  </div>
                ) : null}
                <button onClick={saveBusinessProfile} style={primaryBtn} disabled={savingBusiness}>
                  <Save size={13} />
                  {savingBusiness ? "Saving..." : "Save Business Profile"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <FileBadge2 size={14} />
                Official Documents
              </div>
              <div style={panelBody}>
                <Field label="Document Type">
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="official">Official registration</option>
                    <option value="license">License</option>
                    <option value="tax">Tax document</option>
                    <option value="compliance">Compliance certificate</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Upload File">
                  <input
                    type="file"
                    onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                    style={inputStyle}
                  />
                </Field>
                <button onClick={uploadDocument} style={primaryBtn} disabled={uploadingDocument}>
                  <UploadCloud size={13} />
                  {uploadingDocument ? "Uploading..." : "Upload Document"}
                </button>

                <div style={{ marginTop: "6px", border: "1px solid var(--border-default)", borderRadius: "10px", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1.3fr) minmax(72px, 0.8fr) minmax(86px, 0.8fr)", padding: "8px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-elevated)", fontSize: "10px", letterSpacing: "0.09em", color: "var(--text-quiet)", fontFamily: "monospace" }}>
                    <span>FILE</span>
                    <span>TYPE</span>
                    <span>STATUS</span>
                  </div>
                  {documents.length ? (
                    <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                      {documents.map((doc) => (
                        <a
                          key={doc.id}
                          href={resolveDownloadUrl(doc.download_url)}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(140px, 1.3fr) minmax(72px, 0.8fr) minmax(86px, 0.8fr)",
                            gap: "8px",
                            padding: "10px",
                            textDecoration: "none",
                            borderBottom: "1px solid var(--border-default)",
                            color: "var(--text-muted)",
                            fontSize: "12px",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                            <span style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</span>
                            <span style={{ fontSize: "10px", color: "var(--text-quiet)" }}>{formatBytes(doc.size_bytes)}</span>
                          </span>
                          <span style={{ textTransform: "capitalize" }}>{doc.document_type || "official"}</span>
                          <span style={{ textTransform: "capitalize", color: doc.verification_status === "verified" ? "var(--success)" : "var(--text-subtle)" }}>
                            {doc.verification_status || "pending"}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-subtle)" }}>
                      No documents uploaded yet.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <UserRound size={14} />
                Account Profile
              </div>
              <div style={panelBody}>
                <Field label="Full Name">
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={inputStyle}
                    placeholder="Your full name"
                  />
                </Field>
                <Field label="Job Title">
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    style={inputStyle}
                    placeholder="Operations Lead"
                  />
                </Field>
                <Field label="Email">
                  <input value={email} disabled style={{ ...inputStyle, color: "var(--text-muted)" }} />
                </Field>
                <button onClick={saveProfile} style={primaryBtn} disabled={savingProfile}>
                  <Save size={13} />
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <Building2 size={14} />
                Workspace Context
              </div>
              <div style={panelBody}>
                <Field label="Workspace ID">
                  <input
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    style={inputStyle}
                    placeholder="default-workspace"
                  />
                </Field>
                <Field label="Default Dashboard Module">
                  <select
                    value={defaultSection}
                    onChange={(e) => setDefaultSection(e.target.value as ClientSection)}
                    style={inputStyle}
                  >
                    {CLIENT_SECTIONS.map((section) => (
                      <option key={section} value={section}>
                        {SECTION_LABELS[section]}
                      </option>
                    ))}
                  </select>
                </Field>
                <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Workspace context is used by all client modules and AI requests.
                </p>
                <button onClick={savePreferences} style={primaryBtn} disabled={savingPrefs}>
                  <Save size={13} />
                  {savingPrefs ? "Saving..." : "Save Workspace Preferences"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <Bell size={14} />
                Notification Preferences
              </div>
              <div style={panelBody}>
                <ToggleRow
                  label="Product updates"
                  description="Release notes and feature announcements."
                  checked={notifications.product_updates}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, product_updates: checked }))
                  }
                />
                <ToggleRow
                  label="Weekly digest"
                  description="Weekly summary of module activity."
                  checked={notifications.weekly_digest}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, weekly_digest: checked }))
                  }
                />
                <ToggleRow
                  label="Security alerts"
                  description="Sign-in and account security events."
                  checked={notifications.security_alerts}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, security_alerts: checked }))
                  }
                />
                <ToggleRow
                  label="Billing alerts"
                  description="Invoices, payment issues, and renewal notices."
                  checked={notifications.billing_alerts}
                  onChange={(checked) =>
                    setNotifications((prev) => ({ ...prev, billing_alerts: checked }))
                  }
                />
                <button onClick={savePreferences} style={primaryBtn} disabled={savingPrefs}>
                  <Save size={13} />
                  {savingPrefs ? "Saving..." : "Save Notifications"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <div style={panelHeader}>
                <ShieldCheck size={14} />
                Security
              </div>
              <div style={panelBody}>
                <Field label="New Password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={inputStyle}
                    placeholder="Minimum 8 characters"
                  />
                </Field>
                <Field label="Confirm Password">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={inputStyle}
                    placeholder="Re-enter password"
                  />
                </Field>
                <button onClick={updatePassword} style={primaryBtn} disabled={savingPassword}>
                  <KeyRound size={13} />
                  {savingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: "100%",
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        borderRadius: "10px",
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{description}</div>
      </div>
      <div
        style={{
          width: "38px",
          height: "21px",
          borderRadius: "999px",
          border: checked
            ? "1px solid color-mix(in srgb, var(--accent) 45%, var(--border-soft))"
            : "1px solid var(--border-soft)",
          background: checked ? "var(--accent-soft)" : "var(--bg-elevated)",
          position: "relative",
          flexShrink: 0,
          transition: "all 0.2s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "19px" : "2px",
            width: "15px",
            height: "15px",
            borderRadius: "50%",
            background: checked ? "var(--accent)" : "var(--text-muted)",
            transition: "left 0.2s ease",
          }}
        />
      </div>
    </button>
  );
}

function formatBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (safe < 1024) return `${safe} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const centerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "var(--bg-canvas)",
};

const spinnerStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  border: "2px solid var(--border-default)",
  borderTopColor: "var(--accent)",
  animation: "spin 0.8s linear infinite",
};

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: "14px",
  background: "var(--bg-surface)",
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 14px",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-primary)",
  borderBottom: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
};

const panelBody: React.CSSProperties = {
  padding: "14px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "9px",
  border: "1px solid var(--border-soft)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: "13px",
  padding: "9px 10px",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  height: "34px",
  padding: "0 12px",
  borderRadius: "9px",
  border: "1px solid color-mix(in srgb, var(--accent) 42%, var(--border-default))",
  background: "var(--accent)",
  color: "white",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  width: "fit-content",
};

const secondaryBtn: React.CSSProperties = {
  height: "34px",
  padding: "0 12px",
  borderRadius: "9px",
  border: "1px solid var(--border-soft)",
  background: "var(--bg-elevated)",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
};
