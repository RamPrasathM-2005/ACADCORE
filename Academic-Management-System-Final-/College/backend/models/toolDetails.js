// models/toolDetails.js
export default  (sequelize, DataTypes) => {
  const ToolDetails = sequelize.define('ToolDetails', {
    toolDetailId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    toolId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    maxMarks: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'ToolDetails', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  ToolDetails.associate = (models) => {
    ToolDetails.belongsTo(models.COTool, { foreignKey: 'toolId' });
  };

  return ToolDetails;
};