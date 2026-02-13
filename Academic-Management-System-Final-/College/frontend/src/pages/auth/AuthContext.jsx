import { createContext, useContext, useEffect, useState } from "react";
import API from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      // 1. Get basic info from /auth/me
      const { data } = await API.get("/auth/me");
      const me = data.user || data; 

      // 2. Get full profile info (using me.userId or me.id)
      const userId = me.userId || me.id;
      const { data: userDetail } = await API.get(`/users/${userId}`);
      
      const merged = {
        ...userDetail,
        role: me.role ? me.role.toLowerCase() : userDetail.role.toLowerCase(),
      };

      setUser(merged);
      localStorage.setItem("user", JSON.stringify(merged));
      return merged;
    } catch (error) {
      console.error("Auth Refresh Error:", error);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}