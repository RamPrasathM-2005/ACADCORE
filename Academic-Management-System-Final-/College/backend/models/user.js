// models/user.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      references: {
        model: 'companies',
        key: 'companyId',
      },
      onDelete: 'SET DEFAULT',
    },
    departmentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'departments', // HR departments
        key: 'departmentId',
      },
      onDelete: 'RESTRICT',
    },
    userNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Unique employee/student/staff code (links to staffNumber or registerNumber)',
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userMail: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'roleId',
      },
      onDelete: 'RESTRICT',
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('Active', 'Inactive'),
      defaultValue: 'Active',
    },
    // Audit fields (self-referencing)
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'userId',
      },
      onDelete: 'SET NULL',
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'userId',
      },
      onDelete: 'SET NULL',
    },
    // Optional: if you want to store profile image in users (common field)
    profileImage: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: '/Uploads/default.jpg',
    },
    // Optional: reset password fields (common for all users)
    resetPasswordToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    resetPasswordExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'users',
    timestamps: true,
    paranoid: true, // soft deletes
    indexes: [
      { fields: ['userNumber'], unique: true },
      { fields: ['userMail'], unique: true },
      { fields: ['roleId'] },
      { fields: ['companyId', 'status'] },
      { fields: ['departmentId'] },
    ],
  });

  // ────────────────────────────────────────────────
  //               ASSOCIATIONS
  // ────────────────────────────────────────────────
  User.associate = (models) => {
    // ── Core HR / Common Associations ───────────────
    User.belongsTo(models.Company, {
      foreignKey: 'companyId',
      as: 'company',
    });

    User.belongsTo(models.Department, {  // HR department
      foreignKey: 'departmentId',
      as: 'department',
    });

    User.belongsTo(models.Role, {
      foreignKey: 'roleId',
      as: 'role',
    });

    // Self-references (who created/updated this user)
    User.belongsTo(models.User, {
      as: 'Creator',
      foreignKey: 'createdBy',
    });

    User.belongsTo(models.User, {
      as: 'Updater',
      foreignKey: 'updatedBy',
    });

    // ── HR / Employee Management ────────────────────
    User.hasMany(models.Company, {
      foreignKey: 'createdBy',
      as: 'createdCompanies',
    });
    User.hasMany(models.Company, {
      foreignKey: 'updatedBy',
      as: 'updatedCompanies',
    });

    User.hasMany(models.Department, {
      foreignKey: 'createdBy',
      as: 'createdDepartments',
    });
    User.hasMany(models.Department, {
      foreignKey: 'updatedBy',
      as: 'updatedDepartments',
    });

    User.hasMany(models.Designation, {
      foreignKey: 'createdBy',
      as: 'createdDesignations',
    });
    User.hasMany(models.Designation, {
      foreignKey: 'updatedBy',
      as: 'updatedDesignations',
    });

    User.hasMany(models.EmployeeGrade, {
      foreignKey: 'createdBy',
      as: 'createdEmployeeGrades',
    });
    User.hasMany(models.EmployeeGrade, {
      foreignKey: 'updatedBy',
      as: 'updatedEmployeeGrades',
    });

    User.hasMany(models.Employee, {
      foreignKey: 'createdBy',
      as: 'createdEmployees',
    });
    User.hasMany(models.Employee, {
      foreignKey: 'updatedBy',
      as: 'updatedEmployees',
    });

    // Biometric, Bus, Attendance, Leave, Salary, Shift, Loan...
    User.hasMany(models.Bus, { foreignKey: 'createdBy', as: 'createdBuses' });
    User.hasMany(models.Bus, { foreignKey: 'updatedBy', as: 'updatedBuses' });

    User.hasMany(models.BiometricDevice, {
      foreignKey: 'createdBy',
      as: 'createdBiometricDevices',
    });
    User.hasMany(models.BiometricDevice, {
      foreignKey: 'updatedBy',
      as: 'updatedBiometricDevices',
    });

    User.hasMany(models.Attendance, { foreignKey: 'approvedBy', as: 'approvedAttendances' });
    User.hasMany(models.Attendance, { foreignKey: 'createdBy', as: 'createdAttendances' });
    User.hasMany(models.Attendance, { foreignKey: 'updatedBy', as: 'updatedAttendances' });

    User.hasMany(models.LeaveAllocation, { foreignKey: 'createdBy', as: 'createdLeaveAllocations' });
    User.hasMany(models.LeaveAllocation, { foreignKey: 'updatedBy', as: 'updatedLeaveAllocations' });

    User.hasMany(models.LeavePolicy, { foreignKey: 'createdBy', as: 'createdLeavePolicies' });
    User.hasMany(models.LeavePolicy, { foreignKey: 'updatedBy', as: 'updatedLeavePolicies' });

    User.hasMany(models.LeaveRequest, { foreignKey: 'createdBy', as: 'createdLeaveRequests' });
    User.hasMany(models.LeaveRequest, { foreignKey: 'updatedBy', as: 'updatedLeaveRequests' });

    User.hasMany(models.LeaveApproval, { foreignKey: 'createdBy', as: 'createdLeaveApprovals' });
    User.hasMany(models.LeaveApproval, { foreignKey: 'updatedBy', as: 'updatedLeaveApprovals' });

   User.hasMany(models.HolidayPlan, { foreignKey: 'createdBy', as: 'createdHolidayPlans' });
  User.hasMany(models.HolidayPlan, { foreignKey: 'updatedBy', as: 'updatedHolidayPlans' });

  User.hasMany(models.Holiday, { foreignKey: 'createdBy', as: 'createdHolidays' });
  User.hasMany(models.Holiday, { foreignKey: 'updatedBy', as: 'updatedHolidays' });

  User.hasMany(models.GoogleAuth, { foreignKey: 'userId', as: 'googleAuths' });
  User.hasMany(models.GoogleAuth, { foreignKey: 'createdBy', as: 'createdGoogleAuths' });
  User.hasMany(models.GoogleAuth, { foreignKey: 'updatedBy', as: 'updatedGoogleAuths' });

  User.hasMany(models.Formula, { foreignKey: 'createdBy', as: 'createdFormulas' });
  User.hasMany(models.Formula, { foreignKey: 'updatedBy', as: 'updatedFormulas' });

  User.hasMany(models.EmployeeSalaryMaster, { foreignKey: 'createdBy', as: 'createdEmployeeSalaryMasters' });
  User.hasMany(models.EmployeeSalaryMaster, { foreignKey: 'updatedBy', as: 'updatedEmployeeSalaryMasters' });
  User.hasMany(models.EmployeeSalaryMaster, { foreignKey: 'approvedBy', as: 'approvedEmployeeSalaryMasters' });

  User.hasMany(models.SalaryComponent, { foreignKey: 'createdBy', as: 'createdSalaryComponents' });
  User.hasMany(models.SalaryComponent, { foreignKey: 'updatedBy', as: 'updatedSalaryComponents' });

  User.hasMany(models.EmployeeSalaryComponent, { foreignKey: 'createdBy', as: 'createdEmployeeSalaryComponents' });
  User.hasMany(models.EmployeeSalaryComponent, { foreignKey: 'updatedBy', as: 'updatedEmployeeSalaryComponents' });

  User.hasMany(models.SalaryGeneration, { foreignKey: 'generatedBy', as: 'generatedSalaries' });
  User.hasMany(models.SalaryGeneration, { foreignKey: 'approvedBy', as: 'approvedSalaries' });
  User.hasMany(models.SalaryGeneration, { foreignKey: 'paidBy', as: 'paidSalaries' });

  User.hasMany(models.SalaryGenerationDetail, { foreignKey: 'createdBy', as: 'createdSalaryGenerationDetails' });
  User.hasMany(models.SalaryGenerationDetail, { foreignKey: 'updatedBy', as: 'updatedSalaryGenerationDetails' });

  User.hasMany(models.SalaryRevisionHistory, { foreignKey: 'createdBy', as: 'createdSalaryRevisionHistories' });
  User.hasMany(models.SalaryRevisionHistory, { foreignKey: 'updatedBy', as: 'updatedSalaryRevisionHistories' });

  User.hasMany(models.ShiftType, { foreignKey: 'createdBy', as: 'createdShiftTypes' });
  User.hasMany(models.ShiftType, { foreignKey: 'updatedBy', as: 'updatedShiftTypes' });

  User.hasMany(models.ShiftAssignment, { foreignKey: 'createdBy', as: 'createdShiftAssignments' });
  User.hasMany(models.ShiftAssignment, { foreignKey: 'updatedBy', as: 'updatedShiftAssignments' });

  User.hasMany(models.EmployeeLoan, { foreignKey: 'approvedBy', as: 'approvedEmployeeLoans' });
  User.hasMany(models.EmployeeLoan, { foreignKey: 'createdBy', as: 'createdEmployeeLoans' });
  User.hasMany(models.EmployeeLoan, { foreignKey: 'updatedBy', as: 'updatedEmployeeLoans' });
};

 // ... (add remaining HR hasMany like Formula, SalaryComponent, etc. as needed)

    // ── ACADEMIC / EDUCATION Associations ───────────
    // Created/Updated academic entities
    User.hasMany(models.Regulation, {
      foreignKey: 'createdBy',
      as: 'createdRegulations',
    });
    User.hasMany(models.Regulation, {
      foreignKey: 'updatedBy',
      as: 'updatedRegulations',
    });

    User.hasMany(models.Batch, {
      foreignKey: 'createdBy',
      as: 'createdBatches',
    });
    User.hasMany(models.Batch, {
      foreignKey: 'updatedBy',
      as: 'updatedBatches',
    });

    User.hasMany(models.Semester, {
      foreignKey: 'createdBy',
      as: 'createdSemesters',
    });
    User.hasMany(models.Semester, {
      foreignKey: 'updatedBy',
      as: 'updatedSemesters',
    });

    User.hasMany(models.Course, {
      foreignKey: 'createdBy',
      as: 'createdCourses',
    });
    User.hasMany(models.Course, {
      foreignKey: 'updatedBy',
      as: 'updatedCourses',
    });

    // Staff/Teacher related (teaching assignments)
    User.hasMany(models.StaffCourse, {
      foreignKey: 'Userid',
      as: 'teachingAssignments',
    });

    User.hasMany(models.CourseRequest, {
      foreignKey: 'staffId',
      as: 'courseRequests',
    });

    User.hasMany(models.PeriodAttendance, {
      foreignKey: 'staffId',
      as: 'markedAttendances',
    });

    User.hasMany(models.CBCSSectionStaff, {
      foreignKey: 'staffId',
      as: 'cbcsTeachingAssignments',
    });

    User.hasMany(models.studentcourseChoices, {
      foreignKey: 'staffId',
      as: 'preferredByStudents',
    });

    User.hasMany(models.studentTempChoice, {
      foreignKey: 'preferred_staffId',
      as: 'tempPreferredByStudents',
    });

    // Student-related (tutor / approval)
    User.hasMany(models.StudentDetails, {
      foreignKey: 'staffId',
      as: 'tutoredStudents',
    });

    User.hasMany(models.StudentDetails, {
      foreignKey: 'approvedBy',
      as: 'approvedStudents',
    });

    // General creator/updater for student records
    User.hasMany(models.StudentDetails, {
      foreignKey: 'createdBy',
      as: 'createdStudentRecords',
    });
    User.hasMany(models.StudentDetails, {
      foreignKey: 'updatedBy',
      as: 'updatedStudentRecords',
    });

  return User;
};