// models/courseOutcome.js
export default (sequelize, DataTypes) => {
  const CourseOutcome = sequelize.define('CourseOutcome', {
    coId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    coNumber: { type: DataTypes.STRING(10), allowNull: false },
  }, { tableName: 'CourseOutcome', timestamps: false });

  CourseOutcome.associate = (models) => {
    CourseOutcome.belongsTo(models.Course, { foreignKey: 'courseId' });
    CourseOutcome.hasMany(models.COTool, { foreignKey: 'coId' });
    CourseOutcome.hasOne(models.COType, { foreignKey: 'coId' });
    CourseOutcome.hasMany(models.StudentCoMarks, { foreignKey: 'coId' });
  };

  return CourseOutcome;
};
