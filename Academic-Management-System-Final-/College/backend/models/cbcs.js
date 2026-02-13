// models/cbcs.js
export default (sequelize, DataTypes) => {
  const CBCS = sequelize.define('CBCS', {
    cbcs_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batchId: { type: DataTypes.INTEGER, allowNull: false },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    // ... other fields
  }, { tableName: 'CBCS', timestamps: true });

  CBCS.associate = (models) => {
    // These must match the names defined in sequelize.define() in their files
    CBCS.belongsTo(models.Batch, { foreignKey: 'batchId' });
    CBCS.belongsTo(models.DepartmentAcademic, { foreignKey: 'Deptid' });
    CBCS.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    CBCS.hasMany(models.CBCSSubject, { foreignKey: 'cbcs_id' });
    
    // Check your other files! 
    // If studentcourseChoices.js uses .define('studentcourseChoices'), keep it lowercase:
    CBCS.hasMany(models.studentcourseChoices, { foreignKey: 'cbcs_id' });
    CBCS.hasMany(models.studentTempChoice, { foreignKey: 'cbcs_id' });
  };

  return CBCS;
};