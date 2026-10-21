import { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Sparkles, ArrowLeft } from "lucide-react";
import ElectricBorder from "../components/ElectricBorder";
import { api } from "../utils/api";
import { useAuth } from "../auth/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function LoginRegister() {
    const navigate = useNavigate();
    const { setUser } = useAuth();

    // Page mode: 'login' | 'register'
    const [page, setPage] = useState("login");

    // Form states - Login
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [showLoginPassword, setShowLoginPassword] = useState(false);

    // Form states - Register
    const [regName, setRegName] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [showRegPassword, setShowRegPassword] = useState(false);

    // Feedback toast message state
    const [toastMessage, setToastMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    
    const triggerToast = useCallback((msg) => {
        setToastMessage(msg);
        window.setTimeout(() => setToastMessage(""), 3000);
    }, []);
    useDocumentTitle(page === "login" ? "Login" : "Register");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const reason = params.get("social_error");
        if (!reason) return;
        const messages = {
            unconfigured: "Social sign-in is not configured yet. Please use email and password.",
            configuration: "Facebook Graph API version is invalid. Set it to a version such as v26.0.",
            cancelled: "Sign-in was cancelled.",
            state: "Sign-in could not be verified. Please try again.",
            email: "The provider did not return a verified email address.",
            inactive: "This account is disabled. Contact an administrator.",
            account_exists: "An account already uses this email. Sign in with your password first; social account linking is not enabled.",
            provider: "This sign-in provider is not supported.",
            token: "Could not verify your account with the provider. Please try again.",
            profile: "Could not retrieve your provider profile. Please try again.",
            provider_error: "Facebook rejected the sign-in request. Check the Facebook Login app settings and callback URL.",
            failed: "Social sign-in failed. Please try again.",
        };
        const toastTimer = window.setTimeout(() => triggerToast(messages[reason] || messages.failed), 0);
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
        return () => window.clearTimeout(toastTimer);
    }, [triggerToast]);

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        if (!loginEmail.trim() || !loginPassword) {
            triggerToast("Please fill in all fields.");
            return;
        }
        setIsSubmitting(true);
        try {
            const result = await api("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: loginEmail, password: loginPassword }),
            });
            setUser(result.user);
            triggerToast(`Welcome back, ${result.user.name}!`);
            navigate(result.user.role === "admin" ? "/dashboard" : "/", { replace: true });
        } catch (error) {
            triggerToast(error.message || "Unable to sign in. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        if (!regName.trim() || !regEmail.trim() || !regPassword) {
            triggerToast("Please fill in all required fields.");
            return;
        }
        setIsSubmitting(true);
        try {
            await api("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: regName, email: regEmail, password: regPassword }),
            });
            setPage("login");
            setLoginEmail(regEmail.trim());
            setLoginPassword("");
            setRegPassword("");
            triggerToast("Account created. Sign in with your new account.");
        } catch (error) {
            triggerToast(error.message || "Unable to create your account. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSocialAuth = (provider) => {
        if (isSubmitting) return;
        const normalizedProvider = provider.toLowerCase();
        if (!["google", "facebook"].includes(normalizedProvider)) {
            triggerToast("This sign-in provider is not supported.");
            return;
        }
        setIsSubmitting(true);
        window.location.assign(`/api/auth/oauth?provider=${normalizedProvider}`);
    };

    return (
        <div className="min-h-screen bg-[#0a0d1a] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-cyan-500 selection:text-white">
            {/* Background Animated Gradient Blobs */}
            <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Grid Pattern Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

            {/* Floating Notification Toast */}
            {toastMessage && (
                <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-slate-900/90 border border-cyan-500/40 text-cyan-300 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md animate-bounce">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                    <span className="text-sm font-medium">{toastMessage}</span>
                </div>
            )}

            {/* Main Container Card */}
            <div className="w-full max-w-md z-10">
                {/* Decorative Top Badge */}
                <div className="flex justify-center mb-6 animate-fadeInDown">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-slate-300 backdrop-blur-md shadow-inner">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span>Secure End-to-End Encryption</span>
                    </div>
                </div>

                {/* Card Body with Glassmorphism */}
                <ElectricBorder
                    color="#4c00b0"
                    speed={1.2}
                    chaos={0.7}
                    spread={0.4}
                    strands={0.3}
                    thickness={1.2}
                    borderRadius={24}
                >
                    <div className="relative bg-slate-900/70 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-500 hover:border-slate-700/80">
                        {/* Neon Top Edge Accent */}
                        <div className="absolute -top-[1px] left-12 right-12 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-purple-500 rounded-full" />

                        {/* PAGE 1: LOGIN FORM */}
                        {page === "login" && (
                            <div className="animate-fadeInLeft">
                                <div className="text-center mb-8">
                                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                                        Welcome Back
                                    </h1>
                                    <p className="text-sm text-slate-400 mt-2">
                                        Enter your credentials to access your account
                                    </p>
                                </div>

                                <form onSubmit={handleLoginSubmit} className="space-y-5">
                                    {/* Email / Username Field */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                            Email or Username
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                                <Mail className="w-5 h-5" />
                                            </div>
                                            <input
                                                type="email"
                                                autoComplete="email"
                                                value={loginEmail}
                                                onChange={(e) => setLoginEmail(e.target.value)}
                                                placeholder="name@company.com"
                                                className="w-full pl-11 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-200"
                                            />
                                        </div>
                                    </div>

                                    {/* Password Field */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                                Password
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => triggerToast("Password reset link sent to your email.")}
                                                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium hover:underline cursor-pointer"
                                            >
                                                Forgot Password?
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                                <Lock className="w-5 h-5" />
                                            </div>
                                            <input
                                                type={showLoginPassword ? "text" : "password"}
                                                value={loginPassword}
                                                onChange={(e) => setLoginPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full pl-11 pr-11 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowLoginPassword(!showLoginPassword)}
                                                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                            >
                                                {showLoginPassword ? (
                                                    <EyeOff className="w-5 h-5" />
                                                ) : (
                                                    <Eye className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Primary Gradient Login Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full py-3.5 px-4 mt-2 bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-600 hover:from-cyan-400 hover:via-indigo-400 hover:to-purple-500 text-white font-semibold rounded-2xl shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
                                    >
                                        <span>{isSubmitting ? "PLEASE WAIT…" : "LOGIN"}</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </form>

                                {/* Divider */}
                                <div className="relative my-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-800" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-slate-900/90 px-3 text-slate-500 tracking-wider font-medium">
                                            Or sign in with
                                        </span>
                                    </div>
                                </div>

                                {/* Social Buttons */}
                                <div className="space-y-3">
                                    {/* Google Sign In */}
                                    <button
                                        type="button"
                                        onClick={() => handleSocialAuth("Google")}
                                        className="w-full py-3 px-4 bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium rounded-2xl text-sm transition-all duration-200 flex items-center justify-center gap-3 group cursor-pointer"
                                    >
                                        {/* Google Custom SVG Icon */}
                                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                                            <path
                                                fill="#4285F4"
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            />
                                            <path
                                                fill="#34A853"
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            />
                                            <path
                                                fill="#FBBC05"
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                                            />
                                            <path
                                                fill="#EA4335"
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                                            />
                                        </svg>
                                        <span>Continue with Google</span>
                                    </button>

                                    {/* Facebook Sign In */}
                                    <button
                                        type="button"
                                        onClick={() => handleSocialAuth("Facebook")}
                                        className="w-full py-3 px-4 bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium rounded-2xl text-sm transition-all duration-200 flex items-center justify-center gap-3 group"
                                    >
                                        {/* Facebook SVG Icon */}
                                        <svg className="w-5 h-5 fill-[#1877F2]" viewBox="0 0 24 24">
                                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                        </svg>
                                        <span>Continue with Facebook</span>
                                    </button>
                                </div>

                                {/* Bottom Switcher Link */}
                                <div className="mt-8 text-center">
                                    <p className="text-sm text-slate-400">
                                        Don't have an account?{" "}
                                        <button
                                            type="button"
                                            onClick={() => setPage("register")}
                                            className="text-cyan-400 font-semibold hover:text-cyan-300 hover:underline transition-colors ml-1 cursor-pointer"
                                        >
                                            Register
                                        </button>
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* PAGE 2: REGISTER FORM */}
                        {page === "register" && (
                            <div className="animate-fadeInRight">
                                <div className="text-center mb-8">
                                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                                        Create Account
                                    </h1>
                                    <p className="text-sm text-slate-400 mt-2">
                                        Join our community with a few simple steps
                                    </p>
                                </div>

                                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                                    {/* Full Name Field */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                            Full Name
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                                <User className="w-5 h-5" />
                                            </div>
                                            <input
                                                type="text"
                                                value={regName}
                                                onChange={(e) => setRegName(e.target.value)}
                                                placeholder="Alpha Beta"
                                                className="w-full pl-11 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-200"
                                            />
                                        </div>
                                    </div>

                                    {/* Email Field */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                            Email Address
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                                <Mail className="w-5 h-5" />
                                            </div>
                                            <input
                                                type="email"
                                                value={regEmail}
                                                onChange={(e) => setRegEmail(e.target.value)}
                                                placeholder="email@company.com"
                                                className="w-full pl-11 pr-4 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-200"
                                            />
                                        </div>
                                    </div>

                                    {/* Password Field */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                            Password
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                                <Lock className="w-5 h-5" />
                                            </div>
                                            <input
                                                type={showRegPassword ? "text" : "password"}
                                                minLength={12}
                                                maxLength={128}
                                                autoComplete="new-password"
                                                value={regPassword}
                                                onChange={(e) => setRegPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full pl-11 pr-11 py-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowRegPassword(!showRegPassword)}
                                                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                            >
                                                {showRegPassword ? (
                                                    <EyeOff className="w-5 h-5" />
                                                ) : (
                                                    <Eye className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Primary Gradient Register Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full py-3.5 px-4 mt-2 bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-500 hover:from-purple-500 hover:via-indigo-400 hover:to-cyan-400 text-white font-semibold rounded-2xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
                                    >
                                        <span>{isSubmitting ? "PLEASE WAIT…" : "REGISTER"}</span>
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </form>

                                {/* Divider */}
                                <div className="relative my-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-800" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-slate-900/90 px-3 text-slate-500 tracking-wider font-medium">
                                            Or register with
                                        </span>
                                    </div>
                                </div>

                                {/* Social Buttons */}
                                <div className="space-y-3">
                                    {/* Google Register */}
                                    <button
                                        type="button"
                                        onClick={() => handleSocialAuth("Google")}
                                        className="w-full py-3 px-4 bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium rounded-2xl text-sm transition-all duration-200 flex items-center justify-center gap-3 group cursor-pointer"
                                    >
                                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                                            <path
                                                fill="#4285F4"
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                            />
                                            <path
                                                fill="#34A853"
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                            />
                                            <path
                                                fill="#FBBC05"
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                                            />
                                            <path
                                                fill="#EA4335"
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                                            />
                                        </svg>
                                        <span>Sign up with Google</span>
                                    </button>

                                    {/* Facebook Register */}
                                    <button
                                        type="button"
                                        onClick={() => handleSocialAuth("Facebook")}
                                        className="w-full py-3 px-4 bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium rounded-2xl text-sm transition-all duration-200 flex items-center justify-center gap-3 group cursor-pointer"
                                    >
                                        <svg className="w-5 h-5 fill-[#1877F2]" viewBox="0 0 24 24">
                                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                        </svg>
                                        <span>Sign up with Facebook</span>
                                    </button>
                                </div>

                                {/* Bottom Switcher Link */}
                                <div className="mt-8 text-center">
                                    <p className="text-sm text-slate-400">
                                        Already have an account?{" "}
                                        <button
                                            type="button"
                                            onClick={() => setPage("login")}
                                            className="text-purple-400 font-semibold hover:text-purple-300 hover:underline transition-colors ml-1 cursor-pointer"
                                        >
                                            Login
                                        </button>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </ElectricBorder>
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-500 mt-4 animate-fadeInLeft"
                >
                    <ArrowLeft size={16} className="animate-bounceLeft transition-all" />
                    กลับหน้าหลัก
                </Link>
                {/* Footer info */}
                <div className="mt-6 text-center text-xs text-slate-500 animate-fadeInRight">
                    <p>© 2026 GhuniNew. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
}
