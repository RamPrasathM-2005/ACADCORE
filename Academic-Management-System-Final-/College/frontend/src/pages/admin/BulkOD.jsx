import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { CheckSquare, Square, Users, AlertCircle, Loader2, Search } from "lucide-react";

const API_BASE_URL = "http://localhost:4000";
axios.defaults.withCredentials = true;

export default function AdminAttendanceGenerator() {
  const [selectedDate, setSelectedDate] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [degrees, setDegrees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedDegree, setSelectedDegree] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");

  useEffect(() => {
    if (!selectedDate) setSelectedDate(new Date().toISOString().split("T")[0]);
  }, [selectedDate]);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [bRes, dRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/admin/timetable/batches`),
          axios.get(`${API_BASE_URL}/api/admin/timetable/departments`),
        ]);

        if (bRes.data?.status === "success") {
          setDegrees([...new Set(bRes.data.data.map((b) => b.degree))]);
          setBatches(bRes.data.data);
        }

        if (dRes.data?.status === "success") {
          setDepartments(
            dRes.data.data.map((d) => ({
              id: d.departmentId,
              name: d.Deptname,
              code: d.deptCode,
            }))
          );
        }
      } catch {
        toast.error("Failed to load metadata");
      }
    };

    fetchMetadata();
  }, []);

  useEffect(() => {
    if (selectedDegree && selectedBatch && selectedDepartment) {
      const fetchSems = async () => {
        const bData = batches.find((b) => b.batchId === parseInt(selectedBatch, 10));
        if (!bData) return;

        try {
          const res = await axios.get(`${API_BASE_URL}/api/admin/semesters/by-batch-branch`, {
            params: {
              degree: selectedDegree,
              batch: bData.batch,
              branch: bData.branch,
            },
          });
          setSemesters(res.data.data || []);
        } catch {
          setSemesters([]);
        }
      };

      fetchSems();
    } else {
      setSemesters([]);
    }
  }, [selectedDegree, selectedBatch, selectedDepartment, batches]);

  const fetchStudents = async () => {
    if (!selectedDegree || !selectedBatch || !selectedSemester || !selectedDepartment) {
      return toast.error("Please select Degree, Batch, Department and Semester");
    }

    setLoading(true);
    setStudents([]);

    try {
      const bData = batches.find((b) => b.batchId === parseInt(selectedBatch, 10));
      if (!bData) {
        toast.error("Invalid batch selected");
        return;
      }

      const res = await axios.get(`${API_BASE_URL}/api/admin/attendance/students-list`, {
        params: {
          degree: selectedDegree,
          batch: bData.batch,
          semesterId: selectedSemester,
          departmentId: selectedDepartment,
        },
      });

      if (res.data.status === "success") {
        setStudents(res.data.data.map((s) => ({ ...s, selected: false })));
      } else {
        toast.error(res.data.message || "Failed to load students");
      }
    } catch {
      toast.error("Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  const toggleStudent = (roll) => {
    setStudents((prev) => prev.map((s) => (s.rollnumber === roll ? { ...s, selected: !s.selected } : s)));
  };

  const toggleAll = () => {
    const allSelected = students.length > 0 && students.every((s) => s.selected);
    setStudents((prev) => prev.map((s) => ({ ...s, selected: !allSelected })));
  };

  const handleSaveFullDayOD = async () => {
    const selectedList = students.filter((s) => s.selected);
    if (selectedList.length === 0) return toast.error("Select students first");

    setSaving(true);
    try {
      const bData = batches.find((b) => b.batchId === parseInt(selectedBatch, 10));
      if (!bData) {
        toast.error("Invalid batch selected");
        return;
      }

      await axios.post(`${API_BASE_URL}/api/admin/attendance/mark-full-day-od`, {
        startDate: selectedDate,
        endDate: selectedDate,
        degree: selectedDegree,
        batch: bData.batch,
        departmentId: selectedDepartment,
        semesterId: selectedSemester,
        students: selectedList,
      });

      toast.success("Full Day On-Duty marked successfully!");
      setStudents((prev) => prev.map((s) => ({ ...s, selected: false })));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save OD");
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = students.filter((s) => s.selected).length;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bulk OD</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Admin Attendance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <FilterField label="Degree" value={selectedDegree} onChange={setSelectedDegree}>
              <option value="">Select</option>
              {degrees.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </FilterField>

            <FilterField label="Batch" value={selectedBatch} onChange={setSelectedBatch}>
              <option value="">Select</option>
              {batches
                .filter((b) => b.degree === selectedDegree)
                .map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.batch}
                  </option>
                ))}
            </FilterField>

            <FilterField label="Department" value={selectedDepartment} onChange={setSelectedDepartment}>
              <option value="">Select</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </FilterField>

            <FilterField label="Semester" value={selectedSemester} onChange={setSelectedSemester}>
              <option value="">Select</option>
              {semesters.map((s) => (
                <option key={s.semesterId} value={s.semesterId}>
                  {s.semesterNumber}
                </option>
              ))}
            </FilterField>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-slate-300"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={fetchStudents}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-slate-800"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {loading ? "Loading" : "Get Students"}
            </button>
          </div>
        </section>

        {students.length > 0 && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Users size={18} />
                <h2 className="text-lg font-semibold">Student List</h2>
              </div>
              <button
                onClick={toggleAll}
                className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                {students.every((s) => s.selected) ? "Deselect All" : "Select All"}
              </button>
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Register No</th>
                    <th className="border-b border-slate-200 px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Student Name</th>
                    <th className="border-b border-slate-200 px-6 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Select</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr
                      key={s.rollnumber}
                      onClick={() => toggleStudent(s.rollnumber)}
                      className={`cursor-pointer border-b border-slate-100 transition ${s.selected ? "bg-slate-50" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-slate-700">{s.rollnumber}</td>
                      <td className="px-6 py-4 text-sm text-slate-900">{s.name}</td>
                      <td className="px-6 py-4 text-center">
                        {s.selected ? (
                          <CheckSquare size={20} className="mx-auto text-slate-900" />
                        ) : (
                          <Square size={20} className="mx-auto text-slate-300" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <AlertCircle size={16} className="mt-0.5 text-slate-400" />
                Selected students will be marked On-Duty for the chosen date.
              </div>

              <div className="flex items-center gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  Selected: <span className="text-slate-900">{selectedCount}</span>
                </div>
                <button
                  onClick={handleSaveFullDayOD}
                  disabled={saving}
                  className="inline-flex h-11 items-center rounded-xl bg-slate-900 px-6 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? "Applying..." : "Apply Bulk OD"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      <ToastContainer position="bottom-right" theme="colored" autoClose={2000} />
    </div>
  );
}

function FilterField({ label, value, onChange, children }) {
  return (
    <div>
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

