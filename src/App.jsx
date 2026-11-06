import { Navigate, Outlet, Route, Routes, useLocation, matchPath } from "react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Loader } from "lucide-react";
import { useAuth } from "./auth/useAuth";
import AppShell from "./components/layout/AppShell";
import ProtectedRoute from "./auth/ProtectedRoute";
import { cx } from "./utils/cx";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { consumeSocialReturn, loginDestination, readSocialReturn } from "./auth/loginDestination";

const QRCodeStudio = lazy(() => import("./pages/qr/QRCodeStudio"));
const QRLinks = lazy(() => import("./pages/qr/QRLinks"));
const SavedQRCodes = lazy(() => import("./pages/qr/SavedQRCodes"));
const VideoConverter = lazy(() => import("./pages/VideoConverter"));
const ImageConverter = lazy(() => import("./pages/ImageConverter"));
const PDFStudio = lazy(() => import("./pages/pdf/PDFStudio"));

const DashboardStats = lazy(() => import("./components/dashboard/DashboardStats"));
const RecentIssues = lazy(() => import("./components/dashboard/RecentIssues"));
const ReportIssue = lazy(() => import("./pages/ReportIssue"));
const Issues = lazy(() => import("./pages/Issues"));
const IssueDetail = lazy(() => import("./pages/IssueDetail"));
const PortalHome = lazy(() => import("./pages/PortalHome"));
const LoginRegister = lazy(() => import("./pages/LoginRegister"));
const TrackTicket = lazy(() => import("./pages/TrackTicket"));
const Sheet = lazy(() => import("./pages/Sheet"));
const StorageImages = lazy(() => import("./pages/StorageImages"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Documentation = lazy(() => import("./pages/Documentation"));
const NetworkMonitor = lazy(() => import("./pages/NetworkMonitor"));

function LoginRoute({ page, setPage }) {
    const { user, isLoading } = useAuth();
    const location = useLocation();
    const socialReturn = readSocialReturn();
    useEffect(() => {
        if (user) consumeSocialReturn();
    }, [user]);

    if (isLoading) {
        return (
            <div className="bg-background p-8 min-h-screen text-muted-foreground text-sm" role="status">
                <Loader className="animate-spin" />
                Checking your session…
            </div>
        );
    }

    if (user) {
        return <Navigate to={loginDestination(location.state?.from || socialReturn, user)} replace />;
    }

    return <LoginRegister page={page} setPage={setPage} />;
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
        <div className={cx("mx-auto max-w-7xl animate-fadeInUp")}>
            <Loader className="animate-spin" />
            <h2 className="font-semibold text-2xl tracking-tight">Page not found</h2>
            <p className="mt-2 text-muted-foreground text-sm">The page you are looking for does not exist.</p>
        </div>
    );
}

function AppLayout() {
    return (
        <AppShell>
            <Suspense fallback={<PageLoading />}>
                <Outlet />
            </Suspense>
        </AppShell>
    );
}

function PageLoading() {
    return (
        <div role="status" className={cx("flex items-center gap-2 p-8 text-sm text-muted-foreground")}>
            <Loader className={cx("size-4 animate-spin")} />
            Loading page…
        </div>
    );
}

const pageTitles = {
    "/": "Home", "/login": "Login", "/dashboard": "Dashboard", "/report": "Report Issue",
    "/issues": "Issues", "/attendance": "Attendance", "/sheet": "Asset inventory",
    "/storage/images": "Image Storage", "/network-monitor": "Network Monitoring",
    "/documentation": "Documentation", "/image-converter": "Image Converter",
    "/video-converter": "Video Converter", "/pdf-studio": "PDF Studio",
    "/qr-studio": "QR Code Studio", "/qr-studio/links": "QR Code Studio",
    "/qr-studio/saved": "QR Code Studio",
};

function App() {
    const { pathname, key } = useLocation();
    const [loginState, setLoginState] = useState({ key, page: "login" });
    const loginPage = loginState.key === key ? loginState.page : "login";
    const setLoginPage = (page) => setLoginState({ key, page });
    const issue = matchPath("/issues/:ticketNumber", pathname);
    const track = matchPath("/track/:ticketNumber", pathname);
    const routeTitle = Object.entries(pageTitles).find(([path]) => matchPath({ path, end: true }, pathname))?.[1];
    const title = issue ? `Issue #${issue.params.ticketNumber}`
        : track ? `Track ${track.params.ticketNumber}`
        : routeTitle === "Login" && loginPage === "register" ? "Register"
        : routeTitle || "Page not found";
    useDocumentTitle(title);

    return (
        <Routes>
            <Route
                path="/login"
                element={
                    <Suspense fallback={<PageLoading />}>
                        <LoginRoute page={loginPage} setPage={setLoginPage} />
                    </Suspense>
                }
            />
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
                <Route path="/video-converter" element={<ProtectedRoute><VideoConverter /></ProtectedRoute>} />
                <Route
                    path="/pdf-studio"
                    element={
                        <ProtectedRoute>
                            <PDFStudio />
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
                <Route path="/documentation" element={<ProtectedRoute requiredRole="admin"><Documentation /></ProtectedRoute>} />
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
    );
}

export default App;
