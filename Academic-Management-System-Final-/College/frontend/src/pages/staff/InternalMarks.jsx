import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Download, Search, Filter, User, Hash, AlertCircle } from 'lucide-react';
import { ClipLoader } from 'react-spinners';
import useInternalMarks from '../../hooks/useInternalMarks';
import InternalMarksTable from '../../components/tables/InternalMarksTable';

const InternalMarks = () => {
  const { courseId: courseCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const course = location.state?.course ?? { name: courseCode || 'Unknown Course' };
  const compositeSectionIds = location.state?.compositeSectionIds || '';

  const { 
    students, 
    courseOutcomes, 
    calculateInternalMarks, 
    exportCourseWiseCsv, 
    error: hookError,   // renamed for clarity
    loading 
  } = useInternalMarks(courseCode, compositeSectionIds);

  const [minLoading, setMinLoading] = useState(true);
  const [regNoTerm, setRegNoTerm] = useState('');
  const [nameTerm, setNameTerm] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [filterValue, setFilterValue] = useState('');

  // Debug logs
  useEffect(() => {
    console.log('InternalMarks Render →', {
      courseCode,
      compositeSectionIds,
      studentsCount: students?.length || 0,
      outcomesCount: courseOutcomes?.length || 0,
      loading,
      hookError
    });
  }, [courseCode, compositeSectionIds, students, courseOutcomes, loading, hookError]);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setMinLoading(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const computeFinalAvg = (student) => {
    if (!student?.marks || !courseOutcomes?.length) return 0;
    let sum = 0;
    courseOutcomes.forEach(co => {
      sum += Number(student.marks[co.coId] || 0);
    });
    return courseOutcomes.length > 0 ? sum / courseOutcomes.length : 0;
  };

  const filteredStudents = students.filter(student => {
    const regMatch = !regNoTerm || 
      (student.regno?.toLowerCase().includes(regNoTerm.toLowerCase()) ||
       student.rollnumber?.toLowerCase().includes(regNoTerm.toLowerCase()));

    const nameMatch = !nameTerm || 
      student.name?.toLowerCase().includes(nameTerm.toLowerCase());

    const avg = computeFinalAvg(student);
    let filterMatch = true;

    if (filterOperator && filterValue !== '') {
      const numVal = parseFloat(filterValue);
      if (!isNaN(numVal)) {
        switch (filterOperator) {
          case '>':  filterMatch = avg > numVal; break;
          case '<':  filterMatch = avg < numVal; break;
          case '=':  filterMatch = Math.abs(avg - numVal) < 0.01; break;
          case '>=': filterMatch = avg >= numVal; break;
          case '<=': filterMatch = avg <= numVal; break;
        }
      }
    }

    return regMatch && nameMatch && filterMatch;
  });

  const handleExport = async () => {
    try {
      await exportCourseWiseCsv(courseCode);
    } catch (err) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleRetry = () => {
    window.location.reload();
  };

  const clearFilters = () => {
    setRegNoTerm('');
    setNameTerm('');
    setFilterOperator('');
    setFilterValue('');
  };

  if (loading || minLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <ClipLoader color="#2563eb" loading size={60} />
          <p className="mt-5 text-gray-700 text-lg font-medium">Loading internal marks...</p>
        </div>
      </div>
    );
  }

  const hasData = students.length > 0 && courseOutcomes.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-full text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition"
              >
                <ChevronLeft size={24} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Internal Marks</h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  {course.name || courseCode}
                  {compositeSectionIds && (
                    <span className="ml-2 text-blue-600 font-medium">
                      (Sections: {compositeSectionIds.split('_').join(' & ')})
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={handleExport}
              disabled={!hasData}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition shadow-sm"
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            {/* Reg No */}
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reg No</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search Reg No..."
                  value={regNoTerm}
                  onChange={e => setRegNoTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                />
              </div>
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search Name..."
                  value={nameTerm}
                  onChange={e => setNameTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                />
              </div>
            </div>

            {/* Avg Filter */}
            <div className="flex items-end gap-2 flex-shrink-0">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Final Avg</label>
                <div className="flex items-center gap-2">
                  <select
                    value={filterOperator}
                    onChange={e => setFilterOperator(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                  >
                    <option value="">All</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value="=">=</option>
                    <option value=">=">&ge;</option>
                    <option value="<=">&le;</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Value"
                    value={filterValue}
                    onChange={e => setFilterValue(e.target.value)}
                    disabled={!filterOperator}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
              </div>

              {(regNoTerm || nameTerm || filterOperator || filterValue) && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition text-sm font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            Showing <strong>{filteredStudents.length}</strong> of <strong>{students.length}</strong> students
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {hookError ? (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-xl shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 mt-1" size={24} />
              <div>
                <h3 className="font-semibold text-red-800 text-lg">Something went wrong</h3>
                <p className="text-red-700 mt-1">{hookError}</p>
                <button
                  onClick={handleRetry}
                  className="mt-4 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : !hasData ? (
          <div className="bg-white rounded-xl shadow-sm p-10 text-center border border-gray-200">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <User size={28} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700">No Data Available</h3>
            <p className="text-gray-500 mt-2 max-w-md mx-auto">
              {compositeSectionIds 
                ? 'No students found in the selected sections or no marks recorded yet.' 
                : 'No students enrolled in this course or marks not yet calculated.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <InternalMarksTable
              students={filteredStudents}
              courseOutcomes={courseOutcomes}
              calculateInternalMarks={calculateInternalMarks}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default InternalMarks;