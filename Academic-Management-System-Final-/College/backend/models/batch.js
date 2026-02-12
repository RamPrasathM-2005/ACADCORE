// models/batch.js
module.exports = (sequelize, DataTypes) => {
  const Batch = sequelize.define('Batch', {
    batchId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    degree: { type: DataTypes.STRING(50), allowNull: false },
    branch: { type: DataTypes.STRING(100), allowNull: false },
    batch: { type: DataTypes.STRING(4), allowNull: false },
    batchYears: { type: DataTypes.STRING(20), allowNull: false },
    regulationId: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'Batch', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  Batch.associate = (models) => {
    Batch.belongsTo(models.Regulation, { foreignKey: 'regulationId' });
    Batch.hasMany(models.Semester, { foreignKey: 'batchId' });
    Batch.hasMany(models.CBCS, { foreignKey: 'batchId' });
  };

  return Batch;
};