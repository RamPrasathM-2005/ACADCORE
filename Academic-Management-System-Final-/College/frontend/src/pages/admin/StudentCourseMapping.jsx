import React, { useState, useEffect, useMemo } from 'react';
import { 
  Card, Select, Form, Table, Spin, Button, Input, Typography, 
  Space, Tag, Tooltip, Empty 
} from 'antd';
import { 
  SearchOutlined, CheckOutlined, CloseOutlined, UserOutlined, AppstoreOutlined 
} from '@ant-design/icons';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { api } from "../../services/authService"; 

const MySwal = withReactContent(Swal);
const { Option } = Select;
const { Title, Text } = Typography;

const StudentCourseMapping = () => {
  const [departments, setDepartments] = useState([]);
  const [batches, setBatches] = useState([]);
  const [semesterOptions, setSemesterOptions] = useState([]);
  
  const [selectedDept, setSelectedDept] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [searchText, setSearchText] = useState("");

  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [fetchingMatrix, setFetchingMatrix] = useState(false);
  const [form] = Form.useForm();

  // ──────────────────────────────────────────────
  // Your existing effects and handler logic
  // (kept unchanged – only layout/UI fixes below)
  // ──────────────────────────────────────────────

  useEffect(() => {
    const loadFilterData = async () => {
      setLoading(true);
      try {
        const [deptRes, batchRes] = await Promise.all([
          api.get("/departments"),
          api.get("/admin/batches"),
        ]);
        setDepartments(deptRes.data?.data || []);
        setBatches(batchRes.data?.data || []);
      } catch (err) {
        console.error("Failed to load filters", err);
      } finally {
        setLoading(false);
      }
    };
    loadFilterData();
  }, []);

  useEffect(() => {
    const fetchSemesters = async () => {
      try {
        const semRes = await api.get("/admin/semesters");
        const semData = semRes.data?.data || [];
        const semNums = [...new Set(semData.map(s => s.semesterNumber).filter(Boolean))].sort((a, b) => a - b);
        setSemesterOptions(semNums);
      } catch (err) {
        console.error(err);
      }
    };
    fetchSemesters();
  }, []);

  const handleFetchMatrix = async () => {
    if (!selectedDept || !selectedBatch || !selectedSemester) {
      MySwal.fire({
        toast: true,
        position: 'top-end',
        icon: 'warning',
        title: 'Please select Department, Batch, and Semester',
        showConfirmButton: false,
        timer: 3000,
      });
      return;
    }

    setFetchingMatrix(true);
    setCourses([]);
    setStudents([]);
    setEnrollments([]);

    try {
      const params = new URLSearchParams({
        dept: selectedDept,
        batch: selectedBatch,
        semester: selectedSemester,
        search: searchText.trim(),
      });

      const res = await api.get(`/admin/student-course-matrix?${params}`);
      const data = res.data?.data || {};
      
      setCourses(data.courses || []);
      setStudents(data.students || []);
      setEnrollments(data.enrollments || []);

      if (!data.students?.length) {
        MySwal.fire({
          toast: true,
          position: 'top-end',
          icon: 'info',
          title: 'No students found',
          showConfirmButton: false,
          timer: 2200,
        });
      }
    } catch (err) {
      console.error(err);
      MySwal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: 'Failed to load details',
        showConfirmButton: false,
        timer: 3000,
      });
    } finally {
      setFetchingMatrix(false);
    }
  };

  const enrollmentSet = useMemo(() => 
    new Set(enrollments.map(e => `${e.regno}::${e.courseId}`)),
  [enrollments]);

  const columns = [
    {
      title: 'Reg No',
      dataIndex: 'regno',
      key: 'regno',
      fixed: 'left',
      width: 130,
      sorter: (a, b) => a.regno.localeCompare(b.regno),
      render: text => <span className="font-semibold text-gray-700">{text}</span>
    },
    {
      title: 'Student Name',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left',
      width: 240,
      ellipsis: true,
      render: text => <span className="font-medium text-blue-600">{text}</span>
    },
    ...courses.map(course => ({
      title: (
        <Tooltip title={course.courseTitle}>
          <div className="text-center min-w-[100px]">
            <div className="font-bold text-gray-800">{course.courseCode}</div>
            <div className="text-xs text-gray-500 mt-0.5 line-clamp-2 h-9">
              {course.courseTitle}
            </div>
          </div>
        </Tooltip>
      ),
      key: course.courseId,
      width: 120,
      align: 'center',
      render: (_, record) => {
        const isEnrolled = enrollmentSet.has(`${record.regno}::${course.courseId}`);
        return isEnrolled ? (
          <CheckOutlined style={{ color: "#16a34a", fontSize: 22, fontWeight: 700 }} />
        ) : (
          <CloseOutlined style={{ color: "#ef4444", fontSize: 22, fontWeight: 700 }} />
        );
      },
    }))
  ];

  const getDeptName = () => departments.find(d => d.departmentId === selectedDept)?.Deptacronym || selectedDept;
  const getBatchName = () => selectedBatch;

  return (
    <div className="min-h-screen bg-gray-50 w-full overflow-x-hidden">
      {/* Stronger containment – same pattern as successful consolidated marks pages */}
      <div className="p-6 max-w-screen-xl mx-auto overflow-x-hidden">
        <Title level={3} className="mb-2 flex items-center gap-3 text-gray-800">
          <AppstoreOutlined className="text-blue-600" />
          Student Course Mapping
        </Title>
        <Text type="secondary" className="block mb-6">
          View and verify student enrollments across courses for a specific semester.
        </Text>

        <Card className="mb-6 shadow-sm border-gray-200 overflow-hidden">
          <Spin spinning={loading}>
            <Form layout="vertical">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Form.Item label="Department">
                  <Select
                    showSearch
                    optionFilterProp="children"
                    placeholder="Select Department"
                    value={selectedDept}
                    onChange={setSelectedDept}
                    size="large"
                  >
                    {departments.map(d => (
                      <Option key={d.departmentId} value={d.departmentId}>
                        {d.Deptname} ({d.Deptacronym})
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item label="Batch">
                  <Select
                    placeholder="Select Batch"
                    value={selectedBatch}
                    onChange={setSelectedBatch}
                    size="large"
                  >
                    {[...new Set(batches.map(b => b.batch).filter(Boolean))].map(b => (
                      <Option key={b} value={b}>{b}</Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item label="Semester">
                  <Select
                    placeholder="Select Semester"
                    value={selectedSemester}
                    onChange={setSelectedSemester}
                    size="large"
                  >
                    {semesterOptions.map(s => (
                      <Option key={s} value={s}>Semester {s}</Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item label="Search Student">
                  <Input
                    prefix={<SearchOutlined className="text-gray-400" />}
                    placeholder="Name or Reg No"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    size="large"
                  />
                </Form.Item>
              </div>

              {(selectedDept || selectedBatch || selectedSemester) && (
                <div className="mt-5 p-3 bg-blue-50 border border-blue-100 rounded-lg flex flex-wrap gap-2 items-center">
                  <span className="text-blue-800 font-medium mr-2">Filters:</span>
                  {selectedDept && <Tag color="blue">{getDeptName()}</Tag>}
                  {selectedBatch && <Tag color="green">{getBatchName()}</Tag>}
                  {selectedSemester && <Tag color="orange">Sem {selectedSemester}</Tag>}
                </div>
              )}

              <div className="mt-6">
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  loading={fetchingMatrix}
                  onClick={handleFetchMatrix}
                  disabled={!selectedDept || !selectedBatch || !selectedSemester}
                  size="large"
                >
                  Load Details
                </Button>
              </div>
            </Form>
          </Spin>
        </Card>

        {students.length > 0 ? (
          <Card
            title={
              <div className="flex justify-between items-center flex-wrap gap-3">
                <Space>
                  <UserOutlined />
                  <span className="font-semibold">Enrollment Matrix</span>
                  <Tag color="success" bordered={false}>{students.length}</Tag>
                </Space>
                <span className="text-gray-600 text-sm">
                  Courses: {courses.length}
                </span>
              </div>
            }
            className="shadow-sm border-gray-200 overflow-hidden"
            bodyStyle={{ padding: 0 }}
          >
            {/* ──────────────────────────────────────────────
                This is the key part that matches your reference page
            ────────────────────────────────────────────── */}
            <div className="overflow-x-auto">
              <Table
                columns={columns}
                dataSource={students}
                rowKey="regno"
                scroll={{ x: 'max-content', y: 580 }}
                sticky
                bordered
                size="middle"
                loading={fetchingMatrix}
                pagination={{
                  pageSize: 15,
                  showSizeChanger: true,
                  position: ['bottomRight'],
                }}
              />
            </div>
          </Card>
        ) : !fetchingMatrix && (
          <Card className="text-center py-16 bg-white border-dashed border-gray-300">
            <Empty
              description={
                courses.length > 0
                  ? "No students match the current search"
                  : "Select department, batch, semester and click 'Load Details'"
              }
            />
          </Card>
        )}
      </div>
    </div>
  );
};

export default StudentCourseMapping;

