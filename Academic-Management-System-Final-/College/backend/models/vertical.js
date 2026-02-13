// models/vertical.js
export default  (sequelize, DataTypes) => {
  const Vertical = sequelize.define('Vertical', {
    verticalId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regulationId: { type: DataTypes.INTEGER, allowNull: false },
    verticalName: { type: DataTypes.STRING(100), allowNull: false },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'Vertical', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  Vertical.associate = (models) => {
    Vertical.belongsTo(models.Regulation, { foreignKey: 'regulationId' });
    Vertical.hasMany(models.VerticalCourse, { foreignKey: 'verticalId' });
  };

  return Vertical;
};