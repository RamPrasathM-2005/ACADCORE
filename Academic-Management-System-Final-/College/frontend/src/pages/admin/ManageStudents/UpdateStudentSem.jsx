import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ArrowUpCircle, Layers } from 'lucide-react';
import { api } from '../../../services/authService';
import { showConfirmToast, showErrorToast, showSuccessToast } from '../../../utils/swalConfig';

const UpdateStudentSem = () => {
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [upgradingKey, setUpgradingKey] = useState('');
  const [filters, setFilters] = useState({
    departmentId: '',
    batch: '',
    search: '',
  });

  const canSearch = useMemo(() => filters.departmentId || filters.batch || filters.search, [filters]);

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments');
      const list = res?.data?.data || [];
      setDepartments(list);
    } catch (error) {
      showErrorToast('Error', error?.response?.data?.message || 'Failed to load departments');
    }
  };

  const fetchRows = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.departmentId) params.departmentId = filters.departmentId;
      if (filters.batch) params.batch = filters.batch.trim();
      if (filters.search) params.search = filters.search.trim();

      const res = await api.get('/admin/students/semester-upgrade-batches', { params });
      setRows(res?.data?.data || []);
    } catch (error) {
      setRows([]);
      showErrorToast('Error', error?.response?.data?.message || 'Failed to load batch list');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (row) => {
    const key = `${row.departmentId}-${row.batch}`;
    const confirm = await showConfirmToast(
      'Upgrade Semester',
      `Upgrade all students in ${row.branch} - Batch ${row.batch} by +1 semester?`,
      'warning',
      'Yes, Upgrade',
      'Cancel'
    );

    if (!confirm.isConfirmed) return;

    setUpgradingKey(key);
    try {
      const res = await api.post('/admin/students/semester-upgrade', {
        departmentId: row.departmentId,
        batch: row.batch,
      });
      showSuccessToast(res?.data?.message || 'Semester upgraded successfully');
      await fetchRows();
    } catch (error) {
      showErrorToast('Error', error?.response?.data?.message || 'Failed to upgrade semester');
    } finally {
      setUpgradingKey('');
    }
  };

  useEffect(() => {
    fetchDepartments();
    fetchRows();
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Semester Upgrade</h1>
        <p className="text-gray-600">
          Filter by department and batch, then upgrade semester (+1) for all students in that group.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={filters.departmentId}
            onChange={(e) => setFilters((prev) => ({ ...prev, departmentId: e.target.value }))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.departmentId} value={d.departmentId}>
                {d.Deptacronym} - {d.Deptname}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Batch year (e.g., 2023)"
            value={filters.batch}
            onChange={(e) => setFilters((prev) => ({ ...prev, batch: e.target.value }))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          <input
            type="text"
            placeholder="Search branch/degree/batch"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          <div className="flex gap-2">
            <button
              onClick={fetchRows}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Search className="w-4 h-4" /> Search
            </button>
            <button
              onClick={() => {
                setFilters({ departmentId: '', batch: '', search: '' });
                setTimeout(fetchRows, 0);
              }}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-100"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Batch</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Department</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Degree</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Students</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Current Sem</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Upgradable</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {canSearch ? 'No matching batches found' : 'No batch data available'}
                </td>
              </tr>
            )}
            {!loading && rows.map((row) => {
              const key = `${row.departmentId}-${row.batch}`;
              const busy = upgradingKey === key;
              return (
                <tr key={`${row.batchId}-${key}`} className="border-b last:border-b-0">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.batch}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.branch}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.degree}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.studentCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.currentSemester ? (
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" /> {row.currentSemester}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.upgradableCount}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={busy || row.upgradableCount === 0}
                      onClick={() => handleUpgrade(row)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:bg-gray-400 hover:bg-emerald-700"
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                      {busy ? 'Upgrading...' : 'Upgrade +1'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UpdateStudentSem;
