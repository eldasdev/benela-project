import { authFetch } from "@/lib/auth-fetch";

const API = typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

export interface TeamMember {
  id: number;
  client_org_id: number;
  user_id: string | null;
  email: string;
  full_name: string;
  position_title: string | null;
  allowed_modules: string[];
  status: "invited" | "active" | "suspended" | "removed";
  invited_by_user_id: string;
  invited_at: string | null;
  joined_at: string | null;
}

export interface TeamListResponse {
  members: TeamMember[];
  total: number;
  seats_used: number;
  seats_limit: number;
}

export async function fetchTeamMembers(): Promise<TeamListResponse> {
  const res = await authFetch(`${API}/team/members`);
  if (!res.ok) throw new Error("Failed to load team members");
  return res.json();
}

export async function inviteTeamMember(payload: {
  email: string;
  full_name: string;
  position_title?: string;
  allowed_modules: string[];
}): Promise<TeamMember> {
  const res = await authFetch(`${API}/team/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Invite failed" }));
    throw new Error(err.detail || "Invite failed");
  }
  return res.json();
}

export async function updateTeamMember(
  memberId: number,
  payload: { full_name?: string; position_title?: string; allowed_modules?: string[] },
): Promise<TeamMember> {
  const res = await authFetch(`${API}/team/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Update failed" }));
    throw new Error(err.detail || "Update failed");
  }
  return res.json();
}

export async function removeTeamMember(memberId: number): Promise<void> {
  const res = await authFetch(`${API}/team/members/${memberId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove member");
}

export async function resendInvite(memberId: number): Promise<void> {
  const res = await authFetch(`${API}/team/members/${memberId}/resend-invite`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to resend" }));
    throw new Error(err.detail || "Failed to resend invite");
  }
}

export async function activateTeamMember(): Promise<{ ok: boolean; role: string; allowed_modules: string[] }> {
  const res = await authFetch(`${API}/team/activate`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Activation failed" }));
    throw new Error(err.detail || "Activation failed");
  }
  return res.json();
}
