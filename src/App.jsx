import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import DashboardStats from "./components/dashboard/DashboardStats";
import RecentIssues from "./components/dashboard/RecentIssues";
import ReportIssue from "./pages/ReportIssue";
import Issues from "./pages/Issues";
import IssueDetail from "./pages/IssueDetail";
import PortalHome from "./pages/PortalHome";
import LoginRegister from "./pages/LoginRegister";
import { Loader } from "lucide-react";
import ProtectedRoute from "./auth/ProtectedRoute";
import TrackTicket from "./pages/TrackTicket";
import { useAuth } from "./auth/useAuth";

function LoginRoute() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background p-8 text-sm text-muted-foreground" role="status">
                <Loader className="animate-spin" />
                Checking your session…
            </div>
        );
    }

    if (user) {
        return <Navigate to={user.role === "admin" ? "/dashboard" : "/"} replace />;
    }

    return <LoginRegister />;
}

function DashboardPage() {
    return (
        <div className="mx-auto max-w-7xl">
            <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>

                <p className="mt-2 text-sm text-muted-foreground">
                    Welcome to IssueDesk. Manage and track office IT issues in one place.
                </p>
            </div>

            <DashboardStats />

            <RecentIssues />
        </div>
    );
}

function NotFoundPage() {
    return (
        <div className="mx-auto max-w-7xl">
            <Loader className="animate-spin" />
            <h2 className="text-2xl font-semibold tracking-tight">Page not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">The page you are looking for does not exist.</p>
        </div>
    );
}

function App() {
    return (
        <Routes>
            <Route
                path="/"
                element={
                    <AppShell>
                        <PortalHome />
                    </AppShell>
                }
            />

            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute requiredRole="admin">
                        <AppShell>
                            <DashboardPage />
                        </AppShell>
                    </ProtectedRoute>
                }
            />

            <Route
                path="/issues"
                element={
                    <ProtectedRoute requiredRole="admin">
                        <AppShell>
                            <Issues />
                        </AppShell>
                    </ProtectedRoute>
                }
            />

            <Route
                path="/issues/:ticketNumber"
                element={
                    <ProtectedRoute requiredRole="admin">
                        <AppShell>
                            <IssueDetail />
                        </AppShell>
                    </ProtectedRoute>
                }
            />
            <Route path="/login" element={<LoginRoute />} />

            <Route
                path="/track/:ticketNumber"
                element={
                    <AppShell>
                        <TrackTicket />
                    </AppShell>
                }
            />

            <Route
                path="/report"
                element={
                    <AppShell>
                        <ReportIssue />{" "}
                    </AppShell>
                }
            />

            <Route
                path="*"
                element={
                    <AppShell>
                        <NotFoundPage />
                    </AppShell>
                }
            />
        </Routes>
    );
}

export default App;
