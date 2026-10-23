import { NavLink } from "react-router-dom";
import { cx } from "../../utils/cx";
import { LayoutDashboard, ClipboardList, ClipboardPlus, Images, FileSpreadsheet } from "lucide-react";
import logoFull from "../../assets/GhuniNew_full_color.avif";
import logo from "../../assets/logo.avif";

const navLinks = [
    { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
    { icon: ClipboardList, label: "Issues", to: "/issues" },
    { icon: ClipboardPlus, label: "Report", to: "/report" },
    { icon: Images, label: "Storage", to: "/storage/images" },
    { icon: FileSpreadsheet, label: "Sheet", to: "/sheet" },
];

const SidebarContent = ({ isCollapsed, onNavigate }) => {
    return (
        <>
            {/* Brand */}
            <div
                className={cx(
                    "flex h-16 shrink-0 items-center gap-3",
                    "border-b border-sidebar-border px-4",
                    "md:justify-center md:px-0",
                    !isCollapsed && "lg:justify-start lg:px-5",
                )}
            >
                <NavLink
                    to="/"
                    end
                    className={({ isActive }) =>
                        cx(
                            "transition-colors flex items-center gap-3 rounded-lg px-3 py-2.5",
                            "md:justify-center md:px-0",
                            "focus-visible:outline-none focus-visible:ring-2",
                            "focus-visible:ring-inset focus-visible:ring-ring/50",
                            "hover:bg-sidebar-border hover:text-sidebar-accent-foreground",
                            !isCollapsed && "lg:justify-start lg:px-3 glass-nav-active ",
                            isActive
                                ? "font-medium text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:text-sidebar-accent-foreground glass-nav-link",
                        )
                    }
                >
                    {isCollapsed ? (
                        <img src={logo} alt="IssueDesk" width={36} height={36} className="size-full object-cover" />
                    ) : (
                        <img
                            src={logoFull}
                            alt="IssueDesk"
                            width={120}
                            height={36}
                            className="size-full object-cover"
                        />
                    )}
                </NavLink>
            </div>

            {/* Navigation */}
            <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
                <p
                    className={cx(
                        "px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-wider",
                        "text-muted-foreground",
                        "md:hidden",
                        !isCollapsed && "lg:block",
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
                                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5",
                                "transition-colors",
                                "md:justify-center md:px-0",
                                "focus-visible:outline-none focus-visible:ring-2",
                                "focus-visible:ring-inset focus-visible:ring-ring/50",
                                !isCollapsed && "lg:justify-start lg:px-3",
                                isActive
                                    ? "glass-nav-active font-medium text-sidebar-accent-foreground"
                                    : "text-muted-foreground hover:text-sidebar-accent-foreground glass-nav-link",
                            )
                        }
                    >
                        <link.icon className="size-5 shrink-0" aria-hidden="true" />

                        <span className={cx("text-sm", "md:hidden", !isCollapsed && "lg:inline")}>{link.label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Footer */}
            <div className={cx("shrink-0 border-t border-sidebar-border p-4", "md:hidden", !isCollapsed && "lg:block")}>
                <p className="text-xs text-muted-foreground">IssueDesk</p>

                <p className="mt-1 text-xs text-muted-foreground">Internal IT Support</p>
            </div>
        </>
    );
};

const Sidebar = ({ isCollapsed, isMobileOpen, onMobileClose }) => {
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
                <SidebarContent isCollapsed={false} onNavigate={onMobileClose} />
            </aside>

            {/* Tablet and desktop sidebar */}
            <aside
                aria-label="Main sidebar"
                className={cx(
                    "glass-sidebar relative z-20",
                    "hidden h-screen shrink-0 flex-col animate-fadeInLeft",
                    "border-r text-sidebar-foreground",
                    "transition-[width] duration-200 ease-in-out",
                    "md:sticky md:top-0 md:flex md:w-[60px]",
                    isCollapsed ? "lg:w-[60px]" : "lg:w-56",
                )}
            >
                <SidebarContent isCollapsed={isCollapsed} />
            </aside>
        </>
    );
};

export default Sidebar;
