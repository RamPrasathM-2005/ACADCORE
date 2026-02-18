import React from "react";
import { Navigate } from "react-router-dom";
import { isAuthenticated, getUserRole } from "./utils/auth.js";

// Layouts
import AdminLayout from "./layouts/AdminLayout";
import StaffLayout from "./layouts/StaffLayout";
import StudentLayout from "./layouts/StudentLayout";

// Auth Pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard';
import ManageSemesters from './pages/admin/ManageSemesters/ManageSemsters';
import ManageCourses from './pages/admin/ManageCourses/ManageCourses';
import ManageStaff from './pages/admin/ManageStaffs/ManageStaff';
import ManageStudents from './pages/admin/ManageStudents/ManageStudents';
import Timetable from './pages/admin/Timetable';
import ManageRegulations from './pages/admin/ManageRegulations';
import OverallConsolidatedMarks from './pages/admin/OverallConsolidatedMarks';
import SubjectWiseMarks from './pages/admin/SubjectWiseMarks';
import CourseRecommendation from './pages/admin/CourseRecommendation';
import BatchRegulationAllocation from './pages/admin/BatchRegulationAllocation';
import AdminAttendance from './pages/admin/AttendanceAdmin';
import Report from './pages/admin/Reports';
import StudentEnrollmentsView from './pages/admin/StudentEnrollmentsView';
import CgpaAllocation from './pages/admin/CgpaAllocation.jsx'
import NptelCourses from './pages/admin/ManageCourses/ManageNptelCourses.jsx';
import RequestCoursesAdmin from './pages/admin/RequestCoursesAdmin.jsx';
// import UpdateStudentSem from './pages/admin/ManageStudents/UpdateStudentSem.jsx'; 
import CreateCBCS from './pages/admin/CBCS/CreateCBCS.jsx';
import CBCSList from './pages/admin/CBCS/CBCSList.jsx';
import CBCSDetail from './pages/admin/CBCS/CBCSDetail.jsx';
import NptelCreditTransferApproval from './pages/admin/NptelCreditTransferApproval.jsx';

// Staff Pages

import StaffDashboard from "./pages/staff/Dashboard";
import Attendance from "./pages/staff/Attendance";
import MarksAllocation from "./pages/staff/MarksAllocation";
import Options from "./pages/staff/Options";
import InternalMarks from "./pages/staff/InternalMarks";
import RequestCoursesStaff from './pages/staff/RequestCoursesStaff.jsx'

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
import ChooseCourse from './pages/student/ChooseCourse';
import NptelSelection from './pages/student/NptelSelection.jsx';

import StudentCBCS from './pages/student/StudentCBCS.jsx';
// NotFound
import NotFound from "./pages/NotFound";
// import StudentStaffMapping from "./pages/admin/StudentEnrollmentsView";
//  import StudentEnrollmentsView from "./pages/admin/StudentEnrollmentsView";

import AttendanceReport from "./pages/admin/AttendanceReports";
import BulkOD from "./pages/admin/BulkOD.jsx";
import DayAttendance from "./pages/admin/DayAttendance.jsx";
import StudentCourseMapping from "./pages/admin/StudentCourseMapping.jsx";


import { useAuth } from "./pages/auth/AuthContext";

// ProtectedRoute
const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  // Show nothing or a spinner while the refresh() function is checking the token
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If no user is found in context, go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check roles (Context stores roles as lowercase usually)
  const userRole = user.role?.toLowerCase();
  const requiredRole = role?.toLowerCase();

  if (requiredRole && userRole !== requiredRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
};
const routes = [
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password/:token", element: <ResetPassword /> },
  {
    path: "/admin",
    element: (
      <ProtectedRoute role={["admin","superadmin"]}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboard /> },
      
      { path: 'dashboard', element: <AdminDashboard /> },
      { path: 'manage-semesters', element: <ManageSemesters /> },
      { path: 'manage-regulations', element: <ManageRegulations /> },
      { path: 'manage-batches', element: <BatchRegulationAllocation /> },
      { path: 'manage-courses', element: <ManageCourses /> },
      { path: 'manage-staff', element: <ManageStaff /> },
      { path: 'manage-students', element: <ManageStudents /> },
      { path: 'timetable', element: <Timetable /> },
      { path: 'consolidated-marks', element: <OverallConsolidatedMarks /> },
      { path: 'subjectWise-marks', element: <SubjectWiseMarks /> },
      { path: 'course-recommendation', element: <CourseRecommendation /> },
      { path: 'adminattendance', element: <AdminAttendance /> },
      {path: 'bulk-od', element: <BulkOD />},
      {path: 'periodattendance', element: <DayAttendance></DayAttendance>},
      { path: "/admin/attendance-report", element: <AttendanceReport />} ,
      { path: 'report', element: <Report /> },
      { path: 'student-staff-mapping', element: <StudentEnrollmentsView /> },
      {path : 'student-course-mapping', element: <StudentCourseMapping />},

      {path : 'cgpa-allocation', element: <CgpaAllocation/>},
      {path: 'request-courses', element: <RequestCoursesAdmin/>},
      {path:'cbcs-creation',element:<CreateCBCS />},
      {path:'cbcs-list',element:<CBCSList />},
      {path:'cbcs-detail/:id',element:<CBCSDetail />},
      {path: 'nptel-courses', element: <NptelCourses/>},
      {path: 'nptel-approvals', element: <NptelCreditTransferApproval />},
      // { path: 'student-sem-update', element: <UpdateStudentSem/ > },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    path: "/staff",
    element: (
      <ProtectedRoute role={["staff","teachingstaff"]}>
        <StaffLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <StaffDashboard /> },
      { path: "dashboard", element: <StaffDashboard /> },
      { path: "marks-allocation", element: <MarksAllocation /> },
      { path: "options/:courseId", element: <Options /> },
      {
        path: "marks-allocation/:courseId/:sectionId",
        element: <MarksAllocation />,
      },
      { path: "attendance", element: <Attendance /> },
      { path: "internal-marks/:courseId", element: <InternalMarks /> },
      { path: 'dashboard', element: <StaffDashboard /> },
      { path: 'marks-allocation', element: <MarksAllocation /> },
      { path: 'options/:courseId', element: <Options /> },
      { path: 'marks-allocation/:courseId/:sectionId', element: <MarksAllocation /> },
      { path: 'attendance', element: <Attendance /> },
      { path: 'internal-marks/:courseId', element: <InternalMarks /> },
      { path: 'request-courses', element: <RequestCoursesStaff/>},
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: "/student",
    element: (
      <ProtectedRoute role="student">
        <StudentLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <StudentDashboard /> },

      { path: 'nptel-selection', element: <NptelSelection /> },
      { path: "dashboard", element: <StudentDashboard /> },
      { path: "choose-course", element: <ChooseCourse /> },
      { path: 'stu/:regno/:batchId/:deptId/:semesterId',element:<StudentCBCS />},
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "*", element: <NotFound /> },
];

export default routes;
