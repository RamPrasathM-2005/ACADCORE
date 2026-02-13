// models/studentCourse.js
export default  (sequelize, DataTypes) => {
  const StudentCourse = sequelize.define('StudentCourse', {
    studentCourseId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'StudentCourse', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  StudentCourse.associate = (models) => {
    StudentCourse.belongsTo(models.StudentDetails, { foreignKey: 'regno', targetKey: 'registerNumber' });
    StudentCourse.belongsTo(models.Course, { foreignKey: 'courseId' });
    StudentCourse.belongsTo(models.Section, { foreignKey: 'sectionId' });
  };

  return StudentCourse;
};