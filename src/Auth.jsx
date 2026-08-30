import { useState, useEffect } from "react";
import smartTaskLogo from "./assets/smarttaskflow-logo.png";

const API_URL = "http://localhost:5000/api";

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | signup | forgot | reset

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [resetForm, setResetForm] = useState({
    password: "",
    confirmPassword: "",
  });

  const [resetToken, setResetToken] = useState(null);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  // Check the URL for a reset token when the page loads
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      setResetToken(token);
      setMode("reset");
    }
  }, []);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

    setError("");
  };

  const handleResetChange = (e) => {
    setResetForm({
      ...resetForm,
      [e.target.name]: e.target.value,
    });

    setError("");
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setInfo("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSignup && !form.name.trim()) {
      setError("Name is required.");
      return;
    }

    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!form.password) {
      setError("Password is required.");
      return;
    }

    if (isSignup && form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `${API_URL}/auth/${isSignup ? "signup" : "login"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            isSignup
              ? {
                  name: form.name,
                  email: form.email,
                  password: form.password,
                }
              : {
                  email: form.email,
                  password: form.password,
                }
          ),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Something went wrong."
        );
      }

      localStorage.setItem(
        "smartTaskflowToken",
        result.data.token
      );

      localStorage.setItem(
        "smartTaskflowUser",
        JSON.stringify(result.data.user)
      );

      onLogin(result.data.user, result.data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();

    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setInfo("");

      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: form.email }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Something went wrong.");
      }

      setInfo(
        result.message ||
          "If that email exists, a reset link has been sent."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();

    if (!resetForm.password) {
      setError("New password is required.");
      return;
    }

    if (resetForm.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (resetForm.password !== resetForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: resetToken,
          password: resetForm.password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Something went wrong.");
      }

      setInfo("Password reset successfully. You can now log in.");

      // Clear the token from the URL and go back to login
      window.history.replaceState({}, "", window.location.pathname);
      setResetToken(null);

      setTimeout(() => {
        switchMode("login");
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------- FORGOT PASSWORD VIEW ----------------
  if (mode === "forgot") {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-logo">
            <img src={smartTaskLogo} alt="Smart TaskFlow Logo" />
          </div>

          <h1>Smart TaskFlow</h1>

          <p className="auth-subtitle">Reset your password</p>

          <form onSubmit={handleForgotSubmit}>
            <div className="auth-field">
              <label htmlFor="forgot-email">Email</label>

              <input
                id="forgot-email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Enter your account email"
                autoComplete="email"
              />
            </div>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            {info && (
              <p className="auth-info" role="status">
                {info}
              </p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <div className="auth-switch">
            Remembered your password?
            <button type="button" onClick={() => switchMode("login")}>
              Back to Login
            </button>
          </div>
        </section>
      </main>
    );
  }

  // ---------------- RESET PASSWORD VIEW ----------------
  if (mode === "reset") {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-logo">
            <img src={smartTaskLogo} alt="Smart TaskFlow Logo" />
          </div>

          <h1>Smart TaskFlow</h1>

          <p className="auth-subtitle">Choose a new password</p>

          <form onSubmit={handleResetSubmit}>
            <div className="auth-field">
              <label htmlFor="new-password">New Password</label>

              <input
                id="new-password"
                name="password"
                type="password"
                value={resetForm.password}
                onChange={handleResetChange}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="confirm-password">Confirm Password</label>

              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                value={resetForm.confirmPassword}
                onChange={handleResetChange}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            {info && (
              <p className="auth-info" role="status">
                {info}
              </p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
            >
              {loading ? "Saving..." : "Reset Password"}
            </button>
          </form>

          <div className="auth-switch">
            <button type="button" onClick={() => switchMode("login")}>
              Back to Login
            </button>
          </div>
        </section>
      </main>
    );
  }

  // ---------------- LOGIN / SIGNUP VIEW ----------------
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-logo">
          <img src={smartTaskLogo} alt="Smart TaskFlow Logo" />
        </div>

        <h1>Smart TaskFlow</h1>

        <p className="auth-subtitle">
          {isSignup
            ? "Create your account"
            : "Welcome back"}
        </p>

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div className="auth-field">
              <label htmlFor="name">Name</label>

              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter your name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Enter your email"
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              autoComplete={
                isSignup
                  ? "new-password"
                  : "current-password"
              }
            />
          </div>

          {!isSignup && (
            <div className="auth-forgot-link">
              <button
                type="button"
                className="auth-link-button"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isSignup
              ? "Create Account"
              : "Login"}
          </button>
        </form>

        <div className="auth-switch">
          {isSignup
            ? "Already have an account?"
            : "Don't have an account?"}

          <button
            type="button"
            onClick={() => {
              switchMode(isSignup ? "login" : "signup");
            }}
          >
            {isSignup ? "Login" : "Sign Up"}
          </button>
        </div>
      </section>
    </main>
  );
}