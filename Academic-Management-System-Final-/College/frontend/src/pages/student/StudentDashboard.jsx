import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import {
  GraduationCap,
  CalendarCheck2,
  TrendingUp,
  BookOpen,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import {
  fetchStudentDetails,
  fetchSemesters,
  fetchEnrolledCourses,
  fetchAttendanceSummary,
  fetchOecPecProgress,
  fetchStudentAcademicIds
} from '../../services/studentService';
import { api } from '../../services/authService';
import { useAuth } from '../auth/AuthContext';

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [studentDetails, setStudentDetails] = useState(null);
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [gpaHistory, setGpaHistory] = useState([]);
  const [gpaSelectedSem, setGpaSelectedSem] = useState('');
  const [courses, setCourses] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [progress, setProgress] = useState(null);
  const [academicIds, setAcademicIds] = useState({
    regno: '',
    batchId: '',
    deptId: '',
    semesterId: ''
  });

  const loadGpaHistory = async () => {
    try {
      const res = await api.get('/student/gpa-history');
      if (res.data.status !== 'success') return;

      const sorted = [...(res.data.data || [])].sort((a, b) => a.semesterNumber - b.semesterNumber);
      const mapped = sorted.map((item) => ({
        semester: `Sem ${item.semesterNumber}`,
        semesterNumber: item.semesterNumber,
        gpaValue: toNumber(item.gpa),
        cgpaValue: toNumber(item.cgpa),
        gpa: item.gpa == null ? null : toNumber(item.gpa).toFixed(2),
        cgpa: item.cgpa == null ? null : toNumber(item.cgpa).toFixed(2),
        earnedCredits: toNumber(item.earnedCredits),
        totalCredits: toNumber(item.totalCredits),
        cumulativeEarnedCredits: toNumber(item.cumulativeEarnedCredits),
        cumulativeTotalCredits: toNumber(item.cumulativeTotalCredits),
        cgpaFrozen: Boolean(item.cgpaFrozen),
        hasOutstandingArrear: Boolean(item.hasOutstandingArrear)
      }));

      setGpaHistory(mapped);
      if (mapped.length > 0) {
        setGpaSelectedSem(String(mapped[mapped.length - 1].semesterNumber));
      }
    } catch {
      setGpaHistory([]);
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      if (authLoading) return;
      if ((user?.role || '').toLowerCase() !== 'student') {
        navigate('/login');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const student = await fetchStudentDetails();
        setStudentDetails(student);

        const semList = await fetchSemesters(student?.batchYear?.toString());
        if (!Array.isArray(semList) || semList.length === 0) {
          setError('No semesters available');
          return;
        }

        setSemesters(semList);
        const active = semList
          .filter((s) => s.isActive === 'YES')
          .sort((a, b) => b.semesterNumber - a.semesterNumber);
        const current = active[0] || [...semList].sort((a, b) => b.semesterNumber - a.semesterNumber)[0];
        setSelectedSemester(String(current.semesterId));

        await Promise.all([
          loadGpaHistory(),
          fetchOecPecProgress().then(setProgress).catch(() => setProgress(null))
        ]);
      } catch (err) {
        setError(err?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadInitial();
  }, [authLoading, navigate, user?.role]);

  useEffect(() => {
    const loadAcademicIds = async () => {
      const regno =
        studentDetails?.userNumber ||
        studentDetails?.studentProfile?.registerNumber ||
        '';
      if (!regno) return;

      try {
        const ids = await fetchStudentAcademicIds();
        if (!ids) return;
        setAcademicIds({
          regno: ids.regno || regno,
          batchId: ids.batchId || '',
          deptId: ids.deptId || '',
          semesterId: ids.semesterId || selectedSemester
        });
      } catch {
        setAcademicIds((prev) => ({ ...prev, regno }));
      }
    };

    loadAcademicIds();
  }, [selectedSemester, studentDetails?.studentProfile?.registerNumber, studentDetails?.userNumber]);

  useEffect(() => {
    if (!selectedSemester) return;

    const loadSemesterData = async () => {
      try {
        const [coursesRes, attendanceRes] = await Promise.all([
          fetchEnrolledCourses(selectedSemester),
          fetchAttendanceSummary(selectedSemester).catch(() => ({}))
        ]);
        setCourses(Array.isArray(coursesRes) ? coursesRes : []);
        setAttendanceSummary(attendanceRes || {});
      } catch {
        setCourses([]);
        setAttendanceSummary({});
      }
    };

    loadSemesterData();
  }, [selectedSemester]);

  const selectedHistory = useMemo(() => {
    if (gpaHistory.length === 0) return null;
    return (
      gpaHistory.find((h) => String(h.semesterNumber) === String(gpaSelectedSem)) ||
      gpaHistory[gpaHistory.length - 1]
    );
  }, [gpaHistory, gpaSelectedSem]);

  const visibleHistory = useMemo(() => {
    const semNum = toNumber(gpaSelectedSem, 0);
    if (!semNum) return gpaHistory;
    return gpaHistory.filter((h) => h.semesterNumber <= semNum);
  }, [gpaHistory, gpaSelectedSem]);

  const avgGpa = useMemo(() => {
    if (visibleHistory.length === 0) return '0.00';
    const sum = visibleHistory.reduce((acc, row) => acc + toNumber(row.gpaValue), 0);
    return (sum / visibleHistory.length).toFixed(2);
  }, [visibleHistory]);

  const bestGpa = useMemo(() => {
    if (visibleHistory.length === 0) return '0.00';
    return Math.max(...visibleHistory.map((row) => toNumber(row.gpaValue))).toFixed(2);
  }, [visibleHistory]);

  const totalDays = toNumber(attendanceSummary?.totalDays);
  const daysPresent = toNumber(attendanceSummary?.daysPresent);
  const daysAbsent = Math.max(0, totalDays - daysPresent);
  const attendancePct = totalDays > 0 ? Number(((daysPresent / totalDays) * 100).toFixed(1)) : 0;
  const attendanceStroke = 502;
  const attendanceOffset = attendanceStroke - (attendanceStroke * attendancePct) / 100;
  const safeAbsenceDays = totalDays > 0 ? Math.max(0, Math.floor((daysPresent / 0.75) - totalDays)) : 0;
  const daysNeededFor75 =
    totalDays > 0 && attendancePct < 75
      ? Math.max(0, Math.ceil(((0.75 * totalDays) - daysPresent) / 0.25))
      : 0;

  const score = toNumber(selectedHistory?.cgpa || selectedHistory?.gpa);
  const selectedIndex = visibleHistory.findIndex(
    (h) => h.semesterNumber === selectedHistory?.semesterNumber
  );
  const previousScore =
    selectedIndex > 0
      ? toNumber(visibleHistory[selectedIndex - 1]?.cgpa || visibleHistory[selectedIndex - 1]?.gpa)
      : null;
  const trendDelta = previousScore == null ? null : Number((score - previousScore).toFixed(2));

  const recommendation = useMemo(() => {
    if (!selectedHistory) {
      return {
        title: 'No Academic Data',
        message: 'Upload/processing of semester results is pending.',
        tone: 'text-slate-600'
      };
    }

    if (selectedHistory.cgpaFrozen) {
      return {
        title: 'CGPA Frozen',
        message: 'Clear pending arrears to unlock CGPA movement.',
        tone: 'text-amber-600'
      };
    }

    if (attendancePct > 0 && attendancePct < 75) {
      return {
        title: 'Attendance Risk',
        message: 'Low attendance can impact exam eligibility. Prioritize regular attendance.',
        tone: 'text-red-600'
      };
    }

    if (score >= 9) {
      return {
        title: trendDelta != null && trendDelta < 0 ? 'Strong but Slipping' : 'Outstanding',
        message:
          trendDelta != null && trendDelta < 0
            ? 'You are still in top range. Tighten consistency this semester.'
            : 'Excellent academic performance. Sustain this momentum.',
        tone: 'text-emerald-600'
      };
    }

    if (score >= 8) {
      return {
        title: trendDelta != null && trendDelta >= 0.2 ? 'Strong Uptrend' : 'Very Good',
        message:
          trendDelta != null && trendDelta >= 0.2
            ? 'You are improving steadily. Distinction is within reach.'
            : 'Maintain this level and focus on two weakest subjects.',
        tone: 'text-indigo-600'
      };
    }

    if (score >= 7) {
      return {
        title: trendDelta != null && trendDelta >= 0 ? 'Improving' : 'Needs Consolidation',
        message:
          trendDelta != null && trendDelta >= 0
            ? 'Recovery trend is positive. Keep the same study rhythm.'
            : 'Stabilize fundamentals and improve internal test consistency.',
        tone: 'text-amber-600'
      };
    }

    return {
      title: 'Intervention Needed',
      message: 'Build a weekly recovery plan with your faculty mentor.',
      tone: 'text-red-600'
    };
  }, [attendancePct, score, selectedHistory, trendDelta]);

  const attendanceStatus = useMemo(() => {
    if (totalDays === 0) {
      return {
        title: 'No Attendance Data',
        message: 'Attendance will show once classes are marked.',
        color: '#94a3b8'
      };
    }
    if (attendancePct < 75) {
      return {
        title: 'Critical',
        message: `Need at least ${daysNeededFor75} full present day(s) to reach 75%.`,
        color: '#ef4444'
      };
    }
    if (attendancePct < 85) {
      return {
        title: 'Borderline',
        message: `You can miss about ${safeAbsenceDays} more day(s) before 75%.`,
        color: '#f59e0b'
      };
    }
    return {
      title: 'Healthy',
      message: `Attendance is strong. Buffer before 75%: ${safeAbsenceDays} day(s).`,
      color: '#10b981'
    };
  }, [attendancePct, daysNeededFor75, safeAbsenceDays, totalDays]);

  const normalizedCourses = useMemo(
    () =>
      courses.map((row, index) => ({
        id: row.studentCourseId || row.courseId || index,
        name: row.Course?.courseTitle || row.courseName || row.courseTitle || 'Course',
        code: row.Course?.courseCode || row.courseCode || '-',
        credits: toNumber(row.Course?.credits ?? row.credits)
      })),
    [courses]
  );

  const studentName =
    studentDetails?.userName ||
    studentDetails?.studentProfile?.studentName ||
    'Student';
  const regNo =
    studentDetails?.userNumber ||
    studentDetails?.studentProfile?.registerNumber ||
    '-';
  const deptName =
    studentDetails?.studentProfile?.department?.Deptname ||
    studentDetails?.department?.Deptname ||
    '-';
  const section =
    studentDetails?.studentProfile?.section ||
    '-';

  const handleViewCBCS = () => {
    if (!academicIds.batchId || !academicIds.deptId || !academicIds.semesterId || !academicIds.regno) return;
    navigate(
      `/student/stu/${academicIds.regno}/${academicIds.batchId}/${academicIds.deptId}/${academicIds.semesterId}`
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-11 h-11 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Unable To Load Dashboard</h2>
          <p className="text-sm text-slate-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wide uppercase text-slate-500">Student Dashboard</p>
              <h1 className="text-2xl font-semibold text-slate-900 mt-1">{studentName}</h1>
              <p className="text-sm text-slate-600 mt-1">
                Reg No: <span className="font-medium">{regNo}</span> | Department: <span className="font-medium">{deptName}</span> | Section: <span className="font-medium">{section}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {semesters.map((sem) => (
                  <option key={sem.semesterId} value={String(sem.semesterId)}>
                    Semester {sem.semesterNumber}{sem.isActive === 'YES' ? ' - Active' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => navigate('/student/choose-course')}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 hover:bg-slate-100"
              >
                Choose Courses
              </button>
              <button
                onClick={handleViewCBCS}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                View CBCS
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Current GPA</p>
              <GraduationCap className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-semibold text-slate-900 mt-2">{selectedHistory?.gpa || '0.00'}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Current CGPA</p>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-semibold text-slate-900 mt-2">{selectedHistory?.cgpa || '-'}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Attendance</p>
              <CalendarCheck2 className="w-4 h-4 text-sky-600" />
            </div>
            <p className="text-2xl font-semibold text-slate-900 mt-2">{attendancePct.toFixed(1)}%</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Passed Credits</p>
              <BookOpen className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-2xl font-semibold text-slate-900 mt-2">
              {toNumber(selectedHistory?.cumulativeEarnedCredits)}/{toNumber(selectedHistory?.cumulativeTotalCredits)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Cumulative (excluding U grades)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Academic Trend</h3>
                  <p className="text-xs text-slate-500">Semester-wise GPA and CGPA movement</p>
                </div>
                <select
                  value={gpaSelectedSem}
                  onChange={(e) => setGpaSelectedSem(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {gpaHistory.map((h) => (
                    <option key={h.semesterNumber} value={String(h.semesterNumber)}>
                      Up to Sem {h.semesterNumber}
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gpaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="semester" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis domain={[0, 10]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      formatter={(value) => toNumber(value).toFixed(2)}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
                    />
                    <Area type="monotone" dataKey="gpaValue" stroke="#4f46e5" strokeWidth={2.5} fill="url(#gpaFill)" />
                    <Area type="monotone" dataKey="cgpaValue" stroke="#059669" strokeWidth={2.2} fill="transparent" strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 font-semibold uppercase">Avg GPA</p>
                  <p className="text-lg font-semibold text-slate-900">{avgGpa}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 font-semibold uppercase">Best GPA</p>
                  <p className="text-lg font-semibold text-slate-900">{bestGpa}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 font-semibold uppercase">Sem Credits</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {toNumber(selectedHistory?.earnedCredits)}/{toNumber(selectedHistory?.totalCredits)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 font-semibold uppercase">Trend</p>
                  <p className={`text-lg font-semibold ${trendDelta == null ? 'text-slate-900' : trendDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {trendDelta == null ? '-' : `${trendDelta > 0 ? '+' : ''}${trendDelta.toFixed(2)}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                <div>
                  <h3 className={`text-sm font-semibold ${recommendation.tone}`}>{recommendation.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{recommendation.message}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Attendance Insight</h3>
              <div className="flex justify-center">
                <div className="relative w-44 h-44">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="88" cy="88" r="80" stroke="#e2e8f0" strokeWidth="12" fill="none" />
                    <circle
                      cx="88"
                      cy="88"
                      r="80"
                      stroke={attendanceStatus.color}
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={attendanceStroke}
                      strokeDashoffset={attendanceOffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-semibold text-slate-900">{attendancePct.toFixed(1)}%</p>
                    <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Attendance</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
                  <p className="text-[11px] text-slate-500 font-semibold uppercase">Present</p>
                  <p className="text-base font-semibold text-slate-900">{daysPresent}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
                  <p className="text-[11px] text-slate-500 font-semibold uppercase">Absent</p>
                  <p className="text-base font-semibold text-slate-900">{daysAbsent}</p>
                </div>
              </div>
              <p className="text-sm font-semibold mt-4" style={{ color: attendanceStatus.color }}>
                {attendanceStatus.title}
              </p>
              <p className="text-sm text-slate-600 mt-1">{attendanceStatus.message}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Current Semester Courses</h3>
              {normalizedCourses.length === 0 ? (
                <p className="text-sm text-slate-500">No courses available for this semester.</p>
              ) : (
                <div className="space-y-3">
                  {normalizedCourses.slice(0, 6).map((course) => (
                    <div key={course.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{course.name}</p>
                        <p className="text-xs text-slate-500">{course.code}</p>
                      </div>
                      <p className="text-xs font-semibold text-slate-600">{course.credits} Cr</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {progress && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Elective Credit Progress</h3>
                {['OEC', 'PEC'].map((type) => {
                  const completed = toNumber(progress?.completed?.[type]);
                  const required = Math.max(1, toNumber(progress?.required?.[type], 1));
                  const pct = Math.min(100, Math.round((completed / required) * 100));
                  return (
                    <div key={type} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-slate-700">{type}</span>
                        <span className="text-slate-500">{completed}/{required}</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${type === 'OEC' ? 'bg-pink-500' : 'bg-indigo-600'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => navigate('/student/nptel-selection')}
                  className="mt-3 text-sm font-medium text-indigo-600 inline-flex items-center gap-1 hover:text-indigo-700"
                >
                  Manage NPTEL/Electives <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
