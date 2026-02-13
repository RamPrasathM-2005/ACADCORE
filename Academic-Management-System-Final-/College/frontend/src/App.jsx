// src/App.jsx
import React from "react";
import { BrowserRouter, useRoutes } from "react-router-dom";
import 'react-toastify/dist/ReactToastify.css';
import routes from "./routes.jsx";
import { AuthProvider } from "./pages/auth/AuthContext"; 
// 1. Import GoogleOAuthProvider
import { GoogleOAuthProvider } from "@react-oauth/google";

const AppRoutes = () => {
  const routing = useRoutes(routes);
  return routing;
};

const App = () => {
  // Use your Client ID here
  const GOOGLE_CLIENT_ID = "180795642065-a8vha11jug7jv8ip5b4ivggi39pqej6h.apps.googleusercontent.com";

  return (
    <BrowserRouter>
      {/* 2. Wrap everything in GoogleOAuthProvider */}
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </GoogleOAuthProvider>
    </BrowserRouter>
  );
};

export default App;