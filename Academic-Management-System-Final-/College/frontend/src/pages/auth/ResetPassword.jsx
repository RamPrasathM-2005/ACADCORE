// pages/ResetPassword.jsx
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import API from "../../api";
import { toast } from "react-toastify";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { token } = useParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!password || !confirmPassword) {
      return toast.error("Please enter and confirm your new password");
    }

    if (password !== confirmPassword) {
      return toast.error("Passwords do not match");
    }

    if (password.length < 8) {
      return toast.error("Password must be at least 8 characters");
    }

    setLoading(true);
    try {
      await API.post(`/auth/reset-password/${token}`, {
        password,
        confirmPassword,
      });

      toast.success("Password reset successful! Please log in.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Reset failed. Token may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-purple-100 to-gray-100 relative">
      {loading && <LoadingScreen />}

      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-4xl font-extrabold text-center text-gray-800 mb-2">
          Staff Attendance & Payroll
        </h1>
        <h2 className="text-xl font-semibold text-center text-gray-600 mb-6">
          Reset Password
        </h2>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-lg border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter new password"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 rounded-lg border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Confirm new password"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition ${
              loading ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </div>

        <p className="mt-6 text-center text-sm">
          <button
            onClick={() => navigate("/login")}
            className="text-blue-600 hover:underline"
            disabled={loading}
          >
            Back to Login
          </button>
        </p>
      </div>
    </div>
  );
}