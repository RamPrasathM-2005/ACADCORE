import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserRole } from '../../utils/auth';
import { toast } from 'react-hot-toast';
import { api } from '../../services/authService';
import {
  fetchSemesters,
  fetchNptelCourses,
  enrollNptelCourses,
  fetchStudentNptelEnrollments,
  requestNptelCreditTransfer,

  fetchOecPecProgress,
} from '../../services/studentService';

const NptelSelection = () => {
  const navigate = useNavigate();
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [availableNptel, setAvailableNptel] = useState([]);
  const [enrolledNptel, setEnrolledNptel] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (getUserRole() !== 'student') {
      navigate('/login');
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const sems = await fetchSemesters();
        setSemesters(sems);

        const active = sems.find(s => s.isActive === 'YES') || sems[0];
        setSelectedSemester(active?.semesterId || '');

        const prog = await fetchOecPecProgress();
        setProgress(prog);

        const enrolls = await fetchStudentNptelEnrollments();
        setEnrolledNptel(enrolls);
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  useEffect(() => {
    if (!selectedSemester) return;

    const loadNptel = async () => {
      try {
        const courses = await fetchNptelCourses(selectedSemester);
        setAvailableNptel(courses);
      } catch (err) {
        setError('Failed to fetch NPTEL courses');
      }
    };

    loadNptel();
  }, [selectedSemester]);

  const handleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleEnroll = async () => {
    if (selectedIds.length === 0) return;
    try {
      await enrollNptelCourses(selectedSemester, selectedIds);
      setSuccess('Enrolled successfully!');
      setSelectedIds([]);
      const enrolls = await fetchStudentNptelEnrollments();
      setEnrolledNptel(enrolls);
      const prog = await fetchOecPecProgress();
      setProgress(prog);
    } catch (err) {
      setError('Enrollment failed');
    }
  };


 const handleStudentDecision = async (enrollmentId, decision) => {
  let remarks = '';
  if (decision === 'rejected') {
    remarks = prompt('Optional: Reason for rejecting this credit transfer?') || '';
  }

  try {
    // Use the existing endpoint that already works
    await api.post('/student/nptel-credit-transfer', {
      enrollmentId,
      decision,        // 'accepted' or 'rejected'
      remarks: remarks || ''
    });

    toast.success(
      decision === 'accepted' 
        ? 'Credit transfer accepted! It now counts toward your OEC/PEC.' 
        : 'Credit transfer rejected.'
    );

    // Refresh data
    const updatedEnrolls = await fetchStudentNptelEnrollments();
    setEnrolledNptel(updatedEnrolls);
    const prog = await fetchOecPecProgress();
    setProgress(prog);
  } catch (err) {
    console.error('Decision error:', err);
    toast.error(err.response?.data?.message || 'Failed to submit decision');
  }
};

  if (loading) {
    return <div className="text-center py-12 text-xl">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <h1 className="text-4xl font-bold text-indigo-700 mb-8">NPTEL Course Selection</h1>

      {/* OEC/PEC Progress */}
      {progress && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-300 rounded-xl p-6 mb-8 shadow-md">
          <h3 className="text-2xl font-bold text-amber-800 mb-4">OEC/PEC Requirement Progress</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-lg shadow">
              <p className="text-xl font-semibold">OEC: <span className="text-indigo-600">{progress.completed.OEC} / {progress.required.OEC}</span></p>
              <p className="text-lg mt-2">Remaining: <strong>{progress.remaining.OEC}</strong></p>
              {progress.remaining.OEC === 0 && <p className="text-green-600 font-bold mt-3">✓ Fully Completed!</p>}
            </div>
            <div className="bg-white p-5 rounded-lg shadow">
              <p className="text-xl font-semibold">PEC: <span className="text-purple-600">{progress.completed.PEC} / {progress.required.PEC}</span></p>
              <p className="text-lg mt-2">Remaining: <strong>{progress.remaining.PEC}</strong></p>
              {progress.remaining.PEC === 0 && <p className="text-green-600 font-bold mt-3">✓ Fully Completed!</p>}
            </div>
          </div>
        </div>
      )}

      {/* Semester Selector */}
      <div className="mb-8">
        <label className="text-lg font-medium text-gray-700 mr-4">Select Semester:</label>
        <select 
          value={selectedSemester} 
          onChange={(e) => setSelectedSemester(e.target.value)}
          className="px-6 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">-- Choose Semester --</option>
          {semesters.map(sem => (
            <option key={sem.semesterId} value={sem.semesterId}>
              Semester {sem.semesterNumber} {sem.isActive === 'YES' && '(Current)'}
            </option>
          ))}
        </select>
      </div>

      {selectedSemester && (
        <>
          {/* Available Courses */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Available NPTEL Courses</h2>
            {availableNptel.length === 0 ? (
              <p className="text-gray-500 italic">No NPTEL courses available for this semester.</p>
            ) : (
              <div className="space-y-4">
                {availableNptel.map(course => (
                  <label key={course.nptelCourseId} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(course.nptelCourseId) || course.isEnrolled}
                      onChange={() => handleSelect(course.nptelCourseId)}
                      disabled={course.isEnrolled}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-lg">{course.courseTitle}</p>
                      <p className="text-sm text-gray-600">
                        Code: {course.courseCode} • Type: <span className={`font-medium ${course.type === 'OEC' ? 'text-indigo-600' : 'text-purple-600'}`}>{course.type}</span> • Credits: {course.credits}
                      </p>
                      {course.isEnrolled && <span className="text-green-600 font-medium text-sm">✓ Already Enrolled</span>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={handleEnroll}
              disabled={selectedIds.length === 0}
              className={`mt-8 px-8 py-4 rounded-lg font-bold text-white transition-all ${
                selectedIds.length === 0 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg transform hover:scale-105'
              }`}
            >
              Enroll in Selected Courses ({selectedIds.length})
            </button>
          </div>

          {/* Enrolled NPTEL Courses */}
<div className="bg-white rounded-xl shadow-lg p-8">
  <h2 className="text-2xl font-bold text-gray-800 mb-6">My Enrolled NPTEL Courses</h2>
  {enrolledNptel.length === 0 ? (
    <p className="text-gray-500 italic py-8 text-center">No enrolled NPTEL courses yet.</p>
  ) : (
    <div className="space-y-6">
      {enrolledNptel.map(enroll => (
        <div key={enroll.enrollmentId} className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-indigo-200">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-xl font-bold text-indigo-800">{enroll.courseTitle}</h4>
              <p className="text-gray-700 mt-1">
                Code: <span className="font-mono">{enroll.courseCode}</span> • Type: {enroll.type} • Credits: {enroll.credits}
              </p>
              <p className="text-sm text-gray-600 mt-2">Semester {enroll.semesterNumber}</p>
            </div>
          </div>

          <div className="mt-6">
            {enroll.importedGrade ? (
              <>
                <span className="text-2xl font-bold text-green-600">Grade: {enroll.importedGrade}</span>

                {/* Student has not decided yet */}
                {(!enroll.studentStatus || enroll.studentStatus === 'pending') ? (
                  <div className="mt-4 flex gap-4">
                    <button
                      onClick={() => handleStudentDecision(enroll.enrollmentId, 'accepted')}
                      className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg transition"
                    >
                      Accept Credit Transfer
                    </button>
                    <button
                      onClick={() => handleStudentDecision(enroll.enrollmentId, 'rejected')}
                      className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg transition"
                    >
                      Reject Credit Transfer
                    </button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <span className={`px-6 py-3 rounded-full font-bold text-lg ${
                      enroll.studentStatus === 'accepted' 
                        ? 'bg-green-100 text-green-800 border-2 border-green-500' 
                        : 'bg-red-100 text-red-800 border-2 border-red-500'
                    }`}>
                      You have {enroll.studentStatus === 'accepted' ? 'ACCEPTED' : 'REJECTED'} this credit
                    </span>
                    {enroll.studentStatus === 'accepted' && (
                      <p className="text-green-700 font-semibold mt-3">
                        ✓ This credit is now counted toward your OEC/PEC requirement
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xl text-gray-500 italic">Grade pending - waiting for admin import</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )}
</div>
        </>
      )}

      {/* Messages */}
      {success && (
        <div className="mt-8 p-6 bg-green-100 border-2 border-green-500 rounded-xl text-green-800 font-bold text-center text-xl">
          {success}
        </div>
      )}
      {error && (
        <div className="mt-8 p-6 bg-red-100 border-2 border-red-500 rounded-xl text-red-800 font-bold text-center text-xl">
          {error}
        </div>
      )}
    </div>
  );
};

export default NptelSelection;