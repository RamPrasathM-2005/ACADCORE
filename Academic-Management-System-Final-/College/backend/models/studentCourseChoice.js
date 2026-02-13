// models/studentcourseChoices.js
export default  (sequelize, DataTypes) => {
  const studentcourseChoices = sequelize.define('studentcourseChoices', {
    choiceId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(20), allowNull: false },
    cbcs_id: { type: DataTypes.INTEGER, allowNull: false },
    courseId: { type: DataTypes.INTEGER, allowNull: false },
    staffId: { type: DataTypes.INTEGER, allowNull: false },
    sectionId: { type: DataTypes.INTEGER, allowNull: false },
    preferenceOrder: { type: DataTypes.INTEGER, allowNull: false },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'studentcourse_choices', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  studentcourseChoices.associate = (models) => {
    studentcourseChoices.belongsTo(models.CBCS, { foreignKey: 'cbcs_id' });
    studentcourseChoices.belongsTo(models.Course, { foreignKey: 'courseId' });
    studentcourseChoices.belongsTo(models.StudentDetails, { foreignKey: 'regno', targetKey: 'registerNumber' });
    studentcourseChoices.belongsTo(models.User, { foreignKey: 'staffId' });
    studentcourseChoices.belongsTo(models.Section, { foreignKey: 'sectionId' });
  };

  return studentcourseChoices;
};