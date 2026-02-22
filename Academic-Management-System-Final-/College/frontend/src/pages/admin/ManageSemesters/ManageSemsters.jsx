import React, { useState, useEffect } from 'react';
import { Plus, GraduationCap } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import { api } from '../../../services/authService';
import SearchBar from './SearchBar';
import SemesterList from './SemesterList';
import CreateSemesterForm from './CreateSemesterForm';
import SemesterDetails from './SemesterDetails';
import Swal from 'sweetalert2';
import { branchMap } from './branchMap';

const API_BASE = 'http://localhost:4000/api/admin';

const ManageSemesters = () => {
  const [allSemesters, setAllSemesters] = useState([]);
  const [filteredSemesters, setFilteredSemesters] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [searchQuery, setSearchQuery] = useState({ degree: '', batch: '', branch: '', semesterNumber: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSemesters();
  }, []);

  const fetchSemesters = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`${API_BASE}/semesters`);
      const normalized = (data.data || []).map(sem => ({
        ...sem,
        degree: sem.Batch?.degree || 'Unknown',
        branch: sem.Batch?.branch || 'Unknown',
        batch: sem.Batch?.batch || 'Unknown',
        batchYears: sem.Batch?.batchYears || 'Unknown',
        batchId: sem.Batch?.batchId,
      }));
      console.log('Normalized semesters:', normalized);
      setAllSemesters(normalized);
      setFilteredSemesters(normalized);
    } catch (err) {
      console.error('Error fetching semesters:', err.response?.data || err);
      toast.error('Failed to fetch semesters');
      setAllSemesters([]);
      setFilteredSemesters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = allSemesters;

    if (searchQuery.degree) filtered = filtered.filter(s => s.degree === searchQuery.degree);
    if (searchQuery.batch) filtered = filtered.filter(s => s.batch?.includes(searchQuery.batch));
    if (searchQuery.branch) filtered = filtered.filter(s => s.branch === searchQuery.branch);
    if (searchQuery.semesterNumber) filtered = filtered.filter(s => s.semesterNumber === Number(searchQuery.semesterNumber));

    filtered.sort((a, b) => b.semesterId - a.semesterId);
    setFilteredSemesters(filtered.slice(0, 5));
  }, [searchQuery, allSemesters]);

  const handleDeleteSemester = (semesterId) => {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This will permanently delete the semester and associated data!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        api
          .delete(`${API_BASE}/semesters/${semesterId}`)
          .then(() => {
            setAllSemesters(prev => prev.filter(s => s.semesterId !== semesterId));
            setFilteredSemesters(prev => prev.filter(s => s.semesterId !== semesterId));
            if (selectedSemester?.semesterId === semesterId) setSelectedSemester(null);
            toast.success('Semester deleted successfully');
          })
          .catch(err => {
            const msg = err.response?.data?.message || 'Failed to delete';
            toast.error(msg.includes('foreign key') ? 'Cannot delete: has associated courses' : msg);
          });
      }
    });
  };

  const handleRefresh = () => fetchSemesters();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-blue-600 animate-pulse mx-auto mb-4" />
          <p className="text-xl font-medium text-gray-700">Loading semesters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <ToastContainer position="top-right" autoClose={3000} theme="colored" />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Manage Semesters</h1>
            <p className="text-gray-600 text-lg">Create, view, edit and manage academic semesters across batches</p>
          </div>

          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 shadow-md transition-all hover:shadow-lg font-medium whitespace-nowrap"
          >
            <Plus size={20} />
            Add New Semester
          </button>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          {!selectedSemester ? (
            <div className="p-6 sm:p-8">
              <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

              <div className="mt-8">
                <SemesterList
                  semesters={filteredSemesters}
                  onSemesterClick={setSelectedSemester}
                  onDelete={handleDeleteSemester}
                  onRefresh={handleRefresh}
                />
              </div>

              <CreateSemesterForm
                showCreateForm={showCreateForm}
                setShowCreateForm={setShowCreateForm}
                onRefresh={fetchSemesters}
                branchMap={branchMap}
              />
            </div>
          ) : (
            <div className="p-6 sm:p-8">
              <SemesterDetails
                semester={selectedSemester}
                onBack={() => setSelectedSemester(null)}
                onDelete={handleDeleteSemester}
                onRefresh={handleRefresh}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageSemesters;