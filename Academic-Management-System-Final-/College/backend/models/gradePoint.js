// models/gradePoint.js
export default (sequelize, DataTypes) => {
  const GradePoint = sequelize.define('GradePoint', {
    grade: { 
        type: DataTypes.ENUM('O', 'A+', 'A', 'B+', 'B', 'U'), 
        primaryKey: true 
    },
    point: { 
        type: DataTypes.TINYINT, 
        allowNull: false 
    },
  }, { 
    tableName: 'GradePoint', 
    timestamps: false 
  });

  return GradePoint;
};