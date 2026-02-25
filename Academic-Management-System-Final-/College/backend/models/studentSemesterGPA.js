// models/studentSemesterGPA.js
export default  (sequelize, DataTypes) => {
  const StudentSemesterGPA = sequelize.define('StudentSemesterGPA', {
    studentGPAId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    semesterId: { type: DataTypes.INTEGER, allowNull: false },
    gpa: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
    cgpa: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
    earnedCredits: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    totalCredits: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    qualityPoints: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    cumulativeEarnedCredits: { type: DataTypes.DECIMAL(7, 2), allowNull: false, defaultValue: 0 },
    cumulativeTotalCredits: { type: DataTypes.DECIMAL(7, 2), allowNull: false, defaultValue: 0 },
    cumulativeQualityPoints: { type: DataTypes.DECIMAL(9, 2), allowNull: false, defaultValue: 0 },
    hasOutstandingArrear: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cgpaFrozen: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'StudentSemesterGPA',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['regno', 'semesterId'],
        name: 'uq_student_semester_gpa_regno_semester'
      }
    ]
  });

  StudentSemesterGPA.associate = (models) => {
    StudentSemesterGPA.belongsTo(models.StudentDetails, { foreignKey: 'regno' , targetKey: 'registerNumber'});
    StudentSemesterGPA.belongsTo(models.Semester, { foreignKey: 'semesterId' });
  };

  return StudentSemesterGPA;
};
