import { createContext, useContext, useEffect, useState } from "react";
import API from "../../api";
import { setCurrentUser } from "../../services/authService";

const AuthContext = createContext(null);

const sanitizeUser = (user = {}) => ({
  userId: user.userId ?? user.id ?? null,
  id: user.id ?? user.userId ?? null,
  username: user.username ?? user.userName ?? null,
  userName: user.userName ?? user.username ?? null,
  staffId: user.staffId ?? null,
  departmentId: user.departmentId ?? null,
  role: typeof user.role === "string" ? user.role : null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
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
      const safeUser = sanitizeUser(merged);

      setUser(safeUser);
      setCurrentUser(safeUser);
      return safeUser;
    } catch (error) {
      console.error("Auth Refresh Error:", error);
      setUser(null);
      setCurrentUser(null);
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
