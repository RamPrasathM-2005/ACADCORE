import React, { useState, useEffect } from 'react';
import { Search, Upload, Download, RefreshCw } from 'lucide-react';
import { api } from '../../services/authService';
import { toast } from 'react-hot-toast';

const branchMap = {
  CSE: 'Computer Science Engineering',
  IT: 'Information Technology',
  ECE: 'Electronics & Communication',
  MECH: 'Mechanical Engineering',
  CIVIL: 'Civil Engineering',
  EEE: 'Electrical Engineering'
};

const CgpaAllocation = () => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    degree: 'BE',
    branch: '',
    batch: '',
    semester: ''
  });
  const [isNptelImport, setIsNptelImport] = useState(false);
  const [uploadType, setUploadType] = useState('regular');
  const [batches, setBatches] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [currentSemesterId, setCurrentSemesterId] = useState(null);
  const [lastImportInfo, setLastImportInfo] = useState(null);

  const isFirstSemester = filters.semester === '1';

  useEffect(() => {
    if (!filters.branch) {
      setBatches([]);
      setFilters((prev) => ({ ...prev, batch: '', semester: '' }));
      return;
    }

    const fetchBatches = async () => {
      try {
        const res = await api.get('/admin/batches', {
          params: { branch: filters.branch, degree: filters.degree }
        });
        setBatches(res.data.data || []);
      } catch {
        toast.error('Failed to load batches');
      }
    };
    fetchBatches();
  }, [filters.branch, filters.degree]);

  useEffect(() => {
    if (!filters.batch) {
      setSemesters([]);
      setFilters((prev) => ({ ...prev, semester: '' }));
      return;
    }

    const fetchSemesters = async () => {
      try {
        const res = await api.get('/admin/semesters/by-batch-branch', {
          params: {
            batch: filters.batch,
            branch: filters.branch,
            degree: filters.degree
          }
        });
        const list = res.data.data?.map((s) => s.semesterNumber).sort((a, b) => a - b) || [];
        setSemesters(list);
      } catch {
        toast.error('Failed to load semesters');
      }
    };
    fetchSemesters();
  }, [filters.batch, filters.branch, filters.degree]);

  useEffect(() => {
    if (!filters.semester || !filters.batch || !filters.branch) {
      setCurrentSemesterId(null);
      return;
    }

    const fetchSemesterId = async () => {
      try {
        const res = await api.get('/admin/semesters/by-batch-branch', {
          params: {
            batch: filters.batch,
            branch: filters.branch,
            degree: filters.degree,
            semesterNumber: parseInt(filters.semester, 10)
          }
        });

        const semester = res.data.data?.find(
          (s) => s.semesterNumber === parseInt(filters.semester, 10)
        );

        if (!semester?.semesterId) {
          setCurrentSemesterId(null);
          toast.error('Semester not found in database');
          return;
        }

        setCurrentSemesterId(semester.semesterId);
      } catch {
        setCurrentSemesterId(null);
        toast.error('Failed to load semester');
      }
    };
    fetchSemesterId();
  }, [filters.semester, filters.batch, filters.branch, filters.degree]);

  useEffect(() => {
    if (!filters.branch || !filters.batch) {
      setStudents([]);
      return;
    }

    const fetchStudents = async () => {
      setLoading(true);
      try {
        const res = await api.get('/admin/grades/students-grade', {
          params: {
            branch: filters.branch,
            batch: filters.batch,
            degree: filters.degree
          }
        });
        setStudents(
          (res.data.data || []).map((s) => ({
            regno: s.regno,
            name: s.name,
            gpa: '-',
            cgpa: isFirstSemester ? '-' : '-'
          }))
        );
      } catch {
        toast.error('Failed to load students');
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();
  }, [filters.branch, filters.batch, filters.degree, isFirstSemester]);

  useEffect(() => {
    if (currentSemesterId && students.length > 0) {
      refreshStudentsAndCalculateAll();
    }
  }, [currentSemesterId]);

  const refreshStudentsAndCalculateAll = async () => {
    if (!currentSemesterId) {
      toast.error('Invalid semester selected');
      return;
    }

    setCalculating(true);
    try {
      const gpaPromises = students.map((s) =>
        api
          .get('/admin/grades/gpa', {
            params: { regno: s.regno, semesterId: currentSemesterId }
          })
          .then((r) => ({ regno: s.regno, gpa: r.data.gpa }))
          .catch(() => ({ regno: s.regno, gpa: '-' }))
      );

      const cgpaPromises = isFirstSemester
        ? []
        : students.map((s) =>
            api
              .get('/admin/grades/cgpa', {
                params: { regno: s.regno, upToSemesterId: currentSemesterId }
              })
              .then((r) => ({ regno: s.regno, cgpa: r.data.cgpa }))
              .catch(() => ({ regno: s.regno, cgpa: '-' }))
          );

      const [gpaResults, cgpaResults] = await Promise.all([
        Promise.all(gpaPromises),
        cgpaPromises.length > 0 ? Promise.all(cgpaPromises) : Promise.resolve([])
      ]);

      const gpaMap = Object.fromEntries(gpaResults.map((r) => [r.regno, r.gpa]));
      const cgpaMap =
        cgpaResults.length > 0 ? Object.fromEntries(cgpaResults.map((r) => [r.regno, r.cgpa])) : {};

      setStudents((prev) =>
        prev.map((s) => ({
          ...s,
          gpa: gpaMap[s.regno] ?? '-',
          cgpa: isFirstSemester ? '-' : cgpaMap[s.regno] ?? '-'
        }))
      );

      toast.success(`GPA and CGPA recalculated for ${students.length} students`);
    } catch {
      toast.error('Failed to calculate grades');
    } finally {
      setCalculating(false);
    }
  };

  const importGrades = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentSemesterId) {
      toast.error('Please select semester first');
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('semesterId', currentSemesterId);
    fd.append('isNptel', isNptelImport ? 'true' : 'false');
    fd.append('uploadType', uploadType);

    setLoading(true);
    try {
      const response = await api.post('/admin/grades/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(response.data.message || 'Grades imported successfully');
      setLastImportInfo({
        message: response.data.message || 'Grades imported successfully',
        processed: response.data.processed ?? 0,
        affectedStudents: response.data.affectedStudents ?? 0
      });
      await refreshStudentsAndCalculateAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const calculateForStudent = async (regno) => {
    if (!currentSemesterId) return;

    try {
      const [gpaRes, cgpaRes] = await Promise.all([
        api.get('/admin/grades/gpa', { params: { regno, semesterId: currentSemesterId } }),
        isFirstSemester
          ? Promise.resolve({ data: { cgpa: '-' } })
          : api.get('/admin/grades/cgpa', { params: { regno, upToSemesterId: currentSemesterId } })
      ]);

      setStudents((prev) =>
        prev.map((s) =>
          s.regno === regno
            ? { ...s, gpa: gpaRes.data.gpa || '-', cgpa: cgpaRes.data?.cgpa || '-' }
            : s
        )
      );
    } catch {
      toast.error('Failed');
    }
  };

  const filtered = students.filter(
    (s) =>
      (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.regno || '').includes(search)
  );

  const sampleCSV =
    'data:text/csv;charset=utf-8,s.no,register_number,23SH11C,23SH12C,23SH13C,23SH14C,23SH15C,23SH16C,23CS11C,23EE11C%0A1,2312001,O,A+,A,B+,B,C,A+,B%0A2,2312002,A+,A,B+,B,C,A,O,B+';

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CGPA Allocation</h1>
        <p className="text-gray-600">Import regular/arrear results and view updated GPA/CGPA</p>
        <p className="text-xs text-gray-500 mt-1">
          CSV format: <span className="font-semibold">s.no, register_number, 23SH11C, 23SH12C, ...</span>
        </p>
      </div>

      {filters.semester && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <strong>Semester:</strong>{' '}
              <span className="font-bold text-indigo-700">Semester {filters.semester}</span>
            </div>
            <div>
              <strong>Branch:</strong>{' '}
              <span className="font-bold text-indigo-700">
                {branchMap[filters.branch] || filters.branch}
              </span>
            </div>
            <div>
              <strong>Batch:</strong>{' '}
              <span className="font-bold text-indigo-700">{filters.batch}</span>
            </div>
            <div>
              <strong>Degree:</strong>{' '}
              <span className="font-bold text-indigo-700">{filters.degree}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        {lastImportInfo && (
          <div className="mb-4 p-3 rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm">
            <p className="font-semibold">{lastImportInfo.message}</p>
            <p className="mt-1">
              Processed rows: <span className="font-semibold">{lastImportInfo.processed}</span> | Affected students:{' '}
              <span className="font-semibold">{lastImportInfo.affectedStudents}</span>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <select
            value={filters.degree}
            onChange={(e) =>
              setFilters({ ...filters, degree: e.target.value, branch: '', batch: '', semester: '' })
            }
            className="px-4 py-2 border rounded-lg"
          >
            <option value="BE">BE</option>
            <option value="BTech">BTech</option>
          </select>

          <select
            value={filters.branch}
            onChange={(e) => setFilters({ ...filters, branch: e.target.value, batch: '', semester: '' })}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">Select Branch</option>
            {Object.entries(branchMap).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={filters.batch}
            onChange={(e) => setFilters({ ...filters, batch: e.target.value, semester: '' })}
            className="px-4 py-2 border rounded-lg"
            disabled={!filters.branch}
          >
            <option value="">Select Batch</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batch}>
                {b.batch}
              </option>
            ))}
          </select>

          <select
            value={filters.semester}
            onChange={(e) => setFilters({ ...filters, semester: e.target.value })}
            className="px-4 py-2 border rounded-lg"
            disabled={!filters.batch}
          >
            <option value="">Select Semester</option>
            {semesters.map((n) => (
              <option key={n} value={n}>
                Semester {n}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-end items-center">
          <div className="flex items-center gap-3 mr-auto flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Upload Type</span>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                <option value="regular">Regular Semester</option>
                <option value="arrear">Arrear / Backlog</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isNptelImport}
                onChange={(e) => setIsNptelImport(e.target.checked)}
                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Import NPTEL Grades</span>
            </label>

            {isNptelImport && (
              <p className="text-sm text-gray-600">
                Only grades for enrolled NPTEL courses will be accepted.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700">
            <Upload className="w-4 h-4" />
            Import {isNptelImport ? 'NPTEL' : uploadType === 'arrear' ? 'Arrear' : 'Regular'} Grades
            <input type="file" accept=".csv,.xlsx" onChange={importGrades} className="hidden" />
          </label>

          <a
            href={sampleCSV}
            download="sample_grades.csv"
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="w-4 h-4" /> Sample
          </a>

          <button
            onClick={refreshStudentsAndCalculateAll}
            disabled={!currentSemesterId || calculating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${calculating ? 'animate-spin' : ''}`} />
            {calculating ? 'Calculating...' : 'Recalculate All'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading students...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {filters.branch && filters.batch ? 'No grades yet' : 'Please select filters'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reg No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GPA</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CGPA</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((s) => (
                <tr key={s.regno}>
                  <td className="px-6 py-4 text-sm font-medium">{s.regno}</td>
                  <td className="px-6 py-4 text-sm">{s.name}</td>
                  <td className="px-6 py-4 text-sm font-bold text-blue-600">{s.gpa || '-'}</td>
                  <td className="px-6 py-4 text-sm font-bold text-green-600">{s.cgpa || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => calculateForStudent(s.regno)}
                      className="text-blue-600 hover:underline disabled:text-gray-400"
                      disabled={calculating}
                    >
                      {s.gpa && s.gpa !== '-' ? 'Done' : 'Calculate'}
                    </button>
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

export default CgpaAllocation;
