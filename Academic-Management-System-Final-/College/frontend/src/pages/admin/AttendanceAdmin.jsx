import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Loader2, Search, Calendar, ChevronDown } from "lucide-react";

const API_BASE_URL = "http://localhost:4000";
axios.defaults.withCredentials = true;

const PortalDropdown = ({ isOpen, onClose, rect, children }) => {
  if (!isOpen || !rect) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        style={{ top: rect.bottom + 6, left: rect.left, width: rect.width }}
      >
        {children}
      </div>
    </>,
    document.body
  );
};

const CourseSlot = ({ courses, date, periodNumber, selectedCourse, onSelect }) => {
  const [isOpen, setOpen] = useState(false);
  const buttonRef = useRef(null);

  if (!courses.length === 0) {
    return <div className="flex h-full items-center justify-center text-slate-300">-</div>;
  }

  const isSelected = courses.some(
    (c) =>
      selectedCourse?.courseId === c.courseId &&
      selectedCourse?.date === date &&
      selectedCourse?.periodNumber === periodNumber &&
      selectedCourse?.sectionId === (c.sectionId || "all")
  );

  if (courses.length === 1) {
    const course = courses[0];
    const selected =
      selectedCourse?.courseId === course.courseId &&
      selectedCourse?.date === date &&
      selectedCourse?.periodNumber === periodNumber &&
      selectedCourse?.sectionId === (course.sectionId || "all");

    return (
      <button
        onClick={() => onSelect(course)}
        className={`h-full w-full rounded-lg border p-2 text-left transition ${
          selected
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
        }`}
      >
        <div className="truncate text-[11px] font-bold">{course.courseCode}</div>
        <div className={`truncate text-[10px] ${selected ? "text-slate-300" : "text-slate-400"}`}>{course.courseTitle}</div>
      </button>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
        className={`h-full w-full rounded-lg border p-2 text-center transition ${
          isSelected
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
        }`}
      >
        <div className="flex items-center justify-center gap-1 text-[11px] font-semibold">
          {courses.length} Options <ChevronDown size={12} />
        </div>
        <div className={`text-[10px] ${isSelected ? "text-slate-300" : "text-slate-400"}`}>Elective</div>
      </button>

      <PortalDropdown isOpen={isOpen} onClose={() => setOpen(false)} rect={buttonRef.current?.getBoundingClientRect()}>
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Select Course
        </div>
        {courses.map((c, idx) => (
          <button
            key={idx}
            onClick={() => {
              onSelect(c);
              setOpen(false);
            }}
            className="w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50"
          >
            <div className="font-semibold">{c.courseCode}</div>
            <div className="truncate text-[10px] text-slate-400">{c.courseTitle}</div>
          </button>
        ))}
      </PortalDropdown>
    </>
  );
};

export default function AdminAttendanceGenerator() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [timetable, setTimetable] = useState({});
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [degrees, setDegrees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);

  const [selectedDegree, setSelectedDegree] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [timeSlots, setTimeSlots] = useState([]);

  useEffect(() => {
    if (!fromDate) {
      const today = new Date().toISOString().split("T")[0];
      setFromDate(today);
      setToDate(today);
    }
  }, [fromDate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [batchRes, deptRes, periodRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/admin/timetable/batches`),
          axios.get(`${API_BASE_URL}/api/admin/timetable/departments`),
          axios.get(`${API_BASE_URL}/api/admin/timetable-periods`),
        ]);

        if (batchRes.data?.data) {
          setDegrees([...new Set(batchRes.data.data.map((b) => b.degree))]);
          setBatches(batchRes.data.data);
        }

        if (deptRes.data?.data) {
          setDepartments(
            deptRes.data.data.map((d) => ({
              departmentId: d.departmentId,
              departmentName: d.Deptname,
            }))
          );
        }

        const periods = Array.isArray(periodRes?.data?.data)
          ? periodRes.data.data
              .map((p) => ({
                periodNumber: Number(p.id),
                time: p.startTime && p.endTime ? `${p.startTime} - ${p.endTime}` : "Time not set",
              }))
              .filter((p) => Number.isInteger(p.periodNumber))
              .sort((a, b) => a.periodNumber - b.periodNumber)
          : [];

        setTimeSlots(
          periods.length > 0
            ? periods
            : Array.from({ length: 8 }, (_, i) => ({
                periodNumber: i + 1,
                time: "Time not set",
              }))
        );
      } catch (e) {
        console.error(e);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDegree && selectedBatch && selectedDepartment) {
      const fetchSemesters = async () => {
        const batchData = batches.find((b) => b.batchId === parseInt(selectedBatch, 10));
        if (!batchData) return;

        try {
          const res = await axios.get(`${API_BASE_URL}/api/admin/semesters/by-batch-branch`, {
            params: { degree: selectedDegree, batch: batchData.batch, branch: batchData.branch },
          });
          if (res.data?.status === "success") setSemesters(res.data.data);
        } catch {
          setSemesters([]);
        }
      };

      fetchSemesters();
    } else {
      setSemesters([]);
    }
  }, [selectedDegree, selectedBatch, selectedDepartment, batches]);

  const generateDates = () => {
    if (!fromDate || !toDate) return [];

    const dates = [];
    let current = new Date(fromDate);
    const end = new Date(toDate);

    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const dates = generateDates();

  const handleGenerate = async () => {
    setLoading(true);
    setTimetable({});
    setSelectedCourse(null);

    try {
      const batchData = batches.find((b) => b.batchId === parseInt(selectedBatch, 10));
      if (!batchData || !selectedDegree || !selectedDepartment || !selectedSemester) {
        toast.error("Please select valid Degree, Batch, Department and Semester");
        return;
      }

      const res = await axios.get(`${API_BASE_URL}/api/admin/attendance/timetable`, {
        params: {
          startDate: fromDate,
          endDate: toDate,
          degree: selectedDegree,
          batch: batchData.batch,
          branch: batchData.branch,
          departmentId: selectedDepartment,
          semesterId: selectedSemester,
        },
      });

      if (res.data.data?.timetable) setTimetable(res.data.data.timetable);
      else toast.info("No data found");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Error loading timetable");
    } finally {
      setLoading(false);
    }
  };

  const handleCourseSelect = async (courseData) => {
    const { courseId, sectionId, sectionName, periodNumber, courseTitle, courseCode, date } = courseData;

    try {
      const batchData = batches.find((b) => b.batchId === parseInt(selectedBatch, 10));
      const dayOfWeek = new Date(date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
      const res = await axios.get(
        `${API_BASE_URL}/api/admin/attendance/students/${courseId}/${sectionId || "all"}/${dayOfWeek}/${periodNumber}`,
        {
          params: {
            date,
            departmentId: selectedDepartment,
            semesterId: selectedSemester,
            batch: batchData?.batch,
          },
        }
      );

      if (res.data.data) {
        setStudents(res.data.data.map((s) => ({ ...s, status: s.status || "P" })));
        setSelectedCourse({
          courseId,
          courseTitle,
          courseCode,
          sectionId: sectionId || "all",
          sectionName,
          date,
          periodNumber,
        });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not fetch students");
    }
  };

  const handleSave = async () => {
    if (!selectedCourse) return;

    setSaving(true);
    try {
      const attendances = students.map((s) => ({
        rollnumber: s.rollnumber,
        status: s.status,
        courseId: s.courseId || selectedCourse.courseId,
      }));

      const dayOfWeek = new Date(selectedCourse.date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
      const saveRes = await axios.post(
        `${API_BASE_URL}/api/admin/attendance/mark/${selectedCourse.courseId}/${selectedCourse.sectionId || "all"}/${dayOfWeek}/${selectedCourse.periodNumber}`,
        {
          date: selectedCourse.date,
          attendances,
          departmentId: selectedDepartment,
          semesterId: selectedSemester,
        }
      );

      const processedCount = saveRes?.data?.data?.processedCount ?? 0;
      const skippedCount = saveRes?.data?.data?.skippedCount ?? 0;

      if (processedCount > 0) {
        toast.success(`Attendance saved (${processedCount})`);
        setSelectedCourse(null);
      } else {
        toast.error(`Nothing saved. Skipped ${skippedCount} records.`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = (roll, status) => {
    setStudents((prev) => prev.map((s) => (s.rollnumber === roll ? { ...s, status } : s)));
  };

  const markAllAs = (status) => {
    setStudents((prev) => prev.map((s) => ({ ...s, status })));
  };

  const stats = {
    P: students.filter((s) => s.status === "P").length,
    A: students.filter((s) => s.status === "A").length,
    OD: students.filter((s) => s.status === "OD").length,
  };

  const groupedStudents = useMemo(() => {
    const groups = students.reduce((acc, student) => {
      const sectionName = student.sectionName || "Unassigned";
      if (!acc[sectionName]) {
        acc[sectionName] = {
          sectionName,
          staffName: student.staffName || "Not Assigned",
          students: [],
        };
      }
      if (!acc[sectionName].staffName || acc[sectionName].staffName === "Not Assigned") {
        acc[sectionName].staffName = student.staffName || acc[sectionName].staffName;
      }
      acc[sectionName].students.push(student);
      return acc;
    }, {});

    return Object.values(groups)
      .sort((a, b) => a.sectionName.localeCompare(b.sectionName))
      .map((group) => ({
        ...group,
        students: [...group.students].sort((x, y) => (x.rollnumber || "").localeCompare(y.rollnumber || "")),
      }));
  }, [students]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subject-wise Attendance</h1>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Admin Attendance</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <FilterField label="Degree" value={selectedDegree} onChange={setSelectedDegree} className="xl:col-span-1">
              <option value="">Select</option>
              {degrees.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </FilterField>

            <FilterField label="Batch" value={selectedBatch} onChange={setSelectedBatch} className="xl:col-span-1">
              <option value="">Select</option>
              {batches
                .filter((b) => b.degree === selectedDegree)
                .map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.batch}
                  </option>
                ))}
            </FilterField>

            <FilterField label="Department" value={selectedDepartment} onChange={setSelectedDepartment} className="xl:col-span-2">
              <option value="">Select</option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.departmentName}
                </option>
              ))}
            </FilterField>

            <FilterField label="Semester" value={selectedSemester} onChange={setSelectedSemester} className="xl:col-span-1">
              <option value="">Select</option>
              {semesters.map((s) => (
                <option key={s.semesterId} value={s.semesterId}>
                  {s.semesterNumber}
                </option>
              ))}
            </FilterField>

            <div className="xl:col-span-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
              />
            </div>

            <div className="xl:col-span-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
              />
            </div>

            <div className="flex items-end xl:col-span-1">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {loading ? "Loading" : "Load Grid"}
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Timetable</h2>
            <p className="text-xs text-slate-500">Click a slot to mark attendance.</p>
          </div>

          {Object.keys(timetable).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1024px] border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-r border-slate-200 px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Date
                    </th>
                    {timeSlots.map((slot) => (
                      <th
                        key={slot.periodNumber}
                        className="border-b border-r border-slate-200 px-2 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                      >
                        <div>P{slot.periodNumber}</div>
                        <div className="text-[10px] font-normal text-slate-400">{slot.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((date) => (
                    <tr key={date} className="border-b border-slate-100">
                      <td className="border-r border-slate-200 px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900">{date}</div>
                        <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                          {new Date(date).toLocaleDateString("en-US", { weekday: "long" })}
                        </div>
                      </td>

                      {timeSlots.map((slot) => {
                        const coursesInSlot = (timetable[date] || [])
                          .filter((p) => p.periodNumber === slot.periodNumber)
                          .map((p) => ({ ...p, date }));

                        return (
                          <td key={slot.periodNumber} className="h-20 border-r border-slate-200 p-2 align-middle">
                            <CourseSlot
                              courses={coursesInSlot}
                              date={date}
                              periodNumber={slot.periodNumber}
                              selectedCourse={selectedCourse}
                              onSelect={handleCourseSelect}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center text-slate-400">
              <Calendar size={42} strokeWidth={1.3} />
              <p className="mt-3 text-sm">Select filters to load the timetable.</p>
            </div>
          )}
        </section>

        {selectedCourse && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {selectedCourse.courseCode} - Period {selectedCourse.periodNumber}
                </h2>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
                  {selectedCourse.date} {selectedCourse.courseTitle ? `- ${selectedCourse.courseTitle}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => markAllAs("P")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  All P
                </button>
                <button onClick={() => markAllAs("A")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  All A
                </button>
                <button onClick={() => markAllAs("OD")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  All OD
                </button>
                <button onClick={() => setSelectedCourse(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Register No</th>
                    <th className="border-b border-slate-200 px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Student Name</th>
                    <th className="border-b border-slate-200 px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedStudents.map((group) => (
                    <React.Fragment key={group.sectionName}>
                      <tr className="bg-slate-50">
                        <td colSpan="3" className="px-6 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Section: {group.sectionName} | Staff: {group.staffName || "Not Assigned"}
                        </td>
                      </tr>
                      {group.students.map((s) => (
                        <tr key={s.rollnumber} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-semibold text-slate-700">{s.rollnumber}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{s.name}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex justify-center gap-2">
                              {[
                                { key: "P", active: "bg-emerald-500 border-emerald-500 text-white" },
                                { key: "A", active: "bg-rose-500 border-rose-500 text-white" },
                                { key: "OD", active: "bg-sky-500 border-sky-500 text-white" },
                              ].map((st) => (
                                <button
                                  key={st.key}
                                  onClick={() => updateStatus(s.rollnumber, st.key)}
                                  className={`h-9 min-w-[42px] rounded-lg border text-xs font-semibold transition ${
                                    s.status === st.key
                                      ? st.active
                                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                                  }`}
                                >
                                  {st.key}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}

                  {students.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-6 py-12 text-center text-sm text-slate-400">
                        No students enrolled in this course/section.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                Present: <span className="text-slate-900">{stats.P}</span> | Absent: <span className="text-slate-900">{stats.A}</span> | OD: <span className="text-slate-900">{stats.OD}</span>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || students.length === 0}
                className="inline-flex h-11 items-center rounded-xl bg-slate-900 px-6 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Attendance"}
              </button>
            </div>
          </section>
        )}
      </div>

      <ToastContainer position="bottom-right" theme="colored" autoClose={2000} />
    </div>
  );
}

function FilterField({ label, value, onChange, children, className = "" }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
      >
        {children}
      </select>
    </div>
  );
}
