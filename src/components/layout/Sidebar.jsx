import { NavLink } from "react-router-dom";
import { cx } from "../../utils/cx";
import { LayoutDashboard, ClipboardList, Plus, Headset } from "lucide-react";

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
                            !isCollapsed && "lg:justify-start lg:px-3",
                            isActive
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )
                    }
                >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Headset size={22} aria-hidden="true" className="cursor-pointer hover:scale-105" />
                    </span>

                    <div className={cx("min-w-0", "md:hidden", !isCollapsed && "lg:block")}>
                        <h1 className="text-sm font-semibold">IssueDesk</h1>

                        <p className="text-xs text-muted-foreground">IT Support Center</p>
                    </div>
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

                <NavLink
                    to="/dashboard"
                    title={isCollapsed ? "Dashboard" : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        cx(
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5",
                            "transition-colors",
                            "md:justify-center md:px-0",
                            !isCollapsed && "lg:justify-start lg:px-3",
                            isActive
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )
                    }
                >
                    <LayoutDashboard className="size-5 shrink-0" aria-hidden="true" />

                    <span className={cx("text-sm", "md:hidden", !isCollapsed && "lg:inline")}>Dashboard</span>
                </NavLink>

                <NavLink
                    to="/issues"
                    title={isCollapsed ? "All Issues" : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        cx(
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5",
                            "transition-colors",
                            "md:justify-center md:px-0",
                            !isCollapsed && "lg:justify-start lg:px-3",
                            isActive
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )
                    }
                >
                    <ClipboardList className="size-5 shrink-0" aria-hidden="true" />

                    <span className={cx("text-sm", "md:hidden", !isCollapsed && "lg:inline")}>All Issues</span>
                </NavLink>

                <NavLink
                    to="/report"
                    title={isCollapsed ? "Report an Issue" : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        cx(
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5",
                            "transition-colors",
                            "md:justify-center md:px-0",
                            !isCollapsed && "lg:justify-start lg:px-3",
                            isActive
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )
                    }
                >
                    <Plus className="size-5 shrink-0" aria-hidden="true" />

                    <span className={cx("text-sm", "md:hidden", !isCollapsed && "lg:inline")}>Report an Issue</span>
                </NavLink>
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
                    "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
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
                    "hidden h-screen shrink-0 flex-col animate-fadeInLeft",
                    "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
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
