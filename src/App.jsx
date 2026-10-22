import { Navigate, Outlet, Route, Routes } from "react-router-dom";
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
import Sheet from "./pages/Sheet";
import StorageImages from "./pages/StorageImages";

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

function AppLayout() {
    return (
        <AppShell>
            <Outlet />
        </AppShell>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route element={<AppLayout />}>
                <Route path="/" element={<PortalHome />} />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute requiredRole="admin">
                            <DashboardPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/issues"
                    element={
                        <ProtectedRoute requiredRole="admin">
                            <Issues />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/issues/:ticketNumber"
                    element={
                        <ProtectedRoute requiredRole="admin">
                            <IssueDetail />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/storage/images"
                    element={
                        <ProtectedRoute requiredRole="admin">
                            <StorageImages />
                        </ProtectedRoute>
                    }
                />
                <Route path="/track/:ticketNumber" element={<TrackTicket />} />
                <Route path="/report" element={<ReportIssue />} />
                <Route
                    path="/sheet"
                    element={
                        <ProtectedRoute requiredRole="admin">
                            <Sheet />
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}

export default App;
