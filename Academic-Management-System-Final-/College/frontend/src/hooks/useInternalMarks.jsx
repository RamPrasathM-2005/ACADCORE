import { useState, useEffect } from 'react';
import {
  getCOsForCourse,
  getStudentCOMarks,
  exportCourseWiseCsv,
  getStudentsForSection,          // ← added this import
} from '../services/staffService';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

const MySwal = withReactContent(Swal);

const useInternalMarks = (courseCode, compositeSectionIds = '') => {
  const [students, setStudents] = useState([]);
  const [courseOutcomes, setCourseOutcomes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!courseCode || !courseCode.match(/^[A-Za-z0-9_]+$/)) {
        console.error('Invalid courseCode:', courseCode);
        setError('Invalid course code provided');
        setLoading(false);
        return;
      }

      try {
        setError('');
        setLoading(true);

        // 1. Fetch COs (same across all sections of the same course)
        const cos = await getCOsForCourse(courseCode);
        if (!Array.isArray(cos)) {
          setError('No course outcomes found for this course');
          setCourseOutcomes([]);
          setLoading(false);
          return;
        }
        setCourseOutcomes(cos);

        // ────────────────────────────────────────────────────────────────
        // 2. Handle composite section IDs → fetch students from ALL sections
        // ────────────────────────────────────────────────────────────────
        const sectionIds = compositeSectionIds && compositeSectionIds.includes('_')
          ? compositeSectionIds.split('_').map(id => id.trim()).filter(Boolean)
          : (compositeSectionIds ? [compositeSectionIds] : []);

        const studentMap = new Map(); // deduplicate by regno

        // If no composite IDs provided → fallback to course-level students (if your backend supports it)
        if (sectionIds.length === 0) {
          console.warn('No section IDs provided → trying course-level student fetch if available');
          // You can add fallback logic here if your backend has a course-level student list endpoint
        }

        for (const sid of sectionIds) {
          if (!sid) continue;

          try {
            const studentsData = await getStudentsForSection(courseCode, sid);
            if (Array.isArray(studentsData)) {
              studentsData.forEach(student => {
                if (!studentMap.has(student.regno)) {
                  studentMap.set(student.regno, { ...student });
                }
              });
            }
          } catch (secErr) {
            console.warn(`Failed to fetch students for section ${sid}:`, secErr);
          }
        }

        let allStudents = Array.from(studentMap.values());

        if (allStudents.length === 0) {
          console.warn('No students found in any of the sections');
        }

        // 3. Fetch consolidated CO marks (course-level – should cover students from all sections)
        const marksData = await getStudentCOMarks(courseCode);

        if (!marksData || !Array.isArray(marksData.students)) {
          console.warn('No consolidated marks found for course:', courseCode);
          // Still show students even without marks
          setStudents(allStudents.map(s => ({ ...s, marks: {} })));
          setLoading(false);
          return;
        }

        // 4. Normalize marks to use CO IDs (same logic as before)
        const processedStudents = allStudents.map(student => {
          const marksByCoId = {};

          const studentMarks = marksData.students.find(m => m.regno === student.regno);

          if (studentMarks && studentMarks.marks) {
            Object.entries(studentMarks.marks).forEach(([coNum, markData]) => {
              const primaryCO = cos.find(c => c.coNumber === coNum);
              if (primaryCO) {
                marksByCoId[primaryCO.coId] = Number(markData.consolidatedMark || 0);
              }
            });
          }

          return {
            ...student,
            marks: marksByCoId
          };
        });

        processedStudents.sort((a, b) => a.regno.localeCompare(b.regno));

        setStudents(processedStudents);
        setLoading(false);

      } catch (err) {
        console.error('Error fetching data in useInternalMarks:', err);
        setError(err.message || 'Failed to fetch course data');
        setLoading(false);
      }
    };

    fetchData();
  }, [courseCode, compositeSectionIds]);

  const calculateInternalMarks = (regno) => {
    const student = students.find((s) => s.regno === regno);
    
    const defaultResult = { avgTheory: '0.00', avgPractical: '0.00', avgExperiential: '0.00', finalAvg: '0.00' };
    
    if (!student || !student.marks || !courseOutcomes.length) {
      return defaultResult;
    }

    let theorySum = 0, theoryCount = 0;
    let pracSum = 0, pracCount = 0;
    let expSum = 0, expCount = 0;

    courseOutcomes.forEach((co) => {
      const mark = parseFloat(student.marks[co.coId]);

      if (!isNaN(mark)) {
        if (co.coType === 'THEORY') {
          theorySum += mark;
          theoryCount++;
        } else if (co.coType === 'PRACTICAL') {
          pracSum += mark;
          pracCount++;
        } else if (co.coType === 'EXPERIENTIAL') {
          expSum += mark;
          expCount++;
        }
      }
    });

    const avgTheory = theoryCount ? (theorySum / theoryCount).toFixed(2) : '0.00';
    const avgPractical = pracCount ? (pracSum / pracCount).toFixed(2) : '0.00';
    const avgExperiential = expCount ? (expSum / expCount).toFixed(2) : '0.00';

    const activeAverages = [];
    if (theoryCount > 0) activeAverages.push(parseFloat(avgTheory));
    if (pracCount > 0) activeAverages.push(parseFloat(avgPractical));
    if (expCount > 0) activeAverages.push(parseFloat(avgExperiential));

    const finalAvg = activeAverages.length > 0 
      ? (activeAverages.reduce((a, b) => a + b, 0) / activeAverages.length).toFixed(2) 
      : '0.00';

    return { avgTheory, avgPractical, avgExperiential, finalAvg };
  };

  const handleExportCourseWiseCsv = async () => {
    try {
      setError('');
      await exportCourseWiseCsv(courseCode);
      MySwal.fire('Success', 'Course-wise CSV exported successfully', 'success');
    } catch (err) {
      console.error('Error exporting course-wise CSV:', err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to export course-wise CSV';
      setError(errMsg);
      MySwal.fire('Error', errMsg, 'error');
    }
  };

  return {
    students,
    courseOutcomes,
    calculateInternalMarks,
    exportCourseWiseCsv: handleExportCourseWiseCsv,
    error,
    loading,
  };
};

export default useInternalMarks;