// models/studentGrade.js
module.exports = (sequelize, DataTypes) => {
  const StudentGrade = sequelize.define('StudentGrade', {
    gradeId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    courseCode: { type: DataTypes.STRING(20), allowNull: false },
    grade: { type: DataTypes.ENUM('O', 'A+', 'A', 'B+', 'B', 'U'), allowNull: false },
  }, { tableName: 'StudentGrade', timestamps: true });

  StudentGrade.associate = (models) => {
    StudentGrade.belongsTo(models.StudentDetails, { foreignKey: 'regno' });
  };

  // Triggers (use migrations to add)
  // In migration file:
  // queryInterface.sequelize.query(`CREATE TRIGGER ...`);

  return StudentGrade;
};