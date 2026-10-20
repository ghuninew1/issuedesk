import { useEffect, useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { cx } from "../../utils/cx";
import { useAuth } from "../../auth/useAuth";

const AppShell = ({ children }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const { user, isLoading } = useAuth();

    useEffect(() => {
        if (!isMobileSidebarOpen) {
            return;
        }

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setIsMobileSidebarOpen(false);
            }
        };

        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isMobileSidebarOpen]);

    return (
        <div className="flex min-h-screen bg-background text-foreground selection:bg-cyan-500 selection:text-white relative overflow-hidden font-sans antialiased">
            <div className="absolute top-1/4 -left-20 w-96 h-96 bg-green-500/1 rounded-full blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-red-400/1 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/1 rounded-full blur-[120px] pointer-events-none" />
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.02] pointer-events-none"
                style={{
                    backgroundImage: "url('/it-workspace-bg.jpg')",
                }}
            />

            {user && (
                <Sidebar
                    isCollapsed={isSidebarCollapsed}
                    isMobileOpen={isMobileSidebarOpen}
                    onMobileClose={() => setIsMobileSidebarOpen(false)}
                />
            )}
            {isLoading && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
            )}

            <div className="flex min-w-0 flex-1 flex-col animate-fade">
                <Header
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={() => setIsSidebarCollapsed((previous) => !previous)}
                    onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
                />

                <main className={cx("min-w-0 flex-1 bg-muted/30", "p-4 sm:p-5 lg:p-6")}>{children}</main>
                <footer className="mb-2 border-t border-border pt-4 text-center text-xs text-muted-foreground animate-fadeInUp">
                    IssueDesk | &copy; {new Date().getFullYear()} GhuniNew. All rights reserved.
                </footer>
            </div>
        </div>
    );
};

export default AppShell;
