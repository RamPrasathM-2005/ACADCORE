// models/coTool.js
export default (sequelize, DataTypes) => {
  const COTool = sequelize.define('COTool', {
    toolId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    coId: { type: DataTypes.INTEGER, allowNull: false },
    toolName: { type: DataTypes.STRING(100), allowNull: false },
    weightage: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 100 } },
  }, { 
    tableName: 'COTool', 
    timestamps: false 
  });

  COTool.associate = (models) => {
    COTool.belongsTo(models.CourseOutcome, { foreignKey: 'coId' });
    COTool.hasMany(models.StudentCOTool, { foreignKey: 'toolId' });
    COTool.hasMany(models.ToolDetails, { foreignKey: 'toolId' });
  };

  return COTool;
};