import { useLocation, useNavigate, useMatch } from "react-router-dom";
import ThemeToggle from "../../theme/ThemeToggle";
import { cx } from "../../utils/cx";
import { LogOut, Menu, LogIn } from "lucide-react";
import { api } from "../../utils/api";
import { useAuth } from "../../auth/useAuth";
import logo from "../../assets/logo.avif";

const MenuIcon = () => <Menu size={20} aria-hidden="true" />;

const Header = ({ isHeaderVisible = true, onOpenMobileSidebar }) => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const trackMatch = useMatch("/track/:ticketNumber");
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
        "/sheet": {
            title: "Sheet",
            description: "View and manage office issues",
        },
        "/storage/images": {
            title: "Storage",
            description: "Add and manage office images",
        },
    };

    const currentPage = trackMatch
        ? {
              title: "Issue Tracking",
              description: `Track the progress of an issue: ${trackMatch.params.ticketNumber}`,
          }
        : (pageInfo[pathname] ?? {
              title: "IssueDesk",
              description: "Internal IT Support",
          });

    return (
        <header
            className={cx(
                "glass-header sticky top-0 z-30",
                "flex h-15 shrink-0 items-center justify-between gap-3",
                "px-4 sm:px-5 lg:px-6",
                "transition-transform duration-300 ease-out",
                "motion-reduce:transition-none",
                isHeaderVisible ? "translate-y-0" : "-translate-y-full",
            )}
        >
            <div className="flex min-w-0 items-center gap-2">
                {/* Mobile menu */}
                {user && (
                    <>
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

                    </>
                )}

                <div className="min-w-0 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        aria-label="Go to home"
                        className={cx(
                            "flex size-10 shrink-0 items-center justify-center rounded-lg",
                            "text-foreground transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                    >
                        {/* <Headset size={24} aria-hidden="true" /> */}
                        <img src={logo} alt="IssueDesk" className="h-8 w-8" />
                    </button>
                    <div className="truncate text-sm font-medium">
                        <p className="truncate text-sm font-medium"> {currentPage.title}</p>

                        <p className="hidden truncate text-xs text-muted-foreground sm:block">
                            {currentPage.description}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {user ? (
                    <button
                        type="button"
                        onClick={handleLogout}
                        className={cx(
                            "inline-flex h-10 items-center gap-2 rounded-lg px-3",
                            "text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
                            "transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "motion-reduce:transition-none",
                        )}
                    >
                        <LogOut size={16} aria-hidden="true" />
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => navigate("/login")}
                        className={cx(
                            "inline-flex h-10 items-center gap-2 rounded-lg px-3",
                            "text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer",
                            "transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "motion-reduce:transition-none",
                        )}
                    >
                        <LogIn size={16} aria-hidden="true" />
                        <span className="hidden sm:inline">Sign in</span>
                    </button>
                )}
                <ThemeToggle />
            </div>
        </header>
    );
};

export default Header;
