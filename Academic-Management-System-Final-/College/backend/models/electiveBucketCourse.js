// models/electiveBucketCourse.js
export default  (sequelize, DataTypes) => {
  const ElectiveBucketCourse = sequelize.define('ElectiveBucketCourse', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    bucketId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
  }, { tableName: 'ElectiveBucketCourse', timestamps: true });

  ElectiveBucketCourse.associate = (models) => {
    ElectiveBucketCourse.belongsTo(models.ElectiveBucket, { foreignKey: 'bucketId' });
    ElectiveBucketCourse.belongsTo(models.Course, { foreignKey: 'courseId' });
  };

  return ElectiveBucketCourse;
};