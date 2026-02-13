// models/studentCoTool.js
export default  (sequelize, DataTypes) => {
  const StudentCOTool = sequelize.define('StudentCOTool', {
    studentToolId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    toolId: { type: DataTypes.INTEGER, allowNull: false },
    marksObtained: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
  }, { tableName: 'StudentCOTool', timestamps: false });

  StudentCOTool.associate = (models) => {
    StudentCOTool.belongsTo(models.StudentDetails, { foreignKey: 'regno', targetKey: 'registerNumber'});
    StudentCOTool.belongsTo(models.COTool, { foreignKey: 'toolId' });
  };

  return StudentCOTool;
};