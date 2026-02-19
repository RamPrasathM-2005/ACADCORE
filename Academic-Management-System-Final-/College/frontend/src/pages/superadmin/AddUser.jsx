import React, { useState, useEffect, useRef } from "react";
import { Plus, X, Trash, Pencil, Cpu } from "lucide-react";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import API from "../../api";
import { useAuth } from "../auth/AuthContext";

// 🔹 Modal Component
function AddOrEditUser({
  formData,
  setFormData,
  onSave,
  onCancel,
  userRole,
  companies,
  isEdit,
  roles,
  currentUserCompanyId,
}) {
  const visibleRoles = roles.filter(
    (role) => role.status === "Active" && (userRole !== "Admin" || role.roleName !== "Super Admin")
  );
  const shouldShowCompanyField = true;
  const isCompanyFixed = userRole !== "Super Admin" && Boolean(currentUserCompanyId);
  const fixedCompany = companies.find((c) => Number(c.companyId) === Number(currentUserCompanyId));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  useEffect(() => {
    if (isCompanyFixed && !isEdit) {
      setFormData((prev) => ({ ...prev, companyId: currentUserCompanyId || "" }));
    }
  }, [isCompanyFixed, isEdit, currentUserCompanyId, setFormData]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 relative">
        <button
          onClick={onCancel}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 transition"
        >
          <X size={16} />
        </button>

        <div className="flex justify-center mb-4">
          <div className="bg-blue-100 rounded-full p-2">
            <Cpu className="text-blue-600" size={24} />
          </div>
        </div>

        <h2 className="text-lg font-bold text-gray-800 text-center mb-1">
          {isEdit ? "Edit User" : "Add New User"}
        </h2>

        <form onSubmit={onSave} className="space-y-3">
          {/* User Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User Name</label>
            <input
              type="text"
              name="userName"
              placeholder="User Name"
              value={formData.userName}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="userMail"
              placeholder="Email"
              value={formData.userMail}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required={!isEdit}
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              name="roleId"
              value={formData.roleId}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            >
              <option value="">Select Role</option>
              {visibleRoles.map((role) => (
                <option key={role.roleId} value={role.roleId}>
                  {role.roleName}
                </option>
              ))}
            </select>
          </div>

          {/* Company */}
          {shouldShowCompanyField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <select
                name="companyId"
                value={formData.companyId || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-md p-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                disabled={isCompanyFixed}
                required
              >
                {!isCompanyFixed && <option value="">Select Company</option>}
                {isCompanyFixed ? (
                  <option value={currentUserCompanyId}>
                    {fixedCompany?.companyName || fixedCompany?.companyAcr || `Company ${currentUserCompanyId}`}
                  </option>
                ) : (
                  companies.map((c) => (
                    <option key={c.companyId} value={c.companyId}>
                      {c.companyName}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* User Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User Number</label>
            <input
              type="text"
              name="userNumber"
              placeholder="User Number"
              value={formData.userNumber}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              disabled={isEdit}
              required
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-1.5 rounded-md transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md transition text-sm"
            >
              {isEdit ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 🔹 Main Component
export default function AddUser({ selectedCompanyId, selectedCompanyName }) {
  const { user } = useAuth();
  const [allDepartments, setAllDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [formData, setFormData] = useState({
    userName: "",
    userNumber: "",
    userMail: "",
    roleId: "",
    companyId: selectedCompanyId || "",
    password: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  const currentUserRole = user?.role || "";
  const currentUserId = user?.userId ?? user?.id ?? "system";
  const currentUserCompanyId =
    user?.companyId ||
    user?.company?.companyId ||
    selectedCompanyId ||
    "";
  const isSuperAdmin = String(currentUserRole).trim().toLowerCase() === "super admin";

  const getCompanyAcronym = (id) => {
    const company = companies.find((c) => c.companyId === id);
    return company ? company.companyAcr : "";
  };

  const getDepartmentAcronym = (id) => {
    const dept = allDepartments.find((d) => d.departmentId === id);
    return dept ? dept.departmentAcr || dept.departmentAckr || "" : "";
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const companyRes = await API.get("/companies");
        setCompanies(companyRes.data);
        const roleRes = await API.get("/roles");
        setRoles(roleRes.data || []);

        const res = await API.get("/users", {
          params: selectedCompanyId ? { companyId: selectedCompanyId } : {},
        });
        setUsers(res.data);

        const allDept = await API.get("/departments");
        setAllDepartments(allDept.data.data);
      } catch (err) {
        console.error("Error fetching data:", err.response?.data || err.message);
        toast.error("Error fetching data");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [selectedCompanyId, refreshFlag]);

  const openAddUserForm = () => {
    setFormData({
      userName: "",
      userNumber: "",
      userMail: "",
      roleId: "",
      companyId: currentUserRole !== "Super Admin" ? currentUserCompanyId : (selectedCompanyId || ""),
      password: "",
    });
    setIsEdit(false);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      createdBy: currentUserId,
      updatedBy: currentUserId,
      companyId: currentUserRole !== "Super Admin"
        ? (currentUserCompanyId || formData.companyId)
        : (formData.companyId || selectedCompanyId || 1),
      departmentId: 1,
    };

    try {
      if (isEdit) {
        await API.put(`/users/${formData.userId}`, payload);
      } else {
        await API.post("/users", payload);
      }
      Swal.fire({
        icon: "success",
        title: isEdit ? "Updated" : "Added",
        text: `User ${isEdit ? "Updated" : "Added"} Successfully`,
      });
      setShowForm(false);
      setRefreshFlag((prev) => !prev);
    } catch (err) {
      console.error("Error saving user:", err.response?.data || err.message);
      Swal.fire({
        icon: "error",
        title: isEdit ? "Update Failed" : "Add Failed",
        text: `User ${isEdit ? "Update" : "Add"} Failed`,
      });
      setShowForm(false);
    }
  };

  const parseCsvLine = (line) => {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values.map((v) => v.replace(/^"(.*)"$/, "$1").trim());
  };

  const parseCsvText = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return headers.reduce((acc, key, idx) => {
        acc[key] = values[idx] ?? "";
        return acc;
      }, {});
    });
  };

  const resolveCompanyId = (row, mapByName, mapByAcr) => {
    if (!isSuperAdmin) {
      return String(currentUserCompanyId || selectedCompanyId || "").trim();
    }

    if (selectedCompanyId) return String(selectedCompanyId);

    const companyIdRaw = String(row.companyId || "").trim();
    if (companyIdRaw) return companyIdRaw;

    const byName = mapByName.get(String(row.companyName || "").trim().toLowerCase());
    const byAcr = mapByAcr.get(String(row.companyAcr || "").trim().toLowerCase());
    return String(byName || byAcr || "").trim();
  };

  const resolveDepartmentId = (row, companyId, deptByName, deptByAcr) => {
    const rawDepartmentId = String(row.departmentId || "").trim();
    if (rawDepartmentId) return rawDepartmentId;

    const nameKey = `${companyId}::${String(row.departmentName || "").trim().toLowerCase()}`;
    const acrKey = `${companyId}::${String(row.departmentAcr || "").trim().toLowerCase()}`;
    return String(deptByName.get(nameKey) || deptByAcr.get(acrKey) || "").trim();
  };

  const handleBulkUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length === 0) {
        toast.error("CSV file is empty or invalid");
        return;
      }

      const roleIdByName = new Map(
        roles.map((r) => [String(r.roleName || "").trim().toLowerCase(), String(r.roleId)])
      );
      const companyIdByName = new Map(
        companies.map((c) => [String(c.companyName || "").trim().toLowerCase(), String(c.companyId)])
      );
      const companyIdByAcr = new Map(
        companies.map((c) => [String(c.companyAcr || "").trim().toLowerCase(), String(c.companyId)])
      );
      const departmentIdByName = new Map(
        allDepartments.map((d) => [
          `${String(d.companyId)}::${String(d.departmentName || "").trim().toLowerCase()}`,
          String(d.departmentId),
        ])
      );
      const departmentIdByAcr = new Map(
        allDepartments.map((d) => [
          `${String(d.companyId)}::${String(d.departmentAcr || d.departmentAckr || "").trim().toLowerCase()}`,
          String(d.departmentId),
        ])
      );

      let skippedRows = 0;
      const payloads = rows
        .map((row) => {
          const companyId = resolveCompanyId(row, companyIdByName, companyIdByAcr);
          const roleId =
            String(row.roleId || "").trim() ||
            roleIdByName.get(String(row.roleName || "").trim().toLowerCase()) ||
            "";
          const departmentId = resolveDepartmentId(
            row,
            companyId,
            departmentIdByName,
            departmentIdByAcr
          );

          const payload = {
            userNumber: String(row.userNumber || "").trim(),
            userName: String(row.userName || "").trim() || null,
            userMail: String(row.userMail || "").trim(),
            password: String(row.password || "").trim(),
            roleId,
            companyId,
            departmentId: departmentId || "1",
            status: "Active",
            createdBy: currentUserId,
            updatedBy: currentUserId,
          };

          const isValid =
            payload.userNumber &&
            payload.userMail &&
            payload.password &&
            String(payload.roleId || "").trim() &&
            String(payload.companyId || "").trim() &&
            String(payload.departmentId || "").trim();

          if (!isValid) {
            skippedRows += 1;
            return null;
          }
          return payload;
        })
        .filter(Boolean);

      if (payloads.length === 0) {
        toast.error(
          "CSV must include valid userNumber, userMail, password, roleId/roleName, company mapping and department mapping"
        );
        return;
      }

      const results = await Promise.allSettled(
        payloads.map((payload) => API.post("/users", payload))
      );
      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - successCount;

      if (successCount > 0) {
        setRefreshFlag((prev) => !prev);
      }

      const suffix = skippedRows > 0 ? `, ${skippedRows} skipped (invalid rows)` : "";
      if (failCount === 0) {
        Swal.fire("Uploaded!", `${successCount} users uploaded successfully${suffix}`, "success");
      } else {
        Swal.fire("Completed with errors", `${successCount} uploaded, ${failCount} failed${suffix}`, "warning");
      }
    } catch (err) {
      console.error("User bulk upload failed:", err);
      toast.error("Bulk upload failed");
    }
  };

  const csvValue = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadSampleTemplate = () => {
    const baseHeaders = [
      "userNumber",
      "userName",
      "userMail",
      "password",
      "roleName",
      "departmentName",
      "departmentAcr",
    ];
    const headers = isSuperAdmin
      ? ["userNumber", "userName", "userMail", "password", "roleName", "companyName", "companyAcr", "departmentName", "departmentAcr"]
      : baseHeaders;

    const sampleCompanyName = selectedCompanyName || "Acme Private Limited";
    const sampleCompanyAcr = "APL";
    const superAdminRows = [
      ["USR1001", "John Doe", "john.doe@acme.com", "Pass@123", "Admin", sampleCompanyName, sampleCompanyAcr, "Human Resources", "HR"],
      ["USR1002", "Jane Smith", "jane.smith@acme.com", "Pass@123", "Employee", sampleCompanyName, sampleCompanyAcr, "Finance", "FIN"],
    ];
    const adminRows = [
      ["USR1001", "John Doe", "john.doe@acme.com", "Pass@123", "Admin", "Human Resources", "HR"],
      ["USR1002", "Jane Smith", "jane.smith@acme.com", "Pass@123", "Employee", "Finance", "FIN"],
    ];
    const sampleRows = isSuperAdmin ? superAdminRows : adminRows;

    const csv = [
      headers.join(","),
      ...sampleRows.map((row) => row.map(csvValue).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "user_bulk_upload_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col px-6">
      {isLoading && <div>Loading...</div>}
      <div className="flex justify-between items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search user..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 bg-white text-black rounded-lg px-4 py-2 w-1/3 min-w-52 outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={openAddUserForm}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md"
          >
            <Plus size={18} /> Add User
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleBulkUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm whitespace-nowrap"
          >
            Upload CSV
          </button>
          <button
            type="button"
            onClick={downloadSampleTemplate}
            className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg shadow-sm whitespace-nowrap"
          >
            Download Sample
          </button>
        </div>
      </div>

      <div
        className="overflow-y-auto border border-gray-200 rounded-lg shadow-sm flex-1"
        style={{ maxHeight: "320px" }}
      >
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0">
            <tr className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <th className="py-3 px-4">User Number</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Role</th>
              {!selectedCompanyId && <th className="py-3 px-4">Company</th>}
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users
              .filter(
                (u) =>
                  u.userNumber.toLowerCase().includes(search.toLowerCase()) ||
                  u.userMail.toLowerCase().includes(search.toLowerCase())
              )
              .map((u) => (
                <tr key={u.userNumber} className="border-t hover:bg-gray-50">
                  <td className="py-2 px-4">{u.userNumber}</td>
                  <td className="py-2 px-4">{u.userMail}</td>
                  <td className="py-2 px-4">{u.role?.roleName || u.roleId}</td>
                  {!selectedCompanyId && (
                    <td className="py-2 px-4">{getCompanyAcronym(u.companyId)}</td>
                  )}
                  <td className="py-2 px-4">{getDepartmentAcronym(u.departmentId)}</td>
                  <td className="py-2 px-4 flex gap-2">
                    <button
                      className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-md"
                      onClick={() => {
                        setFormData({
                          userId: u.userId,
                          userName: u.userName || "",
                          userNumber: u.userNumber,
                          userMail: u.userMail,
                          roleId: u.roleId,
                          companyId: u.companyId,
                          password: "",
                        });
                        setShowForm(true);
                        setIsEdit(true);
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-md"
                      onClick={() => {
                        Swal.fire({
                          title: "Are you sure?",
                          text: "You won't be able to revert this!",
                          icon: "warning",
                          showCancelButton: true,
                          confirmButtonColor: "#3085d6",
                          cancelButtonColor: "#d33",
                          confirmButtonText: "Yes, delete it!",
                        }).then(async (result) => {
                          if (result.isConfirmed) {
                            try {
                              await API.delete(`/users/${u.userId}`, {
                                data: { updatedBy: currentUserId },
                              });
                              Swal.fire({
                                title: "Deleted!",
                                text: "User has been deleted.",
                                icon: "success",
                              });
                              setRefreshFlag((prev) => !prev);
                            } catch (err) {
                              console.error("Delete error:", err.response?.data || err.message);
                              Swal.fire({
                                title: "Error!",
                                text: "Failed to delete user.",
                                icon: "error",
                              });
                            }
                          }
                        });
                      }}
                    >
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            {users.filter(
              (u) =>
                u.userNumber.toLowerCase().includes(search.toLowerCase()) ||
                u.userMail.toLowerCase().includes(search.toLowerCase())
            ).length === 0 && (
              <tr>
                <td
                  colSpan={selectedCompanyId ? 5 : 6}
                  className="text-center py-4 text-gray-500"
                >
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <AddOrEditUser
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          userRole={currentUserRole}
          companies={companies}
          isEdit={isEdit}
          roles={roles}
          currentUserCompanyId={currentUserCompanyId}
        />
      )}
    </div>
  );
}