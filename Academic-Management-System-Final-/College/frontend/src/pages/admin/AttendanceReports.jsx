import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Download, FileSearch, ShieldAlert } from "lucide-react";

const API_BASE_URL = "http://localhost:4000";

export default function AttendanceReport() {
  const [filters, setFilters] = useState({
    degree: "Select Degree",
    batch: "Select Batch",
    department: "Select Department",
    semester: "Select Semester",
    fromDate: "2025-10-20",
    toDate: "2025-10-26",
  });

  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [report, setReport] = useState([]);
  const [courses, setCourses] = useState([]);
  const [unmarkedReport, setUnmarkedReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [minPercentage, setMinPercentage] = useState("");

  const fetchWithAuth = async (url) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    return res.json();
  };

  useEffect(() => {
    const loadBatches = async () => {
      try {
        setLoading(true);
        const data = await fetchWithAuth(`${API_BASE_URL}/api/admin/attendanceReports/batches`);
        if (data.success) setBatches(data.batches || []);
        else throw new Error(data.error || "Failed to fetch batches");
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadBatches();
  }, []);

  useEffect(() => {
    const loadDepartments = async () => {
      if (!filters.batch === "Select Batch") {
        setDepartments([]);
        return;
      }

      try {
        setLoading(true);
        const data = await fetchWithAuth(`${API_BASE_URL}/api/admin/attendanceReports/departments/${filters.batch}`);
        if (data.success) setDepartments(data.departments || []);
        else throw new Error(data.error || "Failed to fetch departments");
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadDepartments();
  }, [filters.batch]);

  useEffect(() => {
    const loadSemesters = async () => {
      if (!filters.batch || !filters.department === "Select Department") {
        setSemesters([]);
        return;
      }

      try {
        setLoading(true);
        const data = await fetchWithAuth(
          `${API_BASE_URL}/api/admin/attendanceReports/semesters/${filters.batch}/${filters.department}`
        );
        if (data.success) setSemesters(data.semesters || []);
        else throw new Error(data.error || "Failed to fetch semesters");
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadSemesters();
  }, [filters.batch, filters.department]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleDownloadExcel = () => {
    if (report.length === 0) {
      alert("No report data to export!");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(report);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const data = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(data, `Attendance_Report_${filters.fromDate}_to_${filters.toDate}.xlsx`);
  };

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `${API_BASE_URL}/api/admin/attendanceReports/subject-wise/${filters.degree}/${filters.batch}/${filters.department}/${filters.semester}?fromDate=${filters.fromDate}&toDate=${filters.toDate}`;
      const data = await fetchWithAuth(url);

      if (data.success) {
        setReport(data.report || []);
        setCourses(data.courses || []);
        setUnmarkedReport([]);
      } else {
        throw new Error(data.error || "Failed to generate report");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBlackBoxReport = async () => {
    if (
      !filters.batch === "Select Batch" ||
      !filters.semester === "Select Semester" ||
      !filters.fromDate ||
      !filters.toDate
    ) {
      setError("Please select all required filters and log in.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setReport([]);
      setCourses([]);

      const url = `${API_BASE_URL}/api/admin/attendanceReports/unmarked/${filters.batch}/${filters.semester}?fromDate=${filters.fromDate}&toDate=${filters.toDate}&departmentId=${filters.department}`;
      const data = await fetchWithAuth(url);
      if (data.success) {
        setUnmarkedReport(data.report || []);
      } else {
        throw new Error(data.error || "Failed to generate black box report");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[96rem] space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Attendance Reports</h1>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Admin Attendance Management</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Field label="Degree">
              <select
                name="degree"
                value={filters.degree}
                onChange={handleInputChange}
                className="field-input"
              >
                <option value="Select Degree">Select Degree</option>
                <option value="BE">BE</option>
                <option value="B.Tech">B.Tech</option>
                <option value="ME">ME</option>
                <option value="M.Tech">M.Tech</option>
              </select>
            </Field>

            <Field label="Batch">
              <select
                name="batch"
                value={filters.batch}
                onChange={handleInputChange}
                disabled={!filters.degree === "Select Degree"}
                className="field-input"
              >
                <option value="Select Batch">Select Batch</option>
                {batches.map((batch) => (
                  <option key={batch.batchId} value={batch.batchId}>
                    {batch.batch}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Department">
              <select
                name="department"
                value={filters.department}
                onChange={handleInputChange}
                disabled={!filters.batch === "Select Batch"}
                className="field-input"
              >
                <option value="Select Department">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept.departmentId} value={dept.departmentId}>
                    {dept.departmentName} ({dept.departmentCode})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Semester">
              <select
                name="semester"
                value={filters.semester}
                onChange={handleInputChange}
                disabled={!filters.department === "Select Department"}
                className="field-input"
              >
                <option value="Select Semester">Select Semester</option>
                {semesters.map((sem) => (
                  <option key={sem.semesterId} value={sem.semesterId}>
                    Semester {sem.semesterNumber}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="From Date">
              <input type="date" name="fromDate" value={filters.fromDate} onChange={handleInputChange} className="field-input" />
            </Field>

            <Field label="To Date">
              <input
                type="date"
                name="toDate"
                value={filters.toDate}
                min={filters.fromDate}
                onChange={handleInputChange}
                className="field-input"
              />
            </Field>

            <Field label="Below %">
              <input
                type="number"
                min="0"
                max="100"
                placeholder="Enter %"
                value={minPercentage}
                onChange={(e) => setMinPercentage(e.target.value)}
                className="field-input"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              onClick={handleGenerateReport}
              disabled={
                loading ||
                !filters.fromDate ||
                !filters.toDate ||
                filters.degree === "Select Degree" ||
                filters.batch === "Select Batch" ||
                filters.department === "Select Department" ||
                filters.semester === "Select Semester"
              }
            >
              <FileSearch size={14} />
              {loading ? "Generating..." : "Generate Report"}
            </ActionButton>

            <ActionButton
              onClick={handleBlackBoxReport}
              disabled={
                loading ||
                !filters.fromDate ||
                !filters.toDate ||
                filters.batch === "Select Batch" ||
                filters.department === "Select Department" ||
                filters.semester === "Select Semester"
              }
              variant="secondary"
            >
              <ShieldAlert size={14} />
              Black Box Report
            </ActionButton>

            <ActionButton onClick={handleDownloadExcel} disabled={report.length === 0 || loading} variant="success">
              <Download size={14} />
              Download Excel
            </ActionButton>
          </div>

          {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
        </section>

        {report.length > 0 && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-head">Register Number</th>
                    <th className="table-head">Student Name</th>
                    {courses.map((courseCode) => (
                      <React.Fragment key={courseCode}>
                        <th className="table-head">{courseCode} Conducted</th>
                        <th className="table-head">{courseCode} Attended</th>
                        <th className="table-head">{courseCode} Att%</th>
                      </React.Fragment>
                    ))}
                    <th className="table-head">Total Conducted</th>
                    <th className="table-head">Total Attended</th>
                    <th className="table-head">Total %</th>
                  </tr>
                </thead>
                <tbody>
                  {report
                    .filter((student) => {
                      if (!minPercentage) return true;
                      return parseFloat(student["Total Percentage %"]) < parseFloat(minPercentage);
                    })
                    .map((student, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="table-cell">{student.RegisterNumber}</td>
                        <td className="table-cell">{student.StudentName}</td>
                        {courses.map((courseCode) => [
                          <td key={`${student.RegisterNumber}-conducted-${courseCode}`} className="table-cell">
                            {student[`${courseCode} Conducted Periods`] || 0}
                          </td>,
                          <td key={`${student.RegisterNumber}-attended-${courseCode}`} className="table-cell">
                            {student[`${courseCode} Attended Periods`] || 0}
                          </td>,
                          <td key={`${student.RegisterNumber}-percentage-${courseCode}`} className="table-cell">
                            {student[`${courseCode} Att%`] || "0.00"}
                          </td>,
                        ])}
                        <td className="table-cell">{student["Total Conducted Periods"]}</td>
                        <td className="table-cell">{student["Total Attended Periods"]}</td>
                        <td className="table-cell">{student["Total Percentage %"]}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {unmarkedReport.length > 0 && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Black Box Report - Unmarked Attendance</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-head">Date</th>
                    <th className="table-head">Day</th>
                    <th className="table-head">Period Number</th>
                    <th className="table-head">Course Code</th>
                    <th className="table-head">Course Title</th>
                    <th className="table-head">Section</th>
                    <th className="table-head">Staff Name</th>
                    <th className="table-head">Staff ID</th>
                  </tr>
                </thead>
                <tbody>
                  {unmarkedReport.map((entry, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="table-cell">{entry.Date}</td>
                      <td className="table-cell">{entry.Day}</td>
                      <td className="table-cell">{entry.PeriodNumber}</td>
                      <td className="table-cell">{entry.CourseCode}</td>
                      <td className="table-cell">{entry.CourseTitle}</td>
                      <td className="table-cell">{entry.Section}</td>
                      <td className="table-cell">{entry.StaffName}</td>
                      <td className="table-cell">{entry.StaffNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {report.length === 0 && unmarkedReport.length === 0 && !loading && !error && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500">
            No attendance data available for the selected filters.
          </div>
        )}
      </div>

      <style>{`
        .field-input {
          height: 44px;
          width: 100%;
          border-radius: 12px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 0 12px;
          font-size: 0.875rem;
          color: rgb(51 65 85);
          outline: none;
        }
        .field-input:focus {
          border-color: rgb(148 163 184);
        }
        .field-input:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .table-head {
          border-bottom: 1px solid rgb(226 232 240);
          padding: 12px;
          text-align: center;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgb(100 116 139);
          white-space: nowrap;
        }
        .table-cell {
          padding: 12px;
          text-align: center;
          color: rgb(30 41 59);
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function ActionButton({ children, onClick, disabled, variant = "primary" }) {
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "bg-slate-700 text-white hover:bg-slate-600",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold uppercase tracking-[0.14em] transition disabled:opacity-60 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

