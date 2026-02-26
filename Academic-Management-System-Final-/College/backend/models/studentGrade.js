// models/studentGrade.js
export default(sequelize, DataTypes) => {
  const validGrades = ['O', 'A+', 'A', 'B+', 'B', 'C', 'U'];

  const StudentGrade = sequelize.define('StudentGrade', {
    gradeId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regno: { type: DataTypes.STRING(50), allowNull: false },
    courseCode: { type: DataTypes.STRING(20), allowNull: false },
    grade: {
      type: DataTypes.STRING(3),
      allowNull: false,
      validate: { isIn: [validGrades] }
    },
  }, {
    tableName: 'StudentGrade',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['regno', 'courseCode'],
        name: 'uq_student_grade_regno_course_code'
      }
    ]
  });

  StudentGrade.associate = (models) => {
    StudentGrade.belongsTo(models.StudentDetails, { foreignKey: 'regno' , targetKey: 'registerNumber'});
    StudentGrade.belongsTo(models.Course, {
      foreignKey: 'courseCode',
      targetKey: 'courseCode',
      constraints: false
    });
    StudentGrade.belongsTo(models.GradePoint, { foreignKey: 'grade', targetKey: 'grade' });
  };

  return StudentGrade;
};
