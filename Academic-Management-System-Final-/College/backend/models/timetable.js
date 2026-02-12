// models/timetable.js
module.exports = (sequelize, DataTypes) => {
  const Timetable = sequelize.define('Timetable', {
    timetableId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: true },
    dayOfWeek: { type: DataTypes.ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'), allowNull: false },
    periodNumber: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 8 } },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'Timetable', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  Timetable.associate = (models) => {
    Timetable.belongsTo(models.DepartmentAcademic, { foreignKey: 'Deptid' });
    Timetable.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    Timetable.belongsTo(models.Course, { foreignKey: 'courseId' });
    Timetable.belongsTo(models.Section, { foreignKey: 'sectionId' });
  };

  return Timetable;
};