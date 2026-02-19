// models/periodAttendance.js
export default (sequelize, DataTypes) => {
  const PeriodAttendance = sequelize.define('PeriodAttendance', {
    periodAttendanceId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    staffId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: false },
    semesterNumber: { type: DataTypes.INTEGER, allowNull: false },
    dayOfWeek: { type: DataTypes.ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'), allowNull: false },
    periodNumber: { type: DataTypes.INTEGER, allowNull: false },
    attendanceDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('P', 'A', 'OD'), allowNull: false },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    updatedBy: { type: DataTypes.STRING(150), allowNull: false },
  }, { tableName: 'PeriodAttendance', timestamps: false });

  PeriodAttendance.associate = (models) => {
    if (models.StudentDetails) PeriodAttendance.belongsTo(models.StudentDetails, { foreignKey: 'regno', targetKey: 'registerNumber' });
    if (models.User) PeriodAttendance.belongsTo(models.User, { foreignKey: 'staffId' });
    if (models.Course) PeriodAttendance.belongsTo(models.Course, { foreignKey: 'courseId' });
    if (models.Section) PeriodAttendance.belongsTo(models.Section, { foreignKey: 'sectionId' });
    
    // SAFE CHECK
    if (models.Department) {
        PeriodAttendance.belongsTo(models.Department, { foreignKey: 'Deptid' });
    }
  };

  return PeriodAttendance;
};