import { NavLink } from "react-router-dom";
import { cx } from "../../utils/cx";
import {
    LayoutDashboard,
    ClipboardList,
    ClipboardPlus,
    Images,
    FileSpreadsheet,
    Clock3,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";
import logoFull from "../../assets/GhuniNew_full_color.avif";
import logo from "../../assets/logo.avif";

const navLinks = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: ClipboardList, label: "Issues", to: "/issues" },
    { icon: ClipboardPlus, label: "Report", to: "/report" },
    { icon: Clock3, label: "Attendance", to: "/attendance" },
    { icon: Images, label: "Storage", to: "/storage/images" },
    { icon: FileSpreadsheet, label: "Sheet", to: "/sheet" },
];

const SidebarContent = ({ isCollapsed, onNavigate, onToggleSidebar, mobile = false }) => {
    return (
        <>
            {/* Brand */}
            <div className={cx("flex h-14 shrink-0 items-center justify-center")}>
                <NavLink
                    to="/"
                    end
                    className={({ isActive }) =>
                        cx(
                            "transition-colors flex items-center justify-center rounded-xl",
                            mobile || !isCollapsed ? "h-10 w-full gap-2 px-2" : "size-10",
                            "focus-visible:outline-none focus-visible:ring-2",
                            "focus-visible:ring-inset focus-visible:ring-ring/50",
                            "hover:bg-sidebar-border hover:text-sidebar-accent-foreground",
                            mobile || !isCollapsed ? "" : "glass-nav-active",
                            isActive
                                ? "font-medium text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:text-sidebar-accent-foreground glass-nav-link",
                        )
                    }
                >
                    {mobile || !isCollapsed ? (
                        <img
                            src={logoFull}
                            alt="IssueDesk"
                            width={120}
                            height={36}
                            className="h-8 w-auto object-contain"
                        />
                    ) : (
                        <img src={logo} alt="IssueDesk" width={32} height={32} className="size-8 object-cover" />
                    )}
                </NavLink>
            </div>

            {/* Navigation */}
            <nav
                aria-label="Main navigation"
                className={cx(
                    "flex-1 space-y-1 overflow-y-auto p-2 animate-fadeInLeft",
                    mobile || !isCollapsed ? "w-56" : "overflow-x-hidden",
                )}
            >
                <p
                    className={cx(
                        "px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-wider",
                        "text-muted-foreground",
                        mobile || !isCollapsed ? "block" : "hidden",
                    )}
                >
                    Workspace
                </p>

                {/* Navigation links */}
                {navLinks.map((link) => (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        title={isCollapsed ? link.label : undefined}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                            cx(
                                "flex min-h-11 items-center rounded-xl px-3 py-2.5",
                                mobile || !isCollapsed ? "w-full gap-3" : "mx-auto size-11 justify-center px-0",
                                "transition-all animate-fadeInLeft duration-200 ease-in-out",
                                "focus-visible:outline-none focus-visible:ring-2",
                                "focus-visible:ring-inset focus-visible:ring-ring/50",
                                isActive
                                    ? "glass-nav-active font-medium text-sidebar-accent-foreground"
                                    : "text-muted-foreground hover:text-sidebar-accent-foreground glass-nav-link",
                            )
                        }
                    >
                        <link.icon className="size-5 shrink-0" aria-hidden="true" />
                        <span className={cx("text-sm", mobile || !isCollapsed ? "inline" : "sr-only")}>
                            {link.label}
                        </span>
                    </NavLink>
                ))}
            </nav>

            {/* Footer */}
            {!mobile && (
                <div className={cx("shrink-0 p-2 border-t", !isCollapsed && "border-t border-sidebar-border", "animate-fadeInLeft")}>
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-pressed={isCollapsed}
                        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className="mx-auto flex size-auto items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)] hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                    >
                        {isCollapsed ? (
                            <PanelLeftOpen size={19} aria-hidden="true" />
                        ) : (
                            <div className="flex items-center gap-2 px-2 animate-fadeInLeft">
                                <PanelLeftClose size={19} aria-hidden="true" />
                                Collapse
                            </div>
                        )}
                    </button>
                </div>
            )}
        </>
    );
};

const Sidebar = ({ isCollapsed, isMobileOpen, onMobileClose, onToggleSidebar }) => {
    return (
        <>
            {/* Mobile backdrop */}
            <button
                type="button"
                aria-label="Close navigation menu"
                tabIndex={isMobileOpen ? 0 : -1}
                onClick={onMobileClose}
                className={cx(
                    "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200",
                    "md:hidden",
                    isMobileOpen ? "visible opacity-100" : "invisible pointer-events-none opacity-0",
                )}
            />

            {/* Mobile drawer */}
            <aside
                id="mobile-sidebar"
                aria-label="Mobile navigation"
                aria-hidden={!isMobileOpen}
                className={cx(
                    "fixed inset-y-0 left-0 z-50 flex w-64 flex-col animate-fadeInLeft",
                    "glass-sidebar border-r text-sidebar-foreground",
                    "transition-transform duration-200 ease-in-out",
                    "md:hidden",
                    isMobileOpen ? "translate-x-0" : "-translate-x-full",
                )}
                inert={!isMobileOpen}
            >
                <SidebarContent isCollapsed={false} onNavigate={onMobileClose} mobile />
            </aside>

            {/* Tablet and desktop sidebar */}
            <aside
                aria-label="Main sidebar"
                className={cx(
                    "glass-sidebar fixed left-3 top-1/2 z-30 hidden h-auto max-h-[calc(100vh-2rem)] -translate-y-1/2 flex-col animate-fadeInLeft rounded-[1.4rem] border text-sidebar-foreground shadow-xl transition-[width] duration-200",
                    isCollapsed ? "w-[60px]" : "w-60",
                    "md:flex",
                )}
            >
                <SidebarContent isCollapsed={isCollapsed} onToggleSidebar={onToggleSidebar} />
            </aside>
        </>
    );
};

export default Sidebar;
