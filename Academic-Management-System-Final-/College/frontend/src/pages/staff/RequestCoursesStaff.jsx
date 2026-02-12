import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Send, X, ArrowLeft, Clock, 
  CheckCircle2, AlertCircle, ShoppingCart, Trash2, Info 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api, getCurrentUser } from '../../services/authService'; 
import Filters from '../admin/ManageCourses/Filters'; 

const RequestCoursesStaff = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]); 
  const [myRequests, setMyRequests] = useState([]); 
  const [selectedCourses, setSelectedCourses] = useState([]); 
  const [semOptions, setSemOptions] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({ dept: '', branch: '', semester: '', batch: '', name: '', type: '' });
  
  const user = getCurrentUser();
  const courseTypes = ['THEORY', 'PRACTICAL', 'INTEGRATED', 'EXPERIENTIAL LEARNING'];

  // --- LOGIC: Strict Category Counting (No Overflow) ---
  const globalCounts = useMemo(() => {
    const activeFromDB = myRequests.filter(r => r.status === 'PENDING' || r.status === 'ACCEPTED');
    const allActive = [...activeFromDB, ...selectedCourses];

    // Filter by strict category matches
    const pecCount = allActive.filter(c => c.category === 'PEC').length;
    const pccCount = allActive.filter(c => c.category === 'PCC').length;
    
    // Others includes OEC, HSMC, BSC, ESC, EEC, MC, etc. (Anything NOT PEC/PCC)
    const othersCount = allActive.filter(c => c.category !== 'PEC' && c.category !== 'PCC').length;

    return {
      PEC: pecCount,
      PCC: pccCount,
      OTHERS: othersCount,
      TOTAL: allActive.length
    };
  }, [myRequests, selectedCourses]);

  useEffect(() => {
    const init = async () => {
      try {
        const semRes = await api.get('/admin/semesters');
        setSemOptions(semRes.data.data || []);
        await fetchMyRequests();
        await fetchAvailableCourses();
      } catch (err) {
        console.error("Init error:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    fetchAvailableCourses();
  }, [filters.dept, filters.branch, filters.semester, filters.batch, filters.type]);

  const fetchAvailableCourses = async () => {
    try {
      const params = new URLSearchParams();
      // Logic fix: Ensure department filter is always applied
      params.append('dept', filters.dept || user?.Deptid || '');
      if (filters.branch) params.append('branch', filters.branch);
      if (filters.semester) params.append('semester', filters.semester);
      if (filters.batch) params.append('batch', filters.batch);
      if (filters.type) params.append('type', filters.type);

      const res = await api.get(`/staff/available-courses?${params.toString()}`);
      setCourses(res.data.data || []);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  const fetchMyRequests = async () => {
    const res = await api.get('/staff/my-requests');
    setMyRequests(res.data.data || []);
  };

  const handleToggleSelect = (course) => {
    const isSelected = selectedCourses.find(c => c.courseId === course.courseId);
    if (isSelected) {
      setSelectedCourses(selectedCourses.filter(c => c.courseId !== course.courseId));
      return;
    }

    // Strict Limit Checks per category
    if (course.category === 'PEC') {
      if (globalCounts.PEC >= 2) {
        toast.error(`PEC Limit Reached (2/2). You already have ${globalCounts.PEC} PEC course(s).`);
        return;
      }
    } else if (course.category === 'PCC') {
      if (globalCounts.PCC >= 2) {
        toast.error(`PCC Limit Reached (2/2). You already have ${globalCounts.PCC} PCC course(s).`);
        return;
      }
    } else {
      // Logic for Others (OEC, HSMC, etc.)
      if (globalCounts.OTHERS >= 1) {
        toast.error(`Others Category Limit Reached (1/1). Category: ${course.category}`);
        return;
      }
    }

    if (globalCounts.TOTAL >= 5) {
      toast.warning("Global maximum of 5 courses reached.");
      return;
    }

    setSelectedCourses([...selectedCourses, course]);
  };

  const handleSubmitRequests = async () => {
    setSubmitting(true);
    try {
      for (const course of selectedCourses) {
        await api.post(`/staff/request/${course.courseId}`);
      }
      toast.success(`Sent ${selectedCourses.length} requests successfully!`);
      setSelectedCourses([]); 
      await fetchMyRequests();
      await fetchAvailableCourses();
    } catch (err) {
      toast.error("Failed to submit requests.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-black text-indigo-950 tracking-tight">Staff Course Selection</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest italic">Strict Category Allocation</p>
          </div>
        </div>
        <div className="bg-indigo-600 text-white px-6 py-2 rounded-2xl shadow-lg shadow-indigo-100">
          <span className="text-xs font-black uppercase tracking-widest">Total Active: {globalCounts.TOTAL} / 5</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Discovery Panel */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 mb-8">
              <Filters filters={filters} setFilters={setFilters} semesters={semOptions} courseTypes={courseTypes} />
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Refreshing Courses...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {courses.filter(c => !filters.name || c.courseTitle.toLowerCase().includes(filters.name.toLowerCase())).map(course => {
                  const isSelected = selectedCourses.some(s => s.courseId === course.courseId);
                  const dbRecord = myRequests.find(r => r.courseId === course.courseId);
                  const isInactive = dbRecord?.status === 'PENDING' || dbRecord?.status === 'ACCEPTED';

                  return (
                    <div 
                      key={course.courseId}
                      onClick={() => !isInactive && handleToggleSelect(course)}
                      className={`group p-6 rounded-[2.5rem] border-2 transition-all cursor-pointer relative overflow-hidden ${
                        isSelected 
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-xl' 
                        : 'border-white bg-white hover:border-slate-200 shadow-sm'
                      } ${isInactive ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                    >
                      <span className={`px-4 py-1 rounded-xl text-[10px] font-black tracking-widest border uppercase ${
                        course.category === 'PEC' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                        course.category === 'PCC' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {course.category}
                      </span>
                      <h3 className="font-bold text-slate-900 text-base mt-4 mb-1">{course.courseTitle}</h3>
                      <p className="text-xs text-slate-400 font-black mb-4 uppercase tracking-tighter">{course.courseCode}</p>
                      
                      {isSelected && <div className="absolute top-6 right-6"><CheckCircle2 size={24} className="text-indigo-600" /></div>}
                      {isInactive && (
                        <div className="absolute top-4 right-4 bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">
                          {dbRecord.status}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar with 3 Column Slots */}
        <aside className="w-[420px] bg-white border-l shadow-2xl z-20 flex flex-col">
          <div className="p-8 border-b bg-slate-50/50">
            <h2 className="text-xl font-black text-slate-950 flex items-center gap-3">
              <ShoppingCart size={24} className="text-indigo-600" /> Slot Manager
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            {/* Dedicated Columns: Logic is strictly by category now */}
            <div className="grid grid-cols-3 gap-4">
              <SlotColumn label="PEC Slots" current={globalCounts.PEC} max={2} />
              <SlotColumn label="PCC Slots" current={globalCounts.PCC} max={2} />
              <SlotColumn label="Others" current={globalCounts.OTHERS} max={1} />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Local Cart Items</h3>
              {selectedCourses.length === 0 ? (
                <div className="py-12 border-2 border-dashed rounded-[2.5rem] border-slate-100 flex flex-col items-center justify-center text-slate-300">
                  <ShoppingCart size={28} className="mb-2 opacity-20" />
                  <p className="text-[10px] font-black uppercase">No New Selections</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedCourses.map(course => (
                    <div key={course.courseId} className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-transparent hover:border-indigo-100 transition-all">
                      <div className="overflow-hidden">
                        <p className="text-sm font-bold text-slate-800 truncate w-40">{course.courseTitle}</p>
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{course.category}</span>
                      </div>
                      <button onClick={() => handleToggleSelect(course)} className="p-2.5 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submission Area */}
          <div className="p-8 bg-white border-t">
            <button
              onClick={handleSubmitRequests}
              disabled={selectedCourses.length === 0 || submitting}
              className={`w-full py-5 rounded-[2rem] font-black text-sm flex items-center justify-center gap-3 transition-all shadow-2xl ${
                selectedCourses.length > 0 && !submitting
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none'
              }`}
            >
              {submitting ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Send size={18} /> Request {selectedCourses.length} Courses</>
              )}
            </button>
            <div className="mt-6 p-4 bg-amber-50 rounded-2xl flex items-start gap-3 border border-amber-100">
              <AlertCircle size={16} className="text-amber-500 mt-0.5" />
              <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-tighter">
                Note: No Overflow allowed. PEC goes to PEC slots, PCC to PCC. Remaining courses fill the single "Others" slot.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

// Slot Column UI Component
const SlotColumn = ({ label, current, max }) => {
  const isFull = current >= max;
  return (
    <div className={`p-5 rounded-[2.5rem] border-2 text-center transition-all flex flex-col items-center justify-center shadow-sm ${
      isFull ? 'bg-amber-100 border-amber-300' : 'bg-slate-50 border-slate-100'
    }`}>
      <p className="text-[9px] font-black uppercase mb-4 text-slate-500 tracking-tighter leading-none">
        {label}
      </p>
      <div className="relative">
        <span className={`text-4xl font-black tracking-tighter ${isFull ? 'text-amber-700' : 'text-slate-900'}`}>
          {current}
        </span>
      </div>
      <span className="text-[10px] font-black text-slate-300 mt-3 tracking-widest uppercase">
        Limit {max}
      </span>
      {isFull && <div className="mt-2 text-[8px] font-black text-amber-600 uppercase tracking-widest bg-white/50 px-2 py-0.5 rounded-full">Full</div>}
    </div>
  );
};

export default RequestCoursesStaff;