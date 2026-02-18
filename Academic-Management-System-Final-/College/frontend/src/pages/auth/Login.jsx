import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, Mail } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { toast, ToastContainer } from "react-toastify";
import { useAuth } from "./AuthContext"; 
import API from "../../api"; 

const InputField = ({ label, type = "text", icon: Icon, value, onChange, placeholder, showPassword, setShowPassword }) => (
  <div className="space-y-2">
    <label className="text-sm font-semibold text-gray-700">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />}
      <input
        type={type === "password" && showPassword ? "text" : type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        className={`w-full ${type === "password" ? "pl-12 pr-12" : "pl-12 pr-4"} py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all bg-gray-50 focus:bg-white`}
      />
      {type === "password" && (
        <button 
          type="button" 
          onClick={() => setShowPassword(!showPassword)} 
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      )}
    </div>
  </div>
);

const Login = () => {
  const [identifier, setIdentifier] = useState(""); 
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user, refresh, loading } = useAuth();
  const navigate = useNavigate();

  const handleRedirect = (role) => {
    if (!role) {
      toast.error("No role assigned. Please contact support.");
      navigate("/not-found");
      return;
    }

    const r = role.toLowerCase().trim();

    // Super Admin & Admin variants → admin dashboard
    if (
      r.includes("admin") || 
      r === "superadmin" || 
      r === "super admin" || 
      r === "super-admin"
    ) {
      navigate("/admin/dashboard");
      return;
    }

    // Student
    if (r === "student") {
      navigate("/student/dashboard");
      return;
    }

    // Staff / Teaching staff / Faculty variants
    if (
      r.includes("staff") ||
      r === "teaching staff" ||
      r === "teacher" ||
      r.includes("faculty") ||
      r === "teaching faculty"
    ) {
      navigate("/staff/dashboard");
      return;
    }

    // Fallback for unknown roles
    toast.warn(`Unknown role: "${role}". Redirected to not found page.`);
    navigate("/not-found");
  };

  useEffect(() => {
    if (!loading && user) {
      handleRedirect(user.role);
    }
  }, [user, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data } = await API.post("/auth/login", { 
        identifier, 
        password 
      });

      if (data.token) {
        localStorage.setItem("token", data.token);
        await refresh();           // This updates the user in context
        toast.success("Login Successful");
        // No need to call handleRedirect here — useEffect will handle it
      }
    } catch (err) {
      toast.error(err.response?.data?.msg || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (resp) => {
    try {
      const { data } = await API.post("/auth/google-login", { token: resp.credential });
      localStorage.setItem("token", data.token);
      await refresh();
      toast.success("Google Login Successful");
      // Again — useEffect will redirect based on role
    } catch (err) {
      toast.error(err.response?.data?.msg || "Google Login Failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      <div className="hidden lg:flex w-1/2 bg-blue-600 items-center justify-center p-12">
        <img src="/4583.jpg" alt="National Engineering College Illustration" className="max-w-md rounded-2xl shadow-2xl" />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold">National Engineering College</h1>
            <p className="text-gray-500">Academic Portal Login</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg border space-y-6">
            <InputField 
              label="Email / User Number" 
              icon={Mail} 
              value={identifier} 
              onChange={(e) => setIdentifier(e.target.value)} 
              placeholder="Enter your Email or Student ID" 
            />
            <InputField 
              label="Password" 
              type="password" 
              icon={Lock} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••" 
              showPassword={showPassword} 
              setShowPassword={setShowPassword} 
            />

            <button 
              disabled={isLoading} 
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>

            <div className="flex justify-center mt-4">
              <GoogleLogin 
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error("Google login failed")}
                useOneTap={false}
                theme="outline"
                size="large"
              />
            </div>
          </form>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={4000} />
    </div>
  );
};

export default Login;