// models/regulation.js
export default  (sequelize, DataTypes) => {
  const Regulation = sequelize.define('Regulation', {
    regulationId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    regulationYear: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'Regulation', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  Regulation.associate = (models) => {
    Regulation.belongsTo(models.Department, { foreignKey: 'Deptid' });
    Regulation.hasMany(models.Batch, { foreignKey: 'regulationId' });
    Regulation.hasMany(models.RegulationCourse, { foreignKey: 'regulationId' });
    Regulation.hasMany(models.Vertical, { foreignKey: 'regulationId' });
  };

  return Regulation;
};