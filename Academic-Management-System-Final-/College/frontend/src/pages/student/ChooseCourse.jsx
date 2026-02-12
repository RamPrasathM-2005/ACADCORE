import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  CheckCircle, 
  AlertCircle, 
  ChevronDown, 
  Layers, 
  GraduationCap,
  ArrowRight
} from 'lucide-react';
import { getUserRole, getUserId } from '../../utils/auth';
import {
  fetchStudentDetails,
  fetchSemesters,
  fetchElectiveBuckets,
  allocateElectives,
  fetchOecPecProgress,
} from '../../services/studentService';

const ChooseCourse = () => {
  const navigate = useNavigate();
  
  // --- STATE ---
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [electiveBuckets, setElectiveBuckets] = useState([]);
  const [selections, setSelections] = useState({});
  const [studentDetails, setStudentDetails] = useState({});
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    const fetchStudentData = async () => {
      if (getUserRole() !== 'student') {
        navigate('/login');
        return;
      }

      try {
        setLoading(true);
        const userId = getUserId();
        const studentData = await fetchStudentDetails(userId);
        setStudentDetails(studentData);

        const semesterData = await fetchSemesters(String(studentData.batchYear));
        setSemesters(semesterData);

        const activeSemester = semesterData.find((sem) => sem.isActive === 'YES') || semesterData[0];
        if (activeSemester) {
          setSelectedSemester(activeSemester.semesterId.toString());
        }

        const prog = await fetchOecPecProgress();
        setProgress(prog);
      } catch (err) {
        setError('Failed to fetch student data. Please try again.');
        console.error('Error fetching student data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, [navigate]);

  // --- FETCH BUCKETS ON SEMESTER CHANGE ---
  useEffect(() => {
    const fetchBuckets = async () => {
      if (!selectedSemester) return;

      try {
        setLoading(true);
        setError(null);
        setSuccess(null);
        setSelections({});

        const bucketsData = await fetchElectiveBuckets(selectedSemester);
        setElectiveBuckets(bucketsData);

        const initialSelections = {};
        bucketsData.forEach((bucket) => {
          initialSelections[bucket.bucketId] = '';
        });
        setSelections(initialSelections);
      } catch (err) {
        setError('Failed to fetch elective buckets for this semester.');
      } finally {
        setLoading(false);
      }
    };

    fetchBuckets();
  }, [selectedSemester]);

  // --- HANDLERS ---
  const handleSemesterChange = (e) => {
    setSelectedSemester(e.target.value);
  };

  const handleSelectionChange = (bucketId, courseId) => {
    setSelections((prev) => ({ ...prev, [bucketId]: courseId }));
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const validSelections = Object.entries(selections)
        .filter(([_, courseId]) => courseId)
        .map(([bucketId, courseId]) => ({
          bucketId: parseInt(bucketId),
          courseId: parseInt(courseId),
        }));

      if (validSelections.length !== electiveBuckets.length) {
        throw new Error('Please select one course from each elective bucket.');
      }

      // Validate against remaining slots
      if (progress) {
        let oecSelected = 0, pecSelected = 0;
        validSelections.forEach(sel => {
          const bucket = electiveBuckets.find(b => b.bucketId === sel.bucketId);
          if (bucket?.bucketName.includes('OEC')) oecSelected++;
          if (bucket?.bucketName.includes('PEC')) pecSelected++;
        });

        if (oecSelected > progress.remaining.OEC || pecSelected > progress.remaining.PEC) {
          throw new Error('Selection exceeds your remaining OEC/PEC requirements.');
        }
      }

      await allocateElectives(selectedSemester, validSelections);
      setSuccess('Elective courses allocated successfully!');
      setTimeout(() => navigate('/student/dashboard'), 2000);
    } catch (err) {
      setError(err.message || 'Failed to allocate elective courses.');
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitDisabled = () => {
    return electiveBuckets.length === 0 || Object.values(selections).some((val) => !val) || submitting;
  };

  // --- LOADING STATE ---
  if (loading && !studentDetails.username) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500 font-medium">Loading details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FD] text-slate-800 p-6 font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Course Allocation</h1>
                <p className="text-slate-500 font-medium mt-1">
                    Select your electives for the upcoming semester.
                </p>
            </div>
            
            <div className="bg-white pl-2 pr-6 py-2 rounded-full border border-slate-200 shadow-sm flex items-center gap-4 cursor-default">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Main Form */}
            <div className="lg:col-span-2 space-y-6">

                {/* Error / Success Messages */}
                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                        <div>
                            <h4 className="text-sm font-bold text-red-700">Allocation Failed</h4>
                            <p className="text-xs text-red-600 mt-1">{error}</p>
                        </div>
                    </div>
                )}

                {success && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                            <h4 className="text-sm font-bold text-emerald-700">Success!</h4>
                            <p className="text-xs text-emerald-600 mt-1">{success}</p>
                        </div>
                    </div>
                )}

                {/* Loading Spinner for buckets */}
                {loading && (
                   <div className="py-12 flex justify-center">
                      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                   </div>
                )}

                {/* Elective Buckets */}
                {!loading && electiveBuckets.length > 0 ? (
                  <>
                    <div className="grid gap-6">
                        {electiveBuckets.map((bucket, index) => (
                          <div 
                            key={bucket.bucketId} 
                            className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 hover:border-indigo-100 transition-all duration-300 relative overflow-hidden"
                          >
                             {/* Decoration */}
                             <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-transparent rounded-bl-full -mr-10 -mt-10 opacity-60"></div>

                             <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-indigo-600 bg-indigo-50`}>
                                        <Layers size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">{bucket.bucketName}</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Bucket {bucket.bucketNumber}</p>
                                    </div>
                                </div>

                                {/* Alerts inside bucket */}
                                {bucket.alert && (
                                    <div className="mb-4 bg-orange-50 border border-orange-100 px-4 py-2 rounded-xl text-xs font-medium text-orange-700 flex items-center gap-2">
                                        <AlertCircle size={14} />
                                        {bucket.alert}
                                    </div>
                                )}
                                
                                {bucket.requiredSelections > 0 ? (
                                    <div className="relative">
                                        <select
                                            value={selections[bucket.bucketId] || ''}
                                            onChange={(e) => handleSelectionChange(bucket.bucketId, e.target.value)}
                                            className="w-full appearance-none bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all cursor-pointer"
                                        >
                                            <option value="">Select a Course...</option>
                                            {bucket.courses.map((course) => (
                                                <option key={course.courseId} value={course.courseId}>
                                                    {course.courseCode} — {course.courseTitle} ({course.credits} Credits)
                                                </option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                                            <ChevronDown size={18} />
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500 italic bg-slate-50 p-3 rounded-xl">
                                        No selection required for this bucket.
                                    </p>
                                )}
                             </div>
                          </div>
                        ))}
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end pt-4 pb-10">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitDisabled()}
                            className={`
                                group relative px-8 py-4 rounded-full font-bold text-sm flex items-center gap-3 transition-all duration-300 shadow-lg
                                ${isSubmitDisabled() 
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-1'}
                            `}
                        >
                            {submitting ? 'Allocating...' : 'Confirm Allocation'}
                            {!submitting && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </div>
                  </>
                ) : (
                    !loading && (
                        <div className="bg-white rounded-[32px] p-12 text-center border border-dashed border-slate-200">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <BookOpen className="text-slate-300" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">No Electives Found</h3>
                            <p className="text-slate-500 text-sm mt-2">Select a semester to view available elective buckets.</p>
                        </div>
                    )
                )}
            </div>

            {/* RIGHT COLUMN: Sidebar */}
            <div className="space-y-6">
                
                {/* Semester Selector */}
                <div className="bg-white rounded-[24px] p-2 shadow-sm border border-slate-100">
                     <div className="relative">
                        <select 
                            value={selectedSemester} 
                            onChange={handleSemesterChange}
                            disabled={loading || submitting}
                            className="w-full bg-transparent hover:bg-slate-50 transition-colors border-none rounded-[20px] py-4 px-6 text-slate-700 font-bold focus:ring-0 cursor-pointer text-sm appearance-none disabled:opacity-50"
                        >
                            <option value="">Select Semester</option>
                            {semesters.map(sem => (
                                <option key={sem.semesterId} value={sem.semesterId.toString()}>
                                    Semester {sem.semesterNumber} {sem.isActive === 'YES' ? '• Active' : ''}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                            <ChevronDown size={16} />
                        </div>
                     </div>
                </div>

                {/* Requirements / Progress Card */}
                {progress && (
                    <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 relative overflow-hidden">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
                                <GraduationCap size={20} />
                            </div>
                            <h4 className="font-bold text-slate-800">Requirements</h4>
                        </div>
                        
                        {/* OEC Progress */}
                        <div className="mb-6">
                            <div className="flex justify-between text-xs mb-2">
                                <span className="font-bold text-slate-600">Open Electives (OEC)</span>
                                <span className="text-slate-400 font-bold">{progress.completed.OEC}/{progress.required.OEC}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${progress.remaining.OEC === 0 ? 'bg-emerald-500' : 'bg-pink-400'}`}
                                    style={{ width: `${Math.min((progress.completed.OEC / progress.required.OEC) * 100, 100)}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 text-right">
                                {progress.remaining.OEC === 0 ? 'Requirement Met' : `${progress.remaining.OEC} Remaining`}
                            </p>
                        </div>

                        {/* PEC Progress */}
                        <div>
                            <div className="flex justify-between text-xs mb-2">
                                <span className="font-bold text-slate-600">Prof. Electives (PEC)</span>
                                <span className="text-slate-400 font-bold">{progress.completed.PEC}/{progress.required.PEC}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${progress.remaining.PEC === 0 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                    style={{ width: `${Math.min((progress.completed.PEC / progress.required.PEC) * 100, 100)}%` }}
                                ></div>
                            </div>
                             <p className="text-[10px] font-bold text-slate-400 mt-2 text-right">
                                {progress.remaining.PEC === 0 ? 'Requirement Met' : `${progress.remaining.PEC} Remaining`}
                            </p>
                        </div>

                        {/* Overall Alert */}
                        {(progress.remaining.OEC > 0 || progress.remaining.PEC > 0) && (
                            <div className="mt-6 pt-4 border-t border-slate-50">
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    <span className="font-bold text-indigo-600">Note:</span> Please ensure your selections help fulfill the remaining requirements shown above.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChooseCourse;