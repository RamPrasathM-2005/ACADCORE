
import { getCurrentUser } from "../services/authService.js";

export const isAuthenticated = () => {
  const user = getCurrentUser();
  return user !== null;
};

export const getUserRole = () => {
  const user = getCurrentUser();
  return user ? user.role : null;
};

export const getUserId = () => {
  const user = getCurrentUser();
  return user ? (user.Userid || user.userId || user.id) : null; // Assumes JWT payload has 'id' field matching Userid
};
