import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Clock3,
  BadgeCheck,
  XCircle
} from "lucide-react";
import { api } from "../../services/authService";
import { useAuth } from "../auth/AuthContext";
import {
  fetchStudentDetails,
  fetchSemesters,
  fetchNptelCourses,
  enrollNptelCourses,
  fetchStudentNptelEnrollments,
  fetchOecPecProgress
} from "../../services/studentService";

const NptelSelection = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState("");
  const [availableNptel, setAvailableNptel] = useState([]);
  const [enrolledNptel, setEnrolledNptel] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [currentSemesterNumber, setCurrentSemesterNumber] = useState(0);

  const getAllowedSemesters = (semesterData = [], studentSemesterNumber = 0) => {
    const bySemNo = new Map();
    [...semesterData]
      .sort((a, b) => Number(a.semesterNumber) - Number(b.semesterNumber))
      .forEach((sem) => {
        const semNo = Number(sem.semesterNumber);
        if (!semNo || bySemNo.has(semNo)) return;
        bySemNo.set(semNo, sem);
      });

    const unique = [...bySemNo.values()];
    if (!unique.length) return [];

    const current =
      unique.find((s) => Number(s.semesterNumber) === Number(studentSemesterNumber)) ||
      unique.find((s) => s.isActive === "YES") ||
      unique[unique.length - 1];

    const currentNo = Number(current?.semesterNumber || 0);
    return unique.filter((s) => {
      const semNo = Number(s.semesterNumber);
      return semNo > 0 && semNo <= currentNo;
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if ((user?.role || "").toLowerCase() !== "student") {
      navigate("/login");
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const studentData = await fetchStudentDetails();
        const studentSemesterNumber = Number(studentData?.studentProfile?.semester || 0);
        setCurrentSemesterNumber(studentSemesterNumber);
        const sems = await fetchSemesters(studentData?.studentProfile?.batch);
        const filteredSemesters = getAllowedSemesters(sems, studentSemesterNumber);
        setSemesters(filteredSemesters);

        const defaultSemester =
          filteredSemesters.find((s) => Number(s.semesterNumber) === studentSemesterNumber) ||
          filteredSemesters.find((s) => s.isActive === "YES") ||
          filteredSemesters[0];
        setSelectedSemester(defaultSemester?.semesterId || "");

        const [prog, enrolls] = await Promise.all([
          fetchOecPecProgress(),
          fetchStudentNptelEnrollments()
        ]);

        setProgress(prog);
        setEnrolledNptel(enrolls);
      } catch (err) {
        setError("Failed to load NPTEL data.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate, authLoading, user?.role]);

  useEffect(() => {
    if (!selectedSemester) return;

    const loadNptel = async () => {
      try {
        const courses = await fetchNptelCourses(selectedSemester);
        setAvailableNptel(Array.isArray(courses) ? courses : []);
      } catch {
        setError("Failed to fetch NPTEL courses.");
      }
    };

    loadNptel();
  }, [selectedSemester]);

  const selectedCount = selectedIds.length;

  const selectableCourses = useMemo(
    () => availableNptel.filter((course) => !course.isEnrolled),
    [availableNptel]
  );

  const handleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleEnroll = async () => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      await enrollNptelCourses(selectedSemester, selectedIds);
      setSuccess("Enrolled successfully.");
      setSelectedIds([]);
      const [enrolls, prog] = await Promise.all([
        fetchStudentNptelEnrollments(),
        fetchOecPecProgress()
      ]);
      setEnrolledNptel(enrolls);
      setProgress(prog);
    } catch {
      setError("Enrollment failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleStudentDecision = async (enrollmentId, decision) => {
    let remarks = "";
    if (decision === "rejected") {
      remarks = window.prompt("Optional reason for rejecting this credit transfer:") || "";
    }

    try {
      await api.post("/student/nptel-credit-transfer", {
        enrollmentId,
        decision,
        remarks: remarks || ""
      });

      toast.success(
        decision === "accepted"
          ? "Credit transfer accepted."
          : "Credit transfer rejected."
      );

      const [updatedEnrolls, prog] = await Promise.all([
        fetchStudentNptelEnrollments(),
        fetchOecPecProgress()
      ]);
      setEnrolledNptel(updatedEnrolls);
      setProgress(prog);
    } catch (err) {
      console.error("Decision error:", err);
      toast.error(err.response?.data?.message || "Failed to submit decision");
    }
  };

  if (loading && semesters.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-11 h-11 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">Student Portal</p>
              <h1 className="text-2xl font-semibold text-slate-900 mt-1">NPTEL Course Selection</h1>
              <p className="text-sm text-slate-600 mt-1">Select NPTEL courses and manage credit transfer decisions.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Choose Semester</option>
                {semesters.map((sem) => (
                  <option key={sem.semesterId} value={sem.semesterId}>
                    Semester {sem.semesterNumber} {Number(sem.semesterNumber) === currentSemesterNumber ? "- Current" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={handleEnroll}
                disabled={selectedCount === 0 || loading}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedCount === 0 || loading
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                Enroll Selected ({selectedCount})
              </button>
            </div>
          </div>
        </div>

        {progress && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">OEC Progress</p>
                <GraduationCap className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-lg font-semibold text-slate-900">{progress.completed.OEC}/{progress.required.OEC}</p>
              <p className="text-xs text-slate-500">Remaining: {progress.remaining.OEC}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">PEC Progress</p>
                <BookOpen className="w-4 h-4 text-violet-600" />
              </div>
              <p className="text-lg font-semibold text-slate-900">{progress.completed.PEC}/{progress.required.PEC}</p>
              <p className="text-xs text-slate-500">Remaining: {progress.remaining.PEC}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Available NPTEL Courses</h2>
            {selectedSemester && availableNptel.length === 0 ? (
              <p className="text-sm text-slate-500">No NPTEL courses available for this semester.</p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {availableNptel.map((course) => (
                  <label
                    key={course.nptelCourseId}
                    className={`flex gap-3 items-start rounded-xl border p-3 transition ${
                      course.isEnrolled
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 w-4 h-4"
                      checked={selectedIds.includes(course.nptelCourseId) || course.isEnrolled}
                      onChange={() => handleSelect(course.nptelCourseId)}
                      disabled={course.isEnrolled}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{course.courseTitle}</p>
                        <span
                          className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                            course.type === "OEC" ? "bg-indigo-100 text-indigo-700" : "bg-violet-100 text-violet-700"
                          }`}
                        >
                          {course.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {course.courseCode} | Credits: {course.credits}
                      </p>
                      {course.isEnrolled && (
                        <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
                          <BadgeCheck className="w-3.5 h-3.5" />
                          Already enrolled
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {selectedSemester && selectableCourses.length > 0 && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleEnroll}
                  disabled={selectedCount === 0 || loading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    selectedCount === 0 || loading
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  Enroll Selected ({selectedCount})
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">My Enrolled NPTEL Courses</h2>
            {enrolledNptel.length === 0 ? (
              <p className="text-sm text-slate-500">No enrolled NPTEL courses yet.</p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {enrolledNptel.map((enroll) => (
                  <div key={enroll.enrollmentId} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{enroll.courseTitle}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {enroll.courseCode} | {enroll.type} | {enroll.credits} Credits
                        </p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Clock3 className="w-3.5 h-3.5" />
                          Semester {enroll.semesterNumber}
                        </p>
                      </div>
                      {enroll.importedGrade ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                          Grade {enroll.importedGrade}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">
                          Grade Pending
                        </span>
                      )}
                    </div>

                    {enroll.importedGrade && (!enroll.studentStatus || enroll.studentStatus === "pending") && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleStudentDecision(enroll.enrollmentId, "accepted")}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          Accept Credit
                        </button>
                        <button
                          onClick={() => handleStudentDecision(enroll.enrollmentId, "rejected")}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                        >
                          Reject Credit
                        </button>
                      </div>
                    )}

                    {enroll.studentStatus && enroll.studentStatus !== "pending" && (
                      <div
                        className={`mt-3 text-xs font-semibold inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${
                          enroll.studentStatus === "accepted"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {enroll.studentStatus === "accepted" ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {enroll.studentStatus === "accepted" ? "Accepted" : "Rejected"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NptelSelection;
