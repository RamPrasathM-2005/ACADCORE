// models/cbcs.js
module.exports = (sequelize, DataTypes) => {
  const CBCS = sequelize.define('CBCS', {
    cbcs_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batchId: { type: DataTypes.INTEGER, allowNull: false },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'FCFS' },
    allocation_excel_path: { type: DataTypes.STRING(255) },
    total_students: { type: DataTypes.INTEGER, defaultValue: 0 },
    complete: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'NO' },
    isActive: { type: DataTypes.ENUM('YES', 'NO'), defaultValue: 'YES' },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'CBCS', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  CBCS.associate = (models) => {
    CBCS.belongsTo(models.Batch, { foreignKey: 'batchId' });
    CBCS.belongsTo(models.DepartmentAcademic, { foreignKey: 'Deptid' });
    CBCS.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    CBCS.hasMany(models.CBCSSubject, { foreignKey: 'cbcs_id' });
    CBCS.hasMany(models.studentcourseChoices, { foreignKey: 'cbcs_id' });
    CBCS.hasMany(models.studentTempChoice, { foreignKey: 'cbcs_id' });
  };

  return CBCS;
};