import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-screen overflow-hidden bg-slate-50">
			{/* Sidebar */}
			<Sidebar />

			{/* Main area */}
			<div className="flex flex-1 flex-col min-w-0 overflow-hidden">
				<Header />
				<main className="flex-1 overflow-y-auto">{children}</main>
			</div>
		</div>
	);
}
