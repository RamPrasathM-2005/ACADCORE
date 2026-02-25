import React, { useEffect, useState } from 'react';
import { api } from '../../services/authService';

const ElectiveReselectionRequests = () => {
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/admin/elective-reselection-requests', {
        params: { status, _ts: Date.now() }
      });
      setRows(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [status]);

  const handleAction = async (row, action) => {
    try {
      const remarks = window.prompt(`Remarks for ${action} (optional):`) || '';
      await api.post(
        `/admin/elective-reselection-requests/${row.student.registerNumber}/${row.requestId}/action`,
        { action, remarks }
      );
      await fetchRequests();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} request`);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Elective Reselection Requests</h2>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>}

      {loading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center bg-white border rounded">No requests found.</div>
      ) : (
        <div className="bg-white border rounded overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left">Student</th>
                <th className="p-3 text-left">Request ID</th>
                <th className="p-3 text-left">Semester</th>
                <th className="p-3 text-left">Department</th>
                <th className="p-3 text-left">Reason</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Requested At</th>
                <th className="p-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.student.registerNumber}-${row.requestId}`} className="border-t">
                  <td className="p-3">
                    <div className="font-semibold">{row.student.studentName}</div>
                    <div className="text-xs text-gray-500">{row.student.registerNumber}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{row.requestId}</td>
                  <td className="p-3">{row.semesterId}</td>
                  <td className="p-3">{row.student.departmentAcronym || '-'}</td>
                  <td className="p-3">{row.reason || '-'}</td>
                  <td className="p-3 uppercase">{row.status}</td>
                  <td className="p-3">{row.requestedAt ? new Date(row.requestedAt).toLocaleString() : '-'}</td>
                  <td className="p-3">
                    {row.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(row, 'approve')}
                          className="px-3 py-1 rounded bg-green-600 text-white"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(row, 'reject')}
                          className="px-3 py-1 rounded bg-red-600 text-white"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ElectiveReselectionRequests;
