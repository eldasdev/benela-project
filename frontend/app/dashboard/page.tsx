import DashboardPageClient from "./DashboardPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DashboardPage() {
  return <DashboardPageClient initialSection="dashboard" />;
}
