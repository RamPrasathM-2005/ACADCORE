// models/gradePoint.js
export default (sequelize, DataTypes) => {
  const validGrades = ['O', 'A+', 'A', 'B+', 'B', 'C', 'U'];

  const GradePoint = sequelize.define('GradePoint', {
    grade: { 
        type: DataTypes.STRING(3),
        primaryKey: true,
        validate: { isIn: [validGrades] }
    },
    point: { 
        type: DataTypes.TINYINT, 
        allowNull: false 
    },
  }, { 
    tableName: 'GradePoint', 
    timestamps: false 
  });

  GradePoint.associate = (models) => {
    GradePoint.hasMany(models.StudentGrade, {
      foreignKey: 'grade',
      sourceKey: 'grade'
    });
  };

  return GradePoint;
};
