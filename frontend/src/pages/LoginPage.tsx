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
            {/* Left panel - branding */}
            <div className="hidden lg:flex flex-col justify-between w-1/2 bg-surface border-r border-border p-12">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.5" />
                        </svg>
                    </div>
                    <span className="font-semibold text-white text-lg">Taskloomm</span>
                </div>

                <div>
                    <blockquote className="text-2xl font-medium text-white leading-relaxed mb-6">
                        "The tool your team actually wants to use."
                    </blockquote>
                    <div className="flex flex-col gap-6">
                        {[
                            { icon: "⚡", text: "Real-time collaboration — see changes as they happen" },
                            { icon: "🔐", text: "Role-based access at workspace and board level" },
                            { icon: "📋", text: "Boards, lists, cards, comments — everything in one place" },
                        ].map((item) => (
                            <div key={item.text} className="flex items-start gap-3">
                                <span className="text-xl mt-0.5">{item.icon}</span>
                                <p className="text-slate-400 text-sm leading-relaxed">{item.text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="text-slate-600 text-xs">© 2026 Taskloomm</p>
            </div>

            {/* Right panel - login */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-sm">
                    {/* Mobile logo */}
                    <div className="flex items-center gap-2 mb-10 lg:hidden">
                        <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                                <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                                <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.5" />
                            </svg>
                        </div>
                        <span className="font-semibold text-white text-lg">Taskloomm</span>
                    </div>

                    <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
                    <p className="text-slate-400 mb-10">Sign in to your workspace</p>

                    <a
                        href="http://localhost:3000/auth/google"
                        className="flex items-center justify-center gap-3 w-full bg-white text-gray-800 font-medium py-3 px-4 rounded-xl hover:bg-gray-100 transition-all duration-150 shadow-lg shadow-black/20"
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20">
                            <path d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.77h5.4a4.63 4.63 0 01-2 3.04v2.52h3.23c1.89-1.74 2.97-4.31 2.97-7.33z" fill="#4285F4"/>
                            <path d="M10 20c2.7 0 4.97-.9 6.62-2.44l-3.23-2.52c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H1.1v2.6A9.99 9.99 0 0010 20z" fill="#34A853"/>
                            <path d="M4.41 11.88A5.94 5.94 0 014.1 10c0-.65.11-1.28.31-1.88V5.52H1.1A10 10 0 000 10c0 1.61.38 3.14 1.1 4.48l3.31-2.6z" fill="#FBBC05"/>
                            <path d="M10 3.96c1.47 0 2.78.5 3.82 1.5l2.86-2.86C14.96.9 12.7 0 10 0A9.99 9.99 0 001.1 5.52l3.31 2.6C5.2 5.72 7.4 3.96 10 3.96z" fill="#EA4335"/>
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
