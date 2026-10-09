import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function InvitePage() {
    const { token } = useParams<{ token: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [details, setDetails] = useState<{
        workspace: { name: string; description?: string };
        email: string;
        role: string;
        expiresAt: string;
    } | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [accepted, setAccepted] = useState(false);

    useEffect(() => {
        if (!token) return;
        api.invites.getDetails(token)
            .then((data) => setDetails(data))
            .catch((err) => setError(err.response?.data?.message || "Invalid or expired invite"))
            .finally(() => setLoading(false));
    }, [token]);

    const handleAccept = async () => {
        if (!token) return;
        setAccepting(true);
        try {
            await api.invites.accept(token);
            setAccepted(true);
            setTimeout(() => navigate(`/dashboard`), 1500);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not accept invite");
        } finally {
            setAccepting(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-sm shadow-2xl">
                {/* Logo */}
                <div className="flex items-center gap-2 mb-8">
                    <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="9" rx="1.5" fill="white" />
                            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                        </svg>
                    </div>
                    <span className="text-white font-semibold text-sm">Taskloom</span>
                </div>

                {loading && (
                    <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {!loading && error && (
                    <div className="text-center">
                        <p className="text-red-400 text-sm mb-4">{error}</p>
                        <button
                            onClick={() => navigate("/")}
                            className="text-accent hover:text-accent-hover text-sm transition-colors"
                        >
                            Go to home
                        </button>
                    </div>
                )}

                {!loading && !error && details && !accepted && (
                    <>
                        <h2 className="text-white text-lg font-semibold mb-1">
                            You're invited!
                        </h2>
                        <p className="text-slate-400 text-sm mb-6">
                            You've been invited to join a workspace on Taskloom.
                        </p>

                        <div className="bg-elevated border border-border rounded-xl p-4 mb-6 space-y-2">
                            <div>
                                <p className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Workspace</p>
                                <p className="text-white font-semibold text-sm">{details.workspace.name}</p>
                                {details.workspace.description && (
                                    <p className="text-slate-400 text-xs mt-0.5">{details.workspace.description}</p>
                                )}
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Role</p>
                                <p className="text-white text-sm capitalize">{details.role.toLowerCase()}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">Invited email</p>
                                <p className="text-white text-sm">{details.email}</p>
                            </div>
                        </div>

                        {!user ? (
                            <div className="text-center">
                                <p className="text-slate-400 text-sm mb-4">
                                    Sign in with the invited email to accept.
                                </p>
                                <button
                                    onClick={() => navigate(`/?invite=${token}`)}
                                    className="w-full bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                                >
                                    Sign in to accept
                                </button>
                            </div>
                        ) : user.email !== details.email ? (
                            <div className="text-center">
                                <p className="text-red-400 text-sm mb-2">
                                    This invite was sent to <strong>{details.email}</strong>.
                                </p>
                                <p className="text-slate-500 text-xs">
                                    You're signed in as {user.email}. Sign in with the correct account to accept.
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={handleAccept}
                                disabled={accepting}
                                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                            >
                                {accepting ? "Joining..." : `Join ${details.workspace.name}`}
                            </button>
                        )}
                    </>
                )}

                {accepted && (
                    <div className="text-center py-4">
                        <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <p className="text-white font-medium text-sm">Joined successfully!</p>
                        <p className="text-slate-500 text-xs mt-1">Redirecting to dashboard...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
