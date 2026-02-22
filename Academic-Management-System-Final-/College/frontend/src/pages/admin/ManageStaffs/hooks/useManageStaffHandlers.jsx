import { useState } from 'react';
import { showErrorToast, showSuccessToast, showConfirmToast } from '../../../../utils/swalConfig';
import manageStaffService from '../../../../services/manageStaffService';

const useManageStaffHandlers = ({
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
  courses,
  fetchData,
}) => {
  const [operationLoading, setOperationLoading] = useState(false);
  const [showStaffDetailsModal, setShowStaffDetailsModal] = useState(false);
  const [showAllocateCourseModal, setShowAllocateCourseModal] = useState(false);
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [expandedCourses, setExpandedCourses] = useState([]);
  const [operationFromModal, setOperationFromModal] = useState(false);
  const [newBatchForm, setNewBatchForm] = useState({ numberOfBatches: 1 });
  const [courseRefreshKey, setCourseRefreshKey] = useState(0);

  const handleStaffClick = (staff) => {
    setSelectedStaff(staff);
    setShowStaffDetailsModal(true);
    setOperationFromModal(false);
  };

  const handleAddBatch = async (e) => {
    e.preventDefault();
    if (!selectedCourse || !newBatchForm.numberOfBatches) {
      showErrorToast('Validation Error', 'Missing course or number of batches');
      return;
    }
    setOperationLoading(true);
    try {
      const numberOfBatches = parseInt(newBatchForm.numberOfBatches) || 1;
      const res = await manageStaffService.addSections(selectedCourse.courseId, numberOfBatches);
      if (res.status === 201) {
        setShowAddBatchModal(false);
        setNewBatchForm({ numberOfBatches: 1 });
        await fetchData();
        setCourseRefreshKey(prev => prev + 1);
        setShowAllocateCourseModal(true);
        showSuccessToast(`Added ${numberOfBatches} batch${numberOfBatches > 1 ? 'es' : ''} successfully`);
      } else {
        showErrorToast('Error', `Failed to add batches: ${res.data?.message || 'Unknown error'}`);
      }
    } catch (err) {
      showErrorToast('Error', `Error adding batches: ${err.response?.data?.message || err.message}`);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleAllocateCourse = async () => {
    // 1. Basic Validation
    if (!selectedStaff || !selectedCourse || !selectedSectionId) {
      showErrorToast('Validation Error', 'Missing staff, course, or section information');
      return;
    }

    setOperationLoading(true);
    const isUpdate = selectedCourse?.isAllocated ?? false;

    try {
      // 2. Prepare Optimistic UI Update
      const staffCourseId = isUpdate && selectedStaff?.allocatedCourses
        ? selectedStaff.allocatedCourses.find(c => c.courseCode === selectedCourse.code)?.id
        : Date.now();

      const optimisticCourse = {
        id: staffCourseId,
        courseCode: selectedCourse.code,
        name: selectedCourse.name,
        sectionId: selectedSectionId,
        batch: selectedCourse.sections?.find(s => s.sectionId === selectedSectionId)?.sectionName || 'N/A',
        semester: selectedCourse.semester || 'N/A',
        year: selectedCourse.batchYears || 'N/A',
      };

      setSelectedStaff(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          allocatedCourses: isUpdate
            ? prev.allocatedCourses.map(c => c.courseCode === selectedCourse.code ? optimisticCourse : c)
            : [...(prev.allocatedCourses || []), optimisticCourse],
        };
      });

      // 3. API Calls
      let res;
      if (isUpdate) {
        // UPDATE LOGIC
        const payload = { sectionId: selectedSectionId };
        res = await manageStaffService.updateCourseAllocation(staffCourseId, payload);
      } else {
        // ALLOCATION LOGIC - FIXED HERE
        
        // Use the numeric Database ID (e.g., 2) instead of parsing "cset01"
        // If your API specifically requires the string "cset01", use selectedStaff.staffId without parseInt
        const userDbId = selectedStaff.id; 

        if (!userDbId) {
             throw new Error("Invalid User Database ID");
        }

        const payload = {
          Userid: userDbId, 
          courseId: selectedCourse.courseId,
          sectionId: selectedSectionId,
          departmentId: selectedStaff.departmentId,
        };

        res = await manageStaffService.allocateCourse(
          userDbId, // Passed the numeric ID
          selectedCourse.courseId,
          selectedSectionId,
          selectedStaff.departmentId
        );
      }

      // 4. Handle Response
      if (res.status === 201 || res.status === 200) {
        await fetchData();
        setSelectedCourse(null);
        setSelectedSectionId('');
        setExpandedCourses(prev => prev.includes(selectedStaff.id) ? prev : [...prev, selectedStaff.id]);
        setCourseRefreshKey(prev => prev + 1);
        showSuccessToast(`Course ${selectedCourse.code} ${isUpdate ? 'updated' : 'allocated'} successfully`);
      } else {
        // Revert Optimistic Update on failure
        throw new Error(res.data?.message || 'Unknown error');
      }
    } catch (err) {
      // Revert Optimistic Update
      setSelectedStaff(prev => {
        if (!prev) return prev;
        // Logic to revert: if update, find original; if insert, filter out.
        // For simplicity here, we assume a full fetchData() refresh might be safer, 
        // but checking the previous state logic you had:
        return {
          ...prev,
          allocatedCourses: isUpdate
            ? prev.allocatedCourses // Hard to revert exact object without deep copy, usually fetchData handles this
            : prev.allocatedCourses.filter(c => c.courseCode !== selectedCourse.code),
        };
      });
      
      const errMsg = err.response?.data?.message || err.message;
      showErrorToast('Error', `Error ${isUpdate ? 'updating' : 'allocating'} course: ${errMsg}`);
      // Refresh data to ensure UI matches DB state after error
      await fetchData(); 
    } finally {
      setOperationLoading(false);
    }
  };

  const handleEditBatch = async () => {
    if (!selectedStaff || !selectedStaffCourse || !selectedSectionId) {
      showErrorToast('Validation Error', 'Missing staff, course, or section information');
      return;
    }

    const course = courses.find(c => c.code === selectedStaffCourse.courseCode);
    if (!course) {
      showErrorToast('Validation Error', `Course ${selectedStaffCourse.courseCode} not found`);
      return;
    }
    const section = course.sections.find(s => s.sectionId === selectedSectionId);
    if (!section) {
      showErrorToast('Validation Error', `Section ID ${selectedSectionId} not found`);
      return;
    }

    setOperationLoading(true);
    try {
      const payload = { sectionId: selectedSectionId };
      const optimisticCourse = {
        ...selectedStaffCourse,
        sectionId: selectedSectionId,
        batch: section.sectionName || 'N/A',
      };
      
      setSelectedStaff(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          allocatedCourses: prev.allocatedCourses.map(c => c.id === selectedStaffCourse.id ? optimisticCourse : c),
        };
      });

      const res = await manageStaffService.updateCourseAllocation(selectedStaffCourse.id, payload);
      
      if (res.status === 200) {
        setShowEditBatchModal(false);
        setSelectedStaffCourse(null);
        setSelectedSectionId('');
        await fetchData();
        setSelectedCourse(null);
        if (!operationFromModal) {
          setExpandedCourses(prev => prev.includes(selectedStaff.id) ? prev : [...prev, selectedStaff.id]);
        }
        setCourseRefreshKey(prev => prev + 1);
        showSuccessToast(`Section updated for course ${selectedStaffCourse.courseCode}`);
      } else {
         throw new Error(res.data?.message);
      }
    } catch (err) {
      showErrorToast('Error', `Error updating section: ${err.response?.data?.message || err.message}`);
      await fetchData(); // Revert state from server
    } finally {
      setOperationLoading(false);
    }
  };

  const handleRemoveCourse = async (staff, staffCourseId) => {
    if (!staff || !staffCourseId) return;
    
    const courseToRemove = staff.allocatedCourses?.find(c => c.id === staffCourseId);
    
    showConfirmToast(
      'Confirm Removal',
      `Are you sure you want to remove ${courseToRemove?.courseCode || 'this course'}?`,
      'warning', 'Yes, remove it!', 'Cancel'
    ).then(async (result) => {
      if (!result.isConfirmed) return;

      setOperationLoading(true);
      // Optimistic remove
      setSelectedStaff(prev => ({
        ...prev,
        allocatedCourses: prev.allocatedCourses.filter(c => c.id !== staffCourseId),
      }));

      try {
        const res = await manageStaffService.removeCourseAllocation(staffCourseId);
        if (res.status === 200) {
          await fetchData();
          showSuccessToast('Allocation removed successfully');
        } else {
          throw new Error('Failed to remove');
        }
      } catch (err) {
        showErrorToast('Error', `Removal failed: ${err.message}`);
        await fetchData(); // Revert
      } finally {
        setOperationLoading(false);
      }
    });
  };

  const handleViewStudents = async (courseCode, sectionId) => {
    setOperationLoading(true);
    try {
      const students = await manageStaffService.getEnrolledStudents(courseCode, sectionId);
      setSelectedCourseStudents(students);
      setSelectedCourseCode(courseCode); 
      setShowStudentsModal(true);
    } catch (err) {
      showErrorToast('Error', `Error fetching students: ${err.response?.data?.message || err.message}`);
    } finally {
      setOperationLoading(false);
    }
  };

  return {
    handleStaffClick,
    handleAddBatch,
    handleAllocateCourse,
    handleRemoveCourse,
    handleEditBatch,
    handleViewStudents,
    showStaffDetailsModal,
    setShowStaffDetailsModal,
    showAllocateCourseModal,
    setShowAllocateCourseModal,
    showAddBatchModal,
    setShowAddBatchModal,
    showEditBatchModal,
    setShowEditBatchModal,
    showStudentsModal,
    setShowStudentsModal,
    expandedCourses,
    setExpandedCourses,
    operationLoading,
    operationFromModal,
    setOperationFromModal,
    newBatchForm,
    setNewBatchForm,
    courseRefreshKey,
  };
};

export default useManageStaffHandlers;