import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  GraduationCap,
  Users,
  Calendar,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react";

const API_BASE_URL = "http://localhost:4000";

export default function AdminAttendanceGenerator() {
  const [selectedDate, setSelectedDate] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Filter States
  const [degrees, setDegrees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedDegree, setSelectedDegree] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    if (!selectedDate) {
      setSelectedDate(new Date().toISOString().split("T")[0]);
    }
  }, []);

  // Fetch Metadata (Degrees, Batches, Depts)
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
              id: d.Deptid,
              name: d.Deptname,
              code: d.deptCode,
            }))
          );
        }
      } catch (err) {
        toast.error("Failed to load metadata");
      }
    };
    fetchMetadata();
  }, []);

  useEffect(() => {
    if (selectedDegree && selectedBatch && selectedDepartment) {
      const fetchSems = async () => {
        const bData = batches.find(
          (b) => b.batchId === parseInt(selectedBatch)
        );
        try {
          const res = await axios.get(
            `${API_BASE_URL}/api/admin/semesters/by-batch-branch`,
            {
              params: {
                degree: selectedDegree,
                batch: bData.batch,
                branch: bData.branch,
              },
            }
          );
          setSemesters(res.data.data || []);
        } catch (err) {
          setSemesters([]);
        }
      };
      fetchSems();
    }
  }, [selectedDegree, selectedBatch, selectedDepartment]);

  // ACTION: Fetch Student Roster
  const fetchStudents = async () => {
    if (!selectedSemester || !selectedDepartment) {
      return toast.error("Please select all filters including Department");
    }

    setLoading(true);
    setStudents([]);

    try {
      const bData = batches.find((b) => b.batchId === parseInt(selectedBatch));

      const res = await axios.get(
        `${API_BASE_URL}/api/admin/attendance/students-list`,
        {
          params: {
            degree: selectedDegree,
            batch: bData.batch,
            semesterId: selectedSemester,
            Deptid: selectedDepartment,
          },
        }
      );

      if (res.data.status === "success") {
        setStudents(res.data.data.map((s) => ({ ...s, selected: false })));
      } else {
        toast.error(res.data.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  const toggleStudent = (roll) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.rollnumber === roll ? { ...s, selected: !s.selected } : s
      )
    );
  };

  const toggleAll = () => {
    const allSel = students.every((s) => s.selected);
    setStudents((prev) => prev.map((s) => ({ ...s, selected: !allSel })));
  };

  // ACTION: Save Full Day OD
  const handleSaveFullDayOD = async () => {
    const selectedList = students.filter((s) => s.selected);
    if (selectedList.length === 0) return toast.error("Select students first");

    setSaving(true);
    try {
      const bData = batches.find((b) => b.batchId === parseInt(selectedBatch));
      await axios.post(
        `${API_BASE_URL}/api/admin/attendance/mark-full-day-od`,
        {
          startDate: selectedDate,
          endDate: selectedDate,
          degree: selectedDegree,
          batch: bData.batch,
          Deptid: selectedDepartment,
          semesterId: selectedSemester,
          students: selectedList,
        }
      );
      toast.success("Full Day On-Duty marked successfully!");
      setStudents((prev) => prev.map((s) => ({ ...s, selected: false })));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save OD");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      {/* Top Header Section matching image */}
      <div className="flex flex-col items-center pt-12 pb-10">
        <div className="w-20 h-20 border-2 border-slate-900 rounded-full flex items-center justify-center mb-6">
          <GraduationCap size={44} strokeWidth={1.5} />
        </div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">
          ADMIN ATTENDANCE
        </h1>
      </div>

      <div className="w-full border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* Filters Grid matching image */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="flex flex-col">
              <label className="text-xs font-bold uppercase mb-2 tracking-tight">
                Degree
              </label>
              <select
                value={selectedDegree}
                onChange={(e) => setSelectedDegree(e.target.value)}
                className="border border-slate-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-black outline-none bg-white"
              >
                <option value="">Select</option>
                {degrees.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold uppercase mb-2 tracking-tight">
                Batch
              </label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="border border-slate-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-black outline-none bg-white"
              >
                <option value="">Select</option>
                {batches
                  .filter((b) => b.degree === selectedDegree)
                  .map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.batch}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold uppercase mb-2 tracking-tight">
                Dept
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="border border-slate-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-black outline-none bg-white"
              >
                <option value="">Select</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold uppercase mb-2 tracking-tight">
                Sem
              </label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="border border-slate-300 rounded-md p-2.5 text-sm focus:ring-1 focus:ring-black outline-none bg-white"
              >
                <option value="">Select</option>
                {semesters.map((s) => (
                  <option key={s.semesterId} value={s.semesterId}>
                    {s.semesterNumber}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date and Button Row matching image */}
          <div className="flex flex-col md:flex-row items-end justify-center gap-4">
            <div className="flex flex-col w-full md:w-auto">
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-slate-300 rounded-md p-2.5 text-sm w-full md:w-48 outline-none pr-10"
                />
              </div>
            </div>
            <button
              onClick={fetchStudents}
              className="bg-black text-white font-bold px-10 py-2.5 rounded-md text-sm uppercase hover:bg-slate-800 transition-all"
            >
              {loading ? "Loading..." : "Get Students"}
            </button>
          </div>
        </div>
      </div>

      {/* Student Selection List */}
      {students.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 pb-20 mt-4">
          <div className="border-2 border-black shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] bg-white overflow-hidden">
            <div className="bg-black text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Users size={18} />
                <span className="font-bold uppercase tracking-widest text-sm">
                  Student List
                </span>
              </div>
              <button
                onClick={toggleAll}
                className="text-[10px] font-black border border-white px-3 py-1 uppercase hover:bg-white hover:text-black transition-colors"
              >
                {students.every((s) => s.selected)
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 sticky top-0 border-b-2 border-black">
                  <tr>
                    <th className="p-4 text-[10px] font-black uppercase">
                      Roll Number
                    </th>
                    <th className="p-4 text-[10px] font-black uppercase">
                      Name
                    </th>
                    <th className="p-4 text-[10px] font-black uppercase text-center">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => (
                    <tr
                      key={s.rollnumber}
                      onClick={() => toggleStudent(s.rollnumber)}
                      className={`cursor-pointer transition-colors ${
                        s.selected ? "bg-slate-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="p-4 font-mono text-sm">{s.rollnumber}</td>
                      <td className="p-4 font-bold uppercase text-sm">
                        {s.name}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center">
                          {s.selected ? (
                            <CheckSquare size={24} fill="black" color="white" />
                          ) : (
                            <Square size={24} color="#cbd5e1" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-8 bg-white border-t-4 border-black flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-start gap-2">
                <AlertCircle size={20} className="text-slate-400 mt-0.5" />
                <p className="text-[10px] font-bold text-slate-400 max-w-xs uppercase leading-relaxed">
                  Students will be marked as On-Duty for the selected day.
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-300 uppercase">
                    Selected
                  </p>
                  <p className="text-2xl font-black">
                    {students.filter((s) => s.selected).length}
                  </p>
                </div>
                <button
                  onClick={handleSaveFullDayOD}
                  disabled={saving}
                  className="bg-black text-white px-12 py-4 font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform disabled:opacity-20 active:translate-y-1"
                >
                  {saving ? "Marking..." : "Apply Bulk OD"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ToastContainer position="bottom-right" theme="dark" hideProgressBar />
    </div>
  );
}
