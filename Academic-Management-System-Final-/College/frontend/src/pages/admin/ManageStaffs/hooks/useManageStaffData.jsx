import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import manageStaffService, { clearSectionCache } from '../../../../services/manageStaffService';

const useManageStaffData = () => {
  const [staffList, setStaffList] = useState([]);
  const [courses, setCourses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Selection State
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedStaffCourse, setSelectedStaffCourse] = useState(null);
  const [selectedCourseStudents, setSelectedCourseStudents] = useState([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState('');

  const location = useLocation();

  const fetchData = async () => {
    setLoading(true);
    try {
      clearSectionCache();
      
      // 1. Fetch Metadata
      const departmentsData = await manageStaffService.getDepartments();
      const formattedDepartments = departmentsData.map(dept => ({
        departmentId: dept.Deptid,
        departmentName: dept.Deptname,
        departmentAcronym: dept.Deptacronym,
        isActive: 'YES',
      }));
      setDepartments(formattedDepartments);

      const [semestersData, batchesData, usersData, coursesData] = await Promise.all([
        manageStaffService.getSemesters(),
        manageStaffService.getBatches(),
        manageStaffService.getUsers(),
        manageStaffService.getCourses(),
      ]);

      setSemesters(semestersData);
      setBatches(batchesData);

      // 2. Process Staff
      const staffData = Array.isArray(usersData)
        ? usersData.map(user => {
            const department = formattedDepartments.find(d => d.departmentId === (user.Deptid || user.departmentId));
            
            const allocatedCourses = Array.isArray(user.allocatedCourses)
              ? user.allocatedCourses.map(course => ({
                  id: course.staffCourseId || 0,
                  courseCode: course.courseCode || 'N/A',
                  name: course.courseTitle || 'Unknown',
                  sectionId: course.sectionId || '',
                  batch: course.sectionName ? course.sectionName.replace(/^BatchBatch/, 'Batch') : 'N/A',
                  semesterId: course.semesterId,
                  semester: semestersData.find(s => s.semesterId === course.semesterId)?.semesterNumber
                    ? String(semestersData.find(s => s.semesterId === course.semesterId).semesterNumber)
                    : 'N/A',
                  year: semestersData.find(s => s.semesterId === course.semesterId)?.batchYears || 'N/A',
                }))
              : [];
              
            return {
              id: user.id || 0, // Numeric ID
              staffId: user.staffId || `STAFF_${user.id}`, // String ID "cset01"
              name: user.name || 'Unknown',
              email: user.email || '',
              departmentId: user.Deptid || user.departmentId || 0,
              departmentName: department ? department.departmentName : user.Deptname || user.departmentName || 'Unknown',
              allocatedCourses,
            };
          })
        : [];
      
      // Remove duplicates based on numeric ID
      setStaffList(staffData.filter((staff, index, self) => 
        index === self.findIndex(s => s.id === staff.id)
      ));

      // 3. Process Courses & Sections
      const coursesWithDetails = await Promise.all(
        Array.isArray(coursesData) ? coursesData.map(async course => {
          const sections = await manageStaffService.getCourseSections(course.courseId);
          const semester = semestersData.find(s => s.semesterId === course.semesterId) || {};
          const batch = batchesData.find(b => b.batchId === semester.batchId) || {};
          
          return {
            ...course,
            courseId: course.courseId || 0,
            name: course.courseTitle || '',
            code: course.courseCode || '',
            department: batch.branch || '',
            semester: semester.semesterNumber ? String(semester.semesterNumber) : '',
            batchYears: semester.batchYears || '',
            batch: batch.batch || '',
            sections: sections.map(section => ({
              sectionId: section.sectionId || 0,
              sectionName: section.sectionName ? (section.sectionName.startsWith('Batch') ? section.sectionName : `Batch${section.sectionName}`) : 'N/A',
            })),
          };
        }) : []
      );
      setCourses(coursesWithDetails);

    } catch (err) {
      setError(`Failed to fetch data: ${err.message}`);
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchData();
  }, [location.pathname]);

  // Sync Selected Staff when Data Refreshes
  useEffect(() => {
    if (selectedStaff && staffList.length > 0) {
      const updatedStaff = staffList.find(s => s.id === selectedStaff.id);
      
      if (updatedStaff) {
        // Deep compare to prevent infinite loop
        const currentData = JSON.stringify(selectedStaff.allocatedCourses);
        const newData = JSON.stringify(updatedStaff.allocatedCourses);
        
        if (currentData !== newData) {
          setSelectedStaff({ ...updatedStaff });
        }
      }
    }
  }, [staffList]); // Removed selectedStaff from dependencies to avoid loops

  // Sync Selected Course when Data Refreshes
  useEffect(() => {
    if (selectedCourse && courses.length > 0) {
      const updatedCourse = courses.find(c => c.courseId === selectedCourse.courseId);
      
      if (updatedCourse) {
        // Simple comparison of sections length or IDs
        const currentSections = JSON.stringify(selectedCourse.sections);
        const newSections = JSON.stringify(updatedCourse.sections);
        
        if (currentSections !== newSections) {
          setSelectedCourse({ ...updatedCourse });
        }
      }
    }
  }, [courses]); // Removed selectedCourse from dependencies

  return {
    staffList,
    courses,
    semesters,
    batches,
    departments,
    loading,
    error,
    selectedStaff,
    setSelectedStaff,
    selectedCourse,
    setSelectedCourse,
    selectedSectionId,
    setSelectedSectionId,
    selectedStaffCourse,
    setSelectedStaffCourse,
    selectedCourseStudents,
    setSelectedCourseStudents,
    selectedCourseCode,
    setSelectedCourseCode,
    fetchData,
  };
};

export default useManageStaffData;