import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { api, SESSION_EXPIRED_EVENT } from "../api/client";
import type { User } from "../types";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    logout: () => Promise<void>;
    setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // api.auth.me() already refreshes an expired access token by itself
        api.auth.me()
            .then((data) => setUser(data.user))
            .catch(() => setUser(null))
            .finally(() => setLoading(false));

        // The API client fires this when the refresh token is gone/expired mid-session;
        // clearing the user makes ProtectedRoute send them to the login page.
        const onExpired = () => setUser(null);
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }, []);

    const logout = async () => {
        try {
            await api.auth.logout();
        } finally {
            setUser(null); // log out locally even if the request failed
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, logout, setUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
