import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:4000/api", // Ensure this matches your backend port (4000)
  withCredentials: true,
});

let refreshPromise = null;
const isAuthPath = (url = "") =>
  url.includes("/auth/login") ||
  url.includes("/auth/google-login") ||
  url.includes("/auth/me") ||
  url.includes("/auth/refresh") ||
  url.includes("/auth/logout") ||
  url.includes("/auth/forgot-password") ||
  url.includes("/auth/reset-password");

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;

    if (status !== 401 || originalRequest._retry || isAuthPath(originalRequest.url || "")) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = API.post("/auth/refresh", {}).finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return API(originalRequest);
    } catch (refreshError) {
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    }
  }
);

export default API;
