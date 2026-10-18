import { useCallback, useEffect, useState } from "react";
import { api } from "../utils/api";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const refreshUser = useCallback(async () => {
        try {
            const result = await api("/api/auth/me");
            setUser(result.user);
            return result.user;
        } catch {
            setUser(null);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => {
        let isCurrent = true;
        api("/api/auth/me")
            .then((result) => { if (isCurrent) setUser(result.user); })
            .catch(() => { if (isCurrent) setUser(null); })
            .finally(() => { if (isCurrent) setIsLoading(false); });
        return () => { isCurrent = false; };
    }, []);
    return <AuthContext.Provider value={{ user, isLoading, refreshUser, setUser }}>{children}</AuthContext.Provider>;
}

