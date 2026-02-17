// models/cbcs.js
export default (sequelize, DataTypes) => {
  const CBCS = sequelize.define('CBCS', {
    cbcs_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batchId: { type: DataTypes.INTEGER, allowNull: false },
    Deptid: { type: DataTypes.INTEGER, allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
  }, { tableName: 'CBCS', timestamps: true });

  CBCS.associate = (models) => {
    // Safety check: Log if a model is missing to prevent crash
    const requiredModels = ['Batch', 'DepartmentAcademic', 'Semester', 'CBCSSubject', 'studentcourseChoices', 'studentTempChoice'];
    
    requiredModels.forEach(m => {
      if (!models[m]) {
        console.error(`⚠️ WARNING: Model "${m}" is missing from the models object. Check your filename and define() name.`);
      }
    });

    if (models.Batch) {
      CBCS.belongsTo(models.Batch, { foreignKey: 'batchId' });
    }
    
    if (models.DepartmentAcademic) {
      CBCS.belongsTo(models.DepartmentAcademic, { foreignKey: 'Deptid' });
    }
    
    if (models.Semester) {
      CBCS.belongsTo(models.Semester, { foreignKey: 'semesterId' });
    }

    if (models.CBCSSubject) {
      CBCS.hasMany(models.CBCSSubject, { foreignKey: 'cbcs_id' });
    }

    if (models.studentcourseChoices) {
      CBCS.hasMany(models.studentcourseChoices, { foreignKey: 'cbcs_id' });
    }

    if (models.studentTempChoice) {
      CBCS.hasMany(models.studentTempChoice, { foreignKey: 'cbcs_id' });
    }
  };

  return CBCS;
};