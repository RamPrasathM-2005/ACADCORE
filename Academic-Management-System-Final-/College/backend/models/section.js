// models/section.js
module.exports = (sequelize, DataTypes) => {
  const Section = sequelize.define('Section', {
    sectionId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    sectionName: { type: DataTypes.STRING(10), allowNull: false },
    capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 40, validate: { min: 1 } },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'Section', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  Section.associate = (models) => {
    Section.belongsTo(models.Course, { foreignKey: 'courseId' });
    Section.hasMany(models.StudentCourse, { foreignKey: 'sectionId' });
    Section.hasMany(models.StaffCourse, { foreignKey: 'sectionId' });
    Section.hasMany(models.Timetable, { foreignKey: 'sectionId' });
    Section.hasMany(models.PeriodAttendance, { foreignKey: 'sectionId' });
    Section.hasMany(models.CBCSSectionStaff, { foreignKey: 'sectionId' });
    Section.hasMany(models.studentcourseChoices, { foreignKey: 'sectionId' });
    Section.hasMany(models.studentTempChoice, { foreignKey: 'preferred_sectionId' });
  };

  return Section;
};