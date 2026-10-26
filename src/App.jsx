import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader } from "lucide-react";
import { useAuth } from "./auth/useAuth";

const QRCodeStudio = lazy(() => import("./pages/qr/QRCodeStudio"));
const QRLinks = lazy(() => import("./pages/qr/QRLinks"));
const SavedQRCodes = lazy(() => import("./pages/qr/SavedQRCodes"));
const ImageConverter = lazy(() => import("./pages/ImageConverter"));

const AppShell = lazy(() => import("./components/layout/AppShell"));
const DashboardStats = lazy(() => import("./components/dashboard/DashboardStats"));
const RecentIssues = lazy(() => import("./components/dashboard/RecentIssues"));
const ReportIssue = lazy(() => import("./pages/ReportIssue"));
const Issues = lazy(() => import("./pages/Issues"));
const IssueDetail = lazy(() => import("./pages/IssueDetail"));
const PortalHome = lazy(() => import("./pages/PortalHome"));
const LoginRegister = lazy(() => import("./pages/LoginRegister"));
const ProtectedRoute = lazy(() => import("./auth/ProtectedRoute"));
const TrackTicket = lazy(() => import("./pages/TrackTicket"));
const Sheet = lazy(() => import("./pages/Sheet"));
const StorageImages = lazy(() => import("./pages/StorageImages"));
const Attendance = lazy(() => import("./pages/Attendance"));
const NetworkMonitor = lazy(() => import("./pages/NetworkMonitor"));

function LoginRoute() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="bg-background p-8 min-h-screen text-muted-foreground text-sm" role="status">
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
                <h2 className="font-semibold text-2xl tracking-tight">Dashboard</h2>

                <p className="mt-2 text-muted-foreground text-sm">
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
            <h2 className="font-semibold text-2xl tracking-tight">Page not found</h2>
            <p className="mt-2 text-muted-foreground text-sm">The page you are looking for does not exist.</p>
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
        <Suspense fallback={<Loader className="animate-spin" />}>
            <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route element={<AppLayout />}>
                    <Route path="/" element={<PortalHome />} />
                    <Route
                        path="/qr-studio"
                        element={
                            <ProtectedRoute>
                                <QRCodeStudio />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/qr-studio/links"
                        element={
                            <ProtectedRoute>
                                <QRLinks />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/qr-studio/saved"
                        element={
                            <ProtectedRoute>
                                <SavedQRCodes />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/image-converter"
                        element={
                            <ProtectedRoute>
                                <ImageConverter />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/attendance"
                        element={
                            <ProtectedRoute>
                                <Attendance />
                            </ProtectedRoute>
                        }
                    />
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
                    <Route
                        path="/network-monitor"
                        element={
                            <ProtectedRoute requiredRole="admin">
                                <NetworkMonitor />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/track/:ticketNumber" element={<TrackTicket />} />
                    <Route path="/report" element={<ReportIssue />} />
                    <Route
                        path="/sheet"
                        element={
                            <ProtectedRoute>
                                <Sheet />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </Suspense>
    );
}

export default App;
