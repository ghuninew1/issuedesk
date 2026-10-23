import { useEffect, useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { cx } from "../../utils/cx";
import { useAuth } from "../../auth/useAuth";

const AppShell = ({ children }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isHeaderVisible, setIsHeaderVisible] = useState(true);
    const { user, isLoading } = useAuth();

    useEffect(() => {
        let previousScrollY = window.scrollY;
        let animationFrameId = 0;

        const handleScroll = () => {
            if (animationFrameId) return;

            animationFrameId = window.requestAnimationFrame(() => {
                const currentScrollY = window.scrollY;
                const scrollDifference = currentScrollY - previousScrollY;

                if (currentScrollY <= 24 || scrollDifference < -6) {
                    setIsHeaderVisible(true);
                } else if (scrollDifference > 6) {
                    setIsHeaderVisible(false);
                }

                previousScrollY = currentScrollY;
                animationFrameId = 0;
            });
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
        };
    }, []);

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
        <div className="relative isolate flex min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased selection:bg-cyan-500 selection:text-white">
            <div className="pointer-events-none absolute top-1/4 -left-20 z-0 size-96 rounded-full bg-green-500/5 blur-3xl" />
            <div className="pointer-events-none absolute right-0 bottom-1/4 z-0 size-96 rounded-full bg-red-400/5 blur-3xl" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 z-0 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/5 blur-[120px]" />
            <div
                className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.02]"
                style={{
                    backgroundImage: "url('/it-workspace-bg.jpg')",
                }}
            />

            {user && (
                <Sidebar
                    isCollapsed={isSidebarCollapsed}
                    isMobileOpen={isMobileSidebarOpen}
                    onMobileClose={() => setIsMobileSidebarOpen(false)}
                    onToggleSidebar={() => setIsSidebarCollapsed((previous) => !previous)}
                />
            )}
            {isLoading && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
            )}

            <div className="relative z-10 flex min-w-0 flex-1 flex-col animate-fade">
                <Header
                    isHeaderVisible={isHeaderVisible || isMobileSidebarOpen}
                    onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
                />

                <main className={cx("min-w-0 flex-1 bg-muted/30", "p-4 sm:p-5 lg:p-6")}>{children}</main>
                <footer className="mb-2 pt-4 text-center text-xs text-muted-foreground animate-fadeInUp">
                    IssueDesk | &copy; {new Date().getFullYear()} GhuniNew. All rights reserved.
                </footer>
            </div>
        </div>
    );
};

export default AppShell;
