// models/staffCourse.js
export default  (sequelize, DataTypes) => {
  const StaffCourse = sequelize.define('StaffCourse', {
    staffCourseId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Userid: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: false },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'StaffCourse', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  StaffCourse.associate = (models) => {
    StaffCourse.belongsTo(models.User, { foreignKey: 'Userid' });
    StaffCourse.belongsTo(models.Course, { foreignKey: 'courseId' });
    StaffCourse.belongsTo(models.Section, { foreignKey: 'sectionId' });
    StaffCourse.belongsTo(models.Department, { foreignKey: 'Deptid' });
  };

  return StaffCourse;
};