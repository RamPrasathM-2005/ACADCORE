// src/pages/student/StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { getUserRole } from '../../utils/auth';
import {
  fetchStudentDetails,
  fetchSemesters,
  fetchEnrolledCourses,
  fetchAttendanceSummary,
  fetchOecPecProgress,
  fetchStudentAcademicIds
} from '../../services/studentService';
import { api } from '../../services/authService';

const StudentDashboard = () => {
  const navigate = useNavigate();

  // --- STATE ---
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [gpaSelectedSem, setGpaSelectedSem] = useState('');
  const [courses, setCourses] = useState([]);
  const [studentDetails, setStudentDetails] = useState(null);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [progress, setProgress] = useState(null);
  const [gpaHistory, setGpaHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [academicIds, setAcademicIds] = useState({
    regno: '',
    batchId: '',
    deptId: '',
    semesterId: ''
  });
  const [idsLoading, setIdsLoading] = useState(true);

  // --- LOGIC ---
  const fetchGpaHistory = async () => {
    try {
      const res = await api.get('/student/gpa-history');
      if (res.data.status === 'success') {
        const history = res.data.data || [];
        const sorted = history.sort((a, b) => a.semesterNumber - b.semesterNumber);

        const chartData = sorted.map(item => ({
          semester: `Sem ${item.semesterNumber}`,
          semesterNumber: item.semesterNumber,
          gpa: item.gpa ? parseFloat(item.gpa).toFixed(2) : null,
          cgpa: item.cgpa ? parseFloat(item.cgpa).toFixed(2) : null,
          gpaValue: item.gpa ? parseFloat(item.gpa) : 0,
          cgpaValue: item.cgpa ? parseFloat(item.cgpa) : 0,
        }));

        setGpaHistory(chartData);
        if (chartData.length > 0) {
          setGpaSelectedSem(chartData[chartData.length - 1].semesterNumber.toString());
        }
      }
    } catch (err) {
      console.warn('GPA history load failed');
      setGpaHistory([]);
    }
  };

  useEffect(() => {
    const loadDashboard = async () => {
      if (!getUserRole() || getUserRole() !== 'student') {
        navigate('/login');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const student = await fetchStudentDetails();
        setStudentDetails(student);

        const semList = await fetchSemesters(student.batchYear?.toString());
        if (!semList || semList.length === 0) {
          setError('No semesters found');
          setLoading(false);
          return;
        }

        setSemesters(semList);

        const activeSems = semList.filter(s => s.isActive === 'YES');
        const currentSem = activeSems.length > 0
          ? activeSems.sort((a, b) => b.semesterNumber - a.semesterNumber)[0]
          : semList[semList.length - 1];

        setSelectedSemester(currentSem.semesterId.toString());

        await fetchGpaHistory();

        try {
          const prog = await fetchOecPecProgress();
          setProgress(prog);
        } catch (err) {
          console.warn('Could not fetch OEC/PEC progress:', err);
          setProgress(null);
        }
      } catch (err) {
        console.error('Dashboard failed:', err);
        setError('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [navigate]);

  useEffect(() => {
    const loadAcademicIds = async () => {
      if (!studentDetails?.regno) return;

      try {
        setIdsLoading(true);
        const ids = await fetchStudentAcademicIds();
        if (ids) {
          setAcademicIds({
            regno: ids.regno || studentDetails.regno || '',
            batchId: ids.batchId || '',
            deptId: ids.deptId || '',
            semesterId: ids.semesterId || selectedSemester
          });
        }
      } catch (err) {
        console.error('Failed to fetch academic IDs:', err);
      } finally {
        setIdsLoading(false);
      }
    };
    loadAcademicIds();
  }, [studentDetails?.regno, selectedSemester]);

  useEffect(() => {
    if (!selectedSemester || semesters.length === 0) return;

    const loadSemesterData = async () => {
      try {
        setLoading(true);

        const [coursesRes, attendanceRes] = await Promise.all([
          fetchEnrolledCourses(selectedSemester),
          fetchAttendanceSummary(selectedSemester).catch(() => ({}))
        ]);

        setCourses(coursesRes || []);
        setAttendanceSummary(attendanceRes || {});
      } catch (err) {
        console.error('Failed to load courses/attendance:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSemesterData();
  }, [selectedSemester]);

  // --- HANDLERS ---
  const handleSemesterChange = (e) => {
    setSelectedSemester(e.target.value);
  };

  const handleGpaSemesterChange = (e) => {
    setGpaSelectedSem(e.target.value);
  };

  const handleChooseCourses = () => {
    navigate('/student/choose-course');
  };

  const handleViewCBCS = () => {
    if (!academicIds.batchId || !academicIds.deptId || !academicIds.semesterId) {
      alert('Academic details are still loading. Please wait.');
      return;
    }
    navigate(`/student/stu/${academicIds.regno}/${academicIds.batchId}/${academicIds.deptId}/${academicIds.semesterId}`);
  };

  // --- CALCULATIONS & HELPERS ---
  const selectedGpaData = gpaHistory.find(h => h.semesterNumber.toString() === gpaSelectedSem) || gpaHistory[gpaHistory.length - 1] || null;
  const filteredHistory = gpaHistory.filter(h => h.semesterNumber <= parseInt(gpaSelectedSem || 0));

  const attendancePercentage = attendanceSummary?.percentage || 0;
  const totalDays = attendanceSummary?.totalDays || 0;
  const daysPresent = attendanceSummary?.daysPresent || 0;

  const currentGpa = selectedGpaData?.gpa || null;
  const showCgpa = gpaSelectedSem && parseInt(gpaSelectedSem) > 1;
  const currentCgpa = showCgpa ? selectedGpaData?.cgpa : null;

  const averageGpa = filteredHistory.length > 0
    ? (filteredHistory.reduce((sum, s) => sum + s.gpaValue, 0) / filteredHistory.length).toFixed(2)
    : null;

  const highestGpa = filteredHistory.length > 0
    ? Math.max(...filteredHistory.map(s => s.gpaValue)).toFixed(2)
    : null;

  const getAcademicRecommendation = (value) => {
    const cgpa = parseFloat(value || 0);
    if (cgpa >= 9.0) {
      return {
        title: "Outstanding",
        message: "Your performance is top-tier!",
        color: "text-emerald-600"
      };
    } else if (cgpa >= 8.0) {
      return {
        title: "Excellent",
        message: "Keep up the great work!",
        color: "text-indigo-600"
      };
    } else if (cgpa >= 7.0) {
      return {
        title: "Good",
        message: "Consistent effort will pay off.",
        color: "text-amber-600"
      };
    } else {
      return {
        title: "Focus Needed",
        message: "Contact your mentor for support.",
        color: "text-red-600"
      };
    }
  };

  const recommendation = getAcademicRecommendation(currentCgpa || currentGpa);

  // --- ICONS FOR QUICK INFO ---
  const icons = {
    Dept: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    Section: (
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  };

  // --- RENDER ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 text-2xl">!</div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h3>
          <p className="text-slate-500 mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-medium">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FD] text-slate-800 p-6 font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Overview</h1>
                <p className="text-slate-500 font-medium mt-1">
                    Welcome back, {studentDetails?.username?.split(' ')[0]}
                </p>
            </div>
            
            <div className="bg-white pl-2 pr-6 py-2 rounded-full border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow cursor-default">
                 <img 
                    src={`https://api.dicebear.com/7.x/notionists/svg?seed=${studentDetails?.username || 'User'}&backgroundColor=e0e7ff`} 
                    alt="Avatar" 
                    className="w-10 h-10 rounded-full border border-slate-100 bg-indigo-50"
                 />
                 <div>
                     <p className="text-xs font-bold text-slate-900">{studentDetails?.username}</p>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{studentDetails?.regno}</p>
                 </div>
            </div>
        </div>

        {/* TOP ROW: QUICK INFO CARDS */}
        {/* Adjusted grid to 2 columns to fit the remaining 2 items nicely */}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-8">
            {[
            { label: 'Dept', value: studentDetails?.Deptname?.split(' ')[0], gradient: 'from-blue-500 to-blue-600', icon: icons.Dept },
            { label: 'Section', value: studentDetails?.section, gradient: 'from-purple-500 to-purple-600', icon: icons.Section }
            ].map((item, i) => (
            item.value && (
                <div key={i} className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-all cursor-default">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-md`}>
                        {item.icon}
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">{item.label}</p>
                        <p className="text-base font-extrabold text-slate-800">{item.value}</p>
                    </div>
                </div>
            )
            ))}
        </div>

        {/* BENTO GRID LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN (Content) */}
            <div className="lg:col-span-2 space-y-8">
                
                {/* 1. ACTION BANNERS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Course Selection */}
                    <div className="relative bg-white rounded-[32px] p-8 overflow-hidden shadow-sm border border-slate-100 group hover:border-indigo-100 transition-all duration-300">
                        <div className="relative z-10 w-3/4">
                            <span className="inline-block bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-md mb-3">
                                Enrollment
                            </span>
                            <h3 className="text-xl font-bold text-slate-800 mb-2 leading-tight">Course<br/>Selection</h3>
                            <p className="text-slate-400 text-xs mb-6 font-medium leading-relaxed">
                                Select electives for next semester.
                            </p>
                            <button onClick={handleChooseCourses} className="bg-indigo-600 text-white px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">
                                Select Now <span>→</span>
                            </button>
                        </div>
                        {/* 3D Icon */}
                        <img 
                            src="https://cdn-icons-png.flaticon.com/512/2921/2921222.png" 
                            alt="Book"
                            className="absolute -right-4 -bottom-6 w-32 h-32 object-contain opacity-90 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6"
                        />
                    </div>

                    {/* CBCS System */}
                    <div className="relative bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between group hover:border-orange-100 transition-all duration-300">
                        <div className="relative z-10">
                            <span className="inline-block bg-orange-50 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-md mb-3">
                                Credits
                            </span>
                            <h3 className="text-xl font-bold text-slate-800 mb-1">CBCS System</h3>
                            <p className="text-slate-400 text-xs font-medium">Credit management</p>
                        </div>
                        <div className="mt-4 relative z-10">
                            <button onClick={handleViewCBCS} className="bg-indigo-600 text-white px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">
                                View Details <span>→</span>
                            </button>
                        </div>
                        {/* 3D Icon */}
                        <img 
                            src="https://cdn-icons-png.flaticon.com/512/942/942748.png" 
                            alt="Folder"
                            className="absolute -right-4 -bottom-4 w-28 h-28 object-contain opacity-80 group-hover:scale-110 transition-transform duration-300"
                        />
                    </div>
                </div>

                {/* 2. MAIN ANALYTICS CHART (GPA) */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Academic Progress</h3>
                            <p className="text-xs text-slate-400 font-medium mt-1">GPA Trend Analysis</p>
                        </div>
                        <div className="flex items-center gap-4 bg-slate-50 px-3 py-1.5 rounded-full">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#6366f1]"></span>
                                <span className="text-xs text-slate-600 font-bold">GPA</span>
                            </div>
                            {showCgpa && (
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
                                    <span className="text-xs text-slate-600 font-bold">CGPA</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={filteredHistory} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorGpa" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    dataKey="semester" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 600}} 
                                    dy={10} 
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 600}} 
                                    domain={[0, 10]} 
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)' }}
                                    cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }}
                                    formatter={(value) => parseFloat(value).toFixed(2)}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="gpaValue" 
                                    stroke="#6366f1" 
                                    strokeWidth={3} 
                                    fill="url(#colorGpa)" 
                                    activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff', fill: '#6366f1' }}
                                />
                                {showCgpa && (
                                     <Area 
                                     type="monotone" 
                                     dataKey="cgpaValue" 
                                     stroke="#10b981" 
                                     strokeWidth={3} 
                                     fill="transparent" 
                                     strokeDasharray="5 5"
                                 />
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. METRIC CARDS ROW */}
                <div className="w-full">
                    {/* Performance Metrics */}
                    <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-all">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-slate-800 font-bold text-lg">Performance</h4>
                                <div className="flex items-baseline gap-1 mt-1">
                                    <span className="text-4xl font-extrabold text-slate-900 tracking-tighter">{currentGpa || '0.0'}</span>
                                    <span className="text-slate-400 text-xs font-bold">/ 10</span>
                                </div>
                                <p className={`text-xs font-bold mt-2 ${recommendation.color}`}>{recommendation.title}</p>
                            </div>
                            <select 
                                value={gpaSelectedSem} 
                                onChange={handleGpaSemesterChange}
                                className="bg-slate-50 text-[10px] font-bold text-slate-500 py-2 px-3 rounded-xl border-none focus:ring-0 cursor-pointer hover:bg-slate-100"
                            >
                                {gpaHistory.map(h => <option key={h.semesterNumber} value={h.semesterNumber}>Sem {h.semesterNumber}</option>)}
                            </select>
                        </div>
                        <div className="mt-4">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-slate-50 rounded-xl p-2">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Avg</p>
                                    <p className="text-sm font-bold text-slate-700">{averageGpa}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-2">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Best</p>
                                    <p className="text-sm font-bold text-emerald-600">{highestGpa}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-2">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total</p>
                                    <p className="text-sm font-bold text-slate-700">{filteredHistory.length}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN (Sidebar) */}
            <div className="space-y-6">
                
                {/* Semester Selector */}
                <div className="bg-white rounded-[24px] p-2 shadow-sm border border-slate-100">
                     <div className="relative">
                        <select 
                            value={selectedSemester} 
                            onChange={handleSemesterChange}
                            className="w-full bg-transparent hover:bg-slate-50 transition-colors border-none rounded-[20px] py-4 px-6 text-slate-700 font-bold focus:ring-0 cursor-pointer text-sm appearance-none"
                        >
                            {semesters.map(sem => (
                                <option key={sem.semesterId} value={sem.semesterId.toString()}>
                                    Semester {sem.semesterNumber} {sem.isActive === 'YES' ? '• Active' : ''}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                     </div>
                </div>

                {/* Days Report (Radial) */}
                <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 text-center">
                    <h4 className="font-bold text-slate-800 mb-6 text-left">Days Report</h4>
                    <div className="relative w-48 h-48 mx-auto">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="96" cy="96" r="80" stroke="#F1F5F9" strokeWidth="12" fill="none" strokeLinecap="round" />
                            <circle 
                                cx="96" cy="96" r="80" 
                                stroke={attendancePercentage < 75 ? "#ef4444" : "#6366f1"} 
                                strokeWidth="12" 
                                fill="none" 
                                strokeDasharray="502" 
                                strokeDashoffset={502 - (502 * (attendancePercentage / 100))} 
                                strokeLinecap="round" 
                                className="transition-all duration-1000 ease-out" 
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl font-extrabold text-slate-900">{attendancePercentage}%</span>
                            <span className="text-xs text-slate-400 font-bold mt-1 tracking-wider">PRESENCE</span>
                        </div>
                    </div>
                    <div className="flex justify-between mt-8 text-xs font-bold text-slate-500 px-2">
                        <div className="text-center">
                            <div className={`w-2 h-2 rounded-full ${attendancePercentage < 75 ? 'bg-red-500' : 'bg-indigo-500'} mx-auto mb-2`}></div>
                            Attended ({daysPresent})
                        </div>
                        <div className="text-center">
                            <div className="w-2 h-2 rounded-full bg-slate-200 mx-auto mb-2"></div>
                            Missed ({totalDays - daysPresent})
                        </div>
                    </div>
                </div>

                {/* Courses List */}
                <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="font-bold text-slate-800">Courses</h4>
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{courses.length}</span>
                    </div>
                    <div className="space-y-3">
                        {courses.length > 0 ? courses.slice(0, 4).map((course, idx) => (
                            <div key={course.courseId} className="flex items-center gap-4 p-2.5 hover:bg-slate-50 rounded-2xl transition-colors cursor-default">
                                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-sm
                                    ${idx % 4 === 0 ? 'bg-orange-50 text-orange-600' : 
                                      idx % 4 === 1 ? 'bg-blue-50 text-blue-600' : 
                                      idx % 4 === 2 ? 'bg-purple-50 text-purple-600' : 
                                      'bg-emerald-50 text-emerald-600'}`}>
                                    {course.courseName.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h5 className="font-bold text-slate-800 text-xs truncate">{course.courseName}</h5>
                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">{course.courseCode}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-xs text-slate-400 text-center py-4">No courses enrolled.</p>
                        )}
                    </div>
                </div>

                 {/* Elective Progress */}
                 {progress && (
                    <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
                        <h4 className="font-bold text-slate-800 mb-6">Elective Credits</h4>
                        <div className="mb-5">
                            <div className="flex justify-between text-xs mb-2">
                                <span className="font-bold text-slate-600">Open Elective</span>
                                <span className="text-slate-400 font-bold">{progress.completed.OEC}/{progress.required.OEC}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div className="bg-pink-400 h-2 rounded-full" style={{ width: `${Math.min((progress.completed.OEC / progress.required.OEC) * 100, 100)}%` }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-2">
                                <span className="font-bold text-slate-600">Professional</span>
                                <span className="text-slate-400 font-bold">{progress.completed.PEC}/{progress.required.PEC}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${Math.min((progress.completed.PEC / progress.required.PEC) * 100, 100)}%` }}></div>
                            </div>
                        </div>
                    </div>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;