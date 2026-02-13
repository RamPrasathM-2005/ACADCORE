// models/regulationCourse.js
export default  (sequelize, DataTypes) => {
  const RegulationCourse = sequelize.define('RegulationCourse', {
    regCourseId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regulationId: { type: DataTypes.INTEGER, allowNull: false },
    semesterNumber: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 8 } },
    courseCode: { type: DataTypes.STRING(20), allowNull: false },
    courseTitle: { type: DataTypes.STRING(255), allowNull: false },
    category: { type: DataTypes.ENUM('HSMC', 'BSC', 'ESC', 'PEC', 'OEC', 'EEC', 'PCC'), allowNull: false },
    type: { type: DataTypes.ENUM('THEORY', 'INTEGRATED', 'PRACTICAL', 'EXPERIENTIAL LEARNING'), allowNull: false },
    lectureHours: { type: DataTypes.INTEGER, defaultValue: 0 },
    tutorialHours: { type: DataTypes.INTEGER, defaultValue: 0 },
    practicalHours: { type: DataTypes.INTEGER, defaultValue: 0 },
    experientialHours: { type: DataTypes.INTEGER, defaultValue: 0 },
    totalContactPeriods: { type: DataTypes.INTEGER, allowNull: false },
    credits: { type: DataTypes.INTEGER, allowNull: false },
    minMark: { type: DataTypes.INTEGER, allowNull: false },
    maxMark: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(100) },
    updatedBy: { type: DataTypes.STRING(100) },
  }, { tableName: 'RegulationCourse', timestamps: true });

  RegulationCourse.associate = (models) => {
    RegulationCourse.belongsTo(models.Regulation, { foreignKey: 'regulationId' });
    RegulationCourse.hasMany(models.VerticalCourse, { foreignKey: 'regCourseId' });
  };

  return RegulationCourse;
};