// models/studentSemesterGPA.js
module.exports = (sequelize, DataTypes) => {
  const StudentSemesterGPA = sequelize.define('StudentSemesterGPA', {
    studentGPAId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    gpa: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
    cgpa: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
  }, { tableName: 'StudentSemesterGPA', timestamps: true });

  StudentSemesterGPA.associate = (models) => {
    StudentSemesterGPA.belongsTo(models.StudentDetails, { foreignKey: 'regno' });
    StudentSemesterGPA.belongsTo(models.Semester, { foreignKey: 'semesterId' });
  };

  return StudentSemesterGPA;
};