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
        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
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
    if (!role) return;
    const r = role.toLowerCase();
    if (r.includes("admin")) navigate("/admin/dashboard");
    else if (r === "staff") navigate("/staff/dashboard");
    else if (r === "student") navigate("/student/dashboard");
    else navigate("/userDashboard");
  };

  useEffect(() => {
    if (!loading && user) handleRedirect(user.role);
  }, [user, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Match this payload to your backend. 
      // If your backend expects 'email', change 'identifier' to 'email'.
      const { data } = await API.post("/auth/login", { 
        email: identifier, 
        password 
      });

      if (data.token || (data.data && data.data.token)) {
        const token = data.token || data.data.token;
        localStorage.setItem("token", token);
        await refresh();
        toast.success("Login Successful");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
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
    } catch (err) {
      toast.error("Google Login Failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      <div className="hidden lg:flex w-1/2 bg-blue-600 items-center justify-center p-12">
        <img src="/4583.jpg" alt="Logo" className="max-w-md rounded-2xl shadow-2xl" />
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
                placeholder="Enter your ID" 
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

            <button disabled={isLoading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all">
              {isLoading ? "Signing in..." : "Sign In"}
            </button>

            <div className="flex justify-center">
              <GoogleLogin onSuccess={handleGoogleSuccess} />
            </div>
          </form>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};

export default Login;