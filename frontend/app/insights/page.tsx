import DashboardPageClient from "@/app/dashboard/DashboardPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function InsightsPageRoute() {
  return <DashboardPageClient initialSection="insights" />;
}
