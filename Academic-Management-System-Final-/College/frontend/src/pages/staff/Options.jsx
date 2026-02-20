import React from 'react';
import { ChevronLeft, BarChart3, Calculator } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const Options = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId: paramCourseId } = useParams();

  // Get course data passed from previous page (My Courses / dashboard)
  const course = location.state?.course || {};

  // Extract useful display values with good fallbacks
  const displayTitle = course.title || course.courseTitle || 'Course Details';
  const displayCode = course.displayCode || course.courseCode || course.mainCourseCode || paramCourseId || 'Unknown Code';
  const displaySemester = course.semester || course.semesterName || '';
  const compositeSectionIds = course.compositeSectionIds || course.compositeSectionId || '';

  // For navigation - prefer composite if available, fallback to single courseId
  const targetCourseId = course.compositeCourseCode || course.mainCourseCode || paramCourseId || course.courseCode || 'unknown';

  const options = [
    {
      id: 'marks-allocation',
      title: 'Mark Allocation',
      description: 'Define COs, assign tools, enter marks per tool',
      icon: BarChart3,
      color: 'bg-blue-600 hover:bg-blue-700',
      path: `/staff/marks-allocation/${targetCourseId}/${compositeSectionIds || 'unknown'}`,
    },
    {
      id: 'internal-marks',
      title: 'Internal Marks',
      description: 'View consolidated CO marks, averages & export',
      icon: Calculator,
      color: 'bg-indigo-600 hover:bg-indigo-700',
      path: `/staff/internal-marks/${targetCourseId}`,
    },
  ];

  const handleBack = () => {
    navigate('/staff/dashboard');
  };

  const handleOptionClick = (option) => {
    // Pass essential data to child pages via state
    navigate(option.path, {
      state: {
        course,                        // full course object
        compositeSectionIds,           // for section-specific student fetching
        compositeCourseCode: targetCourseId, // in case child needs to split
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
                aria-label="Go back to dashboard"
              >
                <ChevronLeft size={24} />
              </button>

              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <span className="text-blue-600 font-mono">{displayCode}</span>
                  <span className="text-gray-800">{displayTitle}</span>
                </h1>

                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  {displaySemester && (
                    <span className="font-medium">{displaySemester}</span>
                  )}

                  {course?.branches?.length > 0 && (
                    <div className="flex gap-2">
                      {course.branches.map((branch, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200"
                        >
                          {branch}
                        </span>
                      ))}
                    </div>
                  )}

                  {compositeSectionIds && (
                    <span className="text-gray-500 italic">
                      Sections: {compositeSectionIds.split('_').join(' • ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Options Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option)}
                className={`
                  group relative bg-white rounded-xl shadow-md border border-gray-200 
                  hover:shadow-xl hover:border-blue-300 transition-all duration-300 
                  overflow-hidden text-left
                `}
              >
                <div className={`h-2 ${option.color.split(' ')[0]}`} />

                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div
                      className={`
                        p-3 rounded-lg ${option.color} text-white 
                        shadow-sm group-hover:scale-110 transition-transform duration-300
                      `}
                    >
                      <Icon size={28} />
                    </div>

                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                        {option.title}
                      </h3>
                      <p className="mt-2 text-gray-600 text-sm leading-relaxed">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Optional footer note */}
        <div className="mt-10 text-center text-sm text-gray-500">
          Select an option to manage or view marks for this course
          {compositeSectionIds && ' (multi-section mode)'}
        </div>
      </div>
    </div>
  );
};

export default Options;