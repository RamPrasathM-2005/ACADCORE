// models/dayAttendance.js
module.exports = (sequelize, DataTypes) => {
  const DayAttendance = sequelize.define('DayAttendance', {
    dayAttendanceId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    semesterNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 8 } },
    attendanceDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('P', 'A'), allowNull: false },
  }, { tableName: 'DayAttendance', timestamps: false });

  DayAttendance.associate = (models) => {
    DayAttendance.belongsTo(models.StudentDetails, { foreignKey: 'regno' });
  };

  return DayAttendance;
};