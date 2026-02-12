// models/studentDetails.js (updated from user's provided)
module.exports = (sequelize, DataTypes) => {
  const StudentDetails = sequelize.define('StudentDetails', {
    studentId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentName: { type: DataTypes.STRING(50), allowNull: false },
    registerNumber: { type: DataTypes.STRING(50), unique: true, allowNull: false },
    departmentId: { type: DataTypes.INTEGER, allowNull: true },
    batch: { type: DataTypes.INTEGER },
    semester: { type: DataTypes.STRING(255) },
    staffId: { type: DataTypes.INTEGER, allowNull: true },
    createdBy: { type: DataTypes.INTEGER },
    updatedBy: { type: DataTypes.INTEGER },
    dateOfJoining: { type: DataTypes.DATE },
    dateOfBirth: { type: DataTypes.DATE },
    bloodGroup: { type: DataTypes.ENUM('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-') },
    tutorEmail: { type: DataTypes.STRING, validate: { isEmail: true } },
    personalEmail: { type: DataTypes.STRING, validate: { isEmail: true } },
    firstGraduate: { type: DataTypes.ENUM('Yes', 'No') },
    aadharCardNo: { type: DataTypes.STRING(12), unique: true },
    studentType: { type: DataTypes.ENUM('Day-Scholar', 'Hosteller') },
    motherTongue: { type: DataTypes.STRING },
    identificationMark: { type: DataTypes.STRING },
    religion: { type: DataTypes.ENUM('Hindu', 'Muslim', 'Christian', 'Others') },
    caste: { type: DataTypes.STRING },
    community: { type: DataTypes.ENUM('General', 'OBC', 'SC', 'ST', 'Others') },
    gender: { type: DataTypes.ENUM('Male', 'Female', 'Transgender') },
    seatType: { type: DataTypes.ENUM('Counselling', 'Management') },
    section: { type: DataTypes.STRING },
    doorNo: { type: DataTypes.STRING(255) },
    street: { type: DataTypes.STRING(255) },
    city: { type: DataTypes.STRING(255) },
    pincode: { type: DataTypes.STRING(6) },
    personalPhone: { type: DataTypes.STRING(10) },
    pending: { type: DataTypes.BOOLEAN, defaultValue: true },
    tutorApprovalStatus: { type: DataTypes.BOOLEAN, defaultValue: false },
    approvedBy: { type: DataTypes.INTEGER },
    approvedAt: { type: DataTypes.DATE },
    messages: { type: DataTypes.JSON },
    skillrackProfile: { type: DataTypes.STRING(255), allowNull: true },
  }, { tableName: 'student_details', timestamps: true });

  StudentDetails.associate = (models) => {
    StudentDetails.belongsTo(models.DepartmentAcademic, { foreignKey: 'departmentId', as: 'department' });
    StudentDetails.belongsTo(models.Employee, { foreignKey: 'staffId', as: 'staff' });
    StudentDetails.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    StudentDetails.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'updater' });
    StudentDetails.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
    // HasMany for academic
    StudentDetails.hasMany(models.StudentCourse, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.StudentCOTool, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.DayAttendance, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.PeriodAttendance, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.StudentCoMarks, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.StudentElectiveSelection, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.StudentNptelEnrollment, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.NptelCreditTransfer, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.StudentGrade, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.StudentSemesterGPA, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.studentcourseChoices, { foreignKey: 'regno' });
    StudentDetails.hasMany(models.studentTempChoice, { foreignKey: 'regno' });
  };

  return StudentDetails;
};