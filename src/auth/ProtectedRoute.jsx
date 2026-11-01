import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function ProtectedRoute({ children, requiredRole, unauthorizedTo = "/" }) {
    const { user, isLoading } = useAuth();
    const location = useLocation();
    if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Checking your session…</div>;
    if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} replace />;
    // Administrators inherit access to routes available to any other role.
    if (requiredRole && user.role !== requiredRole && user.role !== "admin") {
        return <Navigate to={unauthorizedTo} replace />;
    }
    return children;
}
