// models/verticalCourse.js
module.exports = (sequelize, DataTypes) => {
  const VerticalCourse = sequelize.define('VerticalCourse', {
    verticalCourseId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    verticalId: { type: DataTypes.INTEGER, allowNull: false },
    regCourseId: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'VerticalCourse', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  VerticalCourse.associate = (models) => {
    VerticalCourse.belongsTo(models.Vertical, { foreignKey: 'verticalId' });
    VerticalCourse.belongsTo(models.RegulationCourse, { foreignKey: 'regCourseId' });
  };

  return VerticalCourse;
};