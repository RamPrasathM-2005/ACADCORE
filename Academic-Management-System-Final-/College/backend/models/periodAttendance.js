// models/periodAttendance.js
export default (sequelize, DataTypes) => {
  const PeriodAttendance = sequelize.define('PeriodAttendance', {
    periodAttendanceId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    staffId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: false },
    semesterNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 8 } },
    dayOfWeek: { type: DataTypes.ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'), allowNull: false },
    periodNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 8 } },
    attendanceDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('P', 'A', 'OD'), allowNull: false },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    updatedBy: { type: DataTypes.STRING(150), allowNull: false },
  }, { tableName: 'PeriodAttendance', timestamps: false });

  PeriodAttendance.associate = (models) => {
    PeriodAttendance.belongsTo(models.StudentDetails, { foreignKey: 'regno',targetKey: 'registerNumber'});
    PeriodAttendance.belongsTo(models.User, { foreignKey: 'staffId' });
    PeriodAttendance.belongsTo(models.DepartmentAcademic, { foreignKey: 'Deptid' });
    PeriodAttendance.belongsTo(models.Course, { foreignKey: 'courseId' });
    PeriodAttendance.belongsTo(models.Section, { foreignKey: 'sectionId' });
  };

  return PeriodAttendance;
};