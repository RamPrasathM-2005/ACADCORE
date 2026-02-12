// models/courseRequest.js
module.exports = (sequelize, DataTypes) => {
  const CourseRequest = sequelize.define('CourseRequest', {
    requestId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    staffId: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'), defaultValue: 'PENDING' },
    requestedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    rejectedAt: { type: DataTypes.DATE, allowNull: true },
    withdrawnAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'CourseRequest', timestamps: true });

  CourseRequest.associate = (models) => {
    CourseRequest.belongsTo(models.User, { foreignKey: 'staffId' });
    CourseRequest.belongsTo(models.Course, { foreignKey: 'courseId' });
  };

  return CourseRequest;
};