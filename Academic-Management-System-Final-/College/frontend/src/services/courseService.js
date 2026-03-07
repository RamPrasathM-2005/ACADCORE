import API from '../api';

const api = API;

let currentUser = null;

const sanitizeUser = (user = {}) => ({
  userId: user.userId ?? user.id ?? null,
  id: user.id ?? user.userId ?? null,
  username: user.username ?? user.userName ?? null,
  userName: user.userName ?? user.username ?? null,
  staffId: user.staffId ?? null,
  departmentId: user.departmentId ?? null,
  role: user.role ? String(user.role).toLowerCase() : null,
});

export const setCurrentUser = (user) => {
  currentUser = user ? sanitizeUser(user) : null;
};

export const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    const payload = response.data?.data || response.data;
    const user = payload?.user;
    if (!user) throw new Error(response.data?.message || 'Login failed');
    const safeUser = sanitizeUser(user);
    setCurrentUser(safeUser);
    return safeUser;
  } catch (error) {
    console.error('Login API error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Invalid email or password');
  }
};

export const register = async (username, email, password, role, departmentId, staffId) => {
  const response = await api.post('/auth/register', {
    username,
    email,
    password,
    role: role.toLowerCase(),
    departmentId,
    staffId: staffId ? parseInt(staffId) : null,
  });
  if (response.data.status === 'success') {
    const { user } = response.data.data;
    const safeUser = sanitizeUser(user);
    setCurrentUser(safeUser);
    return safeUser;
  }
  throw new Error(response.data.message || 'Registration failed');
};

export const forgotPassword = async (email) => {
  const response = await api.post('/auth/forgot-password', { email });
  if (response.data.status !== 'success') {
    throw new Error(response.data.message || 'Failed to send reset email');
  }
  return response.data.message || 'Reset email sent successfully';
};

export const resetPassword = async (token, password) => {
  const response = await api.post(`/auth/reset-password/${token}`, { password });
  if (response.data.status !== 'success') {
    throw new Error(response.data.message || 'Password reset failed');
  }
  setCurrentUser(null);
  return response.data.message || 'Password reset successfully';
};

export const logout = async () => {
  try {
    // 1. Tell the backend to clear the cookie
    await api.post("/auth/logout");
  } catch (err) {
    console.error("Logout API error:", err);
  } finally {
    setCurrentUser(null);
    window.location.href = "/login";
  }
};

export const getCurrentUser = () => {
  return currentUser;
};

export const getDepartments = async () => {
  const response = await api.get('/departments');
  if (response.data.status === 'success') {
    return response.data.data.map(dept => ({
      departmentId: dept.departmentId,
      departmentName: dept.departmentName || dept.Deptname,
      departmentAcr: dept.departmentAcr || dept.Deptacronym,
      deptCode: dept.departmentAcr || dept.Deptacronym,
      Deptname: dept.departmentName || dept.Deptname,
      Deptacronym: dept.departmentAcr || dept.Deptacronym,
    }));
  } else {
    throw new Error(response.data.message || 'Failed to fetch departments');
  }
};

export { api };
