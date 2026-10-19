import { useLocation, useNavigate } from "react-router-dom";
import ThemeToggle from "../../theme/ThemeToggle";
import { cx } from "../../utils/cx";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Headset } from "lucide-react";
import { api } from "../../utils/api";
import { useAuth } from "../../auth/useAuth";

const MenuIcon = () => <Menu size={20} aria-hidden="true" />;

const SidebarToggleIcon = ({ isCollapsed }) =>
    isCollapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />;

const Header = ({ isSidebarCollapsed, onToggleSidebar, onOpenMobileSidebar }) => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { setUser, user } = useAuth();

    const handleLogout = async () => {
        try {
            await api("/api/auth/logout", { method: "POST" });
        } catch {
            // Clear the local view even if the network request fails.
        } finally {
            setUser(null);
            navigate("/login", { replace: true });
        }
    };

    const pageInfo = {
        "/dashboard": {
            title: "Dashboard",
            description: "Monitor and manage office issues",
        },
        "/report": {
            title: "Report an Issue",
            description: "Submit a new office IT issue",
        },
        "/issues": {
            title: "Issues",
            description: "View and manage office issues",
        },
        "/admin": {
            title: "Admin",
            description: "Manage users and settings",
        },
        "/login": {
            title: "Login",
            description: "Sign in to your account",
        },
        "/track/:ticketNumber": {
            title: "Issue Tracking",
            description: `Track the progress of an issue : ${pathname.split("/")[2]}`,
        },
    };

    const currentPage = pageInfo[pathname] ?? {
        title: "IssueDesk",
        description: "Internal IT Support",
    };

    return (
        <header
            className={cx(
                "flex h-16 shrink-0 items-center justify-between gap-3",
                "border-b border-border bg-background",
                "px-4 sm:px-5 lg:px-6 animate-fadeInDown",
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                {/* Mobile menu */}
                <button
                    type="button"
                    onClick={onOpenMobileSidebar}
                    aria-label="Open navigation menu"
                    className={cx(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg",
                        "text-muted-foreground transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "md:hidden",
                    )}
                >
                    <MenuIcon />
                </button>

                {/* Desktop sidebar toggle */}
                {user &&
                <button
                    type="button"
                    onClick={onToggleSidebar}
                    aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-pressed={isSidebarCollapsed}
                    title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className={cx(
                        "hidden size-10 shrink-0 items-center justify-center rounded-lg",
                        "text-muted-foreground transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "md:flex",
                    )}
                >
                    <SidebarToggleIcon isCollapsed={isSidebarCollapsed} />
                </button>
                }

                <div className="min-w-0 flex items-center gap-2">
                    <Headset size={24} aria-hidden="true" />
                    <div className="truncate text-sm font-medium">
                        <p className="truncate text-sm font-medium"> {currentPage.title}</p>

                        <p className="hidden truncate text-xs text-muted-foreground sm:block">
                            {currentPage.description}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {user && (
                    <button
                        type="button"
                        onClick={handleLogout}
                        className={cx(
                            "inline-flex h-10 items-center gap-2 rounded-lg px-3",
                            "text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
                        )}
                    >
                        <LogOut size={16} aria-hidden="true" />
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                )}
                <ThemeToggle />
            </div>
        </header>
    );
};

export default Header;
