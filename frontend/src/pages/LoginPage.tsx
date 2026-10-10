import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (user) return <Navigate to="/dashboard" replace />;

    return (
        <div className="min-h-screen bg-bg flex">
            {/* Left panel */}
            <div className="hidden lg:flex flex-col justify-between w-1/2 bg-surface border-r border-border p-14">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.5" />
                        </svg>
                    </div>
                    <span className="font-semibold text-white text-base tracking-tight">Taskloom</span>
                </div>

                <div className="space-y-10">
                    <div>
                        <p className="text-xs font-semibold text-accent uppercase tracking-widest mb-4">
                            Project Management
                        </p>
                        <h2 className="text-4xl font-bold text-white leading-tight mb-4">
                            Ship faster.<br />Stay in sync.
                        </h2>
                        <p className="text-slate-400 text-base leading-relaxed max-w-sm">
                            Boards, lists, and cards that update in real time. Built for teams that move fast.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {[
                            "Real-time updates across all connected sessions",
                            "Role-based access at workspace and board level",
                            "Drag and drop cards and lists with live sync",
                            "Comments, descriptions, and member assignment",
                        ].map((text) => (
                            <div key={text} className="flex items-start gap-3">
                                <div className="mt-0.5 w-4 h-4 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
                                    <svg width="8" height="8" fill="none" viewBox="0 0 8 8">
                                        <path d="M1.5 4l1.8 1.8L6.5 2" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                                <p className="text-slate-400 text-sm">{text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="text-slate-700 text-xs">© 2026 Taskloom</p>
            </div>

            {/* Right panel */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-sm">
                    {/* Mobile logo */}
                    <div className="flex items-center gap-2 mb-12 lg:hidden">
                        <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                                <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                                <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.5" />
                            </svg>
                        </div>
                        <span className="font-semibold text-white text-base tracking-tight">Taskloom</span>
                    </div>

                    <h1 className="text-3xl font-bold text-white mb-1.5 tracking-tight">Welcome back</h1>
                    <p className="text-slate-500 text-sm mb-10">Sign in to continue to your workspace</p>

                    <a
                        href={`${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/auth/google`}
                        className="flex items-center justify-center gap-3 w-full bg-white text-gray-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-50 transition-all duration-150 shadow-lg shadow-black/30"
                    >
                        <svg width="18" height="18" viewBox="0 0 20 20">
                            <path d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.77h5.4a4.63 4.63 0 01-2 3.04v2.52h3.23c1.89-1.74 2.97-4.31 2.97-7.33z" fill="#4285F4" />
                            <path d="M10 20c2.7 0 4.97-.9 6.62-2.44l-3.23-2.52c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H1.1v2.6A9.99 9.99 0 0010 20z" fill="#34A853" />
                            <path d="M4.41 11.88A5.94 5.94 0 014.1 10c0-.65.11-1.28.31-1.88V5.52H1.1A10 10 0 000 10c0 1.61.38 3.14 1.1 4.48l3.31-2.6z" fill="#FBBC05" />
                            <path d="M10 3.96c1.47 0 2.78.5 3.82 1.5l2.86-2.86C14.96.9 12.7 0 10 0A9.99 9.99 0 001.1 5.52l3.31 2.6C5.2 5.72 7.4 3.96 10 3.96z" fill="#EA4335" />
                        </svg>
                        Continue with Google
                    </a>

                    <p className="text-center text-slate-600 text-xs mt-8">
                        By signing in, you agree to our terms of service
                    </p>
                </div>
            </div>
        </div>
    );
}
