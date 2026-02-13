// models/coursePartitions.js
export default (sequelize, DataTypes) => {
  const CoursePartitions = sequelize.define('CoursePartitions', {
    partitionId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courseId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    theoryCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    practicalCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    experientialCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'CoursePartitions', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  CoursePartitions.associate = (models) => {
    CoursePartitions.belongsTo(models.Course, { foreignKey: 'courseId' });
  };

  return CoursePartitions;
};