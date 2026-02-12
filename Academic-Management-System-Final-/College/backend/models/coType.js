// models/coType.js
module.exports = (sequelize, DataTypes) => {
  const COType = sequelize.define('COType', {
    coTypeId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    coId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    coType: { type: DataTypes.ENUM('THEORY', 'PRACTICAL', 'EXPERIENTIAL'), allowNull: false },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'COType', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  COType.associate = (models) => {
    COType.belongsTo(models.CourseOutcome, { foreignKey: 'coId' });
  };

  return COType;
};