// models/electiveBucket.js
export default (sequelize, DataTypes) => {
  const ElectiveBucket = sequelize.define('ElectiveBucket', {
    bucketId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    bucketNumber: { type: DataTypes.INTEGER, allowNull: false },
    bucketName: { type: DataTypes.STRING(100), allowNull: false },
    createdBy: { type: DataTypes.INTEGER },
  }, { tableName: 'ElectiveBucket', timestamps: true });

  ElectiveBucket.associate = (models) => {
    ElectiveBucket.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    ElectiveBucket.belongsTo(models.User, { foreignKey: 'createdBy' });
    ElectiveBucket.hasMany(models.ElectiveBucketCourse, { foreignKey: 'bucketId' });
    ElectiveBucket.hasMany(models.StudentElectiveSelection, { foreignKey: 'bucketId' });
  };

  return ElectiveBucket;
};