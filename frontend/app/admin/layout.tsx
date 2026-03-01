"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import AdminSidebar from "@/components/admin/AdminSidebar";

function LoadingSpinner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#060608",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          border: "2px solid #1e1e2a",
          borderTopColor: "#ef4444",
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
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setAuthed(true);
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
  }, [pathname, router]);

  if (!authed) return <LoadingSpinner />;
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#060608",
      }}
    >
      <AdminSidebar />
      <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
