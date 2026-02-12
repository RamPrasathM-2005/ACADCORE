import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  Loader2,
  Search,
  Calendar,
  CheckCircle2,
  Minimize2,
  Users,
  Clock,
  AlertCircle
} from "lucide-react";

const API_BASE_URL = "http://localhost:4000"; // Update if needed

// --- PERIOD CELL COMPONENT ---
const PeriodCell = ({ date, periodNumber, courses, selectedSlot, onSelect }) => {
  if (!courses || courses.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50 border-r border-slate-100">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-200"></div>
      </div>
    );
  }

  const isSelected = selectedSlot?.date === date && selectedSlot?.periodNumber === periodNumber;
  
  return (
    <button
      onClick={() => onSelect(courses, date, periodNumber)}
      className={`
        w-full h-full flex flex-col items-center justify-center transition-all border-r border-b border-slate-200 relative group
        ${isSelected 
          ? "bg-slate-800 text-white shadow-inner" 
          : "bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-600"
        }
      `}
    >
      <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-700 group-hover:text-indigo-700'}`}>
        P{periodNumber}
      </span>
      {courses.length > 1 && (
        <span className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full" title="Multiple Sections/Electives"></span>
      )}
    </button>
  );
};

export default function DayAttendance() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [timetable, setTimetable] = useState({});
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [degrees, setDegrees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [semesters, setSemesters] = useState([]);

  const [selectedDegree, setSelectedDegree] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");

  // Initial Date Setup
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    
    if (!fromDate) {
      const today = new Date();
      setFromDate(today.toISOString().split("T")[0]);
      setToDate(today.toISOString().split("T")[0]);
    }
  }, [fromDate]);

  // Load Filters
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

  // Load Semesters
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
  const periods = [1, 2, 3, 4, 5, 6, 7, 8];

  const handleGenerate = async () => {
    setLoading(true);
    setTimetable({});
    setSelectedSlot(null);
    setStudents([]);

    try {
      const batchData = batches.find((b) => b.batchId === parseInt(selectedBatch));
      if (!batchData) return toast.error("Please select a batch");

      const res = await axios.get(`${API_BASE_URL}/api/admin/attendance/timetable`, {
        params: {
          startDate: fromDate, endDate: toDate, degree: selectedDegree,
          batch: batchData.batch, branch: batchData.branch, Deptid: selectedDepartment, semesterId: selectedSemester,
        },
      });
      if (res.data.data?.timetable) setTimetable(res.data.data.timetable);
      else toast.info("No timetable data found");
    } catch (err) { toast.error("Error loading timetable"); } 
    finally { setLoading(false); }
  };

  // --- UPDATED: HANDLER FOR PERIOD SELECTION ---
  const handlePeriodSelect = async (courses, date, periodNumber) => {
    if (!courses || courses.length === 0) return;

    // We use the first course's ID for saving, but we fetch students by Dept/Sem
    const primaryCourse = courses[0]; 
    const { courseId, sectionId, courseTitle, courseCode } = primaryCourse;

    try {
        const dayOfWeek = new Date(date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
        
        // Use the NEW Route: /department-view/
        const res = await axios.get(
            `${API_BASE_URL}/api/admin/attendance/department-view/${dayOfWeek}/${periodNumber}`, 
            { 
                params: { 
                    date,
                    Deptid: selectedDepartment,   // Essential for full roster
                    semesterId: selectedSemester  // Essential for full roster
                } 
            }
        );
        
        if (res.data.data) {
            setStudents(res.data.data.map((s) => ({ ...s, status: s.status || "P" })));
            
            setSelectedSlot({ 
                date, 
                periodNumber,
                courseId,
                sectionId: sectionId || 'all', // Store for save
                courseCode,
                courseTitle,
                isElective: courses.length > 1,
            });
        }
    } catch (err) { 
        console.error(err);
        toast.error("Could not fetch student list"); 
    }
  };

  // --- UPDATED: HANDLER FOR SAVING ---
  const handleSave = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    try {
      const attendances = students.map((s) => ({ rollnumber: s.rollnumber, status: s.status }));
      const dayOfWeek = new Date(selectedSlot.date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
      
      // Matches Route: /mark/:courseId/:sectionId/:dayOfWeek/:periodNumber
      await axios.post(
          `${API_BASE_URL}/api/admin/mark/${selectedSlot.courseId}/${selectedSlot.sectionId}/${dayOfWeek}/${selectedSlot.periodNumber}`, 
          { date: selectedSlot.date, attendances }
      );
      
      toast.success(`Attendance saved for P${selectedSlot.periodNumber}`);
      setSelectedSlot(null);
      setStudents([]);
    } catch (err) { 
        console.error(err);
        toast.error("Save failed"); 
    } 
    finally { setSaving(false); }
  };

  const updateStatus = (roll, status) => setStudents(prev => prev.map(s => s.rollnumber === roll ? {...s, status} : s));
  const markAllAs = (status) => setStudents(prev => prev.map(s => ({...s, status})));
  
  const stats = useMemo(() => {
      return { 
          P: students.filter(s => s.status === 'P').length, 
          A: students.filter(s => s.status === 'A').length, 
          OD: students.filter(s => s.status === 'OD').length 
      };
  }, [students]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* 1. HEADER */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm z-20 shrink-0">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-600 text-white rounded shadow-lg shadow-indigo-200">
                    <Clock size={20} />
                </div>
                <div>
                    <h1 className="text-lg font-bold uppercase tracking-tight text-slate-900 leading-none">Day Attendance Manager</h1>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Department View</span>
                </div>
            </div>
            
            <div className="flex flex-wrap items-end gap-2">
                 <FilterSelect label="Degree" value={selectedDegree} onChange={setSelectedDegree} options={degrees} />
                 <FilterSelect label="Batch" value={selectedBatch} onChange={setSelectedBatch} options={batches.filter(b => b.degree === selectedDegree).map(b => ({id: b.batchId, label: b.batch}))} valueKey="id" labelKey="label" />
                 <FilterSelect label="Dept" value={selectedDepartment} onChange={setSelectedDepartment} options={departments} valueKey="departmentId" labelKey="departmentName" className="flex-[2] min-w-[200px]" />
                 <FilterSelect label="Sem" value={selectedSemester} onChange={setSelectedSemester} options={semesters} valueKey="semesterId" labelKey="semesterNumber" className="w-20" />
                 
                 <div className="flex gap-2 items-end ml-auto">
                    <DateInput label="From" value={fromDate} onChange={setFromDate} />
                    <DateInput label="To" value={toDate} onChange={setToDate} />
                    <button onClick={handleGenerate} disabled={loading} className="h-9 px-6 bg-slate-900 text-white rounded font-bold uppercase text-xs hover:bg-black disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-slate-200">
                        {loading ? <Loader2 className="animate-spin" size={14}/> : <Search size={14} />}
                        <span>Load Grid</span>
                    </button>
                 </div>
            </div>
      </div>

      {/* 2. GRID */}
      <div className="flex-1 overflow-auto bg-slate-100 p-4">
            {Object.keys(timetable).length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-[800px]"> 
                    <table className="w-full table-fixed border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-slate-500">
                            <tr>
                                <th className="w-32 p-4 border-r border-slate-200 text-[10px] font-bold uppercase tracking-wider text-left bg-slate-50 text-slate-400">Date / Day</th>
                                {periods.map(p => (
                                    <th key={p} className="p-2 border-r border-slate-200 text-center bg-slate-50">
                                        <div className="text-slate-800 text-xs font-bold">Period {p}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {dates.map(date => (
                                <tr key={date} className="hover:bg-slate-50/50 h-20"> 
                                    <td className="p-4 border-r border-slate-200 font-medium text-xs text-slate-700 bg-white group cursor-default">
                                        <div className="text-base font-bold text-slate-800">{new Date(date).toLocaleDateString("en-US", { day: '2-digit' })}</div>
                                        <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide">{new Date(date).toLocaleDateString("en-US", { month: 'short', weekday: 'short' })}</div>
                                    </td>
                                    {periods.map(pNum => {
                                        const coursesInSlot = (timetable[date] || []).filter(item => item.periodNumber === pNum);
                                        return (
                                            <td key={pNum} className="p-0 border-r border-slate-200 align-middle h-20">
                                                <PeriodCell 
                                                    date={date}
                                                    periodNumber={pNum}
                                                    courses={coursesInSlot}
                                                    selectedSlot={selectedSlot}
                                                    onSelect={handlePeriodSelect}
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
                    <p className="mt-4 text-sm font-medium">Select filters to load the attendance grid</p>
                </div>
            )}
      </div>

      {/* 3. STUDENT PANEL */}
      {selectedSlot && (
         <div className="h-[450px] bg-white border-t-4 border-slate-800 shrink-0 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.15)] z-30 animate-in slide-in-from-bottom-10 duration-200">
            
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-6">
                    <div>
                        <h2 className="text-lg font-bold uppercase tracking-wide flex items-center gap-2">
                             <span className="text-indigo-400">Period {selectedSlot.periodNumber}</span> 
                             <span className="text-slate-500">|</span> 
                             {new Date(selectedSlot.date).toLocaleDateString("en-US", { weekday: 'short', day: '2-digit', month: 'short' })}
                        </h2>
                        <div className="text-[10px] text-slate-400 flex gap-2 items-center mt-1">
                             {selectedSlot.isElective ? (
                                <span className="flex items-center gap-1 text-amber-400"><AlertCircle size={10}/> Multiple Subjects (Electives) - Showing All Students</span>
                             ) : (
                                <span>Subject: {selectedSlot.courseTitle} ({selectedSlot.courseCode})</span>
                             )}
                        </div>
                    </div>
                    <div className="flex gap-4 text-xs font-bold uppercase ml-6 bg-slate-800 p-2 px-4 rounded-lg border border-slate-700">
                        <div className="flex flex-col items-center leading-none gap-1"><span className="text-[9px] text-slate-500">Present</span><span className="text-green-400 text-lg">{stats.P}</span></div>
                        <div className="w-px bg-slate-700 mx-1"></div>
                        <div className="flex flex-col items-center leading-none gap-1"><span className="text-[9px] text-slate-500">Absent</span><span className="text-red-400 text-lg">{stats.A}</span></div>
                        <div className="w-px bg-slate-700 mx-1"></div>
                        <div className="flex flex-col items-center leading-none gap-1"><span className="text-[9px] text-slate-500">OD</span><span className="text-blue-400 text-lg">{stats.OD}</span></div>
                    </div>
                </div>

                <div className="flex gap-2 items-center">
                     <div className="mr-4 flex gap-1 bg-slate-800 p-1 rounded">
                        <button onClick={() => markAllAs("P")} className="px-3 py-1.5 hover:bg-green-600 hover:text-white text-green-500 rounded text-[10px] font-bold uppercase transition-colors">Mark All P</button>
                        <button onClick={() => markAllAs("A")} className="px-3 py-1.5 hover:bg-red-600 hover:text-white text-red-500 rounded text-[10px] font-bold uppercase transition-colors">Mark All A</button>
                     </div>
                     <button onClick={() => setSelectedSlot(null)} className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"><Minimize2 size={20}/></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-0 relative">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-white text-slate-500 sticky top-0 z-10 shadow-sm text-[10px] font-bold uppercase tracking-wider">
                        <tr>
                            <th className="p-4 border-b border-slate-100 w-40">Roll Number</th>
                            <th className="p-4 border-b border-slate-100">Student Name</th>
                            <th className="p-4 border-b border-slate-100 text-center w-80">Attendance Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {students.map((s) => (
                            <tr key={s.rollnumber} className={`group transition-colors ${
                                s.status === 'A' ? 'bg-red-50/50' : 
                                s.status === 'OD' ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                            }`}>
                                <td className="p-3 px-4 text-xs font-bold font-mono text-slate-600">{s.rollnumber}</td>
                                <td className="p-3 px-4 text-sm font-semibold text-slate-800">{s.name}</td>
                                <td className="p-2 px-4 text-center">
                                    <div className="flex justify-center gap-1">
                                        {['P','A','OD'].map(st => (
                                            <button 
                                                key={st} 
                                                onClick={() => updateStatus(s.rollnumber, st)}
                                                className={`
                                                    w-10 h-8 rounded-md text-[10px] font-bold transition-all border flex items-center justify-center
                                                    ${s.status === st 
                                                        ? st==='P' ? 'bg-green-500 border-green-500 text-white shadow-md scale-105' 
                                                        : st==='A' ? 'bg-red-500 border-red-500 text-white shadow-md scale-105' 
                                                        : 'bg-blue-500 border-blue-500 text-white shadow-md scale-105'
                                                        : 'bg-white border-slate-200 text-slate-300 hover:border-slate-300 hover:text-slate-500'
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
                                <td colSpan="3" className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                                    <Users size={32} className="mb-2 opacity-20"/>
                                    <span className="text-sm font-medium">No students found.</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-white border-t border-slate-200 p-3 flex justify-between items-center px-6 shrink-0 z-20">
                 <div className="text-xs text-slate-400 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-500"/>
                    Changes are not saved until you click the button.
                 </div>
                 <button 
                    onClick={handleSave} 
                    disabled={saving || students.length === 0} 
                    className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold uppercase text-xs hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                 >
                    {saving && <Loader2 className="animate-spin" size={14} />}
                    Save Attendance
                 </button>
            </div>
         </div>
      )}

      <ToastContainer position="bottom-right" theme="colored" autoClose={2000} />
    </div>
  );
}

// Sub-components
const FilterSelect = ({ label, value, onChange, options, valueKey="id", labelKey="label", className="flex-1 min-w-[120px]" }) => (
    <div className={className}>
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{label}</label>
        <div className="relative">
            <select value={value} onChange={e => onChange(e.target.value)} className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs font-medium bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer appearance-none">
                <option value="">Select...</option>
                {typeof options[0] === 'string' 
                    ? options.map(o => <option key={o} value={o}>{o}</option>)
                    : options.map(o => <option key={o[valueKey]} value={o[valueKey]}>{o[labelKey]}</option>)
                }
            </select>
            <div className="absolute right-3 top-3 pointer-events-none opacity-50"><svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1L5 5L9 1"/></svg></div>
        </div>
    </div>
);

const DateInput = ({ label, value, onChange }) => (
    <div className="w-32">
        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{label}</label>
        <input type="date" value={value} onChange={e => onChange(e.target.value)} className="w-full h-10 border border-slate-200 rounded-lg px-3 text-xs font-medium bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer" />
    </div>
);