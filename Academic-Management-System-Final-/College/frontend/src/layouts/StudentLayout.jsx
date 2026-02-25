import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import StudentHeader from '../pages/student/StudentHeader';
import { useAuth } from '../pages/auth/AuthContext';

const StudentLayout = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if ((user?.role || '').toLowerCase() !== 'student') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <StudentHeader />
      <main className="flex-grow container mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
};

export default StudentLayout;
