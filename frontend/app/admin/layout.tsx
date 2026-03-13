"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { PanelLeft } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";

function LoadingSpinner() {
  return (
    <div
      className="admin-auth-loading"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg-canvas)",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          border: "2px solid color-mix(in srgb, var(--border-default) 85%, transparent)",
          borderTopColor: "var(--accent)",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPath = pathname === "/admin/login";
  const isMobile = useIsMobile();
  const [authed, setAuthed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (isLoginPath) {
      return;
    }
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const isAdmin = data.user?.user_metadata?.role === "admin";
        if (!data.user || !isAdmin) {
          router.push("/admin/login");
        } else {
          setAuthed(true);
        }
      });
  }, [isLoginPath, router]);

  if (isLoginPath) return <>{children}</>;
  if (!authed) return <LoadingSpinner />;

  return (
    <div
      className="platform-glass-app admin-route-shell"
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--bg-canvas)",
      }}
    >
      <AdminSidebar
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
      {isMobile ? (
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileSidebarOpen(true)}
          style={{
            position: "fixed",
            top: "12px",
            left: "12px",
            width: "38px",
            height: "38px",
            borderRadius: "12px",
            border: "1px solid var(--border-default)",
            background: "color-mix(in srgb, var(--bg-surface) 86%, var(--accent-soft) 14%)",
            color: "var(--text-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 89,
            boxShadow: "0 16px 38px rgba(5, 10, 24, 0.36)",
          }}
        >
          <PanelLeft size={15} />
        </button>
      ) : null}
      <main
        className="admin-main-shell"
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {children}
      </main>
    </div>
  );
}
