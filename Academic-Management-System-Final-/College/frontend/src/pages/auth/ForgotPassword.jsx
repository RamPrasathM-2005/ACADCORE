// pages/ForgotPassword.jsx
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import API from "../../api";
import { toast } from "react-toastify";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email) {
      return toast.error("Please enter your email");
    }

    setLoading(true);
    try {
      await API.post("/auth/forgot-password", { email });
      toast.success("If the email exists, a reset link has been sent");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Something went wrong");
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
          Forgot Password
        </h2>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-lg border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your registered email"
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
            {loading ? "Sending..." : "Send Reset Link"}
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