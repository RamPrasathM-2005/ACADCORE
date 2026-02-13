// models/course.js
export default  (sequelize, DataTypes) => {
  const Course = sequelize.define('Course', {
    courseId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseCode: { type: DataTypes.STRING(20), allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    courseTitle: { type: DataTypes.STRING(255), allowNull: false },
    category: { type: DataTypes.ENUM('HSMC', 'BSC', 'ESC', 'PEC', 'OEC', 'EEC', 'PCC', 'MC'), allowNull: false },
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
  }, { tableName: 'Course', timestamps: true });

  Course.associate = (models) => {
    Course.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    Course.hasMany(models.Section, { foreignKey: 'courseId' });
    Course.hasMany(models.StudentCourse, { foreignKey: 'courseId' });
    Course.hasMany(models.StaffCourse, { foreignKey: 'courseId' });
    Course.hasMany(models.CourseOutcome, { foreignKey: 'courseId' });
    Course.hasMany(models.Timetable, { foreignKey: 'courseId' });
    Course.hasMany(models.PeriodAttendance, { foreignKey: 'courseId' });
    Course.hasMany(models.CoursePartitions, { foreignKey: 'courseId' });
    Course.hasMany(models.ElectiveBucketCourse, { foreignKey: 'courseId' });
    Course.hasMany(models.StudentElectiveSelection, { foreignKey: 'selectedCourseId' });
    Course.hasMany(models.CourseRequest, { foreignKey: 'courseId' });
    Course.hasMany(models.CBCSSubject, { foreignKey: 'courseId' });
    Course.hasMany(models.studentcourseChoices, { foreignKey: 'courseId' });
    Course.hasMany(models.studentTempChoice, { foreignKey: 'courseId' });
  };

  return Course;
};