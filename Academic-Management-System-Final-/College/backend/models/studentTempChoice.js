// models/studentTempChoice.js
module.exports = (sequelize, DataTypes) => {
  const studentTempChoice = sequelize.define('studentTempChoice', {
    choiceId: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(20), allowNull: false },
    cbcs_id: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    preferred_sectionId: { type: DataTypes.INTEGER, allowNull: false },
    preferred_staffId: { type: DataTypes.INTEGER, allowNull: false },
    preference_order: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'PROCESSED', 'REJECTED'), defaultValue: 'PENDING' },
    submittedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    processedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.STRING(150), allowNull: true },
    updatedBy: { type: DataTypes.STRING(150), allowNull: true },
  }, { tableName: 'student_temp_choice', timestamps: true });

  studentTempChoice.associate = (models) => {
    studentTempChoice.belongsTo(models.StudentDetails, { foreignKey: 'regno' });
    studentTempChoice.belongsTo(models.CBCS, { foreignKey: 'cbcs_id' });
    studentTempChoice.belongsTo(models.Course, { foreignKey: 'courseId' });
    studentTempChoice.belongsTo(models.Section, { foreignKey: 'preferred_sectionId' });
    studentTempChoice.belongsTo(models.User, { foreignKey: 'preferred_staffId' });
  };

  return studentTempChoice;
};