import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  GraduationCap,
  Loader2,
  Search,
  Calendar,
  ChevronDown,
  CheckCircle2,
  Minimize2
} from "lucide-react";

const API_BASE_URL = "http://localhost:4000";

// --- PORTAL DROPDOWN COMPONENT ---
const PortalDropdown = ({ isOpen, onClose, rect, children }) => {
  if (!isOpen || !rect) return null;

  const style = {
    position: 'fixed',
    top: `${rect.bottom + 5}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: 9999,
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div 
        style={style} 
        className="bg-white border border-slate-300 shadow-2xl rounded-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
      >
        {children}
      </div>
    </>,
    document.body
  );
};

// --- COURSE SLOT CELL ---
const CourseSlot = ({ courses, date, periodNumber, selectedCourse, onSelect }) => {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const buttonRef = useRef(null);

  if (!courses || courses.length === 0) {
    return <div className="h-full flex items-center justify-center text-slate-200 text-xl font-light select-none">·</div>;
  }

  const isSelected = courses.some(p => 
     selectedCourse?.courseId === p.courseId && 
     selectedCourse?.date === date && 
     selectedCourse?.periodNumber === periodNumber &&
     selectedCourse?.sectionId === (p.sectionId || 'all')
  );

  // Single Course
  if (courses.length === 1) {
    const p = courses[0];
    const thisSelected = selectedCourse?.courseId === p.courseId && selectedCourse?.date === date;
    
    return (
      <button
        onClick={() => onSelect(p)}
        className={`w-full h-full p-2 text-left rounded border transition-all relative group flex flex-col justify-center
          ${thisSelected 
            ? "bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-slate-900 ring-offset-1" 
            : "bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:shadow-sm"
          }`}
      >
        <div className="flex justify-between items-start w-full">
           <span className="font-bold text-[11px] truncate">{p.courseCode}</span>
           {thisSelected && <CheckCircle2 size={12} className="text-green-400"/>}
        </div>
        <div className={`text-[9px] truncate w-full ${thisSelected ? 'text-slate-300' : 'text-slate-400'}`}>
            {p.courseTitle}
        </div>
      </button>
    );
  }

  // Multiple Courses
  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setDropdownOpen(true)}
        className={`w-full h-full p-2 text-left rounded border flex flex-col justify-center items-center gap-1 transition-all
          ${isSelected ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300"}
        `}
      >
        <div className="text-[10px] font-bold uppercase flex items-center gap-1">
            {courses.length} Options <ChevronDown size={10} />
        </div>
        <div className={`text-[9px] text-center leading-tight ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
             Electives
        </div>
      </button>

      <PortalDropdown 
        isOpen={isDropdownOpen} 
        onClose={() => setDropdownOpen(false)}
        rect={buttonRef.current?.getBoundingClientRect()}
      >
          <div className="bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500 uppercase border-b border-slate-200">
              Select Course
          </div>
          {courses.map((p, idx) => (
              <button
                  key={idx}
                  onClick={() => {
                      onSelect(p);
                      setDropdownOpen(false);
                  }}
                  className="text-left px-3 py-2 text-xs bg-white hover:bg-slate-50 text-slate-700 border-b border-slate-100 last:border-0 hover:text-indigo-600 transition-colors"
              >
                  <div className="font-bold flex justify-between">
                    {p.courseCode}
                    {p.sectionName && <span className="bg-slate-200 px-1 rounded text-[9px]">{p.sectionName}</span>}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{p.courseTitle}</div>
              </button>
          ))}
      </PortalDropdown>
    </>
  );
};


export default function AdminAttendanceGenerator() {
  // ================= STATE =================
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [timetable, setTimetable] = useState({});
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Filters
  const [degrees, setDegrees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);

  const [selectedDegree, setSelectedDegree] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");

  // ================= EFFECTS =================
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    
    if (!fromDate) {
      const today = new Date();
      setFromDate(today.toISOString().split("T")[0]);
      setToDate(today.toISOString().split("T")[0]);
    }
  }, [fromDate]);

  useEffect(() => {
    const fetchData = async () => {
        try {
            const [batchRes, deptRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/admin/timetable/batches`),
                axios.get(`${API_BASE_URL}/api/admin/timetable/departments`)
            ]);
            
            if (batchRes.data?.data) {
                setDegrees([...new Set(batchRes.data.data.map(b => b.degree))]);
                setBatches(batchRes.data.data);
            }
            if (deptRes.data?.data) {
                setDepartments(deptRes.data.data.map(d => ({
                    departmentId: d.Deptid,
                    departmentName: d.Deptname
                })));
            }
        } catch(e) { console.error(e); }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDegree && selectedBatch && selectedDepartment) {
      const fetchSemesters = async () => {
        const batchData = batches.find((b) => b.batchId === parseInt(selectedBatch));
        if (!batchData) return;
        try {
          const res = await axios.get(`${API_BASE_URL}/api/admin/semesters/by-batch-branch`, {
              params: { degree: selectedDegree, batch: batchData.batch, branch: batchData.branch },
          });
          if (res.data?.status === "success") setSemesters(res.data.data);
        } catch (err) {}
      };
      fetchSemesters();
    } else {
      setSemesters([]);
    }
  }, [selectedDegree, selectedBatch, selectedDepartment, batches]);

  // ================= HELPERS =================
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
  
  const timeSlots = [
    { periodNumber: 1, time: "09:00 - 10:00" },
    { periodNumber: 2, time: "10:00 - 11:00" },
    { periodNumber: 3, time: "11:00 - 12:00" },
    { periodNumber: 4, time: "12:00 - 01:00" },
    { periodNumber: 5, time: "01:30 - 02:30" },
    { periodNumber: 6, time: "02:30 - 03:30" },
    { periodNumber: 7, time: "03:30 - 04:30" },
    { periodNumber: 8, time: "04:30 - 05:30" },
  ];

  // ================= HANDLERS =================
  const handleGenerate = async () => {
    setLoading(true);
    setTimetable({});
    setSelectedCourse(null);
    try {
      const batchData = batches.find((b) => b.batchId === parseInt(selectedBatch));
      const res = await axios.get(`${API_BASE_URL}/api/admin/attendance/timetable`, {
        params: {
          startDate: fromDate, endDate: toDate, degree: selectedDegree,
          batch: batchData.batch, branch: batchData.branch, Deptid: selectedDepartment, semesterId: selectedSemester,
        },
      });
      if (res.data.data?.timetable) setTimetable(res.data.data.timetable);
      else toast.info("No data found");
    } catch (err) { toast.error("Error loading timetable"); } 
    finally { setLoading(false); }
  };

  const handleCourseSelect = async (courseData) => {
    const { courseId, sectionId, sectionName, periodNumber, courseTitle, courseCode, date } = courseData;
    
    try {
        const dayOfWeek = new Date(date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
        const res = await axios.get(`${API_BASE_URL}/api/admin/attendance/students/${courseId}/${sectionId || 'all'}/${dayOfWeek}/${periodNumber}`, { params: { date } });
        
        if (res.data.data) {
            setStudents(res.data.data.map((s) => ({ ...s, status: s.status || "P" })));
            setSelectedCourse({ 
                courseId, 
                courseTitle, 
                courseCode,
                sectionId: sectionId || 'all', 
                sectionName, 
                date, 
                periodNumber 
            });
        }
    } catch (err) { 
        toast.error("Could not fetch students"); 
    }
  };

  const handleSave = async () => {
    if (!selectedCourse) return;
    setSaving(true);
    try {
      const attendances = students.map((s) => ({ rollnumber: s.rollnumber, status: s.status }));
      const dayOfWeek = new Date(selectedCourse.date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
      await axios.post(`${API_BASE_URL}/api/admin/attendance/mark/${selectedCourse.courseId}/${dayOfWeek}/${selectedCourse.periodNumber}`, { date: selectedCourse.date, attendances });
      toast.success("Attendance saved!");
      setSelectedCourse(null); 
    } catch (err) { toast.error("Save failed"); } 
    finally { setSaving(false); }
  };

  const updateStatus = (roll, status) => setStudents(prev => prev.map(s => s.rollnumber === roll ? {...s, status} : s));
  const markAllAs = (status) => setStudents(prev => prev.map(s => ({...s, status})));
  const stats = { P: students.filter(s => s.status === 'P').length, A: students.filter(s => s.status === 'A').length, OD: students.filter(s => s.status === 'OD').length };

  // ================= RENDER =================
  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* 1. TOP HEADER & FILTERS */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shadow-sm z-20 shrink-0">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-900 text-white rounded">
                        <GraduationCap size={20} />
                    </div>
                    <h1 className="text-xl font-bold uppercase tracking-tight text-slate-900">Attendance Manager</h1>
                </div>
            </div>
            
            <div className="flex flex-wrap items-end gap-2">
                 <FilterSelect label="Degree" value={selectedDegree} onChange={setSelectedDegree} options={degrees} />
                 <FilterSelect label="Batch" value={selectedBatch} onChange={setSelectedBatch} options={batches.filter(b => b.degree === selectedDegree).map(b => ({id: b.batchId, label: b.batch}))} valueKey="id" labelKey="label" />
                 <FilterSelect label="Dept" value={selectedDepartment} onChange={setSelectedDepartment} options={departments} valueKey="departmentId" labelKey="departmentName" className="flex-[2] min-w-[200px]" />
                 <FilterSelect label="Sem" value={selectedSemester} onChange={setSelectedSemester} options={semesters} valueKey="semesterId" labelKey="semesterNumber" className="w-20" />
                 
                 <div className="flex gap-2 items-end">
                    <DateInput label="From" value={fromDate} onChange={setFromDate} />
                    <DateInput label="To" value={toDate} onChange={setToDate} />
                 </div>

                 <button onClick={handleGenerate} disabled={loading} className="h-9 px-4 bg-slate-900 text-white rounded font-bold uppercase text-xs hover:bg-black disabled:opacity-50 transition-all flex items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" size={14}/> : <Search size={14} />}
                    <span>Load</span>
                 </button>
            </div>
      </div>

      {/* 2. MIDDLE: TIMETABLE */}
      <div className="flex-1 overflow-auto bg-slate-100 p-4">
            {Object.keys(timetable).length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-w-[1000px]"> 
                    <table className="w-full table-fixed border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-slate-500">
                            <tr>
                                <th className="w-24 p-3 border-r border-slate-200 text-[10px] font-bold uppercase tracking-wider text-left bg-slate-50">Date</th>
                                {timeSlots.map(slot => (
                                    <th key={slot.periodNumber} className="p-2 border-r border-slate-200 text-center bg-slate-50">
                                        <div className="text-slate-800 text-[11px] font-bold">P{slot.periodNumber}</div>
                                        <div className="text-[9px] text-slate-400 font-normal">{slot.time}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {dates.map(date => (
                                <tr key={date} className="hover:bg-slate-50/50 h-24"> 
                                    <td className="p-3 border-r border-slate-200 font-medium text-xs text-slate-700 bg-white">
                                        <div>{new Date(date).toLocaleDateString("en-US", { day: '2-digit', month: 'short' })}</div>
                                        <div className="text-[10px] text-slate-400 uppercase">{new Date(date).toLocaleDateString("en-US", { weekday: 'short' })}</div>
                                    </td>
                                    {timeSlots.map(slot => {
                                        const coursesInSlot = (timetable[date] || [])
                                            .filter(p => p.periodNumber === slot.periodNumber)
                                            .map(p => ({...p, date})); 

                                        return (
                                            <td key={slot.periodNumber} className="p-1 border-r border-slate-200 align-middle">
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
                <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                    <Calendar size={64} strokeWidth={1} />
                    <p className="mt-4 text-sm font-medium">Select filters to view the timetable</p>
                </div>
            )}
      </div>

      {/* 3. BOTTOM PANEL: STUDENT LIST (FIXED LIST VIEW) */}
      {selectedCourse && (
         <div className="h-96 bg-white border-t-4 border-slate-800 shrink-0 flex flex-col shadow-[0_-5px_30px_rgba(0,0,0,0.15)] z-30">
            
            {/* Panel Header */}
            <div className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wide">{selectedCourse.courseTitle}</h2>
                        <div className="text-[10px] text-slate-400 font-mono flex gap-2">
                             <span className="bg-slate-800 px-1 rounded text-white">{selectedCourse.courseCode}</span>
                             <span>{selectedCourse.date}</span>
                             <span>Period {selectedCourse.periodNumber}</span>
                        </div>
                    </div>
                    {/* Stats Badge */}
                    <div className="hidden md:flex gap-3 text-[10px] font-bold uppercase ml-6 bg-slate-800 p-1.5 rounded-md px-4 border border-slate-700">
                        <span className="text-green-400">P: {stats.P}</span>
                        <span className="text-red-400">A: {stats.A}</span>
                        <span className="text-blue-400">OD: {stats.OD}</span>
                    </div>
                </div>

                <div className="flex gap-2">
                     <button onClick={() => markAllAs("P")} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-[10px] font-bold uppercase transition-colors">All P</button>
                     <button onClick={() => markAllAs("A")} className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-[10px] font-bold uppercase transition-colors">All A</button>
                     <button onClick={() => markAllAs("OD")} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-[10px] font-bold uppercase transition-colors">All OD</button>
                     <button onClick={() => setSelectedCourse(null)} className="ml-4 p-1 hover:bg-slate-700 rounded transition-colors" title="Close"><Minimize2 size={16}/></button>
                </div>
            </div>

            {/* LIST VIEW (Table Structure) */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-0">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-500 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-wider w-32 border-b border-slate-200">Roll No</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">Student Name</th>
                            <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-center w-64 border-b border-slate-200">Attendance Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {students.map((s) => (
                            <tr key={s.rollnumber} className={`hover:bg-slate-50 transition-colors ${
                                s.status === 'A' ? 'bg-red-50 hover:bg-red-50' : 
                                s.status === 'OD' ? 'bg-blue-50 hover:bg-blue-50' : ''
                            }`}>
                                <td className="p-3 text-xs font-bold font-mono text-slate-700">{s.rollnumber}</td>
                                <td className="p-3 text-xs font-bold text-slate-900">{s.name}</td>
                                <td className="p-2 text-center">
                                    <div className="flex justify-center gap-1">
                                        {['P','A','OD'].map(st => (
                                            <button 
                                                key={st} 
                                                onClick={() => updateStatus(s.rollnumber, st)}
                                                className={`
                                                    w-8 h-8 rounded text-[10px] font-bold transition-all border 
                                                    ${s.status === st 
                                                        ? st==='P' ? 'bg-green-600 border-green-600 text-white shadow-sm scale-105' 
                                                        : st==='A' ? 'bg-red-600 border-red-600 text-white shadow-sm scale-105' 
                                                        : 'bg-blue-600 border-blue-600 text-white shadow-sm scale-105'
                                                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                                                    }
                                                `}
                                            >{st}</button>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {students.length === 0 && (
                            <tr>
                                <td colSpan="3" className="p-10 text-center text-slate-400 italic">No students enrolled in this course/section.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Save Bar */}
            <div className="bg-white border-t border-slate-200 p-2 flex justify-between items-center px-6 shrink-0 h-14">
                 <div className="text-xs text-slate-400 italic">
                    * Ensure all marks are correct before saving.
                 </div>
                 <button 
                    onClick={handleSave} 
                    disabled={saving || students.length === 0} 
                    className="bg-slate-900 text-white px-8 py-2 rounded font-bold uppercase text-xs hover:bg-black disabled:opacity-50 flex items-center gap-2 shadow-lg transition-all active:scale-95"
                 >
                    {saving && <Loader2 className="animate-spin" size={14} />}
                    Save Attendance
                 </button>
            </div>
         </div>
      )}

      <ToastContainer position="bottom-right" theme="colored" />
    </div>
  );
}

// Sub-components
const FilterSelect = ({ label, value, onChange, options, valueKey="id", labelKey="label", className="flex-1 min-w-[120px]" }) => (
    <div className={className}>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full h-9 border border-slate-300 rounded px-2 text-xs bg-slate-50 focus:ring-1 focus:ring-slate-900 outline-none transition-shadow cursor-pointer">
            <option value="">Select</option>
            {typeof options[0] === 'string' 
                ? options.map(o => <option key={o} value={o}>{o}</option>)
                : options.map(o => <option key={o[valueKey]} value={o[valueKey]}>{o[labelKey]}</option>)
            }
        </select>
    </div>
);

const DateInput = ({ label, value, onChange }) => (
    <div>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{label}</label>
        <input type="date" value={value} onChange={e => onChange(e.target.value)} className="h-9 border border-slate-300 rounded px-2 text-xs bg-slate-50 focus:ring-1 focus:ring-slate-900 outline-none cursor-pointer" />
    </div>
);