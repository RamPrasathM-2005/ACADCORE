import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Layers, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { api } from '../../../services/authService';

const API_BASE = 'http://localhost:4000/api/admin';

/* ---------------- MODAL WRAPPER ---------------- */

const ModalWrapper = ({
  title,
  children,
  onClose,
  onSave,
  saveText = "Save",
  saveDisabled = false,
  width = "max-w-md"
}) => {

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">

      <div className={`bg-white rounded-2xl shadow-2xl w-full ${width} relative flex flex-col max-h-[90vh]`}>

        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto">
          {children}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">

          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
            disabled={saveDisabled}
          >
            Cancel
          </button>

          <button
            onClick={onSave}
            disabled={saveDisabled}
            className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl flex items-center gap-2
            ${saveDisabled ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saveText}
          </button>

        </div>
      </div>
    </div>,
    document.body
  );
};


/* ---------------- ADD BATCH MODAL ---------------- */

const AddBatchModal = ({
  selectedCourse,
  newBatchForm,
  setNewBatchForm,
  handleAddBatch,
  setShowAddBatchModal,
  setShowCourseDetailsModal,
}) => {

  const [isSubmitting, setIsSubmitting] = useState(false);

  /* CLOSE BUTTON */
  const handleClose = () => {
    setShowAddBatchModal(false);
    setNewBatchForm({ numberOfBatches: 1 });
  };

  /* GENERATE BATCHES */
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!selectedCourse?.courseId) {
      toast.error('No course selected');
      return;
    }

    const numberOfBatches = parseInt(newBatchForm.numberOfBatches);

    if (isNaN(numberOfBatches) || numberOfBatches < 1) {
      toast.error('Enter a valid number of batches');
      return;
    }

    setIsSubmitting(true);

    try {

      // create sections in backend
      const response = await api.post(
        `${API_BASE}/courses/${selectedCourse.courseId}/sections`,
        { numberOfSections: numberOfBatches }
      );

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'Server error');
      }

      toast.success(`${numberOfBatches} batch(es) created`);

      // refresh course batches in parent
      await handleAddBatch();

      // 🔥 CRITICAL FIX — close first
      setShowAddBatchModal(false);

      // wait React state update cycle, then reopen details
      setTimeout(() => {
        setShowCourseDetailsModal(true);
      }, 80);

      // reset form
      setNewBatchForm({ numberOfBatches: 1 });

    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to add batches';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalWrapper
      title="Add Batches"
      onClose={handleClose}
      onSave={handleSubmit}
      saveText={isSubmitting ? "Generating..." : "Generate Batches"}
      saveDisabled={isSubmitting}
    >

      <div className="space-y-6">

        {/* COURSE INFO */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Layers className="w-5 h-5" />
          </div>

          <div>
            <h4 className="font-bold text-slate-800 text-sm">Course</h4>
            <p className="text-sm text-slate-600 font-medium">
              {selectedCourse?.courseCode} - {selectedCourse?.courseTitle}
            </p>
          </div>
        </div>

        {/* INPUT */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Number of Batches <span className="text-red-500">*</span>
          </label>

          <input
            type="number"
            min="1"
            value={newBatchForm.numberOfBatches}
            onChange={(e) => {
              const value = e.target.value;
              setNewBatchForm({
                numberOfBatches: value === '' ? '' : parseInt(value) || 1
              });
            }}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none text-lg font-bold"
            disabled={isSubmitting}
            placeholder="1"
          />
        </div>

        {/* INFO */}
        <div className="flex gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-slate-400" />
          <p>
            Batches will be automatically named (Batch 1, Batch 2...).  
            You can allocate staff after creation.
          </p>
        </div>

      </div>

    </ModalWrapper>
  );
};

export default AddBatchModal;