import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function ProtectedRoute({ children, requiredRole, unauthorizedTo = "/" }) {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Checking your session…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (requiredRole && user.role !== requiredRole) return <Navigate to={unauthorizedTo} replace />;
    return children;
}
