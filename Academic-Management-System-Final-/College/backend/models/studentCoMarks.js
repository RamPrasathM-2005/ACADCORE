// models/studentCoMarks.js
export default(sequelize, DataTypes) => {
  const StudentCoMarks = sequelize.define('StudentCoMarks', {
    studentCoMarkId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    coId: { type: DataTypes.INTEGER, allowNull: false },
    consolidatedMark: { type: DataTypes.DECIMAL(5, 2), allowNull: false, validate: { min: 0, max: 100 } },
    createdBy: { type: DataTypes.STRING(150) },
    updatedBy: { type: DataTypes.STRING(150) },
  }, { tableName: 'StudentCOMarks', timestamps: true, createdAt: 'createdDate', updatedAt: 'updatedDate' });

  StudentCoMarks.associate = (models) => {
    StudentCoMarks.belongsTo(models.StudentDetails, { foreignKey: 'regno', targetKey: 'registerNumber'});
    StudentCoMarks.belongsTo(models.CourseOutcome, { foreignKey: 'coId' });
  };

  return StudentCoMarks;
};