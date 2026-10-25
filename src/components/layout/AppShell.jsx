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
        <div className="isolate relative flex bg-background selection:bg-cyan-500 min-h-screen overflow-x-clip font-sans text-foreground selection:text-white antialiased">
            <div className="top-1/4 -left-20 z-0 absolute bg-green-500/5 blur-3xl rounded-full size-96 pointer-events-none" />
            <div className="right-0 bottom-1/4 z-0 absolute bg-red-400/5 blur-3xl rounded-full size-96 pointer-events-none" />
            <div className="top-1/2 left-1/2 z-0 absolute bg-cyan-500/5 blur-[120px] rounded-full size-[500px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div
                className="z-0 absolute inset-0 bg-cover bg-no-repeat bg-center opacity-[0.02] pointer-events-none"
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
                <div className="top-1/2 left-1/2 absolute bg-indigo-600/10 blur-[120px] rounded-full w-[500px] h-[500px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            )}

            <div className="z-10 relative flex flex-col flex-1 min-w-0 animate-fade">
                <Header
                    isHeaderVisible={isHeaderVisible || isMobileSidebarOpen}
                    onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
                />

                <main className={cx("min-w-0 flex-1 bg-muted/30", "p-4 md:p-5 lg:p-6")}>{children}</main>
                <footer className="mb-2 pt-4 text-muted-foreground text-xs text-center animate-fadeInUp">
                    IssueDesk | &copy; {new Date().getFullYear()} GhuniNew. All rights reserved.
                </footer>
            </div>
        </div>
    );
};

export default AppShell;
