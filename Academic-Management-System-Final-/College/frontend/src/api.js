import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:4000/api", // Ensure this matches your backend port (4000)
});

// Interceptor to add Token to headers
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;